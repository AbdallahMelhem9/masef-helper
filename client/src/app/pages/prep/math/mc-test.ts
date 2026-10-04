import { Component, DestroyRef, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { GameResult } from '../game-result';
import { fmtClock } from '../rng';
import { ArithQ, KIND_LABEL, ftArith } from './arith-gen';
import { FAMILY_INFO, SeqQ, makeSeq } from './seq-gen';

interface Item {
  prompt: string; // arithmetic text, or the sequence terms joined
  answer: string;
  options: string[];
  cat: string;
  rule?: string;
  chosen: string | null; // null = skipped / not reached
}

const SPEC = {
  arith: { n: 40, seconds: 8 * 60, skip: false },
  seq: { n: 30, seconds: 25 * 60, skip: true },
};

// The Flow Traders–style multiple-choice tests: +1 right, −1 wrong, 0 skipped
// or not reached; forward only.
@Component({
  selector: 'app-mc-test',
  styleUrl: '../prep.css',
  template: `
    <div class="table">
      <div class="table-top">
        @if (!started()) {
          <span class="chip">{{ spec().n }} questions · {{ spec().seconds / 60 }} min</span>
        } @else {
          <span class="chip clock-chip" [class.neg]="leftMs() < 60000">{{ clock() }}</span>
          <span class="chip">Question {{ Math.min(i() + 1, items().length) }} / {{ items().length }}</span>
        }
        <span class="spacer"></span>
        @if (over()) {
          <span class="chip">Score <b [class.neg]="score() < 0">{{ score() }}</b></span>
        }
      </div>

      @if (!started()) {
        <div class="fills">
          <p>
            @if (kind() === 'arith') {
              Answer every question to move on — no skipping. Correct +1, wrong −1, unanswered 0. Keys 1–4 pick an option.
            } @else {
              Find the next term. Skip with S (0 points); you cannot go back. Correct +1, wrong −1. Keys 1–5 pick an option.
            }
          </p>
          <button class="btn" (click)="start()">Start the clock</button>
        </div>
      } @else if (!over()) {
        @if (current(); as it) {
          <div class="mc-q" [class.seq]="kind() === 'seq'">{{ it.prompt }}@if (kind() === 'seq') {, <span class="blank">?</span>}</div>
          <div class="mc-options">
            @for (o of it.options; track o; let k = $index) {
              <button class="mc-opt" (click)="choose(o)"><span class="key">{{ k + 1 }}</span>{{ o }}</button>
            }
          </div>
          @if (spec().skip) {
            <button class="btn ghost" (click)="choose(null)">Skip (S)</button>
          }
        }
      } @else {
        <div class="fills">
          <h4>{{ correct() }} right · {{ wrong() }} wrong · {{ skipped() }} skipped or not reached</h4>
          @if (catRows().length) {
            <table class="recap">
              <thead><tr><th>{{ kind() === 'seq' ? 'Family' : 'Category' }}</th><th>Right</th><th>Wrong</th></tr></thead>
              <tbody>
                @for (r of catRows(); track r.name) {
                  <tr><td>{{ r.name }}</td><td>{{ r.c }}</td><td [class.neg]="r.w > 0">{{ r.w }}</td></tr>
                }
              </tbody>
            </table>
          }
          <h4 class="review-h">Review</h4>
          <ol class="review">
            @for (it of items(); track $index) {
              <li [class.ok]="it.chosen === it.answer" [class.bad]="it.chosen !== null && it.chosen !== it.answer">
                <span class="r-q">{{ it.prompt }}{{ kind() === 'seq' ? ', …' : '' }}</span>
                <span class="r-a">→ {{ it.answer }}@if (it.chosen !== null && it.chosen !== it.answer) { <em>(you: {{ it.chosen }})</em>}@if (it.chosen === null) { <em>(skipped)</em>}</span>
                @if (it.rule) {
                  <span class="r-rule">{{ it.rule }}</span>
                }
              </li>
            }
          </ol>
        </div>
      }
    </div>
  `,
})
export class McTest implements OnInit {
  kind = input.required<'arith' | 'seq'>();
  done = output<GameResult>();
  private destroyRef = inject(DestroyRef);
  Math = Math;

  spec = computed(() => SPEC[this.kind()]);
  items = signal<Item[]>([]);
  i = signal(0);
  started = signal(false);
  over = signal(false);
  leftMs = signal(0);
  private endAt = 0;

  current = computed(() => this.items()[this.i()] ?? null);
  clock = computed(() => fmtClock(this.leftMs()));
  correct = computed(() => this.items().filter((x) => x.chosen !== null && x.chosen === x.answer).length);
  wrong = computed(() => this.items().filter((x) => x.chosen !== null && x.chosen !== x.answer).length);
  skipped = computed(() => this.items().length - this.correct() - this.wrong());
  score = computed(() => this.correct() - this.wrong());
  catRows = computed(() => {
    const m = new Map<string, { c: number; w: number }>();
    for (const it of this.items()) {
      if (it.chosen === null) continue;
      const r = m.get(it.cat) ?? { c: 0, w: 0 };
      if (it.chosen === it.answer) r.c++;
      else r.w++;
      m.set(it.cat, r);
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, name: this.catName(k), ...v }));
  });

  ngOnInit() {
    const n = this.spec().n;
    const items: Item[] = [];
    for (let k = 0; k < n; k++) {
      if (this.kind() === 'arith') {
        const q: ArithQ = ftArith();
        items.push({ prompt: q.text, answer: q.answer, options: q.options!, cat: q.kind, chosen: null });
      } else {
        // Easy-to-hard ramp: a quarter tier 1, the middle tier 2, the last third tier 3.
        const tier = k < n / 4 ? 1 : k < (2 * n) / 3 ? 2 : 3;
        const q: SeqQ = makeSeq(tier);
        items.push({ prompt: q.terms.join(', '), answer: q.answer, options: q.options, cat: q.family, rule: q.rule, chosen: null });
      }
    }
    this.items.set(items);
    this.leftMs.set(this.spec().seconds * 1000);
    const t = setInterval(() => this.tick(), 250);
    this.destroyRef.onDestroy(() => clearInterval(t));
  }

  private catName(k: string) {
    return this.kind() === 'seq' ? (FAMILY_INFO[k]?.name ?? k) : (KIND_LABEL[k] ?? k);
  }

  start() {
    this.endAt = Date.now() + this.spec().seconds * 1000;
    this.started.set(true);
  }

  private tick() {
    if (!this.started() || this.over()) return;
    const left = this.endAt - Date.now();
    this.leftMs.set(left);
    if (left <= 0) this.finish();
  }

  choose(o: string | null) {
    if (this.over() || !this.current()) return;
    if (o === null && !this.spec().skip) return;
    const k = this.i();
    this.items.update((xs) => xs.map((x, j) => (j === k ? { ...x, chosen: o } : x)));
    this.i.update((v) => v + 1);
    if (this.i() >= this.items().length) this.finish();
  }

  @HostListener('window:keydown', ['$event'])
  key(e: KeyboardEvent) {
    if (!this.started() || this.over()) return;
    const it = this.current();
    if (!it) return;
    const n = Number(e.key);
    if (n >= 1 && n <= it.options.length) this.choose(it.options[n - 1]);
    else if (e.key.toLowerCase() === 's' && this.spec().skip) this.choose(null);
    else return;
    e.preventDefault();
  }

  private finish() {
    if (this.over()) return;
    this.over.set(true);
    const used = this.spec().seconds * 1000 - Math.max(0, this.endAt - Date.now());
    const cats: Record<string, [number, number]> = {};
    for (const r of this.catRows()) cats[r.key] = [r.c, r.w];
    this.done.emit({
      score: this.score(),
      stats: {
        summary: `${this.correct()} right · ${this.wrong()} wrong · ${this.skipped()} blank`,
        correct: this.correct(),
        wrong: this.wrong(),
        blank: this.skipped(),
        seconds: Math.round(used / 1000),
        cats,
      },
    });
  }
}

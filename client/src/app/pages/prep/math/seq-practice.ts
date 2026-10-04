import { Component, ElementRef, HostListener, OnInit, computed, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameResult } from '../game-result';
import { Level } from '../prep-meta';
import { FAMILY_INFO, SeqQ, makeSeq } from './seq-gen';

const N = 12;
const MODE_KEY = 'masef_seq_answer_mode';
const TIER: Record<string, number> = { easy: 1, medium: 2, hard: 3 };

interface Answered {
  q: SeqQ;
  given: string | null; // null = "show me"
  ok: boolean;
}

// Untimed sequence practice: the rule and how to spot the family after
// every answer; per-family accuracy saved with the run.
@Component({
  selector: 'app-seq-practice',
  imports: [FormsModule],
  styleUrl: '../prep.css',
  template: `
    <div class="table">
      <div class="table-top">
        <span class="chip">Sequence {{ Math.min(log().length + (shown() ? 0 : 1), N) }} / {{ N }}</span>
        <div class="seg">
          <button [class.on]="mode() === 'typed'" (click)="setMode('typed')">Type</button>
          <button [class.on]="mode() === 'mc'" (click)="setMode('mc')">5 options</button>
        </div>
        <span class="spacer"></span>
        <span class="chip">Score <b [class.neg]="score() < 0">{{ score() }}</b></span>
      </div>

      @if (q(); as cur) {
        <div class="mc-q seq">{{ cur.terms.join(', ') }}, <span class="blank">?</span></div>
        @if (!shown()) {
          @if (mode() === 'typed') {
            <form class="quote-form" (ngSubmit)="answer(typed)">
              <label>Next term <input #box name="t" [(ngModel)]="typed" autocomplete="off" /></label>
              <button class="btn" type="submit">Answer</button>
              <button class="btn ghost" type="button" (click)="answer(null)">Show me</button>
            </form>
          } @else {
            <div class="mc-options">
              @for (o of cur.options; track o; let k = $index) {
                <button class="mc-opt" (click)="answer(o)"><span class="key">{{ k + 1 }}</span>{{ o }}</button>
              }
            </div>
            <button class="btn ghost" (click)="answer(null)">Show me</button>
          }
        } @else {
          @let last = log()[log().length - 1];
          <div class="fills explain" [class.ok]="last.ok" [class.bad]="!last.ok">
            <h4>{{ last.ok ? 'Right' : last.given === null ? 'Answer' : 'Not quite' }}: {{ cur.answer }}@if (!last.ok && last.given) { <em>(you: {{ last.given }})</em>}</h4>
            <p><b>{{ family(cur.family).name }}.</b> {{ cur.rule }}</p>
            <p class="coach">How to spot it: {{ family(cur.family).tip }}</p>
            <button class="btn" #nextBtn (click)="next()">{{ log().length < N ? 'Next' : 'Finish' }} →</button>
          </div>
        }
      } @else {
        <div class="fills">
          <h4>{{ right() }} / {{ N }} right</h4>
          <table class="recap">
            <thead><tr><th>Family</th><th>Right</th><th>Missed</th></tr></thead>
            <tbody>
              @for (r of famRows(); track r.key) {
                <tr><td>{{ r.name }}</td><td>{{ r.c }}</td><td [class.neg]="r.w > 0">{{ r.w }}</td></tr>
              }
            </tbody>
          </table>
          @if (weak().length) {
            <p class="coach">Work on: {{ weak().join(', ') }}.</p>
          }
        </div>
      }
    </div>
  `,
})
export class SeqPractice implements OnInit {
  level = input.required<Level>();
  done = output<GameResult>();
  private box = viewChild<ElementRef<HTMLInputElement>>('box');
  private nextBtn = viewChild<ElementRef<HTMLButtonElement>>('nextBtn');
  readonly N = N;
  Math = Math;

  mode = signal<'typed' | 'mc'>(readMode());
  q = signal<SeqQ | null>(null);
  shown = signal(false);
  log = signal<Answered[]>([]);
  typed = '';

  right = computed(() => this.log().filter((a) => a.ok).length);
  // Wrong costs a point, "show me" costs nothing.
  score = computed(() => this.right() - this.log().filter((a) => !a.ok && a.given !== null).length);
  famRows = computed(() => {
    const m = new Map<string, { c: number; w: number }>();
    for (const a of this.log()) {
      const r = m.get(a.q.family) ?? { c: 0, w: 0 };
      if (a.ok) r.c++;
      else r.w++;
      m.set(a.q.family, r);
    }
    return [...m.entries()].map(([key, v]) => ({ key, name: this.family(key).name, ...v }));
  });
  weak = computed(() =>
    this.famRows()
      .filter((r) => r.w > 0)
      .map((r) => r.name)
  );

  family(k: string) {
    return FAMILY_INFO[k] ?? { name: k, tip: '' };
  }

  ngOnInit() {
    this.newQ();
  }

  setMode(m: 'typed' | 'mc') {
    this.mode.set(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
    setTimeout(() => this.box()?.nativeElement.focus());
  }

  private newQ() {
    // Mostly the level's tier, sometimes one below to keep the families mixed.
    const t = TIER[this.level()] ?? 1;
    this.q.set(makeSeq(t > 1 && Math.random() < 0.25 ? t - 1 : t));
    this.shown.set(false);
    this.typed = '';
    setTimeout(() => this.box()?.nativeElement.focus());
  }

  answer(given: string | null) {
    const q = this.q();
    if (!q || this.shown()) return;
    const g = given === null ? null : given.trim().replace('−', '-').replace(/\s/g, '');
    if (g === '') return;
    this.log.update((l) => [...l, { q, given: g, ok: g !== null && g === q.answer }]);
    this.shown.set(true);
    setTimeout(() => this.nextBtn()?.nativeElement.focus());
  }

  next() {
    if (this.log().length < N) return this.newQ();
    this.q.set(null);
    const fams: Record<string, [number, number]> = {};
    for (const r of this.famRows()) fams[r.key] = [r.c, r.w];
    this.done.emit({ score: this.score(), stats: { summary: `${this.right()}/${N} right`, right: this.right(), fams } });
  }

  @HostListener('window:keydown', ['$event'])
  key(e: KeyboardEvent) {
    const q = this.q();
    if (!q || this.shown() || this.mode() !== 'mc') return;
    const n = Number(e.key);
    if (n >= 1 && n <= q.options.length) {
      this.answer(q.options[n - 1]);
      e.preventDefault();
    }
  }
}

function readMode(): 'typed' | 'mc' {
  try {
    return localStorage.getItem(MODE_KEY) === 'mc' ? 'mc' : 'typed';
  } catch {
    return 'typed';
  }
}

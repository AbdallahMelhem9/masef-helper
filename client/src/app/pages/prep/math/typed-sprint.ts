import { Component, DestroyRef, ElementRef, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameResult } from '../game-result';
import { Level } from '../prep-meta';
import { fmtClock } from '../rng';
import { ArithQ, eightyQ, sprintQ, typedOk } from './arith-gen';

interface Done {
  q: ArithQ;
  typed: string; // '' = skipped
  ok: boolean;
  ms: number;
}

// Typed arithmetic: the 120-second sprint (an answer is taken the moment it
// is right) and the 80-in-8 test (Enter submits, wrong answers cost a point).
@Component({
  selector: 'app-typed-sprint',
  imports: [FormsModule],
  styleUrl: '../prep.css',
  template: `
    <div class="table">
      <div class="table-top">
        @if (started()) {
          <span class="chip clock-chip" [class.neg]="leftMs() < 15000">{{ clock() }}</span>
        }
        @if (mode() === 'eighty') {
          <span class="chip">Question {{ Math.min(log().length + 1, 80) }} / 80</span>
        }
        <span class="spacer"></span>
        <span class="chip">Score <b [class.neg]="score() < 0">{{ score() }}</b></span>
      </div>

      @if (!started()) {
        <div class="fills">
          <p>
            @if (mode() === 'sprint') {
              120 seconds. Type the answer — it is accepted as soon as it is right, no Enter needed.
            } @else {
              80 questions in 8 minutes. Enter submits; Enter on an empty box skips. Fractions as a/b or exact decimals. Wrong answers cost a point.
            }
          </p>
          <button class="btn" (click)="start()">Start the clock</button>
        </div>
      } @else if (!over()) {
        <div class="typed-q">
          <span class="tq-text">{{ q()?.text }} =</span>
          <input #box class="tq-input" [(ngModel)]="typed" (ngModelChange)="onType()" (keydown.enter)="enter()" inputmode="decimal" autocomplete="off" />
        </div>
        @if (flash()) {
          <p class="warn">{{ flash() }}</p>
        }
      } @else {
        <div class="fills">
          <h4>{{ right() }} right{{ mode() === 'eighty' ? ' · ' + wrongN() + ' wrong · ' + (80 - right() - wrongN()) + ' blank' : '' }} · {{ perQ() }} s per answer</h4>
          @if (slowest().length) {
            <p class="coach">Slowest: @for (d of slowest(); track $index) {<span class="slow">{{ d.q.text }} ({{ (d.ms / 1000).toFixed(1) }} s)</span>}</p>
          }
          @if (misses().length) {
            <ol class="review">
              @for (d of misses(); track $index) {
                <li class="bad"><span class="r-q">{{ d.q.text }}</span><span class="r-a">→ {{ d.q.answer }} <em>(you: {{ d.typed || 'skipped' }})</em></span></li>
              }
            </ol>
          }
        </div>
      }
    </div>
  `,
})
export class TypedSprint implements OnInit {
  mode = input.required<'sprint' | 'eighty'>();
  level = input.required<Level>();
  done = output<GameResult>();
  private destroyRef = inject(DestroyRef);
  private box = viewChild<ElementRef<HTMLInputElement>>('box');
  Math = Math;

  q = signal<ArithQ | null>(null);
  log = signal<Done[]>([]);
  started = signal(false);
  over = signal(false);
  leftMs = signal(0);
  flash = signal('');
  typed = '';
  private endAt = 0;
  private qStart = 0;

  seconds = computed(() => (this.mode() === 'sprint' ? 120 : 480));
  clock = computed(() => fmtClock(this.leftMs()));
  right = computed(() => this.log().filter((d) => d.ok).length);
  wrongN = computed(() => this.log().filter((d) => !d.ok && d.typed).length);
  score = computed(() => (this.mode() === 'sprint' ? this.right() : this.right() - this.wrongN()));
  perQ = computed(() => {
    const n = this.right();
    return n ? ((this.seconds() * 1000 - Math.max(0, this.leftMs())) / 1000 / n).toFixed(1) : '—';
  });
  slowest = computed(() =>
    this.log()
      .filter((d) => d.ok)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 5)
  );
  misses = computed(() => this.log().filter((d) => !d.ok));

  ngOnInit() {
    this.leftMs.set(this.seconds() * 1000);
    const t = setInterval(() => this.tick(), 200);
    this.destroyRef.onDestroy(() => clearInterval(t));
  }

  private nextQ() {
    this.q.set(this.mode() === 'sprint' ? sprintQ(this.level()) : eightyQ());
    this.typed = '';
    this.qStart = Date.now();
    setTimeout(() => this.box()?.nativeElement.focus());
  }

  start() {
    this.endAt = Date.now() + this.seconds() * 1000;
    this.started.set(true);
    this.nextQ();
  }

  private tick() {
    if (!this.started() || this.over()) return;
    const left = this.endAt - Date.now();
    this.leftMs.set(left);
    if (left <= 0) this.finish();
  }

  onType() {
    if (this.mode() !== 'sprint' || this.over()) return;
    const q = this.q()!;
    if (typedOk(this.typed, q)) {
      this.log.update((l) => [...l, { q, typed: this.typed, ok: true, ms: Date.now() - this.qStart }]);
      this.nextQ();
    }
  }

  enter() {
    if (this.mode() !== 'eighty' || this.over()) return;
    const q = this.q()!;
    const typed = this.typed.trim();
    const ok = typed ? typedOk(typed, q) : false;
    this.log.update((l) => [...l, { q, typed, ok, ms: Date.now() - this.qStart }]);
    this.flash.set('');
    if (this.log().length >= 80) return this.finish();
    this.nextQ();
  }

  private finish() {
    if (this.over()) return;
    this.over.set(true);
    const cats: Record<string, [number, number]> = {};
    for (const d of this.log()) {
      const c = (cats[d.q.kind] ??= [0, 0]);
      if (d.ok) c[0]++;
      else if (d.typed) c[1]++;
    }
    this.done.emit({
      score: this.score(),
      stats: {
        summary:
          this.mode() === 'sprint' ? `${this.right()} in 120 s` : `${this.right()} right · ${this.wrongN()} wrong`,
        right: this.right(),
        wrong: this.wrongN(),
        cats,
      },
    });
  }
}

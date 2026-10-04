import { Component, DestroyRef, ElementRef, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameResult } from '../game-result';
import { Level } from '../prep-meta';
import { shuffle } from '../rng';
import { FERMI, FermiQ } from './fermi-data';

const CFG: Record<string, { n: number; seconds: number; tiers: number[] }> = {
  easy: { n: 8, seconds: 0, tiers: [1] },
  medium: { n: 12, seconds: 45, tiers: [1, 2] },
  hard: { n: 15, seconds: 25, tiers: [2, 3] },
};
const TIMEOUT_PTS = -60;

// Points for a market [bid, ask] on a true value, on a log scale.
export function fermiPoints(bid: number, ask: number, truth: number): number {
  if (truth >= bid && truth <= ask) return Math.round(100 * Math.max(0.1, 1 - Math.log10(ask / bid) / 1.5));
  const miss = truth > ask ? Math.log10(truth / ask) : Math.log10(bid / truth);
  return -Math.round(30 + 70 * Math.min(miss, 2));
}

// Accepts 1200, 1,200, 1.2k, 3.5m, 2bn, 8e67.
function parseQty(s: string): number {
  const t = String(s ?? '').trim().toLowerCase().replace(/[\s,_]/g, '');
  const m = /^(\d*\.?\d+(?:e[+-]?\d+)?)(k|m|mn|b|bn|t|tn)?$/.exec(t);
  if (!m) return NaN;
  const mult: Record<string, number> = { k: 1e3, m: 1e6, mn: 1e6, b: 1e9, bn: 1e9, t: 1e12, tn: 1e12 };
  return parseFloat(m[1]) * (m[2] ? mult[m[2]] : 1);
}

export function fmtQty(x: number): string {
  if (x >= 1e15 || (x > 0 && x < 1e-3)) return x.toExponential(2);
  if (x >= 1e12) return +(x / 1e12).toPrecision(3) + ' tn';
  if (x >= 1e9) return +(x / 1e9).toPrecision(3) + ' bn';
  if (x >= 1e6) return +(x / 1e6).toPrecision(3) + ' m';
  return x.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

interface Answer {
  q: FermiQ;
  bid: number | null;
  ask: number | null;
  pts: number;
}

// "Make me a market on …": quote bid/ask on a quantity; scored on whether the
// truth is inside and how tight the market is.
@Component({
  selector: 'app-fermi',
  imports: [FormsModule],
  styleUrl: '../prep.css',
  template: `
    <div class="table">
      <div class="table-top">
        <span class="chip">Question {{ Math.min(i() + 1, qs().length) }} / {{ qs().length }}</span>
        <span class="spacer"></span>
        <span class="chip">Points <b [class.neg]="score() < 0">{{ score() }}</b></span>
      </div>

      @if (current(); as q) {
        @if (!shown()) {
          <p class="fermi-q">Make me a market on: <b>{{ q.q }}</b>@if (q.unit) {<span class="muted"> ({{ q.unit }})</span>}</p>
          @if (q.note) {
            <p class="muted small">{{ q.note }}</p>
          }
          <form class="quote-form" (ngSubmit)="submit()">
            <label>Bid <input #bidEl name="bid" [(ngModel)]="bid" autocomplete="off" placeholder="e.g. 300" /></label>
            <span class="at">at</span>
            <label>Ask <input name="ask" [(ngModel)]="ask" autocomplete="off" placeholder="e.g. 1.2k" /></label>
            <button class="btn" type="submit">Quote</button>
            @if (cfg().seconds) {
              <div class="clock" [class.low]="left() < 8000"><span [style.width.%]="(left() / (cfg().seconds * 1000)) * 100"></span></div>
            }
          </form>
          @if (err()) {
            <p class="warn">{{ err() }}</p>
          }
          <p class="hint">Suffixes work: 4.5k, 3m, 2bn, 1.5tn, 8e67. Tighter markets score more; a miss costs more the further out it is.</p>
        } @else {
          @let a = answers()[answers().length - 1];
          <div class="fills">
            <h4>{{ q.q }}: <b>{{ fmt(q.value) }}</b> {{ q.unit }}</h4>
            <p>
              @if (a.bid === null) {
                No market in time: {{ a.pts }}.
              } @else if (a.pts > 0) {
                Inside your {{ fmt(a.bid) }} – {{ fmt(a.ask!) }} market (×{{ ratio(a) }} wide): +{{ a.pts }}.
              } @else {
                Outside your {{ fmt(a.bid) }} – {{ fmt(a.ask!) }} market — the interviewer {{ q.value > a.ask! ? 'buys your ask' : 'sells you your bid' }}: {{ a.pts }}.
              }
            </p>
            <button class="btn" #nextBtn (click)="next()">{{ i() + 1 < qs().length ? 'Next question' : 'Finish' }} →</button>
          </div>
        }
      } @else {
        <div class="fills">
          <h4>Calibration: {{ hits() }} / {{ answers().length }} inside your market</h4>
          <p class="coach">{{ calibration() }}</p>
          <table class="recap">
            <thead><tr><th>Question</th><th>Your market</th><th>Truth</th><th>Pts</th></tr></thead>
            <tbody>
              @for (a of answers(); track $index) {
                <tr>
                  <td>{{ a.q.q }}</td>
                  <td>{{ a.bid === null ? '—' : fmt(a.bid) + ' – ' + fmt(a.ask!) }}</td>
                  <td>{{ fmt(a.q.value) }} {{ a.q.unit }}</td>
                  <td [class.neg]="a.pts < 0">{{ a.pts }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class FermiGame implements OnInit {
  level = input.required<Level>();
  done = output<GameResult>();
  private destroyRef = inject(DestroyRef);
  private bidEl = viewChild<ElementRef<HTMLInputElement>>('bidEl');
  private nextBtn = viewChild<ElementRef<HTMLButtonElement>>('nextBtn');
  Math = Math;
  fmt = fmtQty;

  cfg = computed(() => CFG[this.level()] ?? CFG['easy']);
  qs = signal<FermiQ[]>([]);
  i = signal(0);
  shown = signal(false);
  answers = signal<Answer[]>([]);
  err = signal('');
  left = signal(0);
  bid = '';
  ask = '';
  private deadline = 0;

  current = computed(() => this.qs()[this.i()] ?? null);
  score = computed(() => this.answers().reduce((s, a) => s + a.pts, 0));
  hits = computed(() => this.answers().filter((a) => a.pts > 0).length);
  calibration = computed(() => {
    const n = this.answers().length;
    const rate = n ? this.hits() / n : 0;
    if (rate < 0.7) return 'Too tight: you missed often. Widen until about 9 in 10 of your markets hold the truth.';
    if (rate === 1) return 'Every market held — try tightening: you are leaving points on the table.';
    return 'Well calibrated. Now work on tightening the ones you were sure of.';
  });

  ngOnInit() {
    const c = this.cfg();
    this.qs.set(shuffle(FERMI.filter((q) => c.tiers.includes(q.tier))).slice(0, c.n));
    this.startQ();
    const t = setInterval(() => this.tick(), 200);
    this.destroyRef.onDestroy(() => clearInterval(t));
  }

  private startQ() {
    this.shown.set(false);
    this.bid = '';
    this.ask = '';
    this.err.set('');
    this.deadline = this.cfg().seconds ? Date.now() + this.cfg().seconds * 1000 : 0;
    this.left.set(this.cfg().seconds * 1000);
    setTimeout(() => this.bidEl()?.nativeElement.focus());
  }

  private tick() {
    if (this.shown() || !this.deadline || !this.current()) return;
    const left = this.deadline - Date.now();
    this.left.set(left);
    if (left <= 0) this.record(null, null, TIMEOUT_PTS);
  }

  ratio(a: Answer) {
    return +((a.ask ?? 0) / (a.bid ?? 1)).toPrecision(2);
  }

  submit() {
    const b = parseQty(this.bid);
    const a = parseQty(this.ask);
    if (!(b > 0) || !(a > 0)) return this.err.set('Enter two positive numbers.');
    if (b >= a) return this.err.set('The bid must be below the ask.');
    this.record(b, a, fermiPoints(b, a, this.current()!.value));
  }

  private record(bid: number | null, ask: number | null, pts: number) {
    this.answers.update((xs) => [...xs, { q: this.current()!, bid, ask, pts }]);
    this.shown.set(true);
    setTimeout(() => this.nextBtn()?.nativeElement.focus());
  }

  next() {
    this.i.update((i) => i + 1);
    if (this.current()) return this.startQ();
    this.done.emit({
      score: this.score(),
      stats: { summary: `${this.hits()}/${this.answers().length} inside`, hits: this.hits(), n: this.answers().length },
    });
  }
}

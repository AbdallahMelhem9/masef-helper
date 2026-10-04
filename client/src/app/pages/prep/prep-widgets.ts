import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Board, PrepApi } from './prep-api';
import { fmtScore } from './format';

// Tiny line chart of recent scores (oldest left), zero line dashed.
@Component({
  selector: 'app-sparkline',
  styleUrl: './prep.css',
  template: `
    <svg class="spark" [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" aria-hidden="true">
      @if (zeroY() !== null) {
        <line class="spark-zero" x1="0" [attr.y1]="zeroY()" [attr.x2]="W" [attr.y2]="zeroY()" />
      }
      <polyline class="spark-line" [attr.points]="points()" />
      <circle class="spark-dot" [attr.cx]="last().x" [attr.cy]="last().y" r="2.6" />
    </svg>
  `,
})
export class Sparkline {
  values = input.required<number[]>();
  readonly W = 200;
  readonly H = 36;

  private scale = computed(() => {
    const v = this.values();
    const lo = Math.min(...v, 0);
    const hi = Math.max(...v, 0);
    const span = hi - lo || 1;
    return (x: number) => this.H - 3 - ((x - lo) / span) * (this.H - 6);
  });
  private xs = computed(() => {
    const n = this.values().length;
    return this.values().map((_, i) => (n === 1 ? this.W / 2 : (i / (n - 1)) * this.W));
  });
  points = computed(() => this.values().map((v, i) => `${this.xs()[i].toFixed(1)},${this.scale()(v).toFixed(1)}`).join(' '));
  last = computed(() => {
    const v = this.values();
    return { x: this.xs()[v.length - 1], y: this.scale()(v[v.length - 1]) };
  });
  zeroY = computed(() => (Math.min(...this.values()) < 0 ? this.scale()(0) : null));
}

// Best run per player on one game + level.
@Component({
  selector: 'app-leaderboard',
  styleUrl: './prep.css',
  template: `
    <section class="board-box">
      <h3>Leaderboard <span class="muted">· {{ levelLabel() }}</span></h3>
      @if (error()) {
        <p class="muted">{{ error() }}</p>
      } @else if (!board()) {
        <p class="muted">Loading…</p>
      } @else if (!board()!.players) {
        <p class="muted">Nobody has played this level yet. Be first.</p>
      } @else {
        <ol class="board">
          @for (r of board()!.top; track r.rank) {
            <li [class.me]="r.me">
              <span class="b-rank">{{ r.rank }}</span>
              <span class="b-name">{{ r.name }}@if (r.me) {<em> (you)</em>}</span>
              <span class="b-best">{{ fmt(r.best) }}</span>
              <span class="b-plays">{{ r.plays }}×</span>
            </li>
          }
          @if (board()!.me && board()!.me!.rank > board()!.top.length) {
            <li class="me gap">
              <span class="b-rank">{{ board()!.me!.rank }}</span>
              <span class="b-name">{{ board()!.me!.name }} <em>(you)</em></span>
              <span class="b-best">{{ fmt(board()!.me!.best) }}</span>
              <span class="b-plays">{{ board()!.me!.plays }}×</span>
            </li>
          }
        </ol>
        <p class="muted small">{{ board()!.players }} player{{ board()!.players === 1 ? '' : 's' }} · best run each</p>
      }
    </section>
  `,
})
export class Leaderboard {
  private api = inject(PrepApi);
  game = input.required<string>();
  level = input.required<string>();
  levelLabel = input('');
  money = input(false);
  // Bump to reload after a run is saved.
  refresh = input(0);

  board = signal<Board | null>(null);
  error = signal('');

  constructor() {
    effect(() => {
      const [g, l] = [this.game(), this.level()];
      this.refresh();
      this.board.set(null);
      this.error.set('');
      this.api
        .board(g, l)
        .then((b) => this.board.set(b))
        .catch(() => this.error.set('Leaderboard unavailable.'));
    });
  }

  fmt(x: number) {
    return fmtScore(x, this.money());
  }
}

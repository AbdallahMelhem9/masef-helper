import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PrepApi, Run } from './prep-api';
import { MATH, PrepItem, TRADING } from './prep-meta';
import { Sparkline } from './prep-widgets';
import { fmtScore } from './format';

// /prep/trading and /prep/math: the games of one kind, with personal bests,
// and the name shown on leaderboards.
@Component({
  selector: 'app-prep-hub',
  imports: [RouterLink, FormsModule, Sparkline],
  styleUrl: './prep.css',
  template: `
    <div class="page">
      <nav class="crumbs">
        <a routerLink="/teasers">Interview prep</a><span class="crumb-sep">/</span><span>{{ title() }}</span>
      </nav>
      <header class="page-head">
        <div>
          <p class="eyebrow">Interview preparation</p>
          <h1>{{ title() }}</h1>
          <p class="lede">{{ lede() }}</p>
        </div>
        <div class="name-box">
          <label for="lb-name">Leaderboard name</label>
          <div class="name-row">
            <input id="lb-name" [(ngModel)]="nameDraft" maxlength="30" [placeholder]="shownAs()" (keydown.enter)="saveName()" />
            <button class="btn ghost small" (click)="saveName()" [disabled]="nameDraft === savedName()">Save</button>
          </div>
        </div>
      </header>

      @if (error()) {
        <p class="error-note">{{ error() }}</p>
      }

      <div class="game-grid">
        @for (g of items(); track g.id) {
          <a class="game-card" [routerLink]="['/prep', kind(), g.id]">
            <span class="game-glyph" aria-hidden="true">{{ g.glyph }}</span>
            <h2>{{ g.title }}</h2>
            <p class="firms">{{ g.firms.join(' · ') }}</p>
            <p>{{ g.blurb }}</p>
            <div class="bests">
              @for (l of g.levels; track l.key) {
                <div class="best">
                  <span class="best-level">{{ l.label }}</span>
                  @if (best(g.id, l.key); as b) {
                    <span class="best-score">{{ fmt(g, b.score) }}</span>
                    <span class="best-plays">{{ b.plays }} run{{ b.plays === 1 ? '' : 's' }}</span>
                  } @else {
                    <span class="best-none">not played</span>
                  }
                </div>
              }
            </div>
            @if (trend(g.id).length > 1) {
              <app-sparkline [values]="trend(g.id)" />
            }
          </a>
        }
      </div>
    </div>
  `,
})
export class PrepHub implements OnInit {
  private api = inject(PrepApi);
  private route = inject(ActivatedRoute);

  kind = signal<'trading' | 'math'>('trading');
  runs = signal<Run[]>([]);
  error = signal('');
  shownAs = signal('');
  savedName = signal('');
  nameDraft = '';

  items = computed<PrepItem[]>(() => (this.kind() === 'trading' ? TRADING : MATH));
  title = computed(() => (this.kind() === 'trading' ? 'Trading games' : 'Mental maths & sequences'));
  lede = computed(() =>
    this.kind() === 'trading'
      ? 'Simulations of the games trading firms play in interviews and assessment days. Every run is saved; your best per level goes on the leaderboard.'
      : 'Timed drills in the formats of the online assessments (Flow Traders, Optiver), plus practice with explanations. Every run is saved.'
  );

  ngOnInit() {
    this.route.data.subscribe((d) => this.kind.set(d['kind']));
    this.api
      .history()
      .then((h) => {
        this.runs.set(h.runs);
        this.shownAs.set(h.shownAs);
        this.savedName.set(h.name);
        this.nameDraft = h.name;
      })
      .catch(() => this.error.set('Could not load your saved runs.'));
  }

  best(game: string, level: string) {
    const rs = this.runs().filter((r) => r.game === game && r.level === level);
    if (!rs.length) return null;
    return { score: Math.max(...rs.map((r) => r.score)), plays: rs.length };
  }

  // Last 20 scores on the level played most recently.
  trend(game: string): number[] {
    const rs = this.runs().filter((r) => r.game === game);
    if (!rs.length) return [];
    const level = rs[0].level;
    return rs
      .filter((r) => r.level === level)
      .slice(0, 20)
      .reverse()
      .map((r) => r.score);
  }

  fmt(g: PrepItem, x: number) {
    return fmtScore(x, !!g.money);
  }

  async saveName() {
    try {
      const r = await this.api.setName(this.nameDraft);
      this.savedName.set(r.name);
      this.shownAs.set(r.shownAs);
    } catch {
      this.error.set('Could not save the name.');
    }
  }
}

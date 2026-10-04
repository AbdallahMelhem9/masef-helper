import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PrepApi, Run, SaveResult } from './prep-api';
import { LEVEL_LABEL, Level, prepItem } from './prep-meta';
import { Leaderboard, Sparkline } from './prep-widgets';
import { GameResult } from './game-result';
import { DiceMarket } from './games/dice-market';
import { CardMarket } from './games/card-market';
import { EtfArb } from './games/etf-arb';
import { FermiGame } from './games/fermi';
import { McTest } from './math/mc-test';
import { TypedSprint } from './math/typed-sprint';
import { SeqPractice } from './math/seq-practice';
import { fmtScore } from './format';

// /prep/:kind/:id — the lobby of one game or drill (rules, level, leaderboard,
// your past runs), and the game itself once started.
@Component({
  selector: 'app-prep-game',
  imports: [RouterLink, Leaderboard, Sparkline, DiceMarket, CardMarket, EtfArb, FermiGame, McTest, TypedSprint, SeqPractice],
  styleUrl: './prep.css',
  template: `
    @if (item(); as g) {
      <div class="page" [class.wide]="playing()">
        <nav class="crumbs">
          <a routerLink="/teasers">Interview prep</a><span class="crumb-sep">/</span>
          <a [routerLink]="['/prep', g.kind]">{{ g.kind === 'trading' ? 'Trading games' : 'Mental maths & sequences' }}</a>
          <span class="crumb-sep">/</span><span>{{ g.title }}</span>
        </nav>

        @if (!playing()) {
          <header class="page-head">
            <div>
              <p class="eyebrow">{{ g.firms.join(' · ') }}</p>
              <h1>{{ g.title }}</h1>
              <p class="lede">{{ g.blurb }}</p>
            </div>
          </header>

          <div class="lobby">
            <div class="lobby-main">
              <section class="level-pick">
                @for (l of g.levels; track l.key) {
                  <button type="button" class="level-btn" [class.on]="level() === l.key" (click)="setLevel(l.key)">
                    <strong>{{ l.label }}</strong>
                    <span>{{ l.detail }}</span>
                  </button>
                }
              </section>
              <button class="btn start" (click)="start()">Start · {{ levelLabel() }}</button>
              <section class="rules">
                <h3>How it works</h3>
                <ul>
                  @for (r of g.rules; track $index) {
                    <li>{{ r }}</li>
                  }
                </ul>
                <h3>What the interviewer is grading</h3>
                <ul>
                  @for (r of g.watch; track $index) {
                    <li>{{ r }}</li>
                  }
                </ul>
              </section>


              @if (myRuns().length) {
                <section class="my-runs">
                  <h3>Your runs · {{ levelLabel() }}</h3>
                  @if (myRuns().length > 1) {
                    <app-sparkline [values]="trend()" />
                  }
                  <table>
                    <tbody>
                      @for (r of myRuns().slice(0, 8); track r.id) {
                        <tr>
                          <td class="muted">{{ when(r.created_at) }}</td>
                          <td class="num">{{ fmt(r.score) }}</td>
                          <td class="muted">{{ r.stats?.summary || '' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </section>
              }
            </div>
            <app-leaderboard [game]="g.id" [level]="level()" [levelLabel]="levelLabel()" [money]="!!g.money" [refresh]="saves()" />
          </div>
        } @else {
          <div class="play-head">
            <h1>{{ g.title }} <span class="muted">· {{ levelLabel() }}</span></h1>
            <button class="btn ghost small" (click)="quit()">{{ result() ? 'Back to lobby' : 'Quit (not saved)' }}</button>
          </div>

          @if (result(); as r) {
            <div class="result-banner">
              <div>
                <span class="eyebrow">Final score</span>
                <div class="result-score" [class.neg]="r.score < 0">{{ fmt(r.score) }}</div>
                <span class="muted">{{ g.unit }}</span>
              </div>
              <div class="result-meta">
                @if (saveError()) {
                  <span class="neg">{{ saveError() }}</span>
                } @else if (saved(); as s) {
                  @if (s.personalBest) {
                    <span class="pb">Personal best!</span>
                  } @else {
                    <span>Your best: {{ fmt(s.best) }}</span>
                  }
                  <span>You are #{{ s.rank }} of {{ s.players }} player{{ s.players === 1 ? '' : 's' }} on this board</span>
                } @else {
                  <span class="muted">Saving…</span>
                }
              </div>
              <div class="result-actions">
                <button class="btn" (click)="again()">Play again</button>
                <button class="btn ghost" (click)="quit()">Lobby &amp; leaderboard</button>
              </div>
            </div>
          }

          @for (k of [runKey()]; track k) {
            @switch (g.id) {
              @case ('mm-dice') {
                <app-dice-market [level]="level()" (done)="finish($event)" />
              }
              @case ('card-market') {
                <app-card-market [level]="level()" (done)="finish($event)" />
              }
              @case ('etf-arb') {
                <app-etf-arb [level]="level()" (done)="finish($event)" />
              }
              @case ('fermi') {
                <app-fermi [level]="level()" (done)="finish($event)" />
              }
              @case ('ft-arith') {
                <app-mc-test kind="arith" (done)="finish($event)" />
              }
              @case ('ft-seq') {
                <app-mc-test kind="seq" (done)="finish($event)" />
              }
              @case ('seq-practice') {
                <app-seq-practice [level]="level()" (done)="finish($event)" />
              }
              @case ('sprint') {
                <app-typed-sprint mode="sprint" [level]="level()" (done)="finish($event)" />
              }
              @case ('eighty-in-eight') {
                <app-typed-sprint mode="eighty" [level]="level()" (done)="finish($event)" />
              }
            }
          }
        }
      </div>
    } @else {
      <div class="page"><p class="error-note">Unknown game.</p></div>
    }
  `,
})
export class PrepGame implements OnInit {
  private api = inject(PrepApi);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  id = signal('');
  level = signal<Level>('easy');
  playing = signal(false);
  runKey = signal(0);
  result = signal<GameResult | null>(null);
  saved = signal<SaveResult | null>(null);
  saveError = signal('');
  saves = signal(0);
  runs = signal<Run[]>([]);

  item = computed(() => prepItem(this.id()));
  levelLabel = computed(() => LEVEL_LABEL[this.level()]);
  myRuns = computed(() => this.runs().filter((r) => r.game === this.id() && r.level === this.level()));
  trend = computed(() =>
    this.myRuns()
      .slice(0, 30)
      .reverse()
      .map((r) => r.score)
  );

  ngOnInit() {
    this.route.paramMap.subscribe((p) => {
      this.id.set(p.get('id') || '');
      this.playing.set(false);
      const g = this.item();
      const wanted = this.route.snapshot.queryParamMap.get('level');
      const levels = g?.levels.map((l) => l.key) ?? [];
      this.level.set((levels.includes(wanted as Level) ? wanted : (levels[0] ?? 'easy')) as Level);
    });
    this.loadRuns();
  }

  private loadRuns() {
    this.api
      .history()
      .then((h) => this.runs.set(h.runs))
      .catch(() => {});
  }

  setLevel(l: Level) {
    this.level.set(l);
    this.router.navigate([], { queryParams: { level: l }, replaceUrl: true });
  }

  start() {
    this.result.set(null);
    this.saved.set(null);
    this.saveError.set('');
    this.runKey.update((k) => k + 1);
    this.playing.set(true);
    window.scrollTo({ top: 0 });
  }

  again() {
    this.start();
  }

  quit() {
    this.playing.set(false);
    this.result.set(null);
  }

  async finish(r: GameResult) {
    this.result.set(r);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      this.saved.set(await this.api.save(this.id(), this.level(), r.score, r.stats));
      this.saves.update((n) => n + 1);
      this.loadRuns();
    } catch {
      this.saveError.set('Could not save this run.');
    }
  }

  fmt(x: number) {
    return fmtScore(x, !!this.item()?.money);
  }

  when(iso: string) {
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}

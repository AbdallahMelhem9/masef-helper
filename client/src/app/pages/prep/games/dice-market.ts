import { Component, DestroyRef, ElementRef, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameResult } from '../game-result';
import { Level } from '../prep-meta';
import { chance, fmtMoney, gauss, randInt, round } from '../rng';

interface Cfg {
  dice: number[]; // number of faces of each die
  maxWidth: number;
  informed: number; // share of informed traders
  lots: number; // max lots per trade
  traders: number; // traders who look at each quote
  seconds: number; // per quote, 0 = no clock
}

const CFG: Record<string, Cfg> = {
  easy: { dice: [6, 6, 6], maxWidth: 4, informed: 0, lots: 1, traders: 5, seconds: 0 },
  medium: { dice: [6, 6, 8, 10], maxWidth: 3, informed: 0.25, lots: 1, traders: 5, seconds: 25 },
  hard: { dice: [6, 8, 10, 12, 20], maxWidth: 2, informed: 0.4, lots: 3, traders: 6, seconds: 12 },
};
const HANDS = 5;
const FREEZE_PENALTY = 3;

interface Fill {
  side: 'bought' | 'sold'; // from the trader's point of view
  lots: number;
  price: number;
  informed: boolean;
  trader: number;
}

interface HandLog {
  dice: number[];
  pnl: number;
  noisePnl: number;
  informedPnl: number;
  trades: number;
}

type Phase = 'quote' | 'fills' | 'settled' | 'over';

// Market making on the sum of hidden dice: quote, get traded against, a die
// is revealed, quote again; the position settles at the true sum.
@Component({
  selector: 'app-dice-market',
  imports: [FormsModule],
  styleUrl: '../prep.css',
  template: `
    <div class="table">
      <div class="table-top">
        <span class="chip">Hand {{ hand() + 1 }} / {{ HANDS }}</span>
        <span class="chip">Round {{ Math.min(revealed() + 1, cfg().dice.length) }} / {{ cfg().dice.length }}</span>
        <span class="chip">Max width {{ cfg().maxWidth }}</span>
        <span class="spacer"></span>
        <span class="chip">Total P&amp;L <b [class.neg]="totalPnl() < 0">{{ money(totalPnl()) }}</b></span>
      </div>

      <div class="dice-row">
        @for (d of dice(); track $index) {
          <div class="die" [class.hidden-die]="$index >= revealed()">
            <span class="die-face">{{ $index < revealed() ? d : '?' }}</span>
            <span class="die-kind">d{{ cfg().dice[$index] }}</span>
          </div>
        }
        <div class="contract-note">
          Contract pays the sum
          @if (showFair()) {
            <span class="fair">fair {{ fair() }}</span>
          }
        </div>
      </div>

      <div class="book-stats">
        <div><span class="lbl">Position</span><b [class.neg]="pos() < 0">{{ pos() > 0 ? '+' : '' }}{{ pos() }}</b></div>
        <div><span class="lbl">Cash</span><b>{{ money(cash()) }}</b></div>
        <div><span class="lbl">This hand, marked at fair</span><b [class.neg]="markPnl() < 0">{{ money(markPnl()) }}</b></div>
      </div>

      @switch (phase()) {
        @case ('quote') {
          <form class="quote-form" (ngSubmit)="quote()">
            <label>Bid <input #bidEl type="number" step="0.5" name="bid" [(ngModel)]="bid" autocomplete="off" /></label>
            <span class="at">at</span>
            <label>Ask <input type="number" step="0.5" name="ask" [(ngModel)]="ask" autocomplete="off" /></label>
            <button class="btn" type="submit">Quote</button>
            @if (cfg().seconds) {
              <div class="clock" [class.low]="left() < 4000"><span [style.width.%]="(left() / (cfg().seconds * 1000)) * 100"></span></div>
            }
          </form>
          @if (quoteError()) {
            <p class="warn">{{ quoteError() }}</p>
          }
          <p class="hint">Quote a bid and an ask at most {{ cfg().maxWidth }} apart. Enter submits.</p>
        }
        @case ('fills') {
          <div class="fills">
            <h4>
              @if (froze()) {
                You froze — the desk charges {{ FREEZE_PENALTY }} and nobody traded.
              } @else {
                Your market {{ lastBid }} @ {{ lastAsk }} &mdash; {{ fills().length ? fills().length + ' trade' + (fills().length > 1 ? 's' : '') : 'no trades' }}
              }
            </h4>
            <ul>
              @for (f of fills(); track $index) {
                <li [class.informed]="f.informed && reveal()">
                  Trader {{ f.trader }} {{ f.side }} {{ f.lots }} at {{ f.price }}
                  @if (f.informed && reveal()) {
                    <em>· informed</em>
                  }
                </li>
              }
            </ul>
            <p class="coach">Fair value was <b>{{ fairBefore }}</b>@if (!froze()) {; your mid {{ (lastBid + lastAsk) / 2 }}}. {{ coach }}</p>
            <button class="btn" (click)="next()" #nextBtn>{{ revealed() + 1 < cfg().dice.length ? 'Reveal a die' : 'Reveal the last die & settle' }} →</button>
          </div>
        }
        @case ('settled') {
          <div class="fills">
            <h4>Settlement: the dice sum to {{ total() }}</h4>
            <p>
              Position {{ pos() }} × {{ total() }} + cash {{ money(cash()) }} = <b [class.neg]="lastHand()!.pnl < 0">{{ money(lastHand()!.pnl) }}</b>
            </p>
            <p class="coach">
              Edge from noise traders {{ money(lastHand()!.noisePnl) }}@if (cfg().informed) {, lost to informed traders {{ money(lastHand()!.informedPnl) }}}.
            </p>
            <button class="btn" (click)="nextHand()" #nextBtn>{{ hand() + 1 < HANDS ? 'Next hand' : 'Finish' }} →</button>
          </div>
        }
        @case ('over') {
          <div class="fills">
            <h4>All hands played</h4>
            <table class="recap">
              <thead><tr><th>Hand</th><th>Dice</th><th>Trades</th><th>Noise edge</th><th>Informed</th><th>P&amp;L</th></tr></thead>
              <tbody>
                @for (h of log(); track $index) {
                  <tr>
                    <td>{{ $index + 1 }}</td>
                    <td>{{ h.dice.join(' + ') }} = {{ sum(h.dice) }}</td>
                    <td>{{ h.trades }}</td>
                    <td>{{ money(h.noisePnl) }}</td>
                    <td>{{ money(h.informedPnl) }}</td>
                    <td [class.neg]="h.pnl < 0">{{ money(h.pnl) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </div>
  `,
})
export class DiceMarket implements OnInit {
  level = input.required<Level>();
  done = output<GameResult>();
  private destroyRef = inject(DestroyRef);
  private bidEl = viewChild<ElementRef<HTMLInputElement>>('bidEl');
  private nextBtn = viewChild<ElementRef<HTMLButtonElement>>('nextBtn');

  readonly Math = Math;
  readonly HANDS = HANDS;
  readonly FREEZE_PENALTY = FREEZE_PENALTY;

  cfg = computed(() => CFG[this.level()] ?? CFG['easy']);
  hand = signal(0);
  dice = signal<number[]>([]);
  revealed = signal(0);
  phase = signal<Phase>('quote');
  pos = signal(0);
  cash = signal(0);
  fills = signal<Fill[]>([]);
  froze = signal(false);
  quoteError = signal('');
  log = signal<HandLog[]>([]);
  left = signal(0);

  bid: number | null = null;
  ask: number | null = null;
  lastBid = 0;
  lastAsk = 0;
  fairBefore = 0;
  coach = '';
  private deadline = 0;
  private handFills: { fill: Fill }[] = [];
  private freezes = 0;

  fair = computed(() => {
    const c = this.cfg();
    return round(
      this.dice().reduce((s, d, i) => s + (i < this.revealed() ? d : (c.dice[i] + 1) / 2), 0),
      2
    );
  });
  total = computed(() => this.sum(this.dice()));
  markPnl = computed(() => this.cash() + this.pos() * (this.phase() === 'settled' ? this.total() : this.fair()));
  totalPnl = computed(() => this.log().reduce((s, h) => s + h.pnl, 0));
  lastHand = computed(() => this.log()[this.log().length - 1] ?? null);
  // The fair value is printed on easy; above that you work it out yourself.
  showFair = computed(() => this.level() === 'easy');
  reveal = computed(() => this.phase() !== 'quote');

  ngOnInit() {
    this.deal();
    const t = setInterval(() => this.tick(), 100);
    this.destroyRef.onDestroy(() => clearInterval(t));
  }

  sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  money = fmtMoney;

  private deal() {
    this.dice.set(this.cfg().dice.map((f) => randInt(1, f)));
    this.revealed.set(0);
    this.pos.set(0);
    this.cash.set(0);
    this.handFills = [];
    this.startQuote();
  }

  private startQuote() {
    this.phase.set('quote');
    this.quoteError.set('');
    this.froze.set(false);
    this.bid = null;
    this.ask = null;
    this.deadline = this.cfg().seconds ? Date.now() + this.cfg().seconds * 1000 : 0;
    this.left.set(this.cfg().seconds * 1000);
    setTimeout(() => this.bidEl()?.nativeElement.focus());
  }

  private tick() {
    if (this.phase() !== 'quote' || !this.deadline) return;
    const left = this.deadline - Date.now();
    this.left.set(left);
    if (left <= 0) {
      this.freezes++;
      this.cash.update((c) => c - FREEZE_PENALTY);
      this.fairBefore = this.fair();
      this.coach = 'In an interview, a fast approximate market beats a slow exact one.';
      this.fills.set([]);
      this.froze.set(true);
      this.toFills();
    }
  }

  quote() {
    const c = this.cfg();
    const bid = Number(this.bid);
    const ask = Number(this.ask);
    if (this.bid === null || this.ask === null || !Number.isFinite(bid) || !Number.isFinite(ask)) return this.quoteError.set('Enter both a bid and an ask.');
    if (bid >= ask) return this.quoteError.set('The bid must be below the ask.');
    if (ask - bid > c.maxWidth + 1e-9) return this.quoteError.set(`Too wide: at most ${c.maxWidth} between bid and ask.`);

    this.lastBid = bid;
    this.lastAsk = ask;
    this.fairBefore = this.fair();
    const fills: Fill[] = [];
    const hidden = this.dice().map((_, i) => i).filter((i) => i >= this.revealed());
    const sdLeft = Math.sqrt(hidden.reduce((s, i) => s + (c.dice[i] ** 2 - 1) / 12, 0));
    for (let t = 1; t <= c.traders; t++) {
      const informed = chance(c.informed);
      let value: number;
      if (informed) {
        // Knows the whole total, or one hidden die.
        if (this.level() === 'hard' && chance(0.5)) value = this.total();
        else {
          const k = hidden[randInt(0, hidden.length - 1)];
          value = this.fair() - (c.dice[k] + 1) / 2 + this.dice()[k];
        }
        value += gauss() * 0.3;
      } else value = this.fair() + gauss() * (1 + 0.35 * sdLeft);
      const lots = randInt(1, c.lots);
      if (value > ask) fills.push({ side: 'bought', lots, price: ask, informed, trader: t });
      else if (value < bid) fills.push({ side: 'sold', lots, price: bid, informed, trader: t });
    }
    for (const f of fills) {
      if (f.side === 'bought') {
        this.pos.update((p) => p - f.lots);
        this.cash.update((x) => x + f.lots * f.price);
      } else {
        this.pos.update((p) => p + f.lots);
        this.cash.update((x) => x - f.lots * f.price);
      }
      this.handFills.push({ fill: f });
    }
    this.fills.set(fills);
    this.coach = this.coachLine(bid, ask, fills);
    this.toFills();
  }

  private coachLine(bid: number, ask: number, fills: Fill[]): string {
    const mid = (bid + ask) / 2;
    const off = mid - this.fairBefore;
    const p = this.pos();
    if (Math.abs(off) > this.cfg().maxWidth / 2 && Math.sign(off) !== -Math.sign(p))
      return off > 0 ? 'Your market sat above fair: you got lifted for free.' : 'Your market sat below fair: you got hit for free.';
    if (Math.abs(p) >= 4 && Math.sign(off) === Math.sign(p)) return `You are ${p > 0 ? 'long' : 'short'} ${Math.abs(p)}: skew ${p > 0 ? 'down' : 'up'} to get out, not the other way.`;
    if (Math.abs(p) >= 4) return `Position ${p > 0 ? '+' : ''}${p}: good that you lean against it.`;
    if (!fills.length) return 'No trades: tighten up or centre better to earn the spread.';
    return 'Centred on fair — the spread is yours.';
  }

  private toFills() {
    this.phase.set('fills');
    setTimeout(() => this.nextBtn()?.nativeElement.focus());
  }

  next() {
    if (this.revealed() + 1 < this.cfg().dice.length) {
      this.revealed.update((r) => r + 1);
      this.startQuote();
    } else this.settle();
  }

  private settle() {
    this.revealed.set(this.cfg().dice.length);
    const total = this.total();
    let noisePnl = 0;
    let informedPnl = 0;
    for (const { fill: f } of this.handFills) {
      // P&L of a fill at settlement: we sold at f.price if the trader bought.
      const pnl = (f.side === 'bought' ? f.price - total : total - f.price) * f.lots;
      if (f.informed) informedPnl += pnl;
      else noisePnl += pnl;
    }
    const pnl = round(this.cash() + this.pos() * total, 2);
    this.log.update((l) => [
      ...l,
      { dice: this.dice(), pnl, noisePnl: round(noisePnl), informedPnl: round(informedPnl), trades: this.handFills.length },
    ]);
    this.phase.set('settled');
    setTimeout(() => this.nextBtn()?.nativeElement.focus());
  }

  nextHand() {
    if (this.hand() + 1 < HANDS) {
      this.hand.update((h) => h + 1);
      this.deal();
      return;
    }
    this.phase.set('over');
    const trades = this.log().reduce((s, h) => s + h.trades, 0);
    this.done.emit({
      score: round(this.totalPnl(), 2),
      stats: {
        summary: `${trades} trades · ${this.freezes} freeze${this.freezes === 1 ? '' : 's'}`,
        hands: this.log(),
      },
    });
  }
}

import { Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { GameResult } from '../game-result';
import { Level } from '../prep-meta';
import { chance, fmtMoney, gauss, pick, randInt, round, shuffle } from '../rng';

interface Card {
  rank: number; // 1 = ace … 13 = king
  suit: number; // 0..3
}

interface Cfg {
  ranks: number; // deck = ranks 1..ranks in 4 suits
  cards: number; // cards in the contract
  makers: number;
  maxSize: number;
  seconds: number;
  err: number; // sd of a maker's mistake around fair
  removed: number; // known cards removed from the deck before the deal
  informed: number; // chance per round that one maker has seen a hidden card
}

const CFG: Record<string, Cfg> = {
  easy: { ranks: 10, cards: 3, makers: 1, maxSize: 1, seconds: 0, err: 2.2, removed: 0, informed: 0 },
  medium: { ranks: 13, cards: 5, makers: 2, maxSize: 3, seconds: 20, err: 2.6, removed: 0, informed: 0 },
  hard: { ranks: 13, cards: 5, makers: 3, maxSize: 5, seconds: 10, err: 2.4, removed: 8, informed: 0.4 },
};
const HANDS = 5;
const SUITS = ['♠', '♥', '♦', '♣'];
const RANK = (r: number) => (r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r));
const MAKER_NAMES = ['Maker A', 'Maker B', 'Maker C'];

interface Quote {
  name: string;
  bid: number;
  ask: number;
  informed: boolean;
}

interface Trade {
  side: 'buy' | 'sell';
  size: number;
  price: number;
  fair: number;
  maker: string;
  informed: boolean;
}

interface HandLog {
  total: number;
  pnl: number;
  edge: number;
  trades: number;
}

type Phase = 'trade' | 'result' | 'settled' | 'over';

// Market taking on the sum of cards dealt face down: makers quote, you pick a
// side and a size or pass; a card flips; positions settle at the true sum.
@Component({
  selector: 'app-card-market',
  styleUrl: '../prep.css',
  template: `
    <div class="table">
      <div class="table-top">
        <span class="chip">Hand {{ hand() + 1 }} / {{ HANDS }}</span>
        <span class="chip">Round {{ Math.min(flipped() + 1, cfg().cards) }} / {{ cfg().cards }}</span>
        <span class="spacer"></span>
        <span class="chip">Total P&amp;L <b [class.neg]="totalPnl() < 0">{{ money(totalPnl()) }}</b></span>
      </div>

      <div class="cards-row">
        @for (c of hidden(); track $index) {
          <div class="card" [class.back]="$index >= flipped()" [class.red]="c.suit === 1 || c.suit === 2">
            @if ($index < flipped()) {
              <span class="card-rank">{{ rank(c.rank) }}</span><span class="card-suit">{{ suits[c.suit] }}</span>
            }
          </div>
        }
        <div class="contract-note">
          Pays the sum (A = 1 … {{ rank(cfg().ranks) }} = {{ cfg().ranks }})
          @if (level() === 'easy') {
            <span class="fair">fair {{ fair() }}</span>
          }
        </div>
      </div>
      @if (removed().length) {
        <p class="deck-note">Known to be removed from the deck before the deal: {{ removedText() }}</p>
      }

      <div class="book-stats">
        <div><span class="lbl">Position</span><b [class.neg]="pos() < 0">{{ pos() > 0 ? '+' : '' }}{{ pos() }}</b></div>
        <div><span class="lbl">Cash</span><b>{{ money(cash()) }}</b></div>
      </div>

      @switch (phase()) {
        @case ('trade') {
          <div class="makers">
            @for (q of quotes(); track q.name) {
              <div class="maker">
                <span class="maker-name">{{ q.name }}</span>
                <span class="maker-quote">{{ q.bid }} &#64; {{ q.ask }}</span>
                <button class="btn sell" (click)="trade(q, 'sell')">Sell {{ size() }} at {{ q.bid }}</button>
                <button class="btn buy" (click)="trade(q, 'buy')">Buy {{ size() }} at {{ q.ask }}</button>
              </div>
            }
          </div>
          <div class="size-row">
            @if (cfg().maxSize > 1) {
              <span class="lbl">Size</span>
              @for (s of sizes(); track s) {
                <button class="size-btn" [class.on]="size() === s" (click)="size.set(s)">{{ s }}</button>
              }
            }
            <span class="spacer"></span>
            <button class="btn ghost" (click)="pass()">Pass</button>
          </div>
          @if (cfg().seconds) {
            <div class="clock" [class.low]="left() < 3000"><span [style.width.%]="(left() / (cfg().seconds * 1000)) * 100"></span></div>
          }
        }
        @case ('result') {
          <div class="fills">
            <h4>{{ resultLine }}</h4>
            <p class="coach">Fair value was <b>{{ fairBefore }}</b>. {{ coach }}</p>
            <button class="btn" (click)="next()">{{ flipped() + 1 < cfg().cards ? 'Flip a card' : 'Flip the last card & settle' }} →</button>
          </div>
        }
        @case ('settled') {
          <div class="fills">
            <h4>The cards sum to {{ total() }}</h4>
            <p>Position {{ pos() }} × {{ total() }} + cash {{ money(cash()) }} = <b [class.neg]="lastHand()!.pnl < 0">{{ money(lastHand()!.pnl) }}</b></p>
            <p class="coach">Edge at the moment you traded (vs fair): {{ money(lastHand()!.edge) }}. The rest is luck of the cards.</p>
            <button class="btn" (click)="nextHand()">{{ hand() + 1 < HANDS ? 'Next hand' : 'Finish' }} →</button>
          </div>
        }
        @case ('over') {
          <div class="fills">
            <h4>All hands played</h4>
            <table class="recap">
              <thead><tr><th>Hand</th><th>Sum</th><th>Trades</th><th>Edge taken</th><th>P&amp;L</th></tr></thead>
              <tbody>
                @for (h of log(); track $index) {
                  <tr>
                    <td>{{ $index + 1 }}</td><td>{{ h.total }}</td><td>{{ h.trades }}</td><td>{{ money(h.edge) }}</td>
                    <td [class.neg]="h.pnl < 0">{{ money(h.pnl) }}</td>
                  </tr>
                }
              </tbody>
            </table>
            <p class="coach">Edge taken is what a trader is judged on; P&amp;L adds the luck of the draw.</p>
          </div>
        }
      }
    </div>
  `,
})
export class CardMarket implements OnInit {
  level = input.required<Level>();
  done = output<GameResult>();
  private destroyRef = inject(DestroyRef);

  readonly Math = Math;
  readonly HANDS = HANDS;
  readonly suits = SUITS;
  rank = RANK;
  money = fmtMoney;

  cfg = computed(() => CFG[this.level()] ?? CFG['easy']);
  hand = signal(0);
  hidden = signal<Card[]>([]);
  removed = signal<Card[]>([]);
  flipped = signal(0);
  phase = signal<Phase>('trade');
  quotes = signal<Quote[]>([]);
  size = signal(1);
  pos = signal(0);
  cash = signal(0);
  left = signal(0);
  log = signal<HandLog[]>([]);

  resultLine = '';
  coach = '';
  fairBefore = 0;
  private deadline = 0;
  private trades: Trade[] = [];
  private allTrades = 0;

  sizes = computed(() => Array.from({ length: this.cfg().maxSize }, (_, i) => i + 1));
  // Cards that can still be under the hidden ones: deck minus removed minus flipped.
  private remaining = computed(() => {
    const out: number[] = [];
    const gone = [...this.removed(), ...this.hidden().slice(0, this.flipped())];
    for (let r = 1; r <= this.cfg().ranks; r++)
      for (let s = 0; s < 4; s++) if (!gone.some((c) => c.rank === r && c.suit === s)) out.push(r);
    return out;
  });
  fair = computed(() => {
    const rem = this.remaining();
    const mean = rem.reduce((a, b) => a + b, 0) / rem.length;
    const shown = this.hidden()
      .slice(0, this.flipped())
      .reduce((s, c) => s + c.rank, 0);
    return round(shown + (this.cfg().cards - this.flipped()) * mean, 2);
  });
  total = computed(() => this.hidden().reduce((s, c) => s + c.rank, 0));
  totalPnl = computed(() => this.log().reduce((s, h) => s + h.pnl, 0));
  lastHand = computed(() => this.log()[this.log().length - 1] ?? null);
  removedText = computed(() =>
    this.removed()
      .map((c) => RANK(c.rank) + SUITS[c.suit])
      .join(' ')
  );

  ngOnInit() {
    this.deal();
    const t = setInterval(() => this.tick(), 100);
    this.destroyRef.onDestroy(() => clearInterval(t));
  }

  private deal() {
    const c = this.cfg();
    const deck: Card[] = [];
    for (let r = 1; r <= c.ranks; r++) for (let s = 0; s < 4; s++) deck.push({ rank: r, suit: s });
    const d = shuffle(deck);
    // Removing high or low cards skews the mean, which is the point.
    let removed: Card[] = [];
    if (c.removed) {
      const high = chance(0.5);
      const pool = d.filter((x) => (high ? x.rank >= 9 : x.rank <= 5));
      removed = pool.slice(0, c.removed);
    }
    const rest = d.filter((x) => !removed.includes(x));
    this.removed.set(removed);
    this.hidden.set(rest.slice(0, c.cards));
    this.flipped.set(0);
    this.pos.set(0);
    this.cash.set(0);
    this.trades = [];
    this.startRound();
  }

  private startRound() {
    const c = this.cfg();
    const fair = this.fair();
    const informedMaker = chance(c.informed) ? randInt(0, c.makers - 1) : -1;
    const quotes: Quote[] = [];
    for (let m = 0; m < c.makers; m++) {
      let mid: number;
      const informed = m === informedMaker;
      if (informed) {
        // Has seen one hidden card: centred on the fair given that card.
        const k = randInt(this.flipped(), c.cards - 1);
        const rem = this.remaining();
        const meanWithout = (rem.reduce((a, b) => a + b, 0) - this.hidden()[k].rank) / (rem.length - 1);
        mid = fair - (c.cards - this.flipped()) * (rem.reduce((a, b) => a + b, 0) / rem.length) + this.hidden()[k].rank + (c.cards - this.flipped() - 1) * meanWithout;
        mid += gauss() * 0.4;
      } else mid = fair + gauss() * c.err;
      const width = pick([1, 1, 2, 2, 3]);
      const bid = Math.round((mid - width / 2) * 2) / 2;
      quotes.push({ name: MAKER_NAMES[m], bid, ask: bid + width, informed });
    }
    this.quotes.set(quotes);
    this.size.set(Math.min(this.size(), c.maxSize));
    this.phase.set('trade');
    this.deadline = c.seconds ? Date.now() + c.seconds * 1000 : 0;
    this.left.set(c.seconds * 1000);
  }

  private tick() {
    if (this.phase() !== 'trade' || !this.deadline) return;
    const left = this.deadline - Date.now();
    this.left.set(left);
    if (left <= 0) {
      this.fairBefore = this.fair();
      this.resultLine = 'Too slow — the market moved on.';
      this.coach = this.bestEdgeLine();
      this.phase.set('result');
    }
  }

  private bestEdgeLine() {
    const f = this.fair();
    let best = 0;
    let line = 'No quote had edge: passing was right.';
    for (const q of this.quotes()) {
      if (f - q.ask > best) {
        best = f - q.ask;
        line = `Best trade: buy from ${q.name} at ${q.ask} (${round(best, 2)} of edge).`;
      }
      if (q.bid - f > best) {
        best = q.bid - f;
        line = `Best trade: sell to ${q.name} at ${q.bid} (${round(best, 2)} of edge).`;
      }
    }
    return line;
  }

  trade(q: Quote, side: 'buy' | 'sell') {
    const size = this.size();
    const price = side === 'buy' ? q.ask : q.bid;
    const fair = this.fair();
    this.pos.update((p) => p + (side === 'buy' ? size : -size));
    this.cash.update((x) => x + (side === 'buy' ? -1 : 1) * price * size);
    this.trades.push({ side, size, price, fair, maker: q.name, informed: q.informed });
    const edge = round((side === 'buy' ? fair - price : price - fair) * size, 2);
    this.fairBefore = fair;
    this.resultLine = `You ${side === 'buy' ? 'bought' : 'sold'} ${size} at ${price} from ${q.name} — edge ${fmtMoney(edge)}.`;
    this.coach =
      (edge < 0 ? 'Negative edge: you paid more than it is worth. ' : '') +
      (q.informed ? `${q.name} had seen a hidden card. ` : '') +
      this.bestEdgeLine();
    this.phase.set('result');
  }

  pass() {
    this.fairBefore = this.fair();
    this.resultLine = 'You passed.';
    this.coach = this.bestEdgeLine();
    this.phase.set('result');
  }

  next() {
    if (this.flipped() + 1 < this.cfg().cards) {
      this.flipped.update((f) => f + 1);
      this.startRound();
    } else this.settle();
  }

  private settle() {
    this.flipped.set(this.cfg().cards);
    const pnl = round(this.cash() + this.pos() * this.total(), 2);
    const edge = round(
      this.trades.reduce((s, t) => s + (t.side === 'buy' ? t.fair - t.price : t.price - t.fair) * t.size, 0),
      2
    );
    this.allTrades += this.trades.length;
    this.log.update((l) => [...l, { total: this.total(), pnl, edge, trades: this.trades.length }]);
    this.phase.set('settled');
  }

  nextHand() {
    if (this.hand() + 1 < HANDS) {
      this.hand.update((h) => h + 1);
      this.deal();
      return;
    }
    this.phase.set('over');
    const edge = round(this.log().reduce((s, h) => s + h.edge, 0), 2);
    this.done.emit({
      score: round(this.totalPnl(), 2),
      stats: { summary: `${this.allTrades} trades · edge ${fmtMoney(edge)}`, edge, hands: this.log() },
    });
  }
}

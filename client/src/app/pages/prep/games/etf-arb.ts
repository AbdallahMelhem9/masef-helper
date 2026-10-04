import { Component, DestroyRef, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { GameResult } from '../game-result';
import { Level } from '../prep-meta';
import { chance, fmtClock, fmtMoney, gauss, randInt, round } from '../rng';

interface StockDef {
  sym: string;
  w: number; // shares per ETF unit
  p0: number;
  vol: number; // price sd per tick
  usd?: boolean; // priced in USD, converted at the EUR/USD rate
}

interface Cfg {
  stocks: StockDef[];
  tickMs: number;
  seconds: number;
  fee: number; // per ETF unit traded
  hedgeCost: number; // per basket unit traded
  limit: number; // max |ETF position|
  bias: number; // typical size of a maker's mistake
  showNav: boolean;
  fx: boolean;
}

const CFG: Record<string, Cfg> = {
  easy: {
    stocks: [
      { sym: 'ALFA', w: 1, p0: 50, vol: 0.12 },
      { sym: 'BRVO', w: 1, p0: 30, vol: 0.1 },
    ],
    tickMs: 1500,
    seconds: 90,
    fee: 0,
    hedgeCost: 0,
    limit: 50,
    bias: 1.2,
    showNav: false,
    fx: false,
  },
  medium: {
    stocks: [
      { sym: 'ALFA', w: 2, p0: 41, vol: 0.1 },
      { sym: 'BRVO', w: 1, p0: 87, vol: 0.15 },
      { sym: 'CHRL', w: 3, p0: 12.5, vol: 0.05 },
    ],
    tickMs: 1100,
    seconds: 90,
    fee: 0.05,
    hedgeCost: 0.05,
    limit: 20,
    bias: 1.0,
    showNav: false,
    fx: false,
  },
  hard: {
    stocks: [
      { sym: 'ALFA', w: 2, p0: 41, vol: 0.1 },
      { sym: 'BRVO', w: 1, p0: 87, vol: 0.15 },
      { sym: 'CHRL', w: 4, p0: 12.5, vol: 0.05 },
      { sym: 'DLTA', w: 1, p0: 110, vol: 0.18, usd: true },
    ],
    tickMs: 800,
    seconds: 120,
    fee: 0.05,
    hedgeCost: 0.08,
    limit: 20,
    bias: 0.9,
    showNav: false,
    fx: true,
  },
};

interface Maker {
  name: string;
  lag: number; // ticks of staleness
  bias: number; // current mistake
  biasLeft: number; // ticks the mistake lasts
  bid: number;
  ask: number;
  flash: string;
}

// Live ETF arbitrage: compute the NAV from the basket in your head, trade
// the ETF against lagging/biased makers, hedge with the basket.
@Component({
  selector: 'app-etf-arb',
  styleUrl: '../prep.css',
  template: `
    <div class="table">
      <div class="table-top">
        @if (phase() === 'ready') {
          <span class="chip">Ready?</span>
        } @else {
          <span class="chip clock-chip" [class.neg]="leftMs() < 10000">{{ clock() }}</span>
        }
        <span class="chip">Fee {{ cfg().fee }} / unit</span>
        <span class="chip">Limit ±{{ cfg().limit }}</span>
        <span class="spacer"></span>
        <span class="chip">P&amp;L at NAV <b [class.neg]="pnl() < 0">{{ money(pnl()) }}</b></span>
      </div>

      <div class="etf-grid">
        <div class="basket">
          <h4>Basket per ETF unit</h4>
          <table>
            <tbody>
              @for (s of cfg().stocks; track s.sym; let i = $index) {
                <tr>
                  <td class="sym">{{ s.sym }}</td>
                  <td class="muted">× {{ s.w }}</td>
                  <td class="num" [class.up]="moves()[i] > 0" [class.down]="moves()[i] < 0">{{ prices()[i].toFixed(2) }}{{ s.usd ? ' $' : '' }}</td>
                </tr>
              }
              @if (cfg().fx) {
                <tr>
                  <td class="sym">EUR/USD</td>
                  <td class="muted">$ per €</td>
                  <td class="num">{{ fx().toFixed(3) }}</td>
                </tr>
              }
            </tbody>
          </table>
          <p class="muted small">ETF fair value = Σ shares × price{{ cfg().fx ? ' (DLTA converted to €: divide by EUR/USD)' : '' }}.</p>
          @if (cfg().showNav || phase() === 'over') {
            <p class="nav-line">NAV {{ nav().toFixed(2) }}</p>
          }
        </div>

        <div class="etf-book">
          <h4>ETF quotes</h4>
          @for (m of makers(); track m.name) {
            <div class="maker" [class.flash]="m.flash">
              <span class="maker-name">{{ m.name }}</span>
              <button class="btn sell" [disabled]="phase() !== 'live'" (click)="hit(m, 'sell')">Sell {{ size() }} &#64; {{ m.bid.toFixed(2) }}</button>
              <button class="btn buy" [disabled]="phase() !== 'live'" (click)="hit(m, 'buy')">Buy {{ size() }} &#64; {{ m.ask.toFixed(2) }}</button>
            </div>
          }
          <div class="size-row">
            <span class="lbl">Size</span>
            @for (s of [1, 5, 10]; track s) {
              <button class="size-btn" [class.on]="size() === s" (click)="size.set(s)">{{ s }}</button>
            }
          </div>
          <div class="book-stats">
            <div><span class="lbl">ETF</span><b>{{ etf() > 0 ? '+' : '' }}{{ etf() }}</b></div>
            <div><span class="lbl">Basket hedge</span><b>{{ basket() > 0 ? '+' : '' }}{{ basket() }}</b></div>
            <div><span class="lbl">Net exposure</span><b [class.neg]="etf() + basket() !== 0">{{ etf() + basket() }}</b></div>
          </div>
          <button class="btn ghost" [disabled]="phase() !== 'live' || etf() + basket() === 0" (click)="hedge()">
            Hedge: {{ etf() + basket() > 0 ? 'sell' : 'buy' }} {{ abs(etf() + basket()) }} basket{{ cfg().hedgeCost ? ' (cost ' + cfg().hedgeCost + ' each)' : '' }}
          </button>
          <p class="muted small">Keys: S / B hit the best bid / ask · H hedges · 1 5 0 set size.</p>
          @if (msg()) {
            <p class="warn">{{ msg() }}</p>
          }
        </div>
      </div>

      @if (phase() === 'ready') {
        <div class="fills">
          <button class="btn" (click)="go()">Start the clock</button>
        </div>
      }
      @if (phase() === 'over') {
        <div class="fills">
          <h4>Time — everything marked at the final NAV {{ nav().toFixed(2) }}</h4>
          <p>
            {{ trades }} trades · edge at the time of your trades {{ money(edge) }} · fees and hedge costs −{{ round(costs) }} · open
            exposure at the end {{ etf() + basket() }}.
          </p>
          <p class="coach">
            @if (abs(etf() + basket()) > 2) {
              You ended with market exposure: part of your P&amp;L was a bet on the basket, not arbitrage.
            } @else if (edge <= 0) {
              Negative edge: check the NAV more carefully before hitting — the makers are usually close to fair.
            } @else {
              Hedged and positive edge: that is the job.
            }
          </p>
        </div>
      }
    </div>
  `,
})
export class EtfArb implements OnInit {
  level = input.required<Level>();
  done = output<GameResult>();
  private destroyRef = inject(DestroyRef);

  money = fmtMoney;
  round = round;
  abs = Math.abs;

  cfg = computed(() => CFG[this.level()] ?? CFG['easy']);
  phase = signal<'ready' | 'live' | 'over'>('ready');
  prices = signal<number[]>([]);
  moves = signal<number[]>([]);
  fx = signal(1.08);
  makers = signal<Maker[]>([]);
  size = signal(1);
  etf = signal(0);
  basket = signal(0);
  cash = signal(0);
  msg = signal('');
  leftMs = signal(0);

  trades = 0;
  edge = 0;
  costs = 0;
  private navHist: number[] = [];
  private endAt = 0;
  private nextTick = 0;

  nav = computed(() => this.navOf(this.prices(), this.fx()));
  pnl = computed(() => this.cash() + (this.etf() + this.basket()) * this.nav());
  clock = computed(() => fmtClock(this.leftMs()));

  private navOf(prices: number[], fx: number) {
    return round(
      this.cfg().stocks.reduce((s, st, i) => s + st.w * (st.usd ? prices[i] / fx : prices[i]), 0),
      4
    );
  }

  ngOnInit() {
    this.prices.set(this.cfg().stocks.map((s) => s.p0 + round(gauss() * s.p0 * 0.02, 2)));
    this.moves.set(this.cfg().stocks.map(() => 0));
    this.navHist = Array(6).fill(this.nav());
    this.makers.set(
      ['Bot Amsterdam', 'Bot Chicago', 'Bot Sydney'].map((name, i) => {
        const m: Maker = { name, lag: i + 1, bias: 0, biasLeft: 0, bid: 0, ask: 0, flash: '' };
        this.requote(m);
        return m;
      })
    );
    this.leftMs.set(this.cfg().seconds * 1000);
    const t = setInterval(() => this.loop(), 100);
    this.destroyRef.onDestroy(() => clearInterval(t));
  }

  go() {
    this.endAt = Date.now() + this.cfg().seconds * 1000;
    this.nextTick = Date.now() + this.cfg().tickMs;
    this.phase.set('live');
  }

  private loop() {
    if (this.phase() !== 'live') return;
    const now = Date.now();
    this.leftMs.set(this.endAt - now);
    if (now >= this.endAt) return this.finish();
    if (now >= this.nextTick) {
      this.nextTick = now + this.cfg().tickMs;
      this.tick();
    }
  }

  private tick() {
    const c = this.cfg();
    const old = this.prices();
    const next = old.map((p, i) => Math.max(1, round(p + gauss() * c.stocks[i].vol + (chance(0.03) ? gauss() * c.stocks[i].vol * 6 : 0), 2)));
    this.moves.set(next.map((p, i) => p - old[i]));
    this.prices.set(next);
    if (c.fx) this.fx.set(round(this.fx() + gauss() * 0.0012, 4));
    this.navHist.push(this.nav());
    if (this.navHist.length > 12) this.navHist.shift();
    this.makers.update((ms) =>
      ms.map((m) => {
        const n = { ...m, flash: '' };
        if (n.biasLeft > 0) n.biasLeft--;
        else n.bias = 0;
        if (!n.bias && chance(0.07)) {
          n.bias = (chance(0.5) ? 1 : -1) * c.bias * (0.5 + Math.random());
          n.biasLeft = randInt(3, 8);
        }
        this.requote(n);
        return n;
      })
    );
  }

  // A maker quotes around a stale NAV plus its current mistake.
  private requote(m: Maker, fresh = false) {
    const stale = fresh || !this.navHist.length ? this.nav() : this.navHist[Math.max(0, this.navHist.length - 1 - m.lag)];
    const mid = stale + m.bias + gauss() * 0.04;
    const half = 0.1;
    m.bid = round(mid - half, 2);
    m.ask = round(mid + half, 2);
  }

  hit(m: Maker, side: 'buy' | 'sell') {
    if (this.phase() !== 'live') return;
    const c = this.cfg();
    const q = this.size();
    const newPos = this.etf() + (side === 'buy' ? q : -q);
    if (Math.abs(newPos) > c.limit) {
      this.msg.set(`Position limit: at most ±${c.limit} ETF.`);
      return;
    }
    this.msg.set('');
    const price = side === 'buy' ? m.ask : m.bid;
    this.etf.set(newPos);
    this.cash.update((x) => x + (side === 'buy' ? -price : price) * q - c.fee * q);
    this.costs += c.fee * q;
    this.edge += (side === 'buy' ? this.nav() - price : price - this.nav()) * q - c.fee * q;
    this.trades++;
    // After being hit, a maker corrects its mistake and re-centres.
    this.makers.update((ms) =>
      ms.map((x) => {
        if (x.name !== m.name) return x;
        const n = { ...x, bias: 0, biasLeft: 0, flash: side };
        this.requote(n, true);
        return n;
      })
    );
  }

  hedge() {
    const c = this.cfg();
    const q = -(this.etf() + this.basket());
    if (!q || this.phase() !== 'live') return;
    this.basket.update((b) => b + q);
    this.cash.update((x) => x - q * this.nav() - Math.abs(q) * c.hedgeCost);
    this.costs += Math.abs(q) * c.hedgeCost;
  }

  @HostListener('window:keydown', ['$event'])
  key(e: KeyboardEvent) {
    if (this.phase() !== 'live' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    const ms = this.makers();
    if (k === 'b') this.hit(ms.reduce((a, b) => (b.ask < a.ask ? b : a)), 'buy');
    else if (k === 's') this.hit(ms.reduce((a, b) => (b.bid > a.bid ? b : a)), 'sell');
    else if (k === 'h') this.hedge();
    else if (k === '1') this.size.set(1);
    else if (k === '5') this.size.set(5);
    else if (k === '0') this.size.set(10);
    else return;
    e.preventDefault();
  }

  private finish() {
    this.phase.set('over');
    this.leftMs.set(0);
    this.edge = round(this.edge, 2);
    const score = round(this.pnl(), 2);
    this.done.emit({
      score,
      stats: {
        summary: `${this.trades} trades · edge ${fmtMoney(this.edge)} · open ${this.etf() + this.basket()}`,
        trades: this.trades,
        edge: this.edge,
        costs: round(this.costs, 2),
      },
    });
  }
}

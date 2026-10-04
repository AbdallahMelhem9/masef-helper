// Small random helpers shared by the games and drills.

export const randInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
export const chance = (p: number) => Math.random() < p;

export function shuffle<T>(xs: T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Standard normal (Box–Muller).
export function gauss(): number {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

// Round to `d` decimals without float noise (0.1 + 0.2 → 0.3).
export const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export const fmtMoney = (x: number) => (x < 0 ? '−' : x > 0 ? '+' : '') + Math.abs(round(x, 2)).toLocaleString('en-US');

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

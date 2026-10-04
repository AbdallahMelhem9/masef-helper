// Arithmetic question generators: Flow Traders–style multiple choice
// (integers, decimals, fractions, missing operands) and typed questions for
// the sprint and 80-in-8 drills.
import { chance, pick, randInt, round, shuffle } from '../rng';

export interface ArithQ {
  text: string; // e.g. "47 × 8" or "? × 6 = 13.8"
  answer: string; // canonical answer
  value: number; // numeric value of the answer
  kind: string; // category for per-category stats
  options?: string[];
}

export const KIND_LABEL: Record<string, string> = {
  add: 'Addition',
  sub: 'Subtraction',
  mul: 'Multiplication',
  div: 'Division',
  dec: 'Decimals',
  frac: 'Fractions',
  miss: 'Missing operand',
  pct: 'Percentages',
};

export const num = (x: number) => String(round(x, 6));

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
function frac(n: number, d: number): string {
  const g = gcd(n, d);
  n /= g;
  d /= g;
  if (d < 0) [n, d] = [-n, -d];
  return d === 1 ? String(n) : `${n}/${d}`;
}

// A reduced proper fraction n/d with d ≤ 9.
function properFrac(): [number, number] {
  for (;;) {
    const d = randInt(2, 9);
    const n = randInt(1, d - 1);
    if (gcd(n, d) === 1) return [n, d];
  }
}

// A decimal with `d` decimals between lo and hi.
const dec = (lo: number, hi: number, d: number) => round(lo + Math.random() * (hi - lo), d);

// ---------- Flow Traders multiple choice ----------

function numberOptions(ans: number): string[] {
  const s = num(ans);
  const decimals = s.includes('.') ? s.split('.')[1].length : 0;
  const unit = 10 ** -decimals;
  const pool = [
    ans + unit,
    ans - unit,
    ans + 2 * unit,
    ans + 10 * unit,
    ans - 10 * unit,
    ans * 10,
    ans / 10,
    ans + (decimals ? 1 : 10),
    ans - (decimals ? 1 : 10),
    round(ans * 1.1, decimals),
    round(ans * 0.9, decimals),
  ].map((x) => num(x));
  const out = [...new Set(pool)].filter((x) => x !== s);
  // Same last digit as the answer makes the last-digit trick useless half the time.
  const sameLast = out.filter((x) => x.slice(-1) === s.slice(-1));
  const others = out.filter((x) => x.slice(-1) !== s.slice(-1));
  return shuffle([s, ...shuffle(sameLast).slice(0, 2), ...shuffle(others)].slice(0, 4));
}

function fracOptions(n: number, d: number): string[] {
  const s = frac(n, d);
  const pool = [frac(n + 1, d), frac(n - 1, d), frac(n, d + 1), frac(n + d, d * 2), frac(d, n || 1), frac(n * 2, d), frac(n + 2, d + 1)];
  const out = [...new Set(pool)].filter((x) => x !== s && !x.startsWith('-') && x !== '0');
  return shuffle([s, ...shuffle(out).slice(0, 3)]);
}

export function ftArith(): ArithQ {
  const k = pick(['add', 'sub', 'mul', 'div', 'dec', 'dec', 'frac', 'miss', 'miss']);
  switch (k) {
    case 'add': {
      const a = randInt(100, 999);
      const b = randInt(100, 999);
      return { text: `${a} + ${b}`, answer: num(a + b), value: a + b, kind: k, options: numberOptions(a + b) };
    }
    case 'sub': {
      const a = randInt(1000, 9999);
      const b = randInt(100, 999);
      return { text: `${a} − ${b}`, answer: num(a - b), value: a - b, kind: k, options: numberOptions(a - b) };
    }
    case 'mul': {
      const [a, b] = chance(0.5) ? [randInt(12, 99), randInt(3, 9)] : [randInt(11, 39), randInt(11, 29)];
      return { text: `${a} × ${b}`, answer: num(a * b), value: a * b, kind: k, options: numberOptions(a * b) };
    }
    case 'div': {
      const b = randInt(3, 19);
      const q = randInt(12, 99);
      return { text: `${b * q} ÷ ${b}`, answer: num(q), value: q, kind: k, options: numberOptions(q) };
    }
    case 'dec': {
      const op = pick(['+', '−', '×', '÷']);
      if (op === '+') {
        const a = dec(1, 99, 2);
        const b = dec(1, 50, 1);
        return { text: `${num(a)} + ${num(b)}`, answer: num(a + b), value: round(a + b, 6), kind: k, options: numberOptions(round(a + b, 6)) };
      }
      if (op === '−') {
        const a = dec(20, 99, 1);
        const b = dec(1, 19, 2);
        return { text: `${num(a)} − ${num(b)}`, answer: num(a - b), value: round(a - b, 6), kind: k, options: numberOptions(round(a - b, 6)) };
      }
      if (op === '×') {
        const a = pick([dec(1, 9, 1), randInt(12, 80)]);
        const b = pick([0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1.5, 2.5, 0.05, 0.12]);
        const v = round(a * b, 6);
        return { text: `${num(a)} × ${num(b)}`, answer: num(v), value: v, kind: k, options: numberOptions(v) };
      }
      const b = randInt(2, 9);
      const q = dec(1, 9, 1);
      return { text: `${num(round(b * q, 6))} ÷ ${b}`, answer: num(q), value: q, kind: k, options: numberOptions(q) };
    }
    case 'frac': {
      const [a, b] = properFrac();
      const [c, d] = properFrac();
      const op = pick(['+', '−', '×', '÷']);
      let n: number, m: number;
      if (op === '+') [n, m] = [a * d + c * b, b * d];
      else if (op === '−') [n, m] = [Math.abs(a * d - c * b) || 1, b * d];
      else if (op === '×') [n, m] = [a * c, b * d];
      else [n, m] = [a * d, b * c];
      // keep "−" positive by ordering the operands
      const [l, r] = op === '−' && a * d < c * b ? [`${c}/${d}`, `${a}/${b}`] : [`${a}/${b}`, `${c}/${d}`];
      if (op === '−' && a * d === c * b) return ftArith();
      const g = gcd(n, m);
      return { text: `${l} ${op} ${r}`, answer: frac(n, m), value: n / m, kind: k, options: fracOptions(n / g, m / g) };
    }
    default: {
      // missing operand
      const shape = pick(['mul', 'add', 'div', 'sub']);
      if (shape === 'mul') {
        const b = randInt(3, 9);
        const x = dec(1, 9, 1);
        return { text: `? × ${b} = ${num(round(x * b, 6))}`, answer: num(x), value: x, kind: 'miss', options: numberOptions(x) };
      }
      if (shape === 'add') {
        const x = dec(10, 99, 1);
        const b = randInt(20, 150);
        return { text: `${b} + ? = ${num(round(b + x, 6))}`, answer: num(x), value: x, kind: 'miss', options: numberOptions(x) };
      }
      if (shape === 'div') {
        const b = pick([4, 5, 8, 2]);
        const r = dec(1, 9, 2);
        const x = round(r * b, 6);
        return { text: `? ÷ ${b} = ${num(r)}`, answer: num(x), value: x, kind: 'miss', options: numberOptions(x) };
      }
      const a = randInt(200, 900);
      const x = randInt(15, 190);
      return { text: `${a} − ? = ${a - x}`, answer: num(x), value: x, kind: 'miss', options: numberOptions(x) };
    }
  }
}

// ---------- typed (sprint / 80 in 8) ----------

export function sprintQ(level: string): ArithQ {
  const op = pick(['add', 'sub', 'mul', 'div']);
  if (level === 'easy') {
    if (op === 'add' || op === 'sub') {
      const a = randInt(2, 60);
      const b = randInt(2, 40);
      return op === 'add'
        ? { text: `${a} + ${b}`, answer: num(a + b), value: a + b, kind: op }
        : { text: `${a + b} − ${b}`, answer: num(a), value: a, kind: op };
    }
    const a = randInt(2, 12);
    const b = randInt(2, 12);
    return op === 'mul'
      ? { text: `${a} × ${b}`, answer: num(a * b), value: a * b, kind: op }
      : { text: `${a * b} ÷ ${a}`, answer: num(b), value: b, kind: op };
  }
  if (level === 'medium') {
    // Zetamac defaults: + on 2–100, × on 2–12 by 2–100, − and ÷ their inverses.
    if (op === 'add' || op === 'sub') {
      const a = randInt(2, 100);
      const b = randInt(2, 100);
      return op === 'add'
        ? { text: `${a} + ${b}`, answer: num(a + b), value: a + b, kind: op }
        : { text: `${a + b} − ${a}`, answer: num(b), value: b, kind: op };
    }
    const a = randInt(2, 12);
    const b = randInt(2, 100);
    return op === 'mul'
      ? { text: `${a} × ${b}`, answer: num(a * b), value: a * b, kind: op }
      : { text: `${a * b} ÷ ${a}`, answer: num(b), value: b, kind: op };
  }
  // hard
  const h = pick(['add', 'sub', 'mul', 'div', 'dec', 'pct']);
  if (h === 'add') {
    const a = randInt(100, 999);
    const b = randInt(100, 999);
    return { text: `${a} + ${b}`, answer: num(a + b), value: a + b, kind: 'add' };
  }
  if (h === 'sub') {
    const a = randInt(300, 999);
    const b = randInt(100, a - 1);
    return { text: `${a} − ${b}`, answer: num(a - b), value: a - b, kind: 'sub' };
  }
  if (h === 'mul') {
    const a = randInt(11, 99);
    const b = randInt(11, 30);
    return { text: `${a} × ${b}`, answer: num(a * b), value: a * b, kind: 'mul' };
  }
  if (h === 'div') {
    const a = randInt(11, 25);
    const b = randInt(11, 60);
    return { text: `${a * b} ÷ ${a}`, answer: num(b), value: b, kind: 'div' };
  }
  if (h === 'dec') {
    const a = dec(1, 20, 1);
    const b = randInt(2, 9);
    const v = round(a * b, 6);
    return chance(0.5)
      ? { text: `${num(a)} × ${b}`, answer: num(v), value: v, kind: 'dec' }
      : { text: `${num(v)} ÷ ${b}`, answer: num(a), value: a, kind: 'dec' };
  }
  const p = pick([5, 10, 12.5, 15, 20, 25, 30, 40, 75]);
  const base = randInt(2, 40) * 20;
  const v = round((p * base) / 100, 6);
  return { text: `${p}% of ${base}`, answer: num(v), value: v, kind: 'pct' };
}

export function eightyQ(): ArithQ {
  const q = chance(0.7) ? sprintQ('hard') : ftArith();
  // Fractions are typed as a/b; decimals with a dot.
  return { ...q, options: undefined };
}

// Is a typed string a correct answer? Accepts "3/4" or "0.75" for 3/4.
export function typedOk(input: string, q: ArithQ): boolean {
  const t = input.trim().replace(',', '.').replace('−', '-');
  if (!t) return false;
  if (t.includes('/')) {
    const [a, b] = t.split('/').map(Number);
    return b !== 0 && Math.abs(a / b - q.value) < 1e-9;
  }
  const x = Number(t);
  return Number.isFinite(x) && Math.abs(x - q.value) < 1e-9 * Math.max(1, Math.abs(q.value)) + 1e-9;
}

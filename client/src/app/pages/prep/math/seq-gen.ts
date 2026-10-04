// Number-sequence generator: the families reported in trading-firm sequence
// tests (arithmetic, geometric, difference ladders, interleaved strands,
// recurrences, operation cycles, powers/primes, index rules, fractions), each
// with the rule written out for the review.
import { chance, pick, randInt, shuffle } from '../rng';

export interface SeqQ {
  terms: string[]; // shown terms
  answer: string; // the next term
  family: string; // key of FAMILY_INFO
  rule: string; // the rule for this instance
  options: string[]; // 5 options incl. the answer (shuffled)
}

export const FAMILY_INFO: Record<string, { name: string; tip: string }> = {
  arith: { name: 'Arithmetic', tip: 'Constant differences. Always compute the differences first.' },
  geom: { name: 'Geometric', tip: 'Constant ratios: terms grow (or shrink) too fast for differences to be constant.' },
  powers: { name: 'Powers', tip: 'Learn squares to 30, cubes to 12 and powers of 2 to 2¹² by heart; look for n² ± k, n³ ± k, 2ⁿ − n, nⁿ.' },
  diff2: { name: 'Second differences', tip: 'Differences change by a constant: take the differences of the differences.' },
  diffgeom: { name: 'Geometric differences', tip: 'The differences themselves multiply (×2, ×3, ×−2): a ladder of differences.' },
  interleave: { name: 'Interleaved strands', tip: 'Erratic jumps: read every other term — two simple sequences are woven together.' },
  fib: { name: 'Fibonacci-like', tip: 'Each term is the sum of the previous two (or three): check t₃ = t₁ + t₂.' },
  cycle: { name: 'Operation cycle', tip: 'The operations repeat in a cycle (+3, ×2, +3, ×2 …): look at the differences and ratios alternately.' },
  linrec: { name: 'Linear recurrence', tip: 'Each term is a·(previous) + b: try ×2, ×3 then fix the constant.' },
  primes: { name: 'Primes', tip: 'Know the primes to 100: 2 3 5 7 11 13 17 19 23 29 31 37 41 43 47 53 59 61 67 71 73 79 83 89 97.' },
  index: { name: 'Index-dependent', tip: 'The step depends on the position: differences 1, 2, 3, 4 … or ratios ×1, ×2, ×3 …' },
  subrec: { name: 'Subtractive recurrence', tip: 'Shrinking and changing sign: each term is a difference of the previous two.' },
  product: { name: 'Product recurrence', tip: 'Explodes fast: each term is the product of the previous two.' },
  digits: { name: 'Digit rules', tip: 'Small irregular steps: try adding the digit sum (or the last digit) of the previous term.' },
  fraction: { name: 'Fractions', tip: 'Treat the numerators and the denominators as two separate sequences.' },
};

type Gen = () => { terms: number[]; next: number; rule: string; alts?: number[] };

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113];
const sgn = (x: number) => (x < 0 ? `− ${-x}` : `+ ${x}`);
const diffs = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i]);

function seqOf(n: number, a0: number, f: (prev: number, i: number, all: number[]) => number): number[] {
  const out = [a0];
  for (let i = 1; i < n; i++) out.push(f(out[i - 1], i, out));
  return out;
}

const GENS: Record<string, { tier: number; gen: Gen }[]> = {
  arith: [
    {
      tier: 1,
      gen: () => {
        const a = randInt(-20, 60);
        const d = pick([-13, -9, -7, -6, -4, 3, 4, 6, 7, 8, 9, 11, 12, 15, 17, 25]);
        const s = seqOf(7, a, (p) => p + d);
        return { terms: s.slice(0, 6), next: s[6], rule: `Add ${d} each time (${sgn(d)}).` };
      },
    },
  ],
  geom: [
    {
      tier: 1,
      gen: () => {
        const r = pick([2, 3, -2, 4]);
        const a = randInt(1, r === 4 ? 3 : 7);
        const s = seqOf(6, a, (p) => p * r);
        return { terms: s.slice(0, 5), next: s[5], rule: `Multiply by ${r} each time.` };
      },
    },
    {
      tier: 1,
      gen: () => {
        const r = pick([2, 3]);
        const s = seqOf(6, r ** 5 * randInt(1, 3), (p) => p / r);
        return { terms: s.slice(0, 5), next: s[5], rule: `Divide by ${r} each time.` };
      },
    },
  ],
  powers: [
    {
      tier: 1,
      gen: () => {
        const n0 = randInt(1, 9);
        const k = pick([0, 0, 1, -1, 2, 3]);
        const s = Array.from({ length: 7 }, (_, i) => (n0 + i) ** 2 + k);
        return { terms: s.slice(0, 6), next: s[6], rule: `Squares: tₙ = n²${k ? ' ' + sgn(k) : ''} for n = ${n0}, ${n0 + 1}, ${n0 + 2}, …` };
      },
    },
    {
      tier: 2,
      gen: () => {
        const n0 = randInt(1, 5);
        const k = pick([0, 1, -1, 2]);
        const s = Array.from({ length: 6 }, (_, i) => (n0 + i) ** 3 + k);
        return { terms: s.slice(0, 5), next: s[5], rule: `Cubes: tₙ = n³${k ? ' ' + sgn(k) : ''} for n = ${n0}, ${n0 + 1}, ${n0 + 2}, …` };
      },
    },
    {
      tier: 3,
      gen: () => {
        const s = Array.from({ length: 6 }, (_, i) => 2 ** (i + 1) - (i + 1));
        const t = chance(0.5) ? s : Array.from({ length: 6 }, (_, i) => (i + 1) ** (i + 1));
        return {
          terms: t.slice(0, 5),
          next: t[5],
          rule: t === s ? 'tₙ = 2ⁿ − n: 1, 2, 5, 12, 27, 58.' : 'tₙ = nⁿ: 1, 4, 27, 256, 3125, 46656.',
        };
      },
    },
  ],
  diff2: [
    {
      tier: 2,
      gen: () => {
        const a = randInt(1, 30);
        const d0 = randInt(-3, 6);
        const s2 = pick([2, 3, 4, -2, 5]);
        const s = seqOf(7, a, (p, i) => p + d0 + s2 * (i - 1));
        return {
          terms: s.slice(0, 6),
          next: s[6],
          rule: `Differences ${diffs(s).slice(0, 5).join(', ')} grow by ${s2}; next difference ${d0 + s2 * 5}.`,
          alts: [s[5] + (s[5] - s[4])],
        };
      },
    },
  ],
  diffgeom: [
    {
      tier: 3,
      gen: () => {
        const r = pick([2, -2, 3]);
        const d0 = pick([1, 2, 3]);
        const a = randInt(1, 20);
        const s = seqOf(7, a, (p, i) => p + d0 * r ** (i - 1));
        return {
          terms: s.slice(0, 6),
          next: s[6],
          rule: `Differences ${diffs(s).slice(0, 5).join(', ')} are multiplied by ${r} each time; next difference ${d0 * r ** 5}.`,
          alts: [s[5] + (s[5] - s[4]), s[5] + 2 * (s[5] - s[4]) * -1],
        };
      },
    },
  ],
  interleave: [
    {
      tier: 2,
      gen: () => {
        const a = randInt(1, 20);
        const b = randInt(20, 60);
        const da = pick([2, 3, 4, 5, 7]);
        const db = pick([-3, -4, -5, -6, 6, 10]);
        const s = Array.from({ length: 8 }, (_, i) => (i % 2 === 0 ? a + (i / 2) * da : b + ((i - 1) / 2) * db));
        return {
          terms: s.slice(0, 7),
          next: s[7],
          rule: `Two strands: odd positions ${a}, ${a + da}, … (${sgn(da)}); even positions ${b}, ${b + db}, … (${sgn(db)}).`,
          alts: [s[6] + da, s[6] + db],
        };
      },
    },
    {
      tier: 3,
      gen: () => {
        // one doubling strand, one Fibonacci-like strand
        const a = randInt(1, 4);
        const f = seqOf(4, randInt(1, 3), (p, i, all) => (i === 1 ? p + randInt(1, 3) : p + all[i - 2]));
        const g = seqOf(4, a, (p) => p * 2);
        const s = [g[0], f[0], g[1], f[1], g[2], f[2], g[3], f[3]];
        return {
          terms: s.slice(0, 7),
          next: s[7],
          rule: `Two strands: odd positions double (${g.join(', ')}); even positions are Fibonacci-like (${f.join(', ')}), each the sum of the two before.`,
          alts: [g[3] * 2, f[2] * 2, f[2] + f[2] - f[1]],
        };
      },
    },
  ],
  fib: [
    {
      tier: 2,
      gen: () => {
        const s = seqOf(8, randInt(1, 6), (p, i, all) => (i === 1 ? randInt(1, 8) : p + all[i - 2]));
        return { terms: s.slice(0, 7), next: s[7], rule: 'Each term is the sum of the two before it.', alts: [s[6] * 2, s[6] + s[6] - s[5]] };
      },
    },
    {
      tier: 3,
      gen: () => {
        const s = seqOf(8, randInt(0, 2), (p, i, all) => (i < 3 ? randInt(1, 3) : p + all[i - 2] + all[i - 3]));
        return { terms: s.slice(0, 7), next: s[7], rule: 'Each term is the sum of the three before it (tribonacci).', alts: [s[6] + s[5]] };
      },
    },
    {
      tier: 3,
      gen: () => {
        const c = pick([1, -1, 2]);
        const s = seqOf(7, randInt(1, 4), (p, i, all) => (i === 1 ? randInt(2, 5) : p + all[i - 2] + c));
        return { terms: s.slice(0, 6), next: s[6], rule: `Each term is the sum of the two before it, ${sgn(c)}.`, alts: [s[5] + s[4]] };
      },
    },
  ],
  cycle: [
    {
      tier: 2,
      gen: () => {
        const add = pick([1, 2, 3, 4, 5, -1, -2]);
        const mul = pick([2, 3]);
        const s = seqOf(8, randInt(1, 6), (p, i) => (i % 2 === 1 ? p + add : p * mul));
        return { terms: s.slice(0, 7), next: s[7], rule: `Alternately ${sgn(add)} and × ${mul}.`, alts: [s[6] + add, s[6] * mul + add] };
      },
    },
    {
      tier: 3,
      gen: () => {
        const ops = shuffle<[string, (x: number) => number]>([
          ['+ 3', (x) => x + 3],
          ['× 2', (x) => x * 2],
          ['− 1', (x) => x - 1],
          ['+ 5', (x) => x + 5],
          ['× 3', (x) => x * 3],
        ]).slice(0, 3);
        const s = seqOf(9, randInt(1, 5), (p, i) => ops[(i - 1) % 3][1](p));
        return { terms: s.slice(0, 8), next: s[8], rule: `Repeating cycle of operations: ${ops.map((o) => o[0]).join(', then ')}.` };
      },
    },
  ],
  linrec: [
    {
      tier: 2,
      gen: () => {
        const a = pick([2, 3]);
        const b = pick([1, -1, 2, -2, 3]);
        const s = seqOf(6, randInt(1, 5), (p) => a * p + b);
        return { terms: s.slice(0, 5), next: s[5], rule: `Each term is ${a} × previous ${sgn(b)}.`, alts: [s[4] * a, s[4] + (s[4] - s[3])] };
      },
    },
  ],
  primes: [
    {
      tier: 2,
      gen: () => {
        const i0 = randInt(0, 10);
        const k = pick([0, 0, 1, -1, 2]);
        const m = pick([1, 1, 2]);
        const s = PRIMES.slice(i0, i0 + 7).map((p) => m * p + k);
        const desc = `${m === 2 ? '2 × ' : ''}consecutive primes${k ? ' ' + sgn(k) : ''}: ${PRIMES.slice(i0, i0 + 7).join(', ')}`;
        return { terms: s.slice(0, 6), next: s[6], rule: desc + '.', alts: [s[5] + (s[5] - s[4]), s[5] + 2 * m] };
      },
    },
    {
      tier: 3,
      gen: () => {
        // running sums of primes
        const s = seqOf(7, 2, (p, i) => p + PRIMES[i]);
        return { terms: s.slice(0, 6), next: s[6], rule: 'Running sums of the primes: 2, 2+3, 2+3+5, …', alts: [s[5] + 11, s[5] + 15] };
      },
    },
  ],
  index: [
    {
      tier: 3,
      gen: () => {
        const a = randInt(1, 10);
        const k = pick([0, 1, 2]);
        const s = seqOf(7, a, (p, i) => p + i + k);
        return {
          terms: s.slice(0, 6),
          next: s[6],
          rule: `Add ${1 + k}, ${2 + k}, ${3 + k}, … (the step grows by one each time).`,
          alts: [s[5] + 5 + k],
        };
      },
    },
    {
      tier: 3,
      gen: () => {
        const s = seqOf(6, randInt(1, 2), (p, i) => p * (i + 1));
        return { terms: s.slice(0, 5), next: s[5], rule: 'Multiply by 2, 3, 4, 5, … in turn.', alts: [s[4] * 5] };
      },
    },
    {
      tier: 3,
      gen: () => {
        const s = seqOf(7, randInt(1, 6), (p, i) => p * 2 - i);
        return { terms: s.slice(0, 6), next: s[6], rule: 'Double, then subtract the position: tₙ = 2·tₙ₋₁ − (n − 1).', alts: [s[5] * 2, s[5] * 2 - 5] };
      },
    },
  ],
  subrec: [
    {
      tier: 3,
      gen: () => {
        const a = randInt(30, 90);
        const b = randInt(10, Math.floor(a / 2));
        const s = seqOf(7, a, (p, i, all) => (i === 1 ? b : all[i - 2] - p));
        return { terms: s.slice(0, 6), next: s[6], rule: 'Each term is the one two places back minus the previous one: tₙ = tₙ₋₂ − tₙ₋₁.', alts: [s[5] - s[4], -s[6]] };
      },
    },
  ],
  product: [
    {
      tier: 3,
      gen: () => {
        const s = seqOf(6, pick([1, 2]), (p, i, all) => (i === 1 ? pick([2, 3]) : p * all[i - 2]));
        return { terms: s.slice(0, 5), next: s[5], rule: 'Each term is the product of the two before it.', alts: [s[4] * 2, s[4] + s[3]] };
      },
    },
  ],
  digits: [
    {
      tier: 3,
      gen: () => {
        const ds = (x: number) => String(Math.abs(x)).split('').reduce((a, c) => a + +c, 0);
        const s = seqOf(7, randInt(10, 60), (p) => p + ds(p));
        return { terms: s.slice(0, 6), next: s[6], rule: 'Add the digit sum of the previous term (e.g. 23 → 23 + 2 + 3 = 28).', alts: [s[5] + (s[5] - s[4])] };
      },
    },
  ],
};

// Fractions are generated separately (two integer strands).
function fractionQ(): { terms: string[]; next: string; rule: string; alts: string[] } {
  const n0 = randInt(1, 5);
  const dn = pick([1, 2]);
  const d0 = n0 + randInt(1, 3);
  const fibDen = chance(0.4);
  const nums = Array.from({ length: 6 }, (_, i) => n0 + i * dn);
  const dens = fibDen ? seqOf(6, d0, (p, i, all) => (i === 1 ? d0 + 1 : p + all[i - 2])) : Array.from({ length: 6 }, (_, i) => d0 + i * (dn + 1));
  const t = nums.map((n, i) => `${n}/${dens[i]}`);
  return {
    terms: t.slice(0, 5),
    next: t[5],
    rule: `Numerators ${nums.join(', ')} (${sgn(dn)}); denominators ${dens.join(', ')} (${fibDen ? 'each the sum of the two before' : sgn(dn + 1)}).`,
    alts: [
      `${nums[5]}/${dens[4] + (dens[4] - dens[3])}`,
      `${nums[5] + 1}/${dens[5]}`,
      `${nums[4]}/${dens[5]}`,
      `${nums[5]}/${dens[5] + 1}`,
      `${nums[5] + dn}/${dens[5] + 1}`,
    ],
  };
}

function distractors(answer: number, alts: number[] = [], terms: number[]): number[] {
  const last = terms[terms.length - 1];
  const d = last - terms[terms.length - 2];
  const mag = Math.max(1, Math.round(Math.abs(answer) * 0.04));
  const pool = [...alts, answer + 1, answer - 1, answer + 2, answer - 2, answer + mag * 3, answer - mag * 3, last + d, answer + d, answer * 2, answer + 10, answer - 10];
  const out: number[] = [];
  for (const x of shuffle(pool.slice(0, alts.length)).concat(shuffle(pool.slice(alts.length))))
    if (Number.isFinite(x) && Number.isInteger(x) && x !== answer && !out.includes(x)) out.push(x);
  return out.slice(0, 4);
}

// One sequence question at a tier (1 easy … 3 hard).
export function makeSeq(tier: number): SeqQ {
  const families = Object.keys(GENS).filter((f) => GENS[f].some((g) => g.tier <= tier));
  const useFraction = tier >= 3 && chance(0.1);
  if (useFraction) {
    const f = fractionQ();
    return { terms: f.terms, answer: f.next, family: 'fraction', rule: f.rule, options: shuffle([f.next, ...[...new Set(f.alts)].filter((a) => a !== f.next).slice(0, 4)]) };
  }
  // Prefer generators at exactly this tier, so hard tests are actually hard.
  let fam = pick(families);
  let gens = GENS[fam].filter((g) => g.tier === tier);
  for (let k = 0; !gens.length && k < 20; k++) {
    fam = pick(families);
    gens = GENS[fam].filter((g) => g.tier === tier);
  }
  if (!gens.length) gens = GENS[fam].filter((g) => g.tier <= tier);
  for (let attempt = 0; attempt < 30; attempt++) {
    const r = pick(gens).gen();
    if (![...r.terms, r.next].every((x) => Number.isInteger(x) && Math.abs(x) < 1e7)) continue;
    const opts = distractors(r.next, r.alts, r.terms);
    if (opts.length < 4) continue;
    return {
      terms: r.terms.map(String),
      answer: String(r.next),
      family: fam,
      rule: r.rule,
      options: shuffle([String(r.next), ...opts.map(String)]),
    };
  }
  return makeSeq(1);
}

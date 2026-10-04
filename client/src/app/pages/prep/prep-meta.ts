// Catalogue of the trading games and maths drills: names, the firms whose
// interviews they imitate, the levels and how a run is scored. The ids and
// level keys must match GAMES in server/src/games.js.

export type Level = 'easy' | 'medium' | 'hard' | 'test';

export interface LevelInfo {
  key: Level;
  label: string;
  detail: string;
}

export interface PrepItem {
  id: string;
  kind: 'trading' | 'math';
  title: string;
  glyph: string;
  firms: string[];
  blurb: string;
  // How to play, shown on the lobby; markdown-free plain sentences.
  rules: string[];
  // What the interviewer is actually grading.
  watch: string[];
  levels: LevelInfo[];
  unit: string; // what the score counts
  money?: boolean; // score is a P&L
}

export const TRADING: PrepItem[] = [
  {
    id: 'mm-dice',
    kind: 'trading',
    title: 'Market making on dice',
    glyph: '⚄',
    firms: ['Optiver', 'SIG', 'IMC', 'Flow Traders'],
    blurb: 'A contract settles on the sum of hidden dice. Quote a two-way price, the street trades against you, a die is revealed, quote again.',
    rules: [
      'Each hand is one contract that pays the sum of the dice shown face down. Dice are revealed one at a time.',
      'Before every reveal you quote a bid and an ask (at most the level\'s maximum width apart). You do not choose which side trades: traders buy at your ask if they think the contract is worth more, sell at your bid if they think it is worth less.',
      'Most traders are noise: they value the contract at the fair value plus a random error. Some are informed: they already know a hidden die, or the total. Tight quotes get you more noise flow; informed traders pick you off whatever you do.',
      'At the end of the hand your position settles at the true sum. Score = total P&L over 5 hands.',
    ],
    watch: [
      'Fair value: the expected sum, updated the instant a die is revealed (a d6 is worth 3.5, a d10 5.5, a d20 10.5).',
      'Width: tight enough to trade, wide enough to survive adverse selection.',
      'Skew: when long, lower both prices to sell; when short, raise them.',
      'Reading flow: if you keep getting lifted, your ask is too low — someone knows something.',
    ],
    levels: [
      { key: 'easy', label: 'Easy', detail: '3 × d6 · max width 4 · noise traders only · no clock' },
      { key: 'medium', label: 'Medium', detail: 'd6 d6 d8 d10 · max width 3 · 25% informed · 25 s per quote' },
      { key: 'hard', label: 'Hard', detail: 'd6 d8 d10 d12 d20 · max width 2 · 40% informed · 1–3 lots · 12 s per quote' },
    ],
    unit: 'P&L over 5 hands',
    money: true,
  },
  {
    id: 'card-market',
    kind: 'trading',
    title: 'Card market taking',
    glyph: '♠',
    firms: ['SIG', 'Jane Street', 'Optiver'],
    blurb: 'Market makers quote you the sum of cards dealt face down. Spot the edge, choose a side and a size, before the next card flips.',
    rules: [
      'The contract pays the sum of a few cards dealt face down from a deck (ace = 1 … king = 13). Cards flip one at a time.',
      'Each round, market makers show you two-way prices. Buy at an ask, sell at a bid, or pass, and choose your size.',
      'Their quotes are centred on their own estimate, which is sometimes off — that is your edge. On the harder levels some makers have peeked at a hidden card, so a quote that looks wrong can be right.',
      'Positions settle at the true sum after the last card. Score = total P&L over 5 hands.',
    ],
    watch: [
      'Fair value without replacement: each hidden card is worth the average of the cards still in the deck, not 7.',
      'Edge = distance between your fair value and the price you trade at; take the best bid or ask on the screen.',
      'Size to edge: big edge, big size; marginal edge, pass.',
      'Adverse selection: an unusually generous price can mean the other side knows more.',
    ],
    levels: [
      { key: 'easy', label: 'Easy', detail: '3 cards from 1–10 · one maker · size 1 · no clock' },
      { key: 'medium', label: 'Medium', detail: '5 cards from a 52-card deck · two makers · size 1–3 · 20 s per round' },
      { key: 'hard', label: 'Hard', detail: '5 cards, some known removed from the deck · three makers, one may be informed · size 1–5 · 10 s' },
    ],
    unit: 'P&L over 5 hands',
    money: true,
  },
  {
    id: 'etf-arb',
    kind: 'trading',
    title: 'ETF arbitrage',
    glyph: '≈',
    firms: ['Flow Traders', 'IMC', 'Optiver', 'Jane Street'],
    blurb: 'Live prices. Work out the ETF\'s fair value from its basket in your head, hit mispriced quotes, hedge with the basket.',
    rules: [
      'An ETF holds a fixed basket of stocks; its fair value (NAV) is the weighted sum of the stock prices. Stock prices tick live.',
      'Three bots quote the ETF. Their quotes lag the basket and sometimes drift off — buy below NAV, sell above.',
      'You can hedge your ETF position by trading the basket (at a small cost), which locks in the gap and removes market risk.',
      'When the clock stops, the ETF position and the basket hedge are marked at the final NAV. Score = P&L.',
    ],
    watch: [
      'Speed of the NAV computation: weights × prices, in your head, every tick.',
      'Only trading when the edge beats the fees.',
      'Hedging: an unhedged position is a bet on the market, not an arbitrage.',
      'Position limits: the hard level caps how much you can hold.',
    ],
    levels: [
      { key: 'easy', label: 'Easy', detail: '2 stocks, weights 1 · slow ticks · no fees · 90 s' },
      { key: 'medium', label: 'Medium', detail: '3 stocks with weights · fees · limit 20 · 90 s' },
      { key: 'hard', label: 'Hard', detail: '4 stocks incl. a USD one priced in EUR · faster · fees · limit 20 · 120 s' },
    ],
    unit: 'P&L',
    money: true,
  },
  {
    id: 'fermi',
    kind: 'trading',
    title: 'Fermi markets',
    glyph: '?',
    firms: ['Optiver', 'SIG', 'Jane Street', 'Flow Traders'],
    blurb: '"Make me a market on the number of …" Quote a bid and an ask; the narrower the market that still holds the truth, the more you score.',
    rules: [
      'Each question is a quantity you probably do not know exactly. Quote a bid (low) and an ask (high).',
      'If the true value lies inside your market you score, more for a tighter market (measured as a ratio, so 100–200 is as wide as 1000–2000).',
      'If the truth is outside, the interviewer trades against you and you lose points, more the further out it is.',
      'Score = total points over the round.',
    ],
    watch: [
      'Decomposition: break the quantity into factors you can estimate.',
      'Calibration: a market that misses more than one time in ten is too tight; one that never misses is too wide.',
      'Orders of magnitude matter more than the second digit.',
    ],
    levels: [
      { key: 'easy', label: 'Easy', detail: '8 everyday questions · no clock' },
      { key: 'medium', label: 'Medium', detail: '12 questions · 45 s each' },
      { key: 'hard', label: 'Hard', detail: '15 harder questions · 25 s each' },
    ],
    unit: 'points',
  },
];

export const MATH: PrepItem[] = [
  {
    id: 'ft-arith',
    kind: 'math',
    title: 'Flow Traders arithmetic test',
    glyph: '÷',
    firms: ['Flow Traders'],
    blurb: 'The format reported for the Flow Traders online assessment: 8 minutes, multiple choice, no skipping, wrong answers cost a point.',
    rules: [
      '40 questions in 8 minutes: addition, subtraction, multiplication and division on integers, decimals and fractions, some with the unknown in the middle (? × 6 = 13.8).',
      '4 options each. You cannot skip: answer to move on.',
      'Score = correct − wrong. Most candidates do not finish, so accuracy beats speed.',
    ],
    watch: ['Accuracy first: a wrong answer is a two-point swing against a non-answer.', 'Estimate to eliminate options (last digit, order of magnitude) instead of computing exactly.'],
    levels: [{ key: 'test', label: 'Real test', detail: '40 questions · 8 min · +1 / −1' }],
    unit: 'correct − wrong',
  },
  {
    id: 'ft-seq',
    kind: 'math',
    title: 'Flow Traders sequences test',
    glyph: '…',
    firms: ['Flow Traders', 'IMC'],
    blurb: 'Find the next term. 30 sequences ramping from easy to hard in 25 minutes, five options, skips allowed, wrong answers cost a point.',
    rules: [
      '30 sequences in 25 minutes, easiest first. Five options each.',
      'You may skip (0 points) but not go back. Correct +1, wrong −1.',
      'After the test every sequence is shown with its rule.',
    ],
    watch: [
      'Try differences first, then ratios, then two interleaved sequences, then recurrences (each term from the previous two).',
      'Skip when you have no idea: guessing among five costs you on average.',
    ],
    levels: [{ key: 'test', label: 'Real test', detail: '30 sequences · 25 min · skip allowed · +1 / −1' }],
    unit: 'correct − wrong',
  },
  {
    id: 'seq-practice',
    kind: 'math',
    title: 'Sequence practice',
    glyph: 'aₙ',
    firms: ['Flow Traders', 'IMC', 'Optiver'],
    blurb: 'Rounds of 12 sequences with the rule explained after every answer, so you learn the families the tests draw from.',
    rules: [
      '12 sequences per round, typed answer or five options (your choice).',
      'After each answer you see the rule, the full sequence, and how to spot that family.',
      'Your accuracy per family is saved, so the summary shows which kinds still trip you up.',
    ],
    watch: ['The families: arithmetic, geometric, second differences, interleaved, recurrences (Fibonacci-like), operation cycles, squares/cubes/primes, index-dependent rules, fractions.'],
    levels: [
      { key: 'easy', label: 'Easy', detail: 'one-step rules' },
      { key: 'medium', label: 'Medium', detail: 'differences of differences, interleaving, recurrences' },
      { key: 'hard', label: 'Hard', detail: 'mixed recurrences, operation cycles, index rules, fractions' },
    ],
    unit: 'correct − wrong',
  },
  {
    id: 'sprint',
    kind: 'math',
    title: '2-minute arithmetic sprint',
    glyph: '+',
    firms: ['Optiver', 'Jane Street', 'SIG', 'IMC'],
    blurb: 'The Zetamac-style warm-up traders use daily: type answers as fast as you can for 120 seconds; the next question appears as soon as you are right.',
    rules: ['120 seconds. Type the answer — it is accepted the moment it is correct, no Enter needed.', 'Score = number of correct answers.'],
    watch: ['Rhythm: a good score is 40+ on medium, 60+ is strong.'],
    levels: [
      { key: 'easy', label: 'Easy', detail: '+ − up to 100 · × ÷ tables to 12' },
      { key: 'medium', label: 'Medium', detail: 'Zetamac default: + − 2–100, × ÷ 2–12 by 2–100' },
      { key: 'hard', label: 'Hard', detail: '3-digit ± · 2-digit × 2-digit · decimals · percentages' },
    ],
    unit: 'correct',
  },
  {
    id: 'eighty-in-eight',
    kind: 'math',
    title: '80 in 8',
    glyph: '80',
    firms: ['Optiver'],
    blurb: 'The classic market-maker screen format: 80 typed arithmetic questions in 8 minutes, decimals and fractions included.',
    rules: ['80 questions, 8 minutes, typed answers (decimals with a dot; fractions as decimals are fine when exact).', 'Enter submits, and you may skip. Score = correct − wrong.'],
    watch: ['Pace: 6 seconds a question. Skip anything that would take three times that.'],
    levels: [{ key: 'test', label: 'Real test', detail: '80 questions · 8 min · +1 / −1' }],
    unit: 'correct − wrong',
  },
];

export const ALL_PREP = [...TRADING, ...MATH];
export const prepItem = (id: string) => ALL_PREP.find((x) => x.id === id);

export const LEVEL_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', test: 'Test' };

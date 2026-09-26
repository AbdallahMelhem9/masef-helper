import { Component, input } from '@angular/core';
import { TeaserBook, TeaserSection } from '../../core/models';

export const SECTIONS: TeaserSection[] = ['brainteaser', 'probability', 'trading'];

export const SECTION_INFO: Record<TeaserSection, { title: string; blurb: string; glyph: string }> = {
  brainteaser: {
    title: 'Brain teasers',
    blurb: 'Logic, strategy, weighing, numbers, invariants, mental math: the puzzles interviewers open with.',
    glyph: '?',
  },
  probability: {
    title: 'Probability',
    blurb: 'Counting, conditioning, expectation, random walks, stopping times: the quant core.',
    glyph: 'P',
  },
  trading: {
    title: 'Trading & markets',
    blurb: 'Market-making games, options and Greeks, market microstructure and risk.',
    glyph: '$',
  },
};

// Same order as server/scripts/build-teasers.js.
export const CATEGORIES: Record<TeaserSection, string[]> = {
  brainteaser: [
    'Logic & deduction',
    'Strategy & games',
    'Weighing & searching',
    'Numbers & digits',
    'Invariants, parity & pigeonhole',
    'Induction & recursion',
    'Geometry & space',
    'Clocks, rates & motion',
    'Estimation & lateral thinking',
    'Calculus & algebra',
    'Mental math',
  ],
  probability: [
    'Counting & combinatorics',
    'Conditional probability & Bayes',
    'Expected value',
    'Variance & correlation',
    'Continuous & geometric probability',
    'Distributions',
    'Order statistics',
    'Games & optimal stopping',
    'Markov chains & random walks',
    'Martingales & stopping times',
    'Brownian motion',
    'Statistics & estimation',
  ],
  trading: ['Market making', 'Options & Greeks', 'Markets & risk'],
};

// Where puzzles come from: the three books, then the free question banks.
export const BOOKS: { key: TeaserBook; label: string; full: string }[] = [
  { key: 'green', label: 'Green book', full: 'A Practical Guide to Quantitative Finance Interviews (Zhou)' },
  { key: 'red', label: 'Red book', full: 'Quant Job Interview Questions and Answers (Joshi, Denson, Downes)' },
  { key: 'heard', label: 'Heard on the Street', full: 'Heard on the Street (Crack)' },
  { key: 'quantqa', label: 'QuantQA', full: 'QuantQA dataset (CoachQuant / ReinforceNow, MIT licence)' },
  { key: 'wso', label: 'WSO', full: 'Wall Street Oasis forum' },
  { key: 'everythingquant', label: 'EverythingQuant', full: 'EverythingQuant forum' },
  { key: 'quantt', label: 'Quantt', full: 'Quantt interview guides' },
];

export const categorySlug = (c: string) =>
  c
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const firmSlug = categorySlug;

export function isSection(s: string | null): s is TeaserSection {
  return s === 'brainteaser' || s === 'probability' || s === 'trading';
}

@Component({
  selector: 'app-book-tags',
  template: `@for (b of books(); track b) {
      <span [class]="'book-tag book-' + b" [title]="full(b)">{{ label(b) }}</span>
    }
    @for (f of firms(); track f) {
      <span class="firm-tag" [title]="'Asked at ' + f">{{ f }}</span>
    }`,
  styles: `
    :host { display: inline-flex; flex-wrap: wrap; gap: 5px; }
    .book-tag, .firm-tag {
      font-family: var(--font-mono);
      font-size: 10.5px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: 20px;
      border: 1px solid;
      white-space: nowrap;
    }
    .book-green { color: #25643f; background: #e6f2ea; border-color: #b6d8c2; }
    .book-red { color: #9c322d; background: #f9e9e8; border-color: #e8bcb9; }
    .book-heard { color: #1f3fa3; background: #e5eafb; border-color: #b7c6f2; }
    .book-quantqa, .book-wso, .book-everythingquant, .book-quantt { color: #6b4f0e; background: #f7ecce; border-color: #e6d09a; }
    .firm-tag {
      color: #fff;
      background: var(--board);
      border-color: var(--board);
      text-transform: none;
      letter-spacing: 0.02em;
    }
  `,
})
export class BookTags {
  books = input.required<TeaserBook[]>();
  firms = input<string[]>([]);
  label = (b: TeaserBook) => BOOKS.find((x) => x.key === b)?.label ?? b;
  full = (b: TeaserBook) => BOOKS.find((x) => x.key === b)?.full ?? b;
}

import { Component, input } from '@angular/core';
import { TeaserBook, TeaserSection } from '../../core/models';

export const SECTION_INFO: Record<TeaserSection, { title: string; blurb: string }> = {
  brainteaser: {
    title: 'Brain teasers',
    blurb: 'Logic, strategy, weighing, numbers, invariants: the puzzles interviewers open with.',
  },
  probability: {
    title: 'Probability',
    blurb: 'Counting, conditioning, expectation, random walks, stopping times: the quant core.',
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
};

export const BOOKS: { key: TeaserBook; label: string; full: string }[] = [
  { key: 'green', label: 'Green book', full: 'A Practical Guide to Quantitative Finance Interviews (Zhou)' },
  { key: 'red', label: 'Red book', full: 'Quant Job Interview Questions and Answers (Joshi, Denson, Downes)' },
  { key: 'heard', label: 'Heard on the Street', full: 'Heard on the Street (Crack)' },
];

export const categorySlug = (c: string) =>
  c
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function isSection(s: string | null): s is TeaserSection {
  return s === 'brainteaser' || s === 'probability';
}

@Component({
  selector: 'app-book-tags',
  template: `@for (b of books(); track b) {
    <span class="book-tag" [class]="'book-tag book-' + b" [title]="full(b)">{{ label(b) }}</span>
  }`,
  styles: `
    :host { display: inline-flex; flex-wrap: wrap; gap: 5px; }
    .book-tag {
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
  `,
})
export class BookTags {
  books = input.required<TeaserBook[]>();
  label = (b: TeaserBook) => BOOKS.find((x) => x.key === b)?.label ?? b;
  full = (b: TeaserBook) => BOOKS.find((x) => x.key === b)?.full ?? b;
}

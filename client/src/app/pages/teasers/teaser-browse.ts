import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { TeaserBook, TeaserSection, TeaserSummary } from '../../core/models';
import { BOOKS, BookTags, CATEGORIES, SECTION_INFO, categorySlug, isSection } from './teaser-meta';

const BOOK_FILTER_KEY = 'masef_teaser_books';
const HIDE_DONE_KEY = 'masef_teaser_hide_done';

interface Group {
  name: string;
  slug: string;
  total: number;
  done: number;
}

// /teasers: the two sections; /teasers/:section: its categories;
// /teasers/:section/:category: the puzzles of one category.
@Component({
  selector: 'app-teaser-browse',
  imports: [RouterLink, BookTags],
  templateUrl: './teaser-browse.html',
  styleUrl: './teasers.css',
})
export class TeaserBrowse implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  all = signal<TeaserSummary[] | null>(null);
  error = signal('');
  section = signal<TeaserSection | null>(null);
  categoryKey = signal<string | null>(null);
  books = signal<TeaserBook[]>(loadBooks());
  hideDone = signal(localStorage.getItem(HIDE_DONE_KEY) === '1');

  readonly BOOKS = BOOKS;
  readonly SECTION_INFO = SECTION_INFO;
  readonly sections: TeaserSection[] = ['brainteaser', 'probability'];

  // The list with the book filter applied (a puzzle shows if it is in any selected book).
  filtered = computed(() => {
    const list = this.all() ?? [];
    const books = this.books();
    return books.length === 3 ? list : list.filter((t) => t.books.some((b) => books.includes(b)));
  });

  sectionStats = computed(() => {
    const out = {} as Record<TeaserSection, { total: number; done: number }>;
    for (const s of this.sections) {
      const list = this.filtered().filter((t) => t.section === s);
      out[s] = { total: list.length, done: list.filter((t) => t.completed).length };
    }
    return out;
  });

  groups = computed<Group[]>(() => {
    const s = this.section();
    if (!s) return [];
    const list = this.filtered().filter((t) => t.section === s);
    return CATEGORIES[s]
      .map((name) => {
        const items = list.filter((t) => t.category === name);
        return { name, slug: categorySlug(name), total: items.length, done: items.filter((t) => t.completed).length };
      })
      .filter((g) => g.total > 0);
  });

  category = computed(() => {
    const s = this.section();
    const key = this.categoryKey();
    if (!s || !key) return null;
    return CATEGORIES[s].find((c) => categorySlug(c) === key) ?? null;
  });

  items = computed(() => {
    const cat = this.category();
    if (!cat) return [];
    const list = this.filtered().filter((t) => t.section === this.section() && t.category === cat);
    return this.hideDone() ? list.filter((t) => !t.completed) : list;
  });

  categoryTotals = computed(() => {
    const cat = this.category();
    const list = this.filtered().filter((t) => t.section === this.section() && t.category === cat);
    return { total: list.length, done: list.filter((t) => t.completed).length };
  });

  ngOnInit() {
    this.route.paramMap.subscribe((p) => {
      const s = p.get('section');
      this.section.set(isSection(s) ? s : null);
      this.categoryKey.set(p.get('category'));
    });
    this.api
      .getTeasers()
      .then((list) => this.all.set(list))
      .catch((err) => this.error.set(err?.error?.error || 'Could not load the puzzles'));
  }

  toggleBook(b: TeaserBook) {
    const cur = this.books();
    let next = cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b];
    if (next.length === 0) next = BOOKS.map((x) => x.key);
    this.books.set(next);
    localStorage.setItem(BOOK_FILTER_KEY, JSON.stringify(next));
  }

  toggleHideDone() {
    this.hideDone.update((v) => !v);
    localStorage.setItem(HIDE_DONE_KEY, this.hideDone() ? '1' : '0');
  }

  pct(done: number, total: number): number {
    return total ? Math.round((100 * done) / total) : 0;
  }
}

function loadBooks(): TeaserBook[] {
  try {
    const v = JSON.parse(localStorage.getItem(BOOK_FILTER_KEY) || 'null');
    if (Array.isArray(v) && v.length) return v.filter((b) => BOOKS.some((x) => x.key === b));
  } catch {
    /* default below */
  }
  return BOOKS.map((x) => x.key);
}

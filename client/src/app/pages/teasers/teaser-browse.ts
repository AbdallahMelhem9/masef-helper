import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { TeaserBook, TeaserSection, TeaserSummary } from '../../core/models';
import { BOOKS, BookTags, CATEGORIES, SECTIONS, SECTION_INFO, categorySlug, firmSlug, isSection } from './teaser-meta';

// Sources switched OFF, so sources added later show by default.
const HIDDEN_SOURCES_KEY = 'masef_teaser_hidden_sources';
const HIDE_DONE_KEY = 'masef_teaser_hide_done';

type View = 'home' | 'topics' | 'section' | 'category' | 'companies' | 'company';

interface Group {
  name: string;
  slug: string;
  total: number;
  done: number;
}

interface Heading {
  section: TeaserSection;
  category: string;
  items: TeaserSummary[];
}

// /teasers: pick "by topic" or "by company".
// By topic: /teasers/topics → /teasers/:section → /teasers/:section/:category.
// By company: /teasers/companies → /teasers/company/:firm.
@Component({
  selector: 'app-teaser-browse',
  imports: [RouterLink, NgTemplateOutlet, BookTags],
  templateUrl: './teaser-browse.html',
  styleUrl: './teasers.css',
})
export class TeaserBrowse implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  all = signal<TeaserSummary[] | null>(null);
  error = signal('');
  view = signal<View>('home');
  section = signal<TeaserSection | null>(null);
  categoryKey = signal<string | null>(null);
  firmKey = signal<string | null>(null);
  books = signal<TeaserBook[]>(loadBooks());
  hideDone = signal(localStorage.getItem(HIDE_DONE_KEY) === '1');

  readonly BOOKS = BOOKS;
  readonly SECTION_INFO = SECTION_INFO;
  readonly sections = SECTIONS;

  // Company pages list everything a firm asked, whatever the source, so the
  // source filter only applies to the topic views.
  companyMode = computed(() => this.view() === 'companies' || this.view() === 'company');

  // The list with the source filter applied (a puzzle shows if it is in any selected source).
  filtered = computed(() => {
    const list = this.all() ?? [];
    const books = this.books();
    if (this.companyMode() || books.length === BOOKS.length) return list;
    return list.filter((t) => t.books.some((b) => books.includes(b)));
  });

  stats = computed(() => {
    const list = this.filtered();
    const withFirm = list.filter((t) => t.firms.length);
    return {
      total: list.length,
      done: list.filter((t) => t.completed).length,
      firmTotal: withFirm.length,
      firmDone: withFirm.filter((t) => t.completed).length,
      firms: new Set(withFirm.flatMap((t) => t.firms)).size,
    };
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

  firmGroups = computed<Group[]>(() => {
    const by = new Map<string, TeaserSummary[]>();
    for (const t of this.filtered()) for (const f of t.firms) by.set(f, [...(by.get(f) ?? []), t]);
    return [...by.entries()]
      .map(([name, items]) => ({ name, slug: firmSlug(name), total: items.length, done: items.filter((t) => t.completed).length }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  });

  category = computed(() => {
    const s = this.section();
    const key = this.categoryKey();
    if (!s || !key) return null;
    return CATEGORIES[s].find((c) => categorySlug(c) === key) ?? null;
  });

  firm = computed(() => {
    const key = this.firmKey();
    if (!key) return null;
    for (const t of this.all() ?? []) {
      const f = t.firms.find((x) => firmSlug(x) === key);
      if (f) return f;
    }
    return null;
  });

  private visible = (list: TeaserSummary[]) => (this.hideDone() ? list.filter((t) => !t.completed) : list);

  items = computed(() => {
    const cat = this.category();
    if (!cat) return [];
    return this.visible(this.filtered().filter((t) => t.section === this.section() && t.category === cat));
  });

  categoryTotals = computed(() => {
    const cat = this.category();
    const list = this.filtered().filter((t) => t.section === this.section() && t.category === cat);
    return { total: list.length, done: list.filter((t) => t.completed).length };
  });

  // A company's puzzles, grouped by topic.
  firmHeadings = computed<Heading[]>(() => {
    const f = this.firm();
    if (!f) return [];
    const list = this.filtered().filter((t) => t.firms.includes(f));
    const out: Heading[] = [];
    for (const s of this.sections)
      for (const c of CATEGORIES[s]) {
        const items = this.visible(list.filter((t) => t.section === s && t.category === c));
        if (items.length) out.push({ section: s, category: c, items });
      }
    return out;
  });

  firmTotals = computed(() => {
    const f = this.firm();
    const list = this.filtered().filter((t) => f && t.firms.includes(f));
    return { total: list.length, done: list.filter((t) => t.completed).length };
  });

  title = computed(() => {
    switch (this.view()) {
      case 'topics':
        return 'By topic';
      case 'companies':
        return 'By company';
      case 'company':
        return this.firm() ?? 'Company';
      case 'section':
        return SECTION_INFO[this.section()!]?.title ?? '';
      case 'category':
        return this.category() ?? '';
      default:
        return 'Interview puzzles';
    }
  });

  ngOnInit() {
    combineLatest([this.route.data, this.route.paramMap]).subscribe(([data, p]) => {
      const s = p.get('section');
      this.firmKey.set(p.get('firm'));
      this.categoryKey.set(p.get('category'));
      this.section.set(isSection(s) ? s : null);
      const v = data['view'] as View | undefined;
      this.view.set(v ?? (p.get('category') ? 'category' : 'section'));
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
    localStorage.setItem(HIDDEN_SOURCES_KEY, JSON.stringify(BOOKS.map((x) => x.key).filter((k) => !next.includes(k))));
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
  let hidden: string[] = [];
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_SOURCES_KEY) || '[]');
    if (Array.isArray(v)) hidden = v;
  } catch {
    /* show everything */
  }
  const shown = BOOKS.map((x) => x.key).filter((k) => !hidden.includes(k));
  return shown.length ? shown : BOOKS.map((x) => x.key);
}

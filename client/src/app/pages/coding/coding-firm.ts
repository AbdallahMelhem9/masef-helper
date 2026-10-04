import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CodingFirmDetail, CodingProblem } from '../../core/models';

const PREFS_KEY = 'masef_coding_prefs';
const PAGE = 100;
const DIFF_RANK: Record<string, number> = { Easy: 0, Medium: 1, Hard: 2, '': 3 };

type Sort = 'frequency' | 'difficulty' | 'number';
type Diff = 'Easy' | 'Medium' | 'Hard';
type SaveState = 'saving' | 'saved' | 'error';

interface Prefs {
  sort: Sort;
  diffs: Diff[];
  hideSolved: boolean;
  recentOnly: boolean;
}

// /coding/:firm: one firm's problems, with a solved tick and private notes.
@Component({
  selector: 'app-coding-firm',
  imports: [RouterLink],
  templateUrl: './coding-firm.html',
  styleUrls: ['../teasers/teasers.css', './coding.css'],
})
export class CodingFirm implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  firm = signal<CodingFirmDetail | null>(null);
  problems = signal<CodingProblem[]>([]);
  error = signal('');
  query = signal('');
  prefs = signal<Prefs>(loadPrefs());
  shown = signal(PAGE);
  open = signal<Set<string>>(new Set());
  saveState = signal<Record<string, SaveState>>({});

  readonly DIFFS: Diff[] = ['Easy', 'Medium', 'Hard'];
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  solvedCount = computed(() => this.problems().filter((p) => p.solved).length);

  visible = computed(() => {
    const { sort, diffs, hideSolved, recentOnly } = this.prefs();
    const q = this.query().trim().toLowerCase();
    const list = this.problems().filter(
      (p) =>
        (!diffs.length || diffs.includes(p.difficulty as Diff)) &&
        (!hideSolved || !p.solved) &&
        (!recentOnly || p.recent) &&
        (!q || p.title.toLowerCase().includes(q) || p.topics.some((t) => t.toLowerCase().includes(q)) || String(p.id ?? '') === q)
    );
    if (sort === 'difficulty') return [...list].sort((a, b) => DIFF_RANK[a.difficulty] - DIFF_RANK[b.difficulty] || b.score - a.score);
    if (sort === 'number') return [...list].sort((a, b) => (a.id ?? 1e9) - (b.id ?? 1e9));
    return list;
  });

  diffCounts = computed(() => {
    const out: Record<string, number> = { Easy: 0, Medium: 0, Hard: 0 };
    for (const p of this.problems()) out[p.difficulty] = (out[p.difficulty] ?? 0) + 1;
    return out;
  });

  ngOnInit() {
    this.route.paramMap.subscribe((p) => {
      const slug = p.get('firm')!;
      this.firm.set(null);
      this.error.set('');
      this.shown.set(PAGE);
      this.api
        .getCodingFirm(slug)
        .then((f) => {
          this.firm.set(f);
          this.problems.set(f.problems);
        })
        .catch((err) => this.error.set(err?.error?.error || 'Could not load this firm'));
    });
  }

  ngOnDestroy() {
    // Flush notes still waiting for their debounce.
    for (const [slug, t] of this.timers) {
      clearTimeout(t);
      this.saveNotes(slug);
    }
  }

  setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    this.prefs.update((p) => ({ ...p, [key]: value }));
    this.shown.set(PAGE);
    localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs()));
  }

  toggleDiff(d: Diff) {
    const cur = this.prefs().diffs;
    this.setPref('diffs', cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]);
  }

  private patch(slug: string, change: Partial<CodingProblem>) {
    this.problems.update((list) => list.map((p) => (p.slug === slug ? { ...p, ...change } : p)));
  }

  async toggleSolved(p: CodingProblem) {
    const solved = !p.solved;
    this.patch(p.slug, { solved });
    try {
      await this.api.setCodingSolved(p.slug, solved);
    } catch {
      this.patch(p.slug, { solved: !solved });
    }
  }

  toggleNotes(slug: string) {
    this.open.update((s) => {
      const n = new Set(s);
      n.has(slug) ? n.delete(slug) : n.add(slug);
      return n;
    });
  }

  onNotes(slug: string, notes: string) {
    this.patch(slug, { notes });
    clearTimeout(this.timers.get(slug));
    this.timers.set(slug, setTimeout(() => this.saveNotes(slug), 800));
  }

  async saveNotes(slug: string) {
    clearTimeout(this.timers.get(slug));
    if (!this.timers.delete(slug)) return;
    const p = this.problems().find((x) => x.slug === slug);
    if (!p) return;
    this.saveState.update((s) => ({ ...s, [slug]: 'saving' }));
    try {
      await this.api.setCodingNotes(slug, p.notes);
      this.saveState.update((s) => ({ ...s, [slug]: 'saved' }));
    } catch {
      this.saveState.update((s) => ({ ...s, [slug]: 'error' }));
    }
  }

  pct(done: number, total: number): number {
    return total ? Math.round((100 * done) / total) : 0;
  }
}

function loadPrefs(): Prefs {
  const base: Prefs = { sort: 'frequency', diffs: [], hideSolved: false, recentOnly: false };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return base;
  }
}

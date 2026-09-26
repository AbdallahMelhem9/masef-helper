import { Component, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { InkDoc, InkService, Stroke, emptyInk } from '../../core/ink.service';
import { Teaser, TeaserSummary } from '../../core/models';
import { InkLayer, PenTool } from '../../shared/ink-layer';
import { MathContent } from '../../shared/math-content';
import { PenPalette, defaultFingerDraws, loadPenTool } from '../../shared/pen-tools';
import { BookTags, SECTION_INFO, categorySlug } from './teaser-meta';

const PAGE_HEIGHT = 900;

// One puzzle: the statement, a board to work on (pen or typed), then on
// demand Hint 1, Hint 2 and the full solution. Board and "completed" are
// saved per account.
@Component({
  selector: 'app-teaser-page',
  imports: [FormsModule, RouterLink, InkLayer, MathContent, PenPalette, BookTags],
  templateUrl: './teaser-page.html',
  styleUrl: './teasers.css',
})
export class TeaserPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private inkSvc = inject(InkService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  @ViewChild(InkLayer) inkLayer?: InkLayer;

  readonly SECTION_INFO = SECTION_INFO;
  readonly categorySlug = categorySlug;

  teaser = signal<Teaser | null>(null);
  siblings = signal<TeaserSummary[]>([]);
  error = signal('');
  // 0 = nothing shown, 1 = hint 1, 2 = hints 1-2; the solution is separate so
  // it can be opened straight away.
  hintsShown = signal(0);
  solutionShown = signal(false);
  activeSolution = signal(0);
  followupsShown = signal<Set<number>>(new Set());
  savingDone = signal(false);

  doc = signal<InkDoc | null>(null);
  penActive = signal(true);
  penTool = signal<PenTool>(loadPenTool());
  canUndo = signal(false);
  fingerDraws = signal(defaultFingerDraws());
  typedOpen = signal(false);
  status = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private slug = '';
  private flushOnHide = () => {
    if (document.visibilityState === 'hidden') this.flush();
  };

  position = computed(() => {
    const t = this.teaser();
    const list = this.siblings();
    const i = t ? list.findIndex((x) => x.slug === t.slug) : -1;
    return { index: i, total: list.length, prev: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null };
  });

  get paperHeight(): number {
    return this.doc()?.height ?? PAGE_HEIGHT;
  }

  ngOnInit() {
    document.addEventListener('visibilitychange', this.flushOnHide);
    window.addEventListener('pagehide', this.flushOnHide);
    this.route.paramMap.subscribe((p) => this.open(p.get('slug') || ''));
  }

  ngOnDestroy() {
    document.removeEventListener('visibilitychange', this.flushOnHide);
    window.removeEventListener('pagehide', this.flushOnHide);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.flush();
  }

  private async open(slug: string) {
    // Leaving the previous puzzle (prev/next): save its board first.
    if (this.saveTimer) clearTimeout(this.saveTimer);
    await this.flush();
    this.slug = slug;
    this.teaser.set(null);
    this.doc.set(null);
    this.error.set('');
    this.hintsShown.set(0);
    this.solutionShown.set(false);
    this.activeSolution.set(0);
    this.followupsShown.set(new Set());
    this.status.set('idle');
    try {
      const t = await this.api.getTeaser(slug);
      if (this.slug !== slug) return;
      this.teaser.set(t);
      window.scrollTo({ top: 0 });
      this.api.getTeasers().then((all) => {
        if (this.slug === slug) this.siblings.set(all.filter((x) => x.section === t.section && x.category === t.category));
      });
    } catch (err: any) {
      this.error.set(err?.error?.error || 'Could not load this puzzle');
      return;
    }
    const doc = await this.inkSvc.loadTeaser(slug);
    if (this.slug !== slug) return;
    this.doc.set(doc);
    this.typedOpen.set(!!doc.text);
  }

  showNextHint() {
    this.hintsShown.update((n) => Math.min(2, n + 1));
  }

  toggleSolution() {
    this.solutionShown.update((v) => !v);
  }

  toggleFollowup(i: number) {
    const s = new Set(this.followupsShown());
    if (s.has(i)) s.delete(i);
    else s.add(i);
    this.followupsShown.set(s);
  }

  async toggleCompleted() {
    const t = this.teaser();
    if (!t || this.savingDone()) return;
    const completed = !t.completed;
    this.savingDone.set(true);
    try {
      await this.api.setTeaserCompleted(t.slug, completed);
      this.teaser.set({ ...t, completed });
      this.siblings.update((list) => list.map((x) => (x.slug === t.slug ? { ...x, completed } : x)));
    } catch {
      this.error.set('Could not save the progress; try again.');
    } finally {
      this.savingDone.set(false);
    }
  }

  go(t: TeaserSummary | null) {
    if (t) this.router.navigate(['/teaser', t.slug]);
  }

  // ---- board ----
  setFingerDraws(v: boolean) {
    this.fingerDraws.set(v);
    localStorage.setItem('masef_finger_draws', v ? '1' : '0');
  }

  onStrokes(strokes: Stroke[]) {
    this.patch({ strokes });
  }

  onText(text: string) {
    this.patch({ text });
  }

  addPage() {
    this.patch({ height: this.paperHeight + PAGE_HEIGHT });
  }

  private patch(p: Partial<InkDoc>) {
    this.doc.set({ ...(this.doc() ?? emptyInk()), ...p });
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 1000);
  }

  async flush() {
    const doc = this.doc();
    const slug = this.slug;
    if (!doc || !this.dirty || !slug) return;
    this.dirty = false;
    this.status.set('saving');
    try {
      const remote = await this.inkSvc.saveTeaser(slug, doc);
      if (this.slug === slug) this.status.set(remote ? 'saved' : 'error');
    } catch {
      if (this.slug === slug) this.status.set('error');
    }
  }

  statusLabel(): string {
    switch (this.status()) {
      case 'saving':
        return 'saving…';
      case 'saved':
        return 'saved';
      case 'error':
        return 'kept on this device';
      default:
        return '';
    }
  }
}

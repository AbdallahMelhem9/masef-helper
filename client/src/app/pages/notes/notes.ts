import { Component, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { InkDoc, InkService, Stroke, emptyInk } from '../../core/ink.service';
import { Pdf } from '../../core/models';
import { InkLayer, PenTool } from '../../shared/ink-layer';
import { PenButton, PenPalette, defaultFingerDraws, loadPenTool } from '../../shared/pen-tools';

const PAGE_HEIGHT = 1100;

// The lesson's notebook: a ruled sheet to write on with the pen (or type
// into), saved per lesson and per user.
@Component({
  selector: 'app-notes',
  imports: [FormsModule, RouterLink, InkLayer, PenButton, PenPalette],
  templateUrl: './notes.html',
  styleUrl: './notes.css',
})
export class NotesPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private inkSvc = inject(InkService);
  private route = inject(ActivatedRoute);
  @ViewChild(InkLayer) inkLayer?: InkLayer;

  pdf = signal<Pdf | null>(null);
  doc = signal<InkDoc | null>(null);
  error = signal('');
  penActive = signal(true);
  penTool = signal<PenTool>(loadPenTool());
  canUndo = signal(false);
  fingerDraws = signal(defaultFingerDraws());
  typedOpen = signal(false);
  status = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private flushOnHide = () => {
    if (document.visibilityState === 'hidden') this.flush();
  };

  private get pdfId(): number {
    return Number(this.route.snapshot.paramMap.get('id'));
  }

  get paperHeight(): number {
    return this.doc()?.height ?? PAGE_HEIGHT * 2;
  }

  get pageCount(): number {
    return Math.round(this.paperHeight / PAGE_HEIGHT);
  }

  async ngOnInit() {
    document.addEventListener('visibilitychange', this.flushOnHide);
    window.addEventListener('pagehide', this.flushOnHide);
    try {
      const pdf = await this.api.getPdf(this.pdfId);
      this.pdf.set(pdf);
    } catch (err: any) {
      this.error.set(err?.error?.error || 'Could not load the lesson');
      return;
    }
    const doc = await this.inkSvc.load(this.pdfId, 'notes');
    this.doc.set(doc);
    if (doc.text) this.typedOpen.set(true);
  }

  ngOnDestroy() {
    document.removeEventListener('visibilitychange', this.flushOnHide);
    window.removeEventListener('pagehide', this.flushOnHide);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.flush();
  }

  togglePen() {
    this.penActive.update((v) => !v);
  }

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
    this.saveTimer = setTimeout(() => this.flush(), 1200);
  }

  async flush() {
    const doc = this.doc();
    if (!doc || !this.dirty) return;
    this.dirty = false;
    this.status.set('saving');
    try {
      const remote = await this.inkSvc.save(this.pdfId, 'notes', doc);
      this.status.set(remote ? 'saved' : 'error');
    } catch {
      this.status.set('error');
    }
  }

  statusLabel(): string {
    switch (this.status()) {
      case 'saving':
        return 'saving…';
      case 'saved':
        return 'saved';
      case 'error':
        return 'kept on this device (server unreachable)';
      default:
        return '';
    }
  }
}

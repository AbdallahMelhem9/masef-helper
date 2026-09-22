import { Component, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AnswerLength, ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { GlossaryService } from '../../core/glossary.service';
import { ChatMessage, Pdf, Section } from '../../core/models';
import { MathContent, renderMathMarkdown } from '../../shared/math-content';
import { InkLayer, PenTool } from '../../shared/ink-layer';
import { PenButton, PenPalette, defaultFingerDraws, loadPenTool } from '../../shared/pen-tools';
import { InkDoc, InkService, Stroke, emptyInk } from '../../core/ink.service';

interface BlockVM {
  section: Section;
  explaining: boolean;
  explainError: string;
  regenOpen: boolean;
  regenText: string;
  proofOpen: boolean;
  chatOpen: boolean;
  messages: ChatMessage[];
  messagesLoaded: boolean;
  draft: string;
  sending: boolean;
  slow: boolean;
  chatError: string;
}

function newVM(section: Section): BlockVM {
  return {
    section,
    explaining: false,
    explainError: '',
    regenOpen: false,
    regenText: '',
    proofOpen: section.importance !== 'not imp',
    chatOpen: false,
    messages: [],
    messagesLoaded: false,
    draft: '',
    sending: false,
    slow: false,
    chatError: '',
  };
}

const STATEMENT_KINDS = new Set(['definition', 'proposition', 'theorem', 'lemma', 'corollary', 'example', 'exercise', 'remark']);

@Component({
  selector: 'app-pdf-viewer',
  imports: [FormsModule, RouterLink, MathContent, InkLayer, PenButton, PenPalette],
  templateUrl: './pdf-viewer.html',
  styleUrl: './pdf-viewer.css',
})
export class PdfViewer implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  pdf = signal<Pdf | null>(null);
  // The compact layout is limited to Forien's first three chapters.
  get compactReading(): boolean {
    const p = this.pdf();
    return p?.course?.title === 'Prérentrée de probabilités'
      && p.course.teacher === 'Nicolas Forien'
      && [1, 2, 3].includes(p.lesson?.position ?? 0);
  }
  blocks = signal<BlockVM[]>([]);
  error = signal('');
  // Reading-mode toggles; hiding both makes the page read like the original PDF.
  showExplanations = signal(localStorage.getItem('masef_show_expl') !== '0');
  showNotes = signal(localStorage.getItem('masef_show_notes') !== '0');
  showShortcut = signal(localStorage.getItem('masef_shortcut') === '1');
  showDeep = signal(localStorage.getItem('masef_show_deep') !== '0');
  showExamples = signal(localStorage.getItem('masef_show_ex') !== '0');
  showDefs = signal(localStorage.getItem('masef_show_defs') !== '0');
  // Chat answer length: 'auto' lets the tutor detect short / mid / expanded
  // from the question; the chips under the chat force one (remembered).
  answerLength = signal<AnswerLength>((localStorage.getItem('masef_answer_len') as AnswerLength) || 'auto');
  readonly lengthOptions: { value: AnswerLength; label: string; hint: string }[] = [
    { value: 'auto', label: 'Auto', hint: 'The tutor reads the wanted length off your question' },
    { value: 'short', label: 'Short', hint: '1-3 sentences' },
    { value: 'mid', label: 'Mid', hint: 'A focused paragraph or two' },
    { value: 'expanded', label: 'Expanded', hint: 'Full structured answer with steps and an example' },
  ];

  setAnswerLength(value: AnswerLength) {
    this.answerLength.set(value);
    localStorage.setItem('masef_answer_len', value);
  }
  private glossary = inject(GlossaryService);
  private sanitizer = inject(DomSanitizer);
  popover = signal<{ term: string; html: SafeHtml; src: string; x: number; y: number } | null>(null);

  toggleDefs() {
    this.showDefs.update((v) => !v);
    localStorage.setItem('masef_show_defs', this.showDefs() ? '1' : '0');
    if (!this.showDefs()) this.popover.set(null);
  }

  onGlossOver(event: Event) {
    if (!this.showDefs()) return;
    const target = (event.target as HTMLElement).closest?.('span.gloss') as HTMLElement | null;
    if (!target) return;
    const term = target.getAttribute('data-term');
    const entry = term ? this.glossary.byTerm(term) : undefined;
    if (!entry) return;
    const rect = target.getBoundingClientRect();
    this.popover.set({
      term: entry.term,
      html: this.sanitizer.bypassSecurityTrustHtml(renderMathMarkdown(entry.def)),
      src: entry.src,
      x: Math.min(rect.left, window.innerWidth - 400),
      y: rect.bottom + 8,
    });
  }

  onGlossOut(event: Event) {
    const target = (event.target as HTMLElement).closest?.('span.gloss');
    if (target) this.popover.set(null);
  }

  toggleDeep() {
    this.showDeep.update((v) => !v);
    localStorage.setItem('masef_show_deep', this.showDeep() ? '1' : '0');
  }

  toggleExamples() {
    this.showExamples.update((v) => !v);
    localStorage.setItem('masef_show_ex', this.showExamples() ? '1' : '0');
  }
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastSignature = '';

  // ---- Handwriting over the sheet (pen layer) ----
  @ViewChild(InkLayer) inkLayer?: InkLayer;
  private inkSvc = inject(InkService);
  inkDoc = signal<InkDoc | null>(null);
  penActive = signal(false);
  penTool = signal<PenTool>(loadPenTool());
  canUndo = signal(false);
  fingerDraws = signal(defaultFingerDraws());
  inkStatus = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private inkDirty = false;
  private flushOnHide = () => {
    if (document.visibilityState === 'hidden') this.flushInk();
  };

  togglePen() {
    this.penActive.update((v) => !v);
  }

  setFingerDraws(v: boolean) {
    this.fingerDraws.set(v);
    localStorage.setItem('masef_finger_draws', v ? '1' : '0');
  }

  onStrokes(strokes: Stroke[]) {
    this.inkDoc.set({ ...(this.inkDoc() ?? emptyInk()), strokes });
    this.inkDirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushInk(), 1200);
  }

  async flushInk() {
    const doc = this.inkDoc();
    if (!doc || !this.inkDirty) return;
    this.inkDirty = false;
    this.inkStatus.set('saving');
    try {
      const remote = await this.inkSvc.save(this.pdfId, 'page', doc);
      this.inkStatus.set(remote ? 'saved' : 'error');
    } catch {
      this.inkStatus.set('error');
    }
  }

  inkStatusLabel(): string {
    switch (this.inkStatus()) {
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

  toggleExplanations() {
    this.showExplanations.update((v) => !v);
    localStorage.setItem('masef_show_expl', this.showExplanations() ? '1' : '0');
  }

  toggleNotes() {
    this.showNotes.update((v) => !v);
    localStorage.setItem('masef_show_notes', this.showNotes() ? '1' : '0');
  }

  toggleShortcut() {
    this.showShortcut.update((v) => !v);
    localStorage.setItem('masef_shortcut', this.showShortcut() ? '1' : '0');
  }

  async toggleMark(vm: BlockVM) {
    const next = vm.section.highlight ? 0 : 1;
    this.update(vm.section.id, { section: { ...vm.section, highlight: next } });
    try {
      await this.api.setHighlight(vm.section.id, next === 1);
    } catch {
      this.update(vm.section.id, { section: { ...vm.section, highlight: vm.section.highlight } });
    }
  }

  private get pdfId(): number {
    return Number(this.route.snapshot.paramMap.get('id'));
  }

  get fileHref(): string {
    return `/api/pdfs/${this.pdfId}/file?token=${this.auth.token()}`;
  }

  isStatement(s: Section): boolean {
    return STATEMENT_KINDS.has(s.kind);
  }

  async ngOnInit() {
    this.glossary.load();
    document.addEventListener('visibilitychange', this.flushOnHide);
    window.addEventListener('pagehide', this.flushOnHide);
    await this.load();
    if (this.pdf()?.status === 'processing') {
      this.pollTimer = setInterval(() => this.load(), 8000);
    }
    if (this.pdf()) this.inkDoc.set(await this.inkSvc.load(this.pdfId, 'page'));
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    document.removeEventListener('visibilitychange', this.flushOnHide);
    window.removeEventListener('pagehide', this.flushOnHide);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.flushInk();
  }

  private async load() {
    try {
      const pdf = await this.api.getPdf(this.pdfId);
      this.pdf.set(pdf);
      // Skip the rebuild when nothing changed — re-rendering all the KaTeX on
      // every poll is expensive.
      const signature = JSON.stringify(
        (pdf.sections ?? []).map((s) => [
          s.id,
          s.content_text?.length ?? 0,
          s.ai_explanation?.length ?? 0,
          s.proof?.length ?? 0,
          s.tutor_note?.length ?? 0,
          s.extra_explanation?.length ?? 0,
          s.extra_example?.length ?? 0,
          s.refresh?.length ?? 0,
          s.importance,
          s.highlight,
        ])
      );
      if (signature !== this.lastSignature) {
        this.lastSignature = signature;
        const existing = new Map(this.blocks().map((vm) => [vm.section.id, vm]));
        this.blocks.set(
          (pdf.sections ?? []).map((section) => {
            const vm = existing.get(section.id);
            return vm ? { ...vm, section } : newVM(section);
          })
        );
      }
      if (pdf.status !== 'processing') {
        if (this.pollTimer) {
          clearInterval(this.pollTimer);
          this.pollTimer = null;
        }
      } else if (!this.pollTimer) {
        this.pollTimer = setInterval(() => this.load(), 8000);
      }
    } catch (err: any) {
      this.error.set(err?.error?.error || 'Could not load the document');
      if (this.pollTimer) clearInterval(this.pollTimer);
    }
  }

  private update(id: number, patch: Partial<BlockVM>) {
    this.blocks.update((list) => list.map((b) => (b.section.id === id ? { ...b, ...patch } : b)));
  }

  private vmById(id: number): BlockVM {
    return this.blocks().find((b) => b.section.id === id)!;
  }

  toggleProof(vm: BlockVM) {
    this.update(vm.section.id, { proofOpen: !vm.proofOpen });
  }

  openRegen(vm: BlockVM) {
    this.update(vm.section.id, { regenOpen: !vm.regenOpen, regenText: '' });
  }

  async explain(vm: BlockVM, instructions = '') {
    this.update(vm.section.id, { explaining: true, explainError: '', regenOpen: false });
    try {
      const res = await this.api.explainSection(vm.section.id, !!vm.section.ai_explanation, instructions);
      const current = this.vmById(vm.section.id);
      this.update(vm.section.id, {
        explaining: false,
        section: { ...current.section, ai_explanation: res.ai_explanation },
      });
    } catch (err: any) {
      this.update(vm.section.id, {
        explaining: false,
        explainError: err?.error?.error || 'Generation failed — is the server running?',
      });
    }
  }

  regenWith(vm: BlockVM, preset: string) {
    this.explain(vm, preset);
  }

  submitRegen(vm: BlockVM) {
    this.explain(vm, vm.regenText.trim());
  }

  async toggleChat(vm: BlockVM) {
    const open = !vm.chatOpen;
    this.update(vm.section.id, { chatOpen: open });
    if (open && !vm.messagesLoaded) {
      try {
        const messages = await this.api.getMessages(vm.section.id);
        this.update(vm.section.id, { messages, messagesLoaded: true });
      } catch {
        this.update(vm.section.id, { messagesLoaded: true });
      }
    }
  }

  async send(vm: BlockVM) {
    const content = vm.draft.trim();
    if (!content || vm.sending) return;
    const pending: ChatMessage = {
      id: -1,
      section_id: vm.section.id,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    this.update(vm.section.id, {
      sending: true,
      slow: false,
      chatError: '',
      draft: '',
      messages: [...vm.messages, pending],
    });
    // After 30s, tell the student the wait is on the AI provider's side.
    setTimeout(() => {
      const current = this.vmById(vm.section.id);
      if (current?.sending) this.update(vm.section.id, { slow: true });
    }, 30000);
    try {
      const res = await this.api.sendMessage(vm.section.id, content, this.answerLength());
      const current = this.vmById(vm.section.id);
      this.update(vm.section.id, {
        sending: false,
        messages: [...current.messages.filter((m) => m.id !== -1), res.user, res.assistant],
      });
    } catch (err: any) {
      const current = this.vmById(vm.section.id);
      this.update(vm.section.id, {
        sending: false,
        draft: content,
        messages: current.messages.filter((m) => m.id !== -1),
        chatError: err?.error?.error || 'Sending failed — is the server running?',
      });
    }
  }
}

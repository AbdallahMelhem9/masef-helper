import { Component, OnDestroy, OnInit, ViewChild, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InkDoc, InkService, Stroke, emptyInk } from '../core/ink.service';
import { Section } from '../core/models';
import { InkLayer, PenTool } from './ink-layer';
import { MathContent } from './math-content';
import { PenPalette, defaultFingerDraws, loadPenTool } from './pen-tools';

const PAGE_HEIGHT = 900;

// The board for one block: a sheet opened on the side of the lesson, to
// write on with the pen (or type into), saved per block and per user. The
// lesson-wide notebook stays behind the "Notes" button in the lesson header.
@Component({
  selector: 'app-section-notes',
  imports: [FormsModule, InkLayer, MathContent, PenPalette],
  template: `
    <div class="sn-backdrop" (click)="close()"></div>
    <aside class="sn-panel" role="dialog" [attr.aria-label]="'Notes for ' + label()">
      <header class="sn-head">
        <div class="sn-title">
          <p class="sn-eyebrow">Notes on this block</p>
          <h2>{{ label() }}</h2>
        </div>
        <span class="sn-status">{{ statusLabel() }}</span>
        <button type="button" class="sn-close" (click)="close()" aria-label="Close notes">&times;</button>
      </header>

      <div class="sn-tools">
        <button type="button" class="sn-btn" [class.on]="penActive()" (click)="penActive.set(!penActive())">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/></svg>
          Pen
        </button>
        <button type="button" class="sn-btn" [class.on]="typedOpen()" (click)="typedOpen.set(!typedOpen())">Typed</button>
        <button type="button" class="sn-btn" [class.on]="showBlock()" (click)="showBlock.set(!showBlock())">Show the block</button>
        <button type="button" class="sn-btn" (click)="addPage()">+ Page</button>
      </div>
      @if (penActive()) {
        <div class="sn-pen">
          <app-pen-palette
            [tool]="penTool()"
            [canUndo]="canUndo()"
            [fingerDraws]="fingerDraws()"
            (toolChange)="penTool.set($event)"
            (undo)="inkLayer?.undo()"
            (clear)="inkLayer?.clearAll()"
            (fingerDrawsChange)="setFingerDraws($event)"
          />
        </div>
      }

      <div class="sn-scroll" #scroller>
        @if (showBlock()) {
          <div class="sn-block">
            <app-math-content [content]="section().content_text || ''" />
          </div>
        }
        @if (doc(); as d) {
          @if (typedOpen()) {
            <textarea
              class="sn-typed"
              [ngModel]="d.text || ''"
              (ngModelChange)="patch({ text: $event })"
              placeholder="Type here: a formula to remember, a question for class…"
              rows="4"
            ></textarea>
          }
          <div class="sn-paper" [style.minHeight.px]="d.height ?? PAGE_HEIGHT">
            <app-ink-layer
              [strokes]="d.strokes"
              [active]="penActive()"
              [tool]="penTool()"
              [fingerDraws]="fingerDraws()"
              [scrollContainer]="scroller"
              (strokesChange)="onStrokes($event)"
              (canUndoChange)="canUndo.set($event)"
            />
          </div>
        } @else {
          <p class="sn-loading">Opening the board&hellip;</p>
        }
      </div>
    </aside>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 60;
      pointer-events: none;
    }
    .sn-backdrop {
      position: absolute;
      inset: 0;
      pointer-events: auto;
      background: rgba(23, 38, 62, 0.12);
    }
    .sn-panel {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(620px, 50vw);
      display: flex;
      flex-direction: column;
      pointer-events: auto;
      background: var(--paper);
      border-left: 1px solid var(--line);
      box-shadow: -12px 0 40px rgba(23, 38, 62, 0.14);
    }
    .sn-head {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px 10px;
    }
    .sn-title {
      flex: 1;
      min-width: 0;
    }
    .sn-eyebrow {
      margin: 0;
      font-family: var(--font-mono);
      font-size: 10.5px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink-3);
    }
    .sn-title h2 {
      margin: 2px 0 0;
      font-size: 18px;
      color: var(--ink);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sn-status {
      margin-top: 4px;
      font-family: var(--font-mono);
      font-size: 10.5px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink-3);
      white-space: nowrap;
    }
    .sn-close {
      border: 0;
      background: transparent;
      font-size: 26px;
      line-height: 1;
      color: var(--ink-2);
      cursor: pointer;
      padding: 0 4px;
    }
    .sn-tools {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 0 16px 10px;
    }
    .sn-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font: inherit;
      font-size: 12.5px;
      font-weight: 500;
      color: var(--ink-2);
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 5px 12px;
      cursor: pointer;
    }
    .sn-btn.on {
      background: var(--cobalt-soft);
      border-color: #b7c6f2;
      color: var(--cobalt);
    }
    .sn-pen {
      padding: 0 16px 10px;
    }
    .sn-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 0 16px 60px;
    }
    .sn-block {
      margin-bottom: 12px;
      padding: 10px 14px;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 8px;
      font-family: var(--font-display);
      font-size: 15px;
      max-height: 40vh;
      overflow-y: auto;
    }
    .sn-typed {
      width: 100%;
      box-sizing: border-box;
      margin-bottom: 12px;
      padding: 10px 12px;
      font: inherit;
      font-size: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      resize: vertical;
      background: #fff;
    }
    .sn-paper {
      position: relative;
      background-color: #fffdf6;
      background-image:
        linear-gradient(to right, transparent 0, transparent 44px, #e4a4a4 44px, #e4a4a4 45px, transparent 45px),
        repeating-linear-gradient(to bottom, transparent 0, transparent 31px, #cfd9ec 31px, #cfd9ec 32px);
      background-position: 0 0, 0 24px;
      border: 1px solid var(--line);
      border-radius: 3px;
      box-shadow: 0 2px 6px rgba(23, 38, 62, 0.07);
    }
    .sn-loading {
      color: var(--ink-3);
    }
    @media (max-width: 1000px) {
      .sn-panel {
        width: 100vw;
      }
    }
  `,
})
export class SectionNotes implements OnInit, OnDestroy {
  section = input.required<Section>();
  closed = output<void>();
  // Whether the board holds anything, after each save.
  filledChange = output<boolean>();

  private inkSvc = inject(InkService);
  @ViewChild(InkLayer) inkLayer?: InkLayer;

  readonly PAGE_HEIGHT = PAGE_HEIGHT;
  doc = signal<InkDoc | null>(null);
  penActive = signal(true);
  penTool = signal<PenTool>(loadPenTool());
  canUndo = signal(false);
  fingerDraws = signal(defaultFingerDraws());
  typedOpen = signal(false);
  showBlock = signal(false);
  status = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };

  label(): string {
    const s = this.section();
    return s.title || (s.kind === 'text' ? 'This passage' : s.kind);
  }

  async ngOnInit() {
    document.addEventListener('keydown', this.onKey);
    const doc = await this.inkSvc.loadSection(this.section().id);
    this.doc.set(doc);
    if (doc.text) this.typedOpen.set(true);
  }

  ngOnDestroy() {
    document.removeEventListener('keydown', this.onKey);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.flush();
  }

  close() {
    this.flush();
    this.closed.emit();
  }

  setFingerDraws(v: boolean) {
    this.fingerDraws.set(v);
    localStorage.setItem('masef_finger_draws', v ? '1' : '0');
  }

  onStrokes(strokes: Stroke[]) {
    this.patch({ strokes });
  }

  addPage() {
    this.patch({ height: (this.doc()?.height ?? PAGE_HEIGHT) + PAGE_HEIGHT });
  }

  patch(p: Partial<InkDoc>) {
    this.doc.set({ ...(this.doc() ?? emptyInk()), ...p });
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 1000);
  }

  async flush() {
    const doc = this.doc();
    if (!doc || !this.dirty) return;
    this.dirty = false;
    this.status.set('saving');
    this.filledChange.emit(doc.strokes.length > 0 || !!(doc.text || '').trim());
    try {
      const remote = await this.inkSvc.saveSection(this.section().id, doc);
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
        return 'kept on this device';
      default:
        return '';
    }
  }
}

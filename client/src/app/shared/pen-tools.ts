import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { PenTool, PenToolKind, penSeen } from './ink-layer';

const PEN_COLORS = ['#17263e', '#2b54d4', '#c0392b', '#2e8e5c', '#d9a621', '#7b5cd6'];
const HL_COLORS = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74'];
const SIZES: Record<PenToolKind, { v: number; dot: number }[]> = {
  pen: [
    { v: 2, dot: 5 },
    { v: 3.5, dot: 8 },
    { v: 6, dot: 12 },
  ],
  highlighter: [
    { v: 14, dot: 7 },
    { v: 22, dot: 10 },
    { v: 32, dot: 14 },
  ],
  eraser: [
    { v: 12, dot: 7 },
    { v: 20, dot: 10 },
    { v: 32, dot: 14 },
  ],
  hand: [],
};
const MEMO_KEY = 'masef_pen_memo';

type Memo = Record<'pen' | 'highlighter' | 'eraser', { color: string; size: number }>;

function defaultMemo(): Memo {
  return {
    pen: { color: PEN_COLORS[0], size: 3.5 },
    highlighter: { color: HL_COLORS[0], size: 22 },
    eraser: { color: '#000', size: 20 },
  };
}

export function loadPenTool(): PenTool {
  try {
    const raw = localStorage.getItem(MEMO_KEY);
    const m: Memo & { last?: PenToolKind } = raw ? JSON.parse(raw) : defaultMemo();
    // A page always opens with a drawing tool, never the eraser or the hand.
    const kind = m.last === 'highlighter' ? 'highlighter' : 'pen';
    return { kind, ...m[kind] };
  } catch {
    return { kind: 'pen', ...defaultMemo().pen };
  }
}

// Tools, colours, sizes, undo and clear. Emits the full tool state; the
// choice per tool is remembered across pages.
@Component({
  selector: 'app-pen-palette',
  template: `
    <div class="group tools" role="radiogroup" aria-label="Tool">
      <button type="button" class="tb" [class.sel]="tool.kind === 'pen'" (click)="setKind('pen')" title="Pen" aria-label="Pen">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 21l3.6-1 11.2-11.2-2.6-2.6L4 17.4 3 21zM14.8 5.6l2.6 2.6 1.9-1.9a1 1 0 000-1.4l-1.2-1.2a1 1 0 00-1.4 0l-1.9 1.9z" fill="currentColor"/></svg>
      </button>
      <button type="button" class="tb" [class.sel]="tool.kind === 'highlighter'" (click)="setKind('highlighter')" title="Highlighter" aria-label="Highlighter">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 20h16v2H4zM6.5 17.5l-2-2L15 5l2 2-10.5 10.5zM16.4 3.6l4 4-1.2 1.2-4-4z" fill="currentColor"/></svg>
      </button>
      <button type="button" class="tb" [class.sel]="tool.kind === 'eraser'" (click)="setKind('eraser')" title="Eraser (removes whole strokes)" aria-label="Eraser">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M16.2 3.6l4.2 4.2a2 2 0 010 2.8L11 20H6.6l-3.4-3.4a2 2 0 010-2.8l10.2-10.2a2 2 0 012.8 0zM8 18.6L13.6 13 9.4 8.8 4.6 13.6 8 17z" fill="currentColor"/></svg>
      </button>
      <button type="button" class="tb" [class.sel]="tool.kind === 'hand'" (click)="setKind('hand')" title="Hand: scroll with a finger or the mouse" aria-label="Hand">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 11V5.5a1.5 1.5 0 013 0V11h1V3.5a1.5 1.5 0 013 0V11h1V5.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1.2a6 6 0 01-4.9-2.5L3.6 14a1.5 1.5 0 012.4-1.8L8 14.4V11z" fill="currentColor"/></svg>
      </button>
    </div>
    @if (tool.kind !== 'hand') {
      @if (tool.kind !== 'eraser') {
        <div class="group colors" role="radiogroup" aria-label="Colour">
          @for (c of colors; track c) {
            <button type="button" class="swatch" [class.sel]="c === tool.color" [style.background]="c" (click)="setColor(c)" [attr.aria-label]="c"></button>
          }
        </div>
      }
      <div class="group sizes" role="radiogroup" aria-label="Size">
        @for (s of sizes; track s.v) {
          <button type="button" class="size" [class.sel]="s.v === tool.size" (click)="setSize(s.v)" [attr.aria-label]="'Size ' + s.v">
            <span class="dot" [style.width.px]="s.dot" [style.height.px]="s.dot" [style.background]="tool.kind === 'eraser' ? '#94a1b8' : tool.color"></span>
          </button>
        }
      </div>
    }
    <div class="group actions">
      <button type="button" class="tb" (click)="undo.emit()" [disabled]="!canUndo" title="Undo" aria-label="Undo">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 7H4v5l1.8-1.8A7 7 0 1112 19H8v-2h4a5 5 0 10-4.8-6.5L9 12V7z" fill="currentColor"/></svg>
      </button>
      @if (!confirmClear) {
        <button type="button" class="tb" (click)="confirmClear = true" title="Clear all ink here" aria-label="Clear">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 7h12l-1 14H7L6 7zm3-4h6l1 2h4v2H4V5h4l1-2z" fill="currentColor"/></svg>
        </button>
      } @else {
        <span class="confirm">
          Erase everything?
          <button type="button" class="yes" (click)="clear.emit(); confirmClear = false">Yes</button>
          <button type="button" class="no" (click)="confirmClear = false">No</button>
        </span>
      }
      <label class="finger" title="Off: fingers scroll, only a stylus draws (turned off automatically once a stylus is used)">
        <input type="checkbox" [checked]="fingerDraws" (change)="fingerDrawsChange.emit(!fingerDraws)" />
        Finger draws
      </label>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
        font-family: var(--font-body);
      }
      .group {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .group + .group {
        padding-left: 12px;
        border-left: 1px solid var(--line);
      }
      .tb,
      .size,
      .swatch {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--ink-2);
        cursor: pointer;
        padding: 0;
        touch-action: manipulation;
      }
      .tb:hover,
      .size:hover {
        background: var(--paper);
      }
      .tb.sel,
      .size.sel {
        background: var(--cobalt-soft);
        border-color: #b7c6f2;
        color: var(--cobalt);
      }
      .tb:disabled {
        opacity: 0.35;
        cursor: default;
      }
      .swatch {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 0 0 1px var(--line);
        margin: 0 2px;
      }
      .swatch.sel {
        box-shadow: 0 0 0 2px var(--ink);
      }
      .dot {
        border-radius: 50%;
        display: block;
      }
      .confirm {
        font-size: 12.5px;
        color: var(--bad);
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .confirm button {
        border-radius: 6px;
        border: 1px solid var(--line);
        padding: 4px 10px;
        cursor: pointer;
        font-family: var(--font-body);
        font-size: 12.5px;
        background: var(--card);
      }
      .confirm .yes {
        background: var(--bad);
        border-color: var(--bad);
        color: #fff;
      }
      .finger {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--ink-3);
        margin-left: 6px;
        cursor: pointer;
        white-space: nowrap;
      }
      @media (pointer: coarse) {
        .tb,
        .size {
          width: 40px;
          height: 40px;
        }
        .swatch {
          width: 28px;
          height: 28px;
        }
      }
    `,
  ],
})
export class PenPalette implements OnInit {
  @Input() tool: PenTool = loadPenTool();
  @Input() canUndo = false;
  @Input() fingerDraws = true;
  @Output() toolChange = new EventEmitter<PenTool>();
  @Output() undo = new EventEmitter<void>();
  @Output() clear = new EventEmitter<void>();
  @Output() fingerDrawsChange = new EventEmitter<boolean>();

  confirmClear = false;
  private memo: Memo = defaultMemo();

  ngOnInit() {
    try {
      const raw = localStorage.getItem(MEMO_KEY);
      if (raw) this.memo = { ...this.memo, ...JSON.parse(raw) };
    } catch {
      /* defaults */
    }
  }

  get colors() {
    return this.tool.kind === 'highlighter' ? HL_COLORS : PEN_COLORS;
  }

  get sizes() {
    return SIZES[this.tool.kind];
  }

  setKind(kind: PenToolKind) {
    if (kind === 'hand') {
      this.push({ ...this.tool, kind });
      return;
    }
    this.push({ kind, ...this.memo[kind] });
  }

  setColor(color: string) {
    this.push({ ...this.tool, color });
  }

  setSize(size: number) {
    this.push({ ...this.tool, size });
  }

  private push(t: PenTool) {
    this.tool = t;
    if (t.kind !== 'hand') this.memo[t.kind] = { color: t.color, size: t.size };
    try {
      localStorage.setItem(MEMO_KEY, JSON.stringify({ ...this.memo, last: t.kind }));
    } catch {
      /* ignore */
    }
    this.toolChange.emit(t);
  }
}

// The round "Pen" button. Hovering it (desktop) previews the palette given
// as content; clicking it turns the ink layer on or off. Tablets simply tap.
@Component({
  selector: 'app-pen-button',
  template: `
    <div class="pen-menu" (mouseleave)="hover = false">
      <button
        type="button"
        class="pen-btn"
        [class.on]="active"
        (click)="onClick()"
        (mouseenter)="hover = true"
        [attr.aria-pressed]="active"
        [title]="active ? 'Stop drawing' : 'Draw on this page with a pen or your finger'"
      >
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 21l3.6-1 11.2-11.2-2.6-2.6L4 17.4 3 21zM14.8 5.6l2.6 2.6 1.9-1.9a1 1 0 000-1.4l-1.2-1.2a1 1 0 00-1.4 0l-1.9 1.9z" fill="currentColor"/></svg>
        <span>{{ active ? 'Drawing' : 'Pen' }}</span>
      </button>
      @if (hover && !active) {
        <div class="dropdown"><ng-content /></div>
      }
    </div>
  `,
  styles: [
    `
      .pen-menu {
        position: relative;
        display: inline-block;
      }
      .pen-btn {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        font-family: var(--font-body);
        font-size: 12.5px;
        font-weight: 500;
        color: var(--ink-2);
        background: var(--paper);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 6px 13px 6px 10px;
        cursor: pointer;
        touch-action: manipulation;
        transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      }
      .pen-btn:hover {
        border-color: #cfd6ea;
        color: var(--ink);
      }
      .pen-btn.on {
        background: var(--ink);
        border-color: var(--ink);
        color: var(--gold);
      }
      .dropdown {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        z-index: 40;
        width: max-content;
        max-width: calc(100vw - 32px);
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 12px;
        box-shadow: var(--shadow-2);
        padding: 10px 14px;
        min-width: 320px;
      }
      @media (pointer: coarse) {
        .pen-btn {
          padding: 9px 15px 9px 12px;
          font-size: 13.5px;
        }
      }
    `,
  ],
})
export class PenButton {
  @Input() active = false;
  @Output() toggle = new EventEmitter<void>();
  hover = false;

  onClick() {
    this.hover = false;
    this.toggle.emit();
  }
}

export function defaultFingerDraws(): boolean {
  const saved = localStorage.getItem('masef_finger_draws');
  if (saved !== null) return saved === '1';
  return !penSeen();
}

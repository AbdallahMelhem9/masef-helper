import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { getStroke } from 'perfect-freehand';
import { Stroke } from '../core/ink.service';

export type PenToolKind = 'pen' | 'highlighter' | 'eraser' | 'hand';
export interface PenTool {
  kind: PenToolKind;
  color: string;
  size: number;
}

// Once a stylus has been seen, fingers scroll instead of drawing (palm
// rejection); the toolbar lets the student flip this.
const PEN_SEEN_KEY = 'masef_pen_seen';
export function penSeen(): boolean {
  return localStorage.getItem(PEN_SEEN_KEY) === '1';
}

const MAX_DPR = 2;

interface PointerState {
  mode: 'draw' | 'erase' | 'pan';
  type: string;
  lastX: number;
  lastY: number;
}

interface Anchor {
  left: number;
  top: number;
  width: number;
}

interface Resolved {
  pts: number[][]; // sheet coordinates
  minY: number;
  maxY: number;
}

// A transparent drawing surface laid over its parent element (the lesson
// sheet or the notebook paper). Strokes are rendered with perfect-freehand
// and stored relative to the block they were drawn on (data-anchor), so they
// follow the text when the page reflows. Long pages are covered by a canvas
// window of about three viewport heights that moves with the scroll: a
// single canvas as tall as a lesson would exceed what tablets can allocate.
@Component({
  selector: 'app-ink-layer',
  template: `<canvas #base class="ink-canvas"></canvas><canvas #live class="ink-canvas"></canvas>`,
  styles: [
    `
      :host {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 3;
        overflow: hidden;
      }
      :host(.active) {
        pointer-events: auto;
        touch-action: none;
        -webkit-user-select: none;
        user-select: none;
        -webkit-touch-callout: none;
      }
      :host(.active.tool-pen),
      :host(.active.tool-highlighter) {
        cursor: crosshair;
      }
      :host(.active.tool-eraser) {
        cursor: cell;
      }
      :host(.active.tool-hand) {
        cursor: grab;
      }
      .ink-canvas {
        position: absolute;
        left: 0;
        top: 0;
        display: block;
      }
    `,
  ],
  host: {
    '[class.active]': 'active',
    '[class.tool-pen]': "tool.kind === 'pen'",
    '[class.tool-highlighter]': "tool.kind === 'highlighter'",
    '[class.tool-eraser]': "tool.kind === 'eraser'",
    '[class.tool-hand]': "tool.kind === 'hand'",
  },
})
export class InkLayer implements AfterViewInit, OnChanges, OnDestroy {
  @Input() strokes: Stroke[] = [];
  @Input() active = false;
  @Input() tool: PenTool = { kind: 'pen', color: '#17263e', size: 3 };
  @Input() fingerDraws = true;
  @Output() strokesChange = new EventEmitter<Stroke[]>();
  @Output() canUndoChange = new EventEmitter<boolean>();

  @ViewChild('base') private baseRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('live') private liveRef!: ElementRef<HTMLCanvasElement>;

  private el = inject(ElementRef<HTMLElement>).nativeElement;
  private zone = inject(NgZone);
  private host!: HTMLElement;
  private base!: CanvasRenderingContext2D;
  private liveCtx!: CanvasRenderingContext2D;

  private current: Stroke[] = [];
  private history: Stroke[][] = [];
  private resolved = new Map<Stroke, Resolved>();
  private pointers = new Map<number, PointerState>();
  private drawing: { pointerId: number; pts: number[][]; anchor: string; rect: Anchor; simulated: boolean } | null = null;

  private winTop = 0;
  private winH = 0;
  private docW = 0;
  private docH = 0;
  private dpr = 1;
  private ro: ResizeObserver | null = null;
  private scrollRaf = 0;
  private listeners: [string, EventListener][] = [];

  ngOnChanges(changes: SimpleChanges) {
    // The owner binds back the array this layer emitted: nothing to reload.
    if (changes['strokes'] && this.strokes !== this.current) {
      this.current = [...(this.strokes || [])];
      this.history = [];
      this.canUndoChange.emit(false);
      if (this.base) this.redraw();
    }
  }

  ngAfterViewInit() {
    this.host = this.el.parentElement as HTMLElement;
    this.base = this.baseRef.nativeElement.getContext('2d')!;
    this.liveCtx = this.liveRef.nativeElement.getContext('2d')!;
    this.zone.runOutsideAngular(() => {
      this.ro = new ResizeObserver(() => this.layout());
      this.ro.observe(this.host);
      const on = (target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
        target.addEventListener(type, fn, opts);
        this.listeners.push([type, fn]);
      };
      on(window, 'scroll', () => this.onScroll(), { passive: true });
      on(window, 'resize', () => this.layout());
      on(this.el, 'pointerdown', (e) => this.onPointerDown(e as PointerEvent));
      on(this.el, 'pointermove', (e) => this.onPointerMove(e as PointerEvent));
      on(this.el, 'pointerup', (e) => this.onPointerUp(e as PointerEvent));
      on(this.el, 'pointercancel', (e) => this.onPointerUp(e as PointerEvent, true));
      on(this.el, 'contextmenu', (e) => e.preventDefault());
      this.layout();
    });
  }

  ngOnDestroy() {
    this.ro?.disconnect();
    for (const [type, fn] of this.listeners) {
      window.removeEventListener(type, fn);
      this.el.removeEventListener(type, fn);
    }
  }

  // ---- public controls (called by the toolbar's owner) ----
  undo() {
    const prev = this.history.pop();
    if (!prev) return;
    this.current = prev;
    this.redraw();
    this.emit();
  }

  clearAll() {
    if (!this.current.length) return;
    this.snapshot();
    this.current = [];
    this.redraw();
    this.emit();
  }

  get isEmpty() {
    return this.current.length === 0;
  }

  // ---- geometry ----
  private hostRect() {
    return this.host.getBoundingClientRect();
  }

  private layout() {
    const rect = this.hostRect();
    this.docW = this.host.clientWidth;
    this.docH = this.host.offsetHeight;
    this.dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const vh = window.innerHeight;
    const viewTop = -rect.top;
    const span = Math.min(this.docH, 3 * vh);
    this.winTop = Math.max(0, Math.min(viewTop - vh, this.docH - span));
    this.winH = Math.max(1, Math.min(span, this.docH - this.winTop));
    for (const c of [this.baseRef.nativeElement, this.liveRef.nativeElement]) {
      c.style.top = `${this.winTop}px`;
      c.style.width = `${this.docW}px`;
      c.style.height = `${this.winH}px`;
      c.width = Math.round(this.docW * this.dpr);
      c.height = Math.round(this.winH * this.dpr);
    }
    this.base.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.liveCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.redraw();
    if (this.drawing) this.redrawLive();
  }

  private onScroll() {
    if (this.scrollRaf) return;
    this.scrollRaf = requestAnimationFrame(() => {
      this.scrollRaf = 0;
      const vh = window.innerHeight;
      const viewTop = -this.hostRect().top;
      const margin = 0.5 * vh;
      const needAbove = viewTop < this.winTop + margin && this.winTop > 0;
      const needBelow = viewTop + vh > this.winTop + this.winH - margin && this.winTop + this.winH < this.docH;
      if (needAbove || needBelow || this.host.offsetHeight !== this.docH) this.layout();
    });
  }

  private anchorRect(id: string, hostRect: DOMRect): Anchor | null {
    if (id === 'doc') return { left: 0, top: 0, width: this.docW };
    const el = this.host.querySelector(`[data-anchor="${CSS.escape(id)}"]`) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left - hostRect.left, top: r.top - hostRect.top, width: r.width };
  }

  // ---- rendering ----
  private redraw() {
    if (!this.base) return;
    this.base.clearRect(0, 0, this.docW, this.winH);
    this.resolved.clear();
    const hostRect = this.hostRect();
    const anchors = new Map<string, Anchor | null>();
    for (const s of this.current) {
      if (!anchors.has(s.a)) anchors.set(s.a, this.anchorRect(s.a, hostRect));
      const a = anchors.get(s.a);
      if (!a) continue;
      let minY = Infinity;
      let maxY = -Infinity;
      const pts = s.p.map(([x, y, p]) => {
        const Y = a.top + y;
        if (Y < minY) minY = Y;
        if (Y > maxY) maxY = Y;
        return [a.left + x * a.width, Y, p ?? 0.5];
      });
      const r: Resolved = { pts, minY, maxY };
      this.resolved.set(s, r);
      if (maxY + s.w * 2 < this.winTop || minY - s.w * 2 > this.winTop + this.winH) continue;
      this.paint(this.base, s, pts);
    }
  }

  private paint(ctx: CanvasRenderingContext2D, s: Stroke, pts: number[][]) {
    const local = pts.map(([x, y, p]) => [x, y - this.winTop, p]);
    const outline =
      s.t === 'hl'
        ? getStroke(local, { size: s.w, thinning: 0, smoothing: 0.6, streamline: 0.5, simulatePressure: false, last: true, start: { cap: false }, end: { cap: false } })
        : getStroke(local, { size: s.w, thinning: 0.55, smoothing: 0.5, streamline: 0.4, simulatePressure: s.s === 1, last: true });
    if (outline.length < 2) return;
    const path = new Path2D();
    path.moveTo(outline[0][0], outline[0][1]);
    for (let i = 0; i < outline.length; i++) {
      const [x0, y0] = outline[i];
      const [x1, y1] = outline[(i + 1) % outline.length];
      path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    path.closePath();
    ctx.save();
    if (s.t === 'hl') {
      ctx.globalAlpha = 0.38;
      ctx.globalCompositeOperation = 'multiply';
    }
    ctx.fillStyle = s.c;
    ctx.fill(path);
    ctx.restore();
  }

  private redrawLive() {
    this.liveCtx.clearRect(0, 0, this.docW, this.winH);
    const d = this.drawing;
    if (!d) return;
    this.paint(this.liveCtx, this.liveStroke(d.pts, d.simulated), d.pts);
  }

  private liveStroke(pts: number[][], simulated: boolean): Stroke {
    const hl = this.tool.kind === 'highlighter';
    return { t: hl ? 'hl' : 'pen', c: this.tool.color, w: this.tool.size, a: 'doc', s: simulated ? 1 : undefined, p: pts };
  }

  // ---- pointer input ----
  private modeFor(e: PointerEvent): PointerState['mode'] | null {
    if (e.pointerType === 'mouse' && e.button !== 0) return null;
    if (e.pointerType === 'pen') localStorage.setItem(PEN_SEEN_KEY, '1');
    if (this.tool.kind === 'hand') return 'pan';
    if (e.pointerType === 'touch') {
      const penActive = [...this.pointers.values()].some((p) => p.type === 'pen');
      if (penActive) return null; // resting palm while the stylus draws
      if (this.pointers.size >= 1) {
        // Second finger: drop the stroke, both fingers scroll.
        this.cancelStroke();
        for (const p of this.pointers.values()) p.mode = 'pan';
        return 'pan';
      }
      if (!this.fingerDraws) return 'pan';
    }
    return this.tool.kind === 'eraser' ? 'erase' : 'draw';
  }

  private onPointerDown(e: PointerEvent) {
    if (!this.active) return;
    const mode = this.modeFor(e);
    if (!mode) return;
    e.preventDefault();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* older browsers */
    }
    this.pointers.set(e.pointerId, { mode, type: e.pointerType, lastX: e.clientX, lastY: e.clientY });
    if (mode === 'draw') {
      if (this.drawing) return;
      this.beginStroke(e);
    } else if (mode === 'erase') {
      this.eraseAt(e);
    }
  }

  private onPointerMove(e: PointerEvent) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.mode === 'pan') {
      window.scrollBy(0, p.lastY - e.clientY);
    } else if (p.mode === 'draw') {
      if (this.drawing?.pointerId === e.pointerId) {
        const rect = this.hostRect();
        const events: PointerEvent[] = (e.getCoalescedEvents?.() as PointerEvent[] | undefined)?.length ? (e.getCoalescedEvents() as PointerEvent[]) : [e];
        for (const ev of events) this.drawing.pts.push(this.point(ev, rect));
        this.redrawLive();
      }
    } else {
      this.eraseAt(e);
    }
    p.lastX = e.clientX;
    p.lastY = e.clientY;
  }

  private onPointerUp(e: PointerEvent, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    try {
      this.el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (p.mode === 'draw' && this.drawing?.pointerId === e.pointerId) {
      if (cancelled) this.cancelStroke();
      else this.endStroke();
    }
  }

  private point(e: PointerEvent, rect: DOMRect): number[] {
    const pressure = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5;
    return [e.clientX - rect.left, e.clientY - rect.top, pressure];
  }

  private beginStroke(e: PointerEvent) {
    const rect = this.hostRect();
    let anchor = 'doc';
    for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
      const a = (el as HTMLElement).closest?.('[data-anchor]') as HTMLElement | null;
      if (a && this.host.contains(a)) {
        anchor = a.getAttribute('data-anchor')!;
        break;
      }
    }
    const aRect = this.anchorRect(anchor, rect) || { left: 0, top: 0, width: this.docW };
    this.drawing = { pointerId: e.pointerId, pts: [this.point(e, rect)], anchor, rect: aRect, simulated: e.pointerType !== 'pen' };
    this.redrawLive();
  }

  private cancelStroke() {
    this.drawing = null;
    this.liveCtx.clearRect(0, 0, this.docW, this.winH);
  }

  private endStroke() {
    const d = this.drawing;
    if (!d) return;
    this.drawing = null;
    this.liveCtx.clearRect(0, 0, this.docW, this.winH);
    let pts = simplify(d.pts, 0.6);
    if (pts.length === 1) pts = [pts[0], [pts[0][0] + 0.1, pts[0][1] + 0.1, pts[0][2]]];
    const width = Math.max(1, d.rect.width);
    const stroke: Stroke = {
      ...this.liveStroke([], d.simulated),
      a: d.anchor,
      p: pts.map(([x, y, p]) => [round((x - d.rect.left) / width, 4), round(y - d.rect.top, 1), round(p, 2)]),
    };
    this.snapshot();
    this.current = [...this.current, stroke];
    // Paint the new stroke directly; a full redraw is only needed on reflow.
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    this.resolved.set(stroke, { pts, minY, maxY });
    this.paint(this.base, stroke, pts);
    this.emit();
  }

  private eraseAt(e: PointerEvent) {
    const rect = this.hostRect();
    const [ex, ey] = this.point(e, rect);
    const r = this.tool.size;
    const hits: Stroke[] = [];
    for (const [s, res] of this.resolved) {
      if (ey < res.minY - r || ey > res.maxY + r) continue;
      const reach = r + s.w / 2;
      for (const [x, y] of res.pts) {
        if ((x - ex) ** 2 + (y - ey) ** 2 <= reach * reach) {
          hits.push(s);
          break;
        }
      }
    }
    if (!hits.length) return;
    this.snapshot();
    const gone = new Set(hits);
    this.current = this.current.filter((s) => !gone.has(s));
    this.redraw();
    this.emit();
  }

  private snapshot() {
    this.history.push(this.current);
    if (this.history.length > 40) this.history.shift();
  }

  private emit() {
    this.zone.run(() => {
      this.strokesChange.emit(this.current);
      this.canUndoChange.emit(this.history.length > 0);
    });
  }
}

function round(v: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

// Radial-distance simplification: drops points closer than `tol` to the
// last kept point. perfect-freehand smooths the rest.
function simplify(pts: number[][], tol: number): number[][] {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let last = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    if ((p[0] - last[0]) ** 2 + (p[1] - last[1]) ** 2 >= tol * tol) {
      out.push(p);
      last = p;
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

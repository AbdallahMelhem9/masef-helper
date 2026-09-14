import { Component, computed, input } from '@angular/core';

// Deterministic PRNG so a given seed always draws the same path.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function brownianPathD(seed: number, width: number, height: number, steps = 140): string {
  const rand = mulberry32(seed);
  const gaussian = () => {
    const u = Math.max(rand(), 1e-9);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const dx = width / steps;
  const vol = height * 0.09;
  let y = height * 0.55;
  let d = `M 0 ${y.toFixed(2)}`;
  for (let i = 1; i <= steps; i++) {
    y += gaussian() * vol;
    y = Math.min(Math.max(y, height * 0.06), height * 0.94);
    d += ` L ${(i * dx).toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

@Component({
  selector: 'app-brownian-path',
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
      [attr.width]="'100%'"
      preserveAspectRatio="none"
      aria-hidden="true"
      class="bm-svg"
      [class.animated]="animated()"
    >
      <path [attr.d]="d()" fill="none" [attr.stroke]="stroke()" [attr.stroke-width]="strokeWidth()" stroke-linejoin="round" />
    </svg>
  `,
  styles: `
    .bm-svg {
      display: block;
      overflow: visible;
    }
    .bm-svg.animated path {
      stroke-dasharray: 3000;
      stroke-dashoffset: 3000;
      animation: bm-draw 2.2s ease-out forwards;
    }
    @keyframes bm-draw {
      to {
        stroke-dashoffset: 0;
      }
    }
  `,
})
export class BrownianPath {
  seed = input(7);
  width = input(600);
  height = input(120);
  stroke = input('#d9a621');
  strokeWidth = input(1.6);
  animated = input(false);

  d = computed(() => brownianPathD(this.seed(), this.width(), this.height()));
}

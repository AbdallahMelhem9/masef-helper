import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import katex from 'katex';
import { GlossaryService } from '../core/glossary.service';

// Markdown mangles LaTeX delimiters, so math segments are pulled out first,
// rendered with KaTeX, and spliced back in after the markdown pass.
export function renderMathMarkdown(src: string): string {
  const rendered: string[] = [];
  const stash = (html: string) => `%%MATHBLOCK${rendered.push(html) - 1}%%`;
  const katexOpts = { throwOnError: false, output: 'html' as const };

  let text = src.replace(/\\\[([\s\S]*?)\\\]/g, (_m, tex) =>
    stash(katex.renderToString(tex, { ...katexOpts, displayMode: true }))
  );
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_m, tex) =>
    stash(katex.renderToString(tex, { ...katexOpts, displayMode: false }))
  );
  // Fallback for $$...$$ and $...$ in case the model ignores instructions.
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_m, tex) =>
    stash(katex.renderToString(tex, { ...katexOpts, displayMode: true }))
  );
  text = text.replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_m, pre, tex) =>
    pre + stash(katex.renderToString(tex, { ...katexOpts, displayMode: false }))
  );

  let html = marked.parse(text, { async: false }) as string;
  html = html.replace(/%%MATHBLOCK(\d+)%%/g, (_m, i) => rendered[Number(i)]);
  return html;
}

// Wraps the first occurrence of each glossary term (outside math) in a
// span.gloss carrying the canonical term name, for hover definitions.
function markGlossaryTerms(html: string, matchers: { text: string; entry: { term: string } }[]): string {
  if (matchers.length === 0) return html;
  const container = document.createElement('div');
  container.innerHTML = html;
  const done = new Set<string>();

  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.classList?.contains('katex') || el.classList?.contains('gloss')) return;
      for (const child of Array.from(el.childNodes)) walk(child);
      return;
    }
    if (node.nodeType !== Node.TEXT_NODE) return;
    let textNode = node as Text;
    for (const { text, entry } of matchers) {
      if (done.has(entry.term)) continue;
      const value = textNode.textContent || '';
      const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?<![\\p{L}\\p{N}-])${escaped}(?![\\p{L}\\p{N}-])`, 'iu');
      const m = re.exec(value);
      if (!m) continue;
      done.add(entry.term);
      const matchNode = textNode.splitText(m.index);
      const rest = matchNode.splitText(m[0].length);
      const span = document.createElement('span');
      span.className = 'gloss';
      span.setAttribute('data-term', entry.term);
      span.textContent = matchNode.textContent;
      matchNode.replaceWith(span);
      textNode = rest;
    }
  };
  walk(container);
  return container.innerHTML;
}

@Component({
  selector: 'app-math-content',
  template: `<div class="math-content" [innerHTML]="html()"></div>`,
})
export class MathContent {
  content = input.required<string>();
  gloss = input(false);
  private sanitizer = inject(DomSanitizer);
  private glossary = inject(GlossaryService);

  html = computed<SafeHtml>(() => {
    let html = renderMathMarkdown(this.content());
    if (this.gloss()) {
      html = markGlossaryTerms(html, this.glossary.matchers());
    }
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });
}

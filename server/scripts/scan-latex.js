// Scans block texts for math that KaTeX can't render and for LaTeX left
// outside math delimiters, using the same extraction as the client's
// renderMathMarkdown. node scripts/scan-latex.js [courseId] [--json]
import katex from '../../client/node_modules/katex/dist/katex.mjs';
import { db } from '../src/db.js';

const FIELDS = ['content_text', 'ai_explanation', 'proof', 'tutor_note', 'extra_explanation', 'extra_example', 'refresh'];
const courseId = process.argv.slice(2).find((a) => /^\d+$/.test(a));
const rows = db
  .prepare(
    `SELECT s.*, l.title AS lesson, c.id AS cid FROM sections s JOIN pdfs p ON p.id = s.pdf_id JOIN lessons l ON l.id = p.lesson_id
     JOIN courses c ON c.id = l.course_id ${courseId ? 'WHERE c.id = ?' : ''} ORDER BY c.id, l.position, s.position`
  )
  .all(...(courseId ? [courseId] : []));

const BARE = /\\(?:frac|sum|int|alpha|beta|gamma|lambda|sigma|mathbb|mathcal|leq|geq|le|ge|infty|langle|rangle|sqrt|cdot|times|forall|exists|partial|nabla|hat|bar|tilde|operatorname|mathrm|left|right|xi|mu|nu|theta|varepsilon|epsilon|phi|psi|omega|Omega|Delta|delta|top|min|max|arg|sup|inf|lim|log|exp|mathbf|boldsymbol)(?![a-zA-Z])/g;

export function scanText(src) {
  const issues = [];
  const check = (tex, display) => {
    try {
      katex.renderToString(tex, { throwOnError: true, displayMode: display });
    } catch (e) {
      issues.push(`katex: ${e.message.replace(/\s+/g, ' ').slice(0, 140)} :: ${tex.replace(/\s+/g, ' ').slice(0, 120)}`);
    }
    return ' ';
  };
  let t = src.replace(/\\\[([\s\S]*?)\\\]/g, (_m, x) => check(x, true));
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, (_m, x) => check(x, false));
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, (_m, x) => check(x, true));
  t = t.replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_m, pre, x) => pre + check(x, false));
  if (/\\\(|\\\)|\\\[|\\\]/.test(t)) issues.push('unmatched \\( \\) or \\[ \\] delimiter');
  const bare = t.match(BARE);
  if (bare) issues.push(`LaTeX outside math: ${[...new Set(bare)].slice(0, 6).join(' ')}`);
  return issues;
}

const problems = [];
for (const r of rows) {
  for (const f of FIELDS) {
    if (!r[f]) continue;
    const issues = scanText(r[f]);
    if (issues.length) problems.push({ id: r.id, cid: r.cid, lesson: r.lesson, title: r.title, field: f, issues });
  }
}
const byCourse = {};
for (const p of problems) byCourse[p.cid] = (byCourse[p.cid] || 0) + 1;
if (process.argv.includes('--json')) console.log(JSON.stringify(problems, null, 1));
else {
  for (const p of problems) console.log(`#${p.id} [c${p.cid}] ${p.lesson} / ${p.title || '(untitled)'} / ${p.field}\n   ${p.issues.join('\n   ')}`);
  console.log('\nfields with problems by course:', byCourse, 'of', rows.length, 'blocks scanned');
}

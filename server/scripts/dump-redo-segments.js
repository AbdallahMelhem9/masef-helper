// Dumps the blocks of the given lessons (statement, proof, current
// explanation and tutor note) into N contiguous segment files for the
// "redo" agents that rewrite explanations and add deep dives / examples.
// Usage: node scripts/dump-redo-segments.js <out-dir> <courseId> <N> <lessonPositions e.g. 1,2,3>
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';

const [OUT, courseId, nStr, posStr] = process.argv.slice(2);
if (!OUT || !courseId || !posStr) throw new Error('usage: node dump-redo-segments.js <out-dir> <courseId> <N> <lessonPositions>');
fs.mkdirSync(OUT, { recursive: true });
const N = Number(nStr || 4);
const positions = posStr.split(',').map(Number);

const blocks = db
  .prepare(
    `SELECT s.id, s.kind, s.title, s.content_text, s.proof, s.importance, s.ai_explanation, s.tutor_note,
            s.extra_explanation, s.extra_example,
            l.title AS lessonTitle, l.position AS lpos
     FROM sections s JOIN pdfs p ON p.id = s.pdf_id JOIN lessons l ON l.id = p.lesson_id
     WHERE l.course_id = ? AND s.kind NOT IN ('tutor_note', 'heading')
     ORDER BY l.position, s.position`
  )
  .all(Number(courseId))
  .filter((b) => positions.includes(b.lpos));

const clip = (s, n) => (s && s.length > n ? s.slice(0, n) + `\n[... ${s.length - n} more chars]` : s);

const per = Math.ceil(blocks.length / N);
for (let i = 0; i < N; i++) {
  const seg = blocks.slice(i * per, (i + 1) * per);
  const text = seg
    .map(
      (b) =>
        `## BLOCK id=${b.id} kind=${b.kind} lesson=${b.lpos}: ${b.lessonTitle}\nTITLE: ${b.title || '(none)'}\nSTATEMENT:\n${b.content_text}\n\nPROOF SHOWN ON THE PAGE${b.importance ? ` (importance tag: ${b.importance})` : ''}:\n${clip(b.proof, 2500) || '(none)'}\n\nCURRENT EXPLANATION (to be rewritten):\n${b.ai_explanation || '(none)'}\n\nCURRENT TUTOR NOTE:\n${b.tutor_note || '(none)'}\n\nCURRENT DEEP DIVE PANEL (shown separately, stays):\n${b.extra_explanation || '(none)'}\n\nCURRENT WORKED EXAMPLE PANEL (shown separately, stays):\n${b.extra_example || '(none)'}\n`
    )
    .join('\n----------------------------------------\n\n');
  fs.writeFileSync(path.join(OUT, `segment-${i + 1}.txt`), text);
  console.log(`segment-${i + 1}: ${seg.length} blocks (lesson ${seg[0]?.lpos} ${seg[0]?.title || seg[0]?.kind} ... lesson ${seg[seg.length - 1]?.lpos} ${seg[seg.length - 1]?.title || seg[seg.length - 1]?.kind})`);
}
console.log('total', blocks.length, 'blocks');

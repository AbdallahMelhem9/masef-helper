// Dumps the blocks of a course (all lessons, or the given lesson positions)
// into N contiguous segment files for the layer-writing agents.
// Usage: node scripts/dump-course-segments.js <out-dir> <courseId> <N> [lessonPositions e.g. 1,2]
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';

const [OUT, courseId, nStr, posStr] = process.argv.slice(2);
if (!OUT || !courseId) throw new Error('usage: node dump-course-segments.js <out-dir> <courseId> <N> [lessonPositions]');
fs.mkdirSync(OUT, { recursive: true });
const N = Number(nStr || 4);
const positions = posStr ? posStr.split(',').map(Number) : null;

const blocks = db
  .prepare(
    `SELECT s.id, s.kind, s.title, s.content_text, s.ai_explanation, l.title AS lessonTitle, l.position AS lpos
     FROM sections s JOIN pdfs p ON p.id = s.pdf_id JOIN lessons l ON l.id = p.lesson_id
     WHERE l.course_id = ? AND s.kind NOT IN ('tutor_note', 'heading')
     ORDER BY l.position, s.position`
  )
  .all(Number(courseId))
  .filter((b) => !positions || positions.includes(b.lpos));

const per = Math.ceil(blocks.length / N);
for (let i = 0; i < N; i++) {
  const seg = blocks.slice(i * per, (i + 1) * per);
  const text = seg
    .map(
      (b) =>
        `## BLOCK id=${b.id} kind=${b.kind} lesson=${b.lessonTitle}\nTITLE: ${b.title || '(none)'}\nSTATEMENT:\n${b.content_text}\n\nCURRENT EXPLANATION:\n${b.ai_explanation || '(none)'}\n`
    )
    .join('\n----------------------------------------\n\n');
  fs.writeFileSync(path.join(OUT, `segment-${i + 1}.txt`), text);
  console.log(`segment-${i + 1}: ${seg.length} blocks (${seg[0]?.lessonTitle} ... ${seg[seg.length - 1]?.lessonTitle})`);
}
console.log('total', blocks.length, 'blocks');

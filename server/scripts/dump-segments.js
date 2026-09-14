// Dumps the blocks of Stochastic Calculus lessons 1-2 into 5 contiguous
// segment files for the layer-writing agents.
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: node dump-segments.js <out-dir>');
fs.mkdirSync(OUT, { recursive: true });

const course = db.prepare("SELECT * FROM courses WHERE title = 'Stochastic Calculus'").get();
const blocks = db
  .prepare(
    `SELECT s.id, s.kind, s.title, s.content_text, s.ai_explanation, l.title AS lessonTitle
     FROM sections s JOIN pdfs p ON p.id = s.pdf_id JOIN lessons l ON l.id = p.lesson_id
     WHERE l.course_id = ? AND l.position IN (1, 2) AND s.kind NOT IN ('tutor_note', 'heading')
     ORDER BY l.position, s.position`
  )
  .all(course.id);

const N = 5;
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

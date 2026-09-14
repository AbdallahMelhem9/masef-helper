// Ingests chapters 2-8 of Forien's polycopié into lessons 2-8 as
// statement-level blocks (run after the lesson-1 sample is approved).
// Run from server/: node scripts/ingest-remaining.js
import { db } from '../src/db.js';
import { getChapterOutline, ingestChapter } from '../src/ingest.js';
import path from 'node:path';
import { UPLOADS_DIR } from '../src/db.js';

const course = db.prepare("SELECT * FROM courses WHERE title = 'Prérentrée de probabilités'").get();
const lessons = db.prepare('SELECT * FROM lessons WHERE course_id = ? ORDER BY position').all(course.id);
const absPath = path.join(UPLOADS_DIR, 'poly-prerentree-m2.pdf');

console.log('Getting chapter outline...');
const chapters = await getChapterOutline(absPath);
console.log(chapters.map((c) => `ch${c.number} "${c.title}" pp.${c.page_start}-${c.page_end}`).join('\n'));

for (const lesson of lessons.slice(1)) {
  const chapter = chapters[lesson.position - 1];
  if (!chapter) {
    console.error(`No chapter for lesson ${lesson.position} ("${lesson.title}") — skipping`);
    continue;
  }
  const pdfRow = db.prepare('SELECT * FROM pdfs WHERE lesson_id = ? ORDER BY position LIMIT 1').get(lesson.id);
  const existing = db.prepare('SELECT COUNT(*) n FROM sections WHERE pdf_id = ?').get(pdfRow.id).n;
  if (existing > 0) {
    console.log(`Lesson "${lesson.title}" already has ${existing} blocks — skipping.`);
    continue;
  }
  try {
    await ingestChapter({ pdfRowId: pdfRow.id, chapter, withAnnotations: true });
  } catch (err) {
    console.error(`Lesson "${lesson.title}" failed: ${err.message} — continuing with the next one.`);
  }
}
console.log('All remaining lessons done.');

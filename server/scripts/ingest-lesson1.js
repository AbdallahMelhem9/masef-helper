// Re-ingests ONLY lesson 1 (chapter 1 of Forien's polycopié) in the
// statement-level block format, as the sample for approval.
// Run from server/: node scripts/ingest-lesson1.js
import { db } from '../src/db.js';
import { ingestChapter } from '../src/ingest.js';

const lesson = db
  .prepare("SELECT l.* FROM lessons l JOIN courses c ON c.id = l.course_id WHERE c.title = 'Prérentrée de probabilités' ORDER BY l.position LIMIT 1")
  .get();
if (!lesson) throw new Error('Lesson 1 not found');
const pdfRow = db.prepare('SELECT * FROM pdfs WHERE lesson_id = ? ORDER BY position LIMIT 1').get(lesson.id);
if (!pdfRow) throw new Error('Lesson 1 has no pdf row');

db.prepare('DELETE FROM sections WHERE pdf_id = ?').run(pdfRow.id);
console.log(`Re-ingesting lesson "${lesson.title}" (pdf row ${pdfRow.id}) as blocks...`);

// Chapter 1 spans pages 1-4 (chapter 2 starts at the top of page 5).
await ingestChapter({
  pdfRowId: pdfRow.id,
  chapter: { number: 1, title: 'Basics of measure theory and integration', page_start: 1, page_end: 4 },
  withAnnotations: true,
});
console.log('Lesson 1 done.');

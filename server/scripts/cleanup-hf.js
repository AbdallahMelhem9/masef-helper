// Removes Finance HF lessons whose ingestion was blocked (empty), keeps any
// that succeeded, and updates the course description.
import { db } from '../src/db.js';

const course = db.prepare("SELECT * FROM courses WHERE title = 'Finance haute fréquence'").get();
const lessons = db.prepare('SELECT * FROM lessons WHERE course_id = ?').all(course.id);
let kept = 0, removed = 0;
for (const l of lessons) {
  const pdfRow = db.prepare('SELECT * FROM pdfs WHERE lesson_id = ?').get(l.id);
  const blocks = pdfRow ? db.prepare('SELECT COUNT(*) n FROM sections WHERE pdf_id = ?').get(pdfRow.id).n : 0;
  if (blocks === 0) {
    db.prepare('DELETE FROM lessons WHERE id = ?').run(l.id); // cascades pdfs/sections
    removed++;
  } else {
    kept++;
    console.log(`kept "${l.title}" (${blocks} blocks)`);
  }
}
db.prepare('UPDATE courses SET description = ? WHERE id = ?').run(
  "S3 optional (6 ECTS, 28h). Rosenbaum publishes no notes. Recommended reading: Gould et al., 'Limit Order Books' (Quantitative Finance 2013) — open access at arxiv.org/pdf/1012.0349 (transcribing the full published article into lessons is blocked by content policy, so read it directly). Upload the teacher's own material via Add PDF when distributed.",
  course.id
);
console.log(`HF cleanup: kept ${kept}, removed ${removed} empty lessons.`);

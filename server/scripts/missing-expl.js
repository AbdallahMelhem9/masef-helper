// Lists statement blocks that missed their annotation. node scripts/missing-expl.js
import { db } from '../src/db.js';

const rows = db
  .prepare(
    `SELECT s.id, p.title AS lesson, s.kind, s.title FROM sections s
     JOIN pdfs p ON p.id = s.pdf_id
     WHERE s.ai_explanation IS NULL AND s.kind NOT IN ('heading', 'tutor_note')
     ORDER BY s.pdf_id, s.position`
  )
  .all();
if (rows.length === 0) {
  console.log('ALL STATEMENTS EXPLAINED');
} else {
  for (const r of rows) console.log(`#${r.id} | ${r.lesson} | ${r.kind} | ${r.title || '(text)'}`);
}

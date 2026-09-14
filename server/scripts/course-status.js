// Prints per-lesson ingestion status. node scripts/course-status.js
import { db } from '../src/db.js';

const rows = db
  .prepare(
    `SELECT l.position AS n, l.title, p.status,
       (SELECT COUNT(*) FROM sections s WHERE s.pdf_id = p.id) AS blocks,
       (SELECT COUNT(*) FROM sections s WHERE s.pdf_id = p.id AND s.ai_explanation IS NOT NULL) AS expl,
       (SELECT COUNT(*) FROM sections s WHERE s.pdf_id = p.id AND s.proof IS NOT NULL) AS proofs,
       (SELECT COUNT(*) FROM sections s WHERE s.pdf_id = p.id AND s.tutor_note IS NOT NULL) AS notes
     FROM lessons l JOIN pdfs p ON p.lesson_id = l.id
     ORDER BY l.position`
  )
  .all();
for (const r of rows) {
  console.log(
    `${r.n}. ${r.title.padEnd(56)} ${r.status.padEnd(11)} ${String(r.blocks).padStart(3)} blocks  ${String(r.expl).padStart(3)} explained  ${String(r.proofs).padStart(2)} proofs  ${String(r.notes).padStart(2)} notes`
  );
}
const totals = db
  .prepare(
    'SELECT COUNT(*) AS blocks, SUM(ai_explanation IS NOT NULL) AS expl, SUM(proof IS NOT NULL) AS proofs FROM sections'
  )
  .get();
console.log(`TOTAL: ${totals.blocks} blocks, ${totals.expl} explained, ${totals.proofs} proofs`);

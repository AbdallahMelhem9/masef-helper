// Wipes lessons whose pdf status is not 'ready' (failed / stuck processing)
// so the next ingest-optional pass rebuilds them completely.
import { db } from '../src/db.js';

const rows = db
  .prepare("SELECT p.id, p.status, l.title FROM pdfs p JOIN lessons l ON l.id = p.lesson_id WHERE p.status != 'ready'")
  .all();
for (const r of rows) {
  const n = db.prepare('DELETE FROM sections WHERE pdf_id = ?').run(r.id).changes;
  db.prepare("UPDATE pdfs SET status = 'processing' WHERE id = ?").run(r.id);
  console.log(`reset "${r.title}" (was ${r.status}, dropped ${n} blocks)`);
}
console.log(rows.length, 'lessons reset');

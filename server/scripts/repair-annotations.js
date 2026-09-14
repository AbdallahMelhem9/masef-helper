// Re-annotates any statement blocks whose annotation failed (NULL explanation).
// Safe to re-run. Run from server/: node scripts/repair-annotations.js
import { db } from '../src/db.js';
import { annotateBlock } from '../src/ai.js';

const rows = db
  .prepare(
    `SELECT s.id, s.kind, s.title, s.content_text, s.proof, p.title AS pdfTitle, l.title AS lessonTitle, c.title AS courseTitle
     FROM sections s
     JOIN pdfs p ON p.id = s.pdf_id
     JOIN lessons l ON l.id = p.lesson_id
     JOIN courses c ON c.id = l.course_id
     WHERE s.ai_explanation IS NULL AND s.kind NOT IN ('heading', 'tutor_note')
     ORDER BY s.id`
  )
  .all();

console.log(`${rows.length} blocks to repair.`);
for (const r of rows) {
  try {
    const ann = await annotateBlock({
      courseTitle: r.courseTitle,
      lessonTitle: r.lessonTitle,
      block: { kind: r.kind, title: r.title, statement: r.content_text, proof: r.proof },
      neighbors: '',
    });
    db.prepare('UPDATE sections SET ai_explanation = ?, proof = ?, importance = ?, tutor_note = ? WHERE id = ?').run(
      ann.explanation || null,
      ann.proof ?? r.proof,
      ann.importance,
      ann.tutor_note,
      r.id
    );
    console.log(`repaired #${r.id} ${r.title || r.kind} (${r.lessonTitle})`);
  } catch (err) {
    console.error(`#${r.id} ${r.title || r.kind} still failing: ${err.message}`);
  }
}
console.log('REPAIR DONE.');

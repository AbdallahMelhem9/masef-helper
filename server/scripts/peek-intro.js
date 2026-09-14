import { db } from '../src/db.js';

const intro = db
  .prepare(
    "SELECT substr(s.content_text, 1, 500) AS t FROM sections s JOIN pdfs p ON p.id = s.pdf_id JOIN lessons l ON l.id = p.lesson_id WHERE l.course_id = 2 AND l.position = 1 AND s.kind = 'tutor_note' ORDER BY s.position LIMIT 1"
  )
  .get();
console.log(intro.t.replace(/\s+/g, ' '));

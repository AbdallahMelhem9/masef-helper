// Creates the Term Structures course row (content pending — PDFs are password-protected).
import { db } from '../src/db.js';

const TITLE = 'Term Structures: Interest Rates, Commodities and Other Assets';
let course = db.prepare('SELECT * FROM courses WHERE title = ?').get(TITLE);
if (!course) {
  const info = db
    .prepare('INSERT INTO courses (title, description, teacher) VALUES (?, ?, ?)')
    .run(
      TITLE,
      'Optional course (6 ECTS, 21h). Five chapters: Introduction; First market models; Term structure models; Applications of term structure models; Structural models. Slides are password-protected — waiting for the class password to load them.',
      'Delphine Lautier'
    );
  console.log('Created course id', info.lastInsertRowid);
} else {
  console.log('Course already exists, id', course.id);
}

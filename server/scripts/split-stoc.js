// Splits Stochastic Calculus: Hoffmann's actual course (awaiting his
// material) vs. the Salez notes kept as a separate reference course.
// All existing lessons/blocks/chats/marks move intact to the reference course.
import { db } from '../src/db.js';

const hoffmann = db.prepare("SELECT * FROM courses WHERE title = 'Stochastic Calculus'").get();

let ref = db.prepare("SELECT * FROM courses WHERE title = 'Introduction to Stochastic Calculus (Salez notes)'").get();
if (!ref) {
  const info = db
    .prepare('INSERT INTO courses (title, description, teacher) VALUES (?, ?, ?)')
    .run(
      'Introduction to Stochastic Calculus (Salez notes)',
      "Reference notes — Justin Salez's 'Introduction to stochastic calculus' (46pp), kept as study material. Covers the same four-part syllabus as the MASEF Stochastic Calculus course: preliminaries, stochastic integration, stochastic differentiation, SDEs.",
      'Justin Salez'
    );
  ref = db.prepare('SELECT * FROM courses WHERE id = ?').get(info.lastInsertRowid);
  console.log('created reference course id', ref.id);
}

const moved = db.prepare('UPDATE lessons SET course_id = ? WHERE course_id = ?').run(ref.id, hoffmann.id);
db.prepare('UPDATE courses SET description = ? WHERE id = ?').run(
  "UE fondamentale (6 ECTS, 48h), taught by Marc Hoffmann. Preliminaries, stochastic integration, stochastic differentiation, SDEs. His course material isn't published online — upload it via Add PDF when distributed. Meanwhile, the 'Introduction to Stochastic Calculus (Salez notes)' course in this app covers the same syllabus.",
  hoffmann.id
);
console.log(`moved ${moved.changes} lessons to the reference course; Hoffmann's course now awaits his material.`);

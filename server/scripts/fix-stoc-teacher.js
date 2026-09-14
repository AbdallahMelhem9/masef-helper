// Teacher correction: Stochastic Calculus is taught by Marc Hoffmann.
// The ingested notes remain Justin Salez's — relabel, remove nothing.
import { db } from '../src/db.js';

const course = db.prepare("SELECT * FROM courses WHERE title = 'Stochastic Calculus'").get();
db.prepare('UPDATE courses SET teacher = ?, description = ? WHERE id = ?').run(
  'Marc Hoffmann',
  "UE fondamentale (6 ECTS, 48h), taught by Marc Hoffmann. Preliminaries (Gaussian processes, Brownian motion, martingales), stochastic integration, stochastic differentiation, stochastic differential equations. Lessons follow the course's official lecture notes 'Introduction to stochastic calculus' by Justin Salez.",
  course.id
);
const r = db
  .prepare("UPDATE pdfs SET teacher = 'Notes: Justin Salez' WHERE lesson_id IN (SELECT id FROM lessons WHERE course_id = ?)")
  .run(course.id);
console.log(`course teacher -> Marc Hoffmann; ${r.changes} lesson pdfs relabeled; all content untouched.`);

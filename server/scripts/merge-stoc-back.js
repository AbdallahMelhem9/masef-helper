// Undo the split: move the Salez lessons back into the Stochastic Calculus
// course and remove the now-empty reference course. Nothing is deleted.
import { db } from '../src/db.js';

const hoffmann = db.prepare("SELECT * FROM courses WHERE title = 'Stochastic Calculus'").get();
const ref = db.prepare("SELECT * FROM courses WHERE title = 'Introduction to Stochastic Calculus (Salez notes)'").get();
if (ref) {
  const moved = db.prepare('UPDATE lessons SET course_id = ? WHERE course_id = ?').run(hoffmann.id, ref.id);
  db.prepare('DELETE FROM courses WHERE id = ?').run(ref.id);
  console.log(`moved ${moved.changes} lessons back; reference course removed.`);
}
db.prepare('UPDATE courses SET description = ? WHERE id = ?').run(
  "UE fondamentale (6 ECTS, 48h), taught by Marc Hoffmann. Preliminaries, stochastic integration, stochastic differentiation, SDEs. Lessons follow Justin Salez's notes 'Introduction to stochastic calculus' — same four-part syllabus; Hoffmann's own material isn't available online, add it via Add PDF if he distributes any.",
  hoffmann.id
);
const check = db
  .prepare('SELECT COUNT(*) n FROM lessons WHERE course_id = ?')
  .get(hoffmann.id).n;
console.log(`Stochastic Calculus now has ${check} lessons.`);

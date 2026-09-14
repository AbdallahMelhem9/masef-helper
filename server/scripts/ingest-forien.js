// Seeds the "Prérentrée de probabilités" course from Nicolas Forien's
// polycopié (already downloaded to uploads/poly-prerentree-m2.pdf) and runs
// the full decomposition + transcription + lecture pipeline.
// Run from server/: node scripts/ingest-forien.js
import { db } from '../src/db.js';
import { ingestCoursePdf } from '../src/ingest.js';

const TITLE = 'Prérentrée de probabilités';
const TEACHER = 'Nicolas Forien';
const FILENAME = 'poly-prerentree-m2.pdf';

let course = db.prepare('SELECT * FROM courses WHERE title = ?').get(TITLE);
if (!course) {
  const info = db
    .prepare('INSERT INTO courses (title, description, teacher) VALUES (?, ?, ?)')
    .run(
      TITLE,
      'A review of probability theory foundations — measure theory, random variables, convergence, LLN & CLT, conditional expectations, martingales, Gaussian vectors and Brownian motion. Based on notes by Paul Gassiat and Jean-François Le Gall.',
      TEACHER
    );
  course = db.prepare('SELECT * FROM courses WHERE id = ?').get(info.lastInsertRowid);
  console.log(`Created course "${TITLE}" (id ${course.id})`);
} else {
  console.log(`Course "${TITLE}" already exists (id ${course.id})`);
}

const existingLessons = db.prepare('SELECT COUNT(*) AS n FROM lessons WHERE course_id = ?').get(course.id).n;
if (existingLessons > 0) {
  console.log(`Course already has ${existingLessons} lessons — aborting to avoid duplicates.`);
  console.log('Delete them first if you want to re-ingest.');
  process.exit(1);
}

await ingestCoursePdf({ courseId: course.id, filename: FILENAME, teacher: TEACHER, withLecture: true });
console.log('Done.');

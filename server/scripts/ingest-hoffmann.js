// Ingests Marc Hoffmann's OWN Stochastic Calculus lecture notes (Master MATH
// & MASEF), published on his teaching page
// https://www.ceremade.dauphine.fr/~hoffmann/static4/teaching (PDFs hosted
// on Clément Cosco's page), as a new course: one lesson per chapter. Chapter 1
// (18pp) is decomposed in page windows aligned on its own sections so no
// window is too long; the lesson intro is written once, from the full block
// list. Idempotent: skips lessons that already have blocks.
// Run from server/: node scripts/ingest-hoffmann.js
import { db } from '../src/db.js';
import { ingestChapter } from '../src/ingest.js';
import { lessonIntro } from '../src/ai.js';

export const COURSE_TITLE = "Stochastic Calculus: Hoffmann's lecture notes";

const COURSE = {
  title: COURSE_TITLE,
  teacher: 'Marc Hoffmann',
  description:
    "The actual MASEF Stochastic Calculus lectures (UE fondamentale, 6 ECTS), from Marc Hoffmann's own chapter notes published on his teaching page (ceremade.dauphine.fr/~hoffmann/static4/teaching; PDFs hosted by Clément Cosco). Chapter 1: Brownian motion as a Gaussian process. Chapter 2: Brownian motion as a Markov process (marked 'in progress' by the teacher — re-ingest when he posts the final version). Further chapters will be added as they appear. The 'Stochastic Calculus' course in this app keeps Justin Salez's notes as a parallel reference for the same syllabus.",
};

const CHAPTERS = [
  {
    number: 1,
    title: 'Brownian motion as a Gaussian process',
    filename: 'hoffmann-ch1.pdf',
    // Sections start on pp. 1, 4, 7, 10, 13 (from the chapter's own table of
    // contents); windows follow them.
    windows: [
      [1, 3],
      [4, 6],
      [7, 9],
      [10, 12],
      [13, 18],
    ],
  },
  {
    number: 2,
    title: 'Brownian motion as a Markov process',
    filename: 'hoffmann-ch2.pdf',
    windows: [[1, 6]],
  },
];

let course = db.prepare('SELECT * FROM courses WHERE title = ?').get(COURSE.title);
if (!course) {
  // Place it right after the existing "Stochastic Calculus" course (all
  // courses had position 0 so far; ordering is position, id).
  const allZero = db.prepare('SELECT COUNT(*) n FROM courses WHERE position != 0').get().n === 0;
  if (allZero) db.prepare('UPDATE courses SET position = 1 WHERE id > 2').run();
  const info = db
    .prepare('INSERT INTO courses (title, description, teacher, position) VALUES (?, ?, ?, 0)')
    .run(COURSE.title, COURSE.description, COURSE.teacher);
  course = db.prepare('SELECT * FROM courses WHERE id = ?').get(info.lastInsertRowid);
  console.log(`Created course "${COURSE.title}" (id ${course.id})`);
} else {
  db.prepare('UPDATE courses SET description = ?, teacher = ? WHERE id = ?').run(COURSE.description, COURSE.teacher, course.id);
}

for (const ch of CHAPTERS) {
  let lesson = db.prepare('SELECT * FROM lessons WHERE course_id = ? AND position = ?').get(course.id, ch.number);
  if (!lesson) {
    const li = db.prepare('INSERT INTO lessons (course_id, title, position) VALUES (?, ?, ?)').run(course.id, ch.title, ch.number);
    lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(li.lastInsertRowid);
  }
  let pdfRow = db.prepare('SELECT * FROM pdfs WHERE lesson_id = ? ORDER BY position LIMIT 1').get(lesson.id);
  if (!pdfRow) {
    const pi = db
      .prepare("INSERT INTO pdfs (lesson_id, title, teacher, filename, position, status) VALUES (?, ?, ?, ?, 1, 'processing')")
      .run(lesson.id, `Chapter ${ch.number}: ${ch.title}`, 'Marc Hoffmann', ch.filename);
    pdfRow = db.prepare('SELECT * FROM pdfs WHERE id = ?').get(pi.lastInsertRowid);
  }
  const existing = db.prepare('SELECT COUNT(*) n FROM sections WHERE pdf_id = ?').get(pdfRow.id).n;
  if (existing > 0) {
    console.log(`[${ch.title}] already has ${existing} blocks — skipping.`);
    continue;
  }

  try {
    for (const [start, end] of ch.windows) {
      await ingestChapter({
        pdfRowId: pdfRow.id,
        chapter: { number: ch.number, title: ch.title, page_start: start, page_end: end, windowNote: `pages ${start}-${end}` },
        withAnnotations: true,
        withIntro: false,
      });
    }
    // Intro from the WHOLE chapter (ingestChapter leaves position 1 free).
    const blocks = db
      .prepare("SELECT kind, title FROM sections WHERE pdf_id = ? AND kind NOT IN ('text', 'tutor_note') ORDER BY position")
      .all(pdfRow.id);
    const overview = blocks.map((b) => `- ${b.title || b.kind}${b.kind === 'heading' ? ` (subsection: ${b.title})` : ''}`).join('\n');
    console.log(`[${ch.title}] writing intro from ${blocks.length} statements...`);
    const intro = await lessonIntro({ courseTitle: course.title, lessonTitle: ch.title, blocksOverview: overview });
    db.prepare("INSERT INTO sections (pdf_id, title, kind, content_text, position) VALUES (?, 'Before we start', 'tutor_note', ?, 1)").run(pdfRow.id, intro);
    console.log(`[${ch.title}] done.`);
  } catch (err) {
    console.error(`[${ch.title}] failed: ${err.message}`);
  }
}
console.log('HOFFMANN INGEST DONE.');

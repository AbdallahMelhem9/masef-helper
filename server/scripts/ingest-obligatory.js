// Ingests the 3 obligatory MASEF core courses (UE fondamentales) as
// statement-level blocks, sequentially. Safe to re-run: skips lessons that
// already have blocks. Run from server/: node scripts/ingest-obligatory.js
import path from 'node:path';
import { db, UPLOADS_DIR } from '../src/db.js';
import { getChapterOutline, ingestChapter } from '../src/ingest.js';

const COURSES = [
  {
    title: 'Stochastic Calculus',
    teacher: 'Clément Cosco & Marc Hoffmann',
    notesAuthor: 'Justin Salez',
    filename: 'stoc.pdf',
    description:
      "UE fondamentale (6 ECTS, 48h). Preliminaries (Gaussian processes, Brownian motion, martingales), stochastic integration, stochastic differentiation, stochastic differential equations. Official lecture notes: 'Introduction to stochastic calculus' by Justin Salez.",
  },
  {
    title: 'Stochastic Control',
    teacher: 'Philippe Bergault',
    notesAuthor: 'Pierre Cardaliaguet',
    filename: 'stochastic-control.pdf',
    description:
      "UE fondamentale (6 ECTS, 24h). Feynman-Kac formula, dynamic programming, Hamilton-Jacobi-Bellman equation, viscosity solutions. Course notes by Pierre Cardaliaguet (Master MASEF, 2024-2025).",
  },
  {
    title: 'Monte Carlo and Finite Differences Methods',
    teacher: 'Yating Liu',
    notesAuthor: 'Bernard Lapeyre',
    filename: 'monte-carlo-lapeyre.pdf',
    description:
      "UE fondamentale (6 ECTS, 30h). Monte Carlo methods, variance reduction, diffusion simulation, stochastic algorithms. Reference notes: 'Monte Carlo Methods and Stochastic Algorithms' by Bernard Lapeyre (École des Ponts) — to be swapped for the teacher's own material once distributed.",
  },
];

for (const c of COURSES) {
  let course = db.prepare('SELECT * FROM courses WHERE title = ?').get(c.title);
  if (!course) {
    const info = db
      .prepare('INSERT INTO courses (title, description, teacher) VALUES (?, ?, ?)')
      .run(c.title, c.description, c.teacher);
    course = db.prepare('SELECT * FROM courses WHERE id = ?').get(info.lastInsertRowid);
    console.log(`Created course "${c.title}" (id ${course.id})`);
  }

  const absPath = path.join(UPLOADS_DIR, c.filename);
  console.log(`[${c.title}] outlining ${c.filename}...`);
  let chapters;
  try {
    chapters = await getChapterOutline(absPath);
  } catch (err) {
    console.error(`[${c.title}] outline FAILED: ${err.message} — skipping course.`);
    continue;
  }
  console.log(chapters.map((ch) => `  ch${ch.number} "${ch.title}" pp.${ch.page_start}-${ch.page_end}`).join('\n'));

  for (const chapter of chapters) {
    let lesson = db
      .prepare('SELECT * FROM lessons WHERE course_id = ? AND position = ?')
      .get(course.id, chapter.number);
    if (!lesson) {
      const li = db
        .prepare('INSERT INTO lessons (course_id, title, position) VALUES (?, ?, ?)')
        .run(course.id, chapter.title, chapter.number);
      lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(li.lastInsertRowid);
    }
    let pdfRow = db.prepare('SELECT * FROM pdfs WHERE lesson_id = ? ORDER BY position LIMIT 1').get(lesson.id);
    if (!pdfRow) {
      const pi = db
        .prepare("INSERT INTO pdfs (lesson_id, title, teacher, filename, position, status) VALUES (?, ?, ?, ?, 1, 'processing')")
        .run(lesson.id, chapter.title, c.notesAuthor, c.filename);
      pdfRow = db.prepare('SELECT * FROM pdfs WHERE id = ?').get(pi.lastInsertRowid);
    }
    const existing = db.prepare('SELECT COUNT(*) n FROM sections WHERE pdf_id = ?').get(pdfRow.id).n;
    if (existing > 0) {
      console.log(`[${c.title}] "${chapter.title}" already has ${existing} blocks — skipping.`);
      continue;
    }
    try {
      await ingestChapter({ pdfRowId: pdfRow.id, chapter, withAnnotations: true });
    } catch (err) {
      console.error(`[${c.title}] "${chapter.title}" failed: ${err.message} — continuing.`);
    }
  }
  console.log(`[${c.title}] course done.`);
}
console.log('ALL OBLIGATORY COURSES DONE.');

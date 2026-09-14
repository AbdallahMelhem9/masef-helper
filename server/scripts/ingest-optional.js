// Ingests the optional courses that have verified public materials, splitting
// long chapters into page windows. Idempotent (skips lessons with blocks).
// Run from server/: node scripts/ingest-optional.js
import path from 'node:path';
import { db, UPLOADS_DIR } from '../src/db.js';
import { getChapterOutline, ingestChapter } from '../src/ingest.js';

const WINDOW = 8; // max pages per decomposition call
const MAX_SPAN = 10; // chapters longer than this get windowed

const COURSES = [
  {
    title: 'Machine Learning in Finance',
    notesAuthor: 'Pierre Brugière',
    filename: 'ml-finance-brugiere.pdf',
  },
  {
    title: 'Valuation of Financial Assets and Arbitrage',
    notesAuthor: 'Bruno Bouchard',
    filename: 'valuation-bouchard.pdf',
  },
  {
    title: 'Computational Statistics and MCMC Methods',
    notesAuthor: 'Christian P. Robert',
    filename: 'mcmc-robert.pdf',
  },
  // Finance haute fréquence removed: transcribing the published LOB survey
  // beyond its first three sections is blocked by content policy — the
  // article stays linked in the course description instead.
];

for (const c of COURSES) {
  const course = db.prepare('SELECT * FROM courses WHERE title = ?').get(c.title);
  if (!course) {
    console.error(`course not found: ${c.title}`);
    continue;
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
    let lesson = db.prepare('SELECT * FROM lessons WHERE course_id = ? AND position = ?').get(course.id, chapter.number);
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

    // Split long chapters into page windows so no single Claude response has
    // to carry too much transcription.
    const span = chapter.page_end - chapter.page_start + 1;
    const windows = [];
    if (span <= MAX_SPAN) {
      windows.push({ ...chapter });
    } else {
      let start = chapter.page_start;
      let k = 1;
      while (start <= chapter.page_end) {
        const end = Math.min(start + WINDOW - 1, chapter.page_end);
        windows.push({ ...chapter, page_start: start, page_end: end, windowNote: `pages ${start}-${end}` });
        start = end + 1;
        k++;
      }
    }

    try {
      for (let w = 0; w < windows.length; w++) {
        await ingestChapter({ pdfRowId: pdfRow.id, chapter: windows[w], withAnnotations: true, withIntro: w === 0 });
      }
    } catch (err) {
      console.error(`[${c.title}] "${chapter.title}" failed: ${err.message} — continuing.`);
    }
  }
  console.log(`[${c.title}] course done.`);
}
console.log('ALL OPTIONAL COURSES DONE.');

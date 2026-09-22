// Pins a "Prerequisites" tutor note (written by the prerequisites agent) right
// after the "Before we start" intro of each lesson of a course. Re-runnable:
// an existing note with the same title is replaced in place.
// Usage: node scripts/pin-prereq-notes.js <courseId> <dir with prereq-lesson-<n>.md>
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';

const [courseIdStr, DIR] = process.argv.slice(2);
const courseId = Number(courseIdStr);
if (!courseId || !DIR) throw new Error('usage: node pin-prereq-notes.js <courseId> <dir>');

const TITLE = 'Prerequisites: what to have ready';

const lessons = db
  .prepare('SELECT l.id, l.position, l.title, p.id AS pdfId FROM lessons l JOIN pdfs p ON p.lesson_id = l.id WHERE l.course_id = ? ORDER BY l.position')
  .all(courseId);

for (const l of lessons) {
  const file = path.join(DIR, `prereq-lesson-${l.position}.md`);
  if (!fs.existsSync(file)) {
    console.log(`lesson ${l.position}: no ${path.basename(file)} — skipped`);
    continue;
  }
  const text = fs.readFileSync(file, 'utf8').trim();
  const existing = db.prepare('SELECT id FROM sections WHERE pdf_id = ? AND title = ? AND kind = ?').get(l.pdfId, TITLE, 'tutor_note');
  if (existing) {
    db.prepare('UPDATE sections SET content_text = ? WHERE id = ?').run(text, existing.id);
    console.log(`lesson ${l.position} "${l.title}": note updated (id ${existing.id})`);
    continue;
  }
  // Right after the intro if there is one, else at the very top.
  const intro = db.prepare("SELECT position FROM sections WHERE pdf_id = ? AND kind = 'tutor_note' AND title = 'Before we start'").get(l.pdfId);
  const minPos = db.prepare('SELECT COALESCE(MIN(position), 1) AS p FROM sections WHERE pdf_id = ?').get(l.pdfId).p;
  const at = intro ? intro.position + 1 : minPos;
  db.prepare('UPDATE sections SET position = position + 1 WHERE pdf_id = ? AND position >= ?').run(l.pdfId, at);
  const info = db
    .prepare("INSERT INTO sections (pdf_id, title, kind, content_text, position) VALUES (?, ?, 'tutor_note', ?, ?)")
    .run(l.pdfId, TITLE, text, at);
  console.log(`lesson ${l.position} "${l.title}": note pinned at position ${at} (id ${info.lastInsertRowid})`);
}
console.log('PREREQ NOTES DONE.');

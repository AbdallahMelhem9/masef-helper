// Replaces the "Before we start" intro of each lesson of a course with the
// agent-written intro-lesson-<n>.md (in place, so the intro block keeps its id).
// Usage: node scripts/apply-intros.js <courseId> <dir with intro-lesson-<n>.md>
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';

const [courseIdStr, DIR] = process.argv.slice(2);
const courseId = Number(courseIdStr);
if (!courseId || !DIR) throw new Error('usage: node apply-intros.js <courseId> <dir>');

const lessons = db
  .prepare('SELECT l.position, l.title, p.id AS pdfId FROM lessons l JOIN pdfs p ON p.lesson_id = l.id WHERE l.course_id = ? ORDER BY l.position')
  .all(courseId);

for (const l of lessons) {
  const file = path.join(DIR, `intro-lesson-${l.position}.md`);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8').trim();
  const intro = db.prepare("SELECT id FROM sections WHERE pdf_id = ? AND kind = 'tutor_note' AND title = 'Before we start'").get(l.pdfId);
  if (intro) {
    db.prepare('UPDATE sections SET content_text = ? WHERE id = ?').run(text, intro.id);
    console.log(`lesson ${l.position} "${l.title}": intro replaced (id ${intro.id})`);
  } else {
    const minPos = db.prepare('SELECT COALESCE(MIN(position), 1) AS p FROM sections WHERE pdf_id = ?').get(l.pdfId).p;
    db.prepare('UPDATE sections SET position = position + 1 WHERE pdf_id = ? AND position >= ?').run(l.pdfId, minPos);
    const info = db
      .prepare("INSERT INTO sections (pdf_id, title, kind, content_text, position) VALUES (?, 'Before we start', 'tutor_note', ?, ?)")
      .run(l.pdfId, text, minPos);
    console.log(`lesson ${l.position} "${l.title}": intro inserted (id ${info.lastInsertRowid})`);
  }
}
console.log('INTROS DONE.');

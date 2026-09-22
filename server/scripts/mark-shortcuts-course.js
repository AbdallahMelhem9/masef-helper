// AI-marks the "shortcut path" (highlight = 1) in every lesson of ONE course
// that has no marks yet. Usage: node scripts/mark-shortcuts-course.js <courseId>
import { db } from '../src/db.js';
import { runClaude, parseJsonLoose } from '../src/ai.js';

const courseId = Number(process.argv[2]);
if (!courseId) throw new Error('usage: node mark-shortcuts-course.js <courseId>');

const lessons = db
  .prepare(
    `SELECT l.id, l.title AS lessonTitle, c.title AS courseTitle, p.id AS pdfId
     FROM lessons l JOIN courses c ON c.id = l.course_id JOIN pdfs p ON p.lesson_id = l.id
     WHERE c.id = ? ORDER BY l.position`
  )
  .all(courseId);

for (const l of lessons) {
  const marked = db.prepare('SELECT COUNT(*) n FROM sections WHERE pdf_id = ? AND highlight = 1').get(l.pdfId).n;
  if (marked > 0) {
    console.log(`"${l.lessonTitle}" already has ${marked} marks — skipping.`);
    continue;
  }
  const blocks = db
    .prepare("SELECT id, kind, title, substr(content_text, 1, 160) AS excerpt FROM sections WHERE pdf_id = ? AND kind NOT IN ('heading', 'tutor_note', 'text') ORDER BY position")
    .all(l.pdfId);
  if (blocks.length === 0) continue;

  const listing = blocks.map((b) => `- [${b.id}] ${b.kind} — ${b.title || '(untitled)'}: ${b.excerpt.replace(/\s+/g, ' ')}`).join('\n');
  const prompt = `Course: ${l.courseTitle}
Lesson: ${l.lessonTitle}

Here are the lesson's statements with their database ids:
${listing}

Pick the ESSENTIAL ones — the shortcut path a student must master to understand this lesson and be able to follow the next one. Typically one third to one half of the statements: the load-bearing definitions and the central theorems, not every remark, example or exercise.

Return ONLY raw JSON: {"ids": [1, 2, 3]}`;
  try {
    const out = await runClaude(prompt, {
      system: 'You are a mathematics course assistant. Output ONLY raw JSON, no fences, no commentary.',
    });
    const { ids } = parseJsonLoose(out);
    const valid = new Set(blocks.map((b) => b.id));
    let n = 0;
    for (const id of ids || []) {
      if (valid.has(id)) {
        db.prepare('UPDATE sections SET highlight = 1 WHERE id = ?').run(id);
        n++;
      }
    }
    console.log(`"${l.lessonTitle}": ${n}/${blocks.length} blocks marked.`);
  } catch (err) {
    console.error(`"${l.lessonTitle}" failed: ${err.message} — continuing.`);
  }
}
console.log('SHORTCUT MARKING DONE.');

// Marks the "shortcut path" (highlight = 1) through every lesson.
// - Prérentrée lessons 1-2: the curated prerequisite list for chapter 3.
// - Every other lesson with no marks yet: Claude picks the essential blocks.
// Safe to re-run (skips lessons that already have marks).
// Run from server/: node scripts/mark-shortcuts.js
import { db } from '../src/db.js';
import { runClaude, parseJsonLoose } from '../src/ai.js';

// Curated: what to master before jumping to chapter 3 of the prérentrée.
const CURATED = {
  1: ['Definition 1', 'Definition 4', 'Definition 5', 'Definition 6', 'Proposition/Definition 1', 'Theorem 2 (Monotone convergence)', 'Proposition 3 (Continuity theorem)', 'Proposition 4 (Derivation under the integral)'],
  2: ['Definition 11', 'Proposition 5', 'Definition 12 (\\(L^p\\) spaces)', 'Proposition 7 (Jensen)', 'Proposition 8', 'Proposition 9 (Borel-Cantelli\'s Lemma)'],
};

const prerentree = db.prepare("SELECT id FROM courses WHERE title = 'Prérentrée de probabilités'").get();
for (const [pos, titles] of Object.entries(CURATED)) {
  const lesson = db.prepare('SELECT l.* FROM lessons l WHERE l.course_id = ? AND l.position = ?').get(prerentree.id, Number(pos));
  const pdfRow = db.prepare('SELECT * FROM pdfs WHERE lesson_id = ? ORDER BY position LIMIT 1').get(lesson.id);
  let n = 0;
  for (const t of titles) {
    // Match ignoring parentheticals so "Definition 12 (L^p spaces)" matches loosely.
    const bare = t.split(' (')[0];
    const r = db
      .prepare("UPDATE sections SET highlight = 1 WHERE pdf_id = ? AND (title = ? OR title LIKE ? || ' (%')")
      .run(pdfRow.id, t, bare);
    n += r.changes;
    if (r.changes === 0) console.error(`  curated title not matched in lesson ${pos}: "${t}"`);
  }
  console.log(`Curated lesson ${pos}: ${n} blocks marked.`);
}

// AI pass for all remaining lessons.
const lessons = db
  .prepare(
    `SELECT l.id, l.title AS lessonTitle, c.title AS courseTitle, p.id AS pdfId
     FROM lessons l JOIN courses c ON c.id = l.course_id JOIN pdfs p ON p.lesson_id = l.id
     ORDER BY c.id, l.position`
  )
  .all();

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

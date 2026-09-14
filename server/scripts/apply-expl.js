// Applies the rewrite agents' explanation outputs (eout-*.txt) to sections.
// Usage: node scripts/apply-expl.js <dir>
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';

const DIR = process.argv[2];
if (!DIR) throw new Error('usage: node apply-expl.js <dir>');

const validIds = new Set(
  db
    .prepare(
      `SELECT s.id FROM sections s JOIN pdfs p ON p.id = s.pdf_id JOIN lessons l ON l.id = p.lesson_id
       WHERE l.course_id = (SELECT id FROM courses WHERE title = 'Stochastic Calculus')`
    )
    .all()
    .map((r) => r.id)
);

let applied = 0, skipped = 0;
for (const f of fs.readdirSync(DIR).filter((f) => /^eout-\d\.txt$/.test(f)).sort()) {
  const text = fs.readFileSync(path.join(DIR, f), 'utf8');
  const chunks = text.split(/^===BLOCK\s+(\d+)\s*===\s*$/m);
  for (let i = 1; i < chunks.length; i += 2) {
    const id = Number(chunks[i]);
    const m = (chunks[i + 1] || '').match(/^EXPL:\s*\n?([\s\S]*)$/m);
    const expl = (m?.[1] || '').trim();
    if (!validIds.has(id) || !expl) {
      skipped++;
      continue;
    }
    db.prepare('UPDATE sections SET ai_explanation = ? WHERE id = ?').run(expl, id);
    applied++;
  }
  console.log(`${f} applied`);
}
console.log(`explanations replaced: ${applied}, skipped: ${skipped}`);

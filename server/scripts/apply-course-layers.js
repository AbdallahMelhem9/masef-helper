// Applies the layer agents' sentinel-format outputs (===BLOCK <id>=== /
// DEEP: / EXAMPLE:) to the sections of one course.
// Usage: node scripts/apply-course-layers.js <dir with out-*.txt> <courseId>
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';

const [DIR, courseId] = process.argv.slice(2);
if (!DIR || !courseId) throw new Error('usage: node apply-course-layers.js <dir> <courseId>');

const validIds = new Set(
  db
    .prepare(
      `SELECT s.id FROM sections s JOIN pdfs p ON p.id = s.pdf_id JOIN lessons l ON l.id = p.lesson_id WHERE l.course_id = ?`
    )
    .all(Number(courseId))
    .map((r) => r.id)
);

let deep = 0, ex = 0, entries = 0, unknown = 0;
for (const f of fs.readdirSync(DIR).filter((f) => /^out-\d+\.txt$/.test(f)).sort()) {
  const text = fs.readFileSync(path.join(DIR, f), 'utf8');
  const chunks = text.split(/^===BLOCK\s+(\d+)\s*===\s*$/m);
  for (let i = 1; i < chunks.length; i += 2) {
    const id = Number(chunks[i]);
    const body = chunks[i + 1] || '';
    entries++;
    if (!validIds.has(id)) {
      unknown++;
      console.error(`${f}: unknown block id ${id} — skipped`);
      continue;
    }
    const exSplit = body.split(/^EXAMPLE:\s*$/m);
    const deepMatch = exSplit[0].match(/^DEEP:\s*\n?([\s\S]*)$/m);
    const clean = (s) => {
      const t = (s || '').trim();
      return !t || /^\(none\)$/i.test(t) ? null : t;
    };
    const d = clean(deepMatch?.[1]);
    const e = clean(exSplit[1]);
    if (d) deep++;
    if (e) ex++;
    db.prepare('UPDATE sections SET extra_explanation = COALESCE(?, extra_explanation), extra_example = COALESCE(?, extra_example) WHERE id = ?').run(d, e, id);
  }
  console.log(`${f} applied`);
}
console.log(`entries: ${entries}, deep dives: ${deep}, examples: ${ex}, unknown ids: ${unknown}`);

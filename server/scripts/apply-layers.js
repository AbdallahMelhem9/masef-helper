// Applies the layer agents' sentinel-format outputs to the sections table.
// Usage: node scripts/apply-layers.js <dir with out-*.txt>
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';

const DIR = process.argv[2];
if (!DIR) throw new Error('usage: node apply-layers.js <dir>');

const validIds = new Set(
  db
    .prepare(
      `SELECT s.id FROM sections s JOIN pdfs p ON p.id = s.pdf_id JOIN lessons l ON l.id = p.lesson_id
       WHERE l.course_id = (SELECT id FROM courses WHERE title = 'Stochastic Calculus')`
    )
    .all()
    .map((r) => r.id)
);

let deep = 0, ex = 0, entries = 0, unknown = 0;
for (const f of fs.readdirSync(DIR).filter((f) => /^out-\d\.txt$/.test(f)).sort()) {
  const text = fs.readFileSync(path.join(DIR, f), 'utf8');
  const chunks = text.split(/^===BLOCK\s+(\d+)\s*===\s*$/m);
  // split yields [pre, id1, body1, id2, body2, ...]
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

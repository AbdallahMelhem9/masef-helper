// Applies the redo agents' sentinel-format outputs to one course's sections:
//   ===BLOCK <id>===
//   EXPLANATION:   markdown | (keep) | (none)   -> ai_explanation (none = clear)
//   DEEP:          markdown | (none)            -> extra_explanation (none = unchanged)
//   EXAMPLE:       markdown | (none)            -> extra_example (none = unchanged)
//   NOTE:          markdown | (keep) | (none)   -> tutor_note (none = remove)
// Statements, proofs, importance tags, positions and chats are never touched.
// Usage: node scripts/apply-course-redo.js <dir with out-*.txt> <courseId>
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';

const [DIR, courseId] = process.argv.slice(2);
if (!DIR || !courseId) throw new Error('usage: node apply-course-redo.js <dir> <courseId>');

const validIds = new Set(
  db
    .prepare('SELECT s.id FROM sections s JOIN pdfs p ON p.id = s.pdf_id JOIN lessons l ON l.id = p.lesson_id WHERE l.course_id = ?')
    .all(Number(courseId))
    .map((r) => r.id)
);

//   REFRESH:       markdown | (keep) | (none)   -> refresh (none = clear)
const KEYS = ['EXPLANATION', 'DEEP', 'EXAMPLE', 'NOTE', 'REFRESH'];
const stats = { entries: 0, unknown: 0, explanation: 0, deep: 0, example: 0, note: 0, refresh: 0, cleared: 0 };

for (const f of fs.readdirSync(DIR).filter((f) => /^out-\d+\.txt$/.test(f)).sort()) {
  const text = fs.readFileSync(path.join(DIR, f), 'utf8');
  const chunks = text.split(/^===BLOCK\s+(\d+)\s*===\s*$/m);
  for (let i = 1; i < chunks.length; i += 2) {
    const id = Number(chunks[i]);
    const body = chunks[i + 1] || '';
    stats.entries++;
    if (!validIds.has(id)) {
      stats.unknown++;
      console.error(`${f}: unknown block id ${id} — skipped`);
      continue;
    }
    // Split the body on the key lines, in whatever order they appear.
    const parts = {};
    const re = new RegExp(`^(${KEYS.join('|')}):\\s*$`, 'm');
    let rest = body;
    let current = null;
    for (const line of rest.split('\n')) {
      const m = line.match(re);
      if (m) {
        current = m[1];
        parts[current] = [];
      } else if (current) {
        parts[current].push(line);
      }
    }
    const val = (k) => {
      const t = (parts[k] || []).join('\n').trim();
      if (!t || /^\(keep\)$/i.test(t)) return { action: 'keep' };
      if (/^\(none\)$/i.test(t)) return { action: 'none' };
      return { action: 'set', text: t };
    };

    const ex = val('EXPLANATION');
    if (ex.action === 'set') {
      db.prepare('UPDATE sections SET ai_explanation = ? WHERE id = ?').run(ex.text, id);
      stats.explanation++;
    } else if (ex.action === 'none') {
      db.prepare('UPDATE sections SET ai_explanation = NULL WHERE id = ?').run(id);
      stats.cleared++;
    }
    const d = val('DEEP');
    if (d.action === 'set') {
      db.prepare('UPDATE sections SET extra_explanation = ? WHERE id = ?').run(d.text, id);
      stats.deep++;
    }
    const e = val('EXAMPLE');
    if (e.action === 'set') {
      db.prepare('UPDATE sections SET extra_example = ? WHERE id = ?').run(e.text, id);
      stats.example++;
    }
    const n = val('NOTE');
    if (n.action === 'set') {
      db.prepare('UPDATE sections SET tutor_note = ? WHERE id = ?').run(n.text, id);
      stats.note++;
    } else if (n.action === 'none') {
      db.prepare('UPDATE sections SET tutor_note = NULL WHERE id = ?').run(id);
    }
    const r = val('REFRESH');
    if (r.action === 'set') {
      db.prepare('UPDATE sections SET refresh = ? WHERE id = ?').run(r.text, id);
      stats.refresh++;
    } else if (r.action === 'none') {
      db.prepare('UPDATE sections SET refresh = NULL WHERE id = ?').run(id);
    }
  }
  console.log(`${f} applied`);
}
console.log(JSON.stringify(stats));

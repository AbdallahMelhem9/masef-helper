// Builds (or rebuilds) the condensed probability course — the prérentrée
// rewritten at half length with exactly what Hoffmann's Stochastic Calculus
// assumes — from tutor-written sentinel files:
//
//   lesson-<n>.txt / lesson-<n>b.txt ... (parts of one lesson, read in name order)
//
//   ===LESSON===            (first part of each lesson only)
//   TITLE: ...
//   DESCRIPTION: ...
//   INTRO:                  -> "Before we start" tutor note (markdown, multi-line)
//
//   ===BLOCK===
//   KIND: definition | proposition | theorem | lemma | corollary | example | exercise | remark | text
//   TITLE: ...
//   IMPORTANCE: imp | half imp | not imp | (none)
//   HIGHLIGHT: 1 | 0          -> shortcut marker
//   STATEMENT:  markdown
//   PROOF:      markdown | (none)
//   REFRESH:    markdown | (none)
//   EXPLANATION: markdown
//   DEEP:       markdown
//   EXAMPLE:    markdown | (none)
//   NOTE:       markdown | (none)
//
//   ===NOTE===              standalone tutor note in the flow
//   TITLE: ...
//   CONTENT:    markdown
//
// Idempotent: the course and its lessons are found by title; a lesson's blocks
// are wiped and re-inserted (refused when the lesson has saved chats, unless
// --force). The full prérentrée (course 1) is never touched.
// Sources live in server/content/condensed/.
// Usage (from server/): node scripts/build-condensed-course.js content/condensed [--force]
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';

const args = process.argv.slice(2);
const DIR = args.find((a) => !a.startsWith('--'));
const FORCE = args.includes('--force');
if (!DIR) throw new Error('usage: node scripts/build-condensed-course.js <dir> [--force]');

export const COURSE_TITLE = 'Probability essentials — the prérentrée, condensed';
const COURSE = {
  title: COURSE_TITLE,
  teacher: 'Nicolas Forien (notes), condensed by the tutor',
  description:
    "Nicolas Forien's prérentrée polycopié rewritten at a third of its length: 47 statements instead of 143, keeping exactly what Marc Hoffmann's Stochastic Calculus assumes. Each block: statement, refresh when needed, short explanation, deep dive with the proof explained step by step, worked example, compact proof. The last lesson ends with a map to Hoffmann's Chapters 1–2. The full prérentrée stays available for what was left out.",
};
const FILENAME = 'poly-prerentree-m2.pdf';
const TEACHER_TAG = 'Nicolas Forien (notes) · condensed';

const SINGLE = new Set(['KIND', 'TITLE', 'IMPORTANCE', 'HIGHLIGHT', 'DESCRIPTION']);
const KEYS = ['KIND', 'TITLE', 'IMPORTANCE', 'HIGHLIGHT', 'DESCRIPTION', 'INTRO', 'STATEMENT', 'PROOF', 'REFRESH', 'EXPLANATION', 'DEEP', 'EXAMPLE', 'NOTE', 'CONTENT'];
const KEY_RE = new RegExp(`^(${KEYS.join('|')}):\\s*(.*)$`);

function parseFile(text) {
  const items = [];
  const chunks = text.split(/^===(LESSON|BLOCK|NOTE)===\s*$/m);
  for (let i = 1; i < chunks.length; i += 2) {
    const type = chunks[i];
    const body = chunks[i + 1] || '';
    const fields = {};
    let current = null;
    for (const line of body.split('\n')) {
      const m = line.match(KEY_RE);
      if (m) {
        current = m[1];
        fields[current] = SINGLE.has(current) ? [m[2]] : m[2].trim() ? [m[2]] : [];
      } else if (current && !SINGLE.has(current)) {
        fields[current].push(line);
      }
    }
    const val = (k) => {
      const t = (fields[k] || []).join('\n').trim();
      if (!t || /^\(none\)$/i.test(t)) return null;
      return t;
    };
    items.push({ type, get: val });
  }
  return items;
}

const words = (s) => (s ? s.trim().split(/\s+/).length : 0);

// Group files by lesson number.
const files = fs
  .readdirSync(DIR)
  .filter((f) => /^lesson-\d+[a-z]?\.txt$/.test(f))
  .sort((a, b) => {
    const na = Number(a.match(/\d+/)[0]);
    const nb = Number(b.match(/\d+/)[0]);
    return na - nb || a.localeCompare(b);
  });
const lessonsByNum = new Map();
for (const f of files) {
  const n = Number(f.match(/\d+/)[0]);
  if (!lessonsByNum.has(n)) lessonsByNum.set(n, []);
  lessonsByNum.get(n).push(...parseFile(fs.readFileSync(path.join(DIR, f), 'utf8')));
}
if (lessonsByNum.size === 0) throw new Error(`no lesson-<n>.txt files in ${DIR}`);

// Course row (placed first: the student reads this one now).
let course = db.prepare('SELECT * FROM courses WHERE title = ?').get(COURSE.title);
if (!course) {
  db.prepare('UPDATE courses SET position = -1 WHERE id = 1').run();
  const info = db
    .prepare('INSERT INTO courses (title, description, teacher, position) VALUES (?, ?, ?, -2)')
    .run(COURSE.title, COURSE.description, COURSE.teacher);
  course = db.prepare('SELECT * FROM courses WHERE id = ?').get(info.lastInsertRowid);
  console.log(`Created course "${COURSE.title}" (id ${course.id})`);
} else {
  db.prepare('UPDATE courses SET description = ?, teacher = ? WHERE id = ?').run(COURSE.description, COURSE.teacher, course.id);
  console.log(`Course "${COURSE.title}" exists (id ${course.id}) — rebuilding lessons`);
}

const totals = { blocks: 0, notes: 0, proofs: 0, refresh: 0, examples: 0, highlight: 0, explW: 0, deepW: 0 };

const insertSection = db.prepare(
  `INSERT INTO sections (pdf_id, title, kind, content_text, ai_explanation, proof, importance, tutor_note, position, highlight, extra_explanation, extra_example, refresh)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

for (const [n, items] of [...lessonsByNum.entries()].sort((a, b) => a[0] - b[0])) {
  const header = items.find((it) => it.type === 'LESSON');
  if (!header) throw new Error(`lesson ${n}: no ===LESSON=== header`);
  const title = header.get('TITLE');
  const description = header.get('DESCRIPTION') || '';
  const intro = header.get('INTRO');
  if (!title) throw new Error(`lesson ${n}: missing TITLE`);

  let lesson = db.prepare('SELECT * FROM lessons WHERE course_id = ? AND position = ?').get(course.id, n);
  if (!lesson) {
    const li = db.prepare('INSERT INTO lessons (course_id, title, description, position) VALUES (?, ?, ?, ?)').run(course.id, title, description, n);
    lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(li.lastInsertRowid);
  } else {
    db.prepare('UPDATE lessons SET title = ?, description = ? WHERE id = ?').run(title, description, lesson.id);
  }
  let pdfRow = db.prepare('SELECT * FROM pdfs WHERE lesson_id = ? ORDER BY position LIMIT 1').get(lesson.id);
  if (!pdfRow) {
    const pi = db
      .prepare("INSERT INTO pdfs (lesson_id, title, teacher, filename, position, status) VALUES (?, ?, ?, ?, 1, 'ready')")
      .run(lesson.id, title, TEACHER_TAG, FILENAME);
    pdfRow = db.prepare('SELECT * FROM pdfs WHERE id = ?').get(pi.lastInsertRowid);
  } else {
    db.prepare('UPDATE pdfs SET title = ?, teacher = ?, filename = ?, status = ? WHERE id = ?').run(title, TEACHER_TAG, FILENAME, 'ready', pdfRow.id);
  }

  const chats = db.prepare('SELECT COUNT(*) n FROM messages WHERE section_id IN (SELECT id FROM sections WHERE pdf_id = ?)').get(pdfRow.id).n;
  if (chats > 0 && !FORCE) throw new Error(`lesson ${n} "${title}" has ${chats} saved chat messages — rerun with --force to wipe them`);

  let pos = 1;
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM sections WHERE pdf_id = ?').run(pdfRow.id);
    if (intro) {
      insertSection.run(pdfRow.id, 'Before we start', 'tutor_note', intro, null, null, null, null, pos++, 0, null, null, null);
      totals.notes++;
    }
    for (const it of items) {
      if (it.type === 'LESSON') continue;
      if (it.type === 'NOTE') {
        const t = it.get('TITLE');
        const c = it.get('CONTENT');
        if (!t || !c) throw new Error(`lesson ${n}: NOTE needs TITLE and CONTENT`);
        insertSection.run(pdfRow.id, t, 'tutor_note', c, null, null, null, null, pos++, 0, null, null, null);
        totals.notes++;
        continue;
      }
      const kind = it.get('KIND');
      const t = it.get('TITLE') || '';
      const statement = it.get('STATEMENT');
      const expl = it.get('EXPLANATION');
      const deep = it.get('DEEP');
      if (!kind || !statement || !expl || !deep) throw new Error(`lesson ${n}, block "${t}": KIND, STATEMENT, EXPLANATION and DEEP are required`);
      const proof = it.get('PROOF');
      const importance = proof ? it.get('IMPORTANCE') : null;
      if (proof && !['imp', 'half imp', 'not imp'].includes(importance)) throw new Error(`lesson ${n}, block "${t}": a proof needs IMPORTANCE imp | half imp | not imp`);
      const highlight = it.get('HIGHLIGHT') === '1' ? 1 : 0;
      const refresh = it.get('REFRESH');
      const example = it.get('EXAMPLE');
      const note = it.get('NOTE');
      insertSection.run(pdfRow.id, t, kind, statement, expl, proof, importance, note, pos++, highlight, deep, example, refresh);
      totals.blocks++;
      if (proof) totals.proofs++;
      if (refresh) totals.refresh++;
      if (example) totals.examples++;
      if (highlight) totals.highlight++;
      totals.explW += words(expl);
      totals.deepW += words(deep);
      const ew = words(expl);
      const dw = words(deep);
      if (ew > 160) console.warn(`  ! "${t}": explanation ${ew} words`);
      if (dw > 700) console.warn(`  ! "${t}": deep dive ${dw} words`);
      if (refresh && words(refresh) > 60) console.warn(`  ! "${t}": refresh ${words(refresh)} words`);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  console.log(`lesson ${n} "${title}": ${pos - 1} rows (pdf ${pdfRow.id})`);
}

console.log(
  `done: ${totals.blocks} blocks, ${totals.notes} tutor notes, ${totals.proofs} proofs, ${totals.refresh} refreshes, ${totals.examples} examples, ${totals.highlight} highlighted; ` +
    `avg explanation ${Math.round(totals.explW / Math.max(1, totals.blocks))} w, avg deep dive ${Math.round(totals.deepW / Math.max(1, totals.blocks))} w`
);

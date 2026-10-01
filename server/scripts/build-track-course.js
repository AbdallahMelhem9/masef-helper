// Builds (or rebuilds) one track of a multi-track course from tutor-written
// sentinel files (same format as build-condensed-course.js: lesson-<n>[b|c].txt
// with ===LESSON===, ===BLOCK===, ===NOTE===) plus a track.json:
//
//   { courseId, filename, teacherTag,
//     tracks: [{key, label, teacher, description}, ...],   -> courses.tracks
//     track: "<key of the track built here>",
//     otherLessonsTrack: "<key given to the course's lessons that have no track yet>" }
//
// Lesson n of the track is found by (course, track, position n); its blocks are
// wiped and re-inserted (refused when it has saved chats, unless --force).
// Usage (from server/): node scripts/build-track-course.js content/hf-rosenbaum [--force]
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';
import { parseFile } from './lib/sentinel-lessons.js';

const args = process.argv.slice(2);
const DIR = args.find((a) => !a.startsWith('--'));
const FORCE = args.includes('--force');
if (!DIR) throw new Error('usage: node scripts/build-track-course.js <dir> [--force]');

const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'track.json'), 'utf8'));
const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(cfg.courseId);
if (!course) throw new Error(`course ${cfg.courseId} not found`);
if (!cfg.tracks.some((t) => t.key === cfg.track)) throw new Error(`track "${cfg.track}" is not listed in tracks`);

db.prepare('UPDATE courses SET tracks = ? WHERE id = ?').run(JSON.stringify(cfg.tracks), course.id);
if (cfg.otherLessonsTrack) {
  const n = db.prepare('UPDATE lessons SET track = ? WHERE course_id = ? AND track IS NULL').run(cfg.otherLessonsTrack, course.id).changes;
  if (n) console.log(`tagged ${n} existing lessons as track "${cfg.otherLessonsTrack}"`);
}

const files = fs
  .readdirSync(DIR)
  .filter((f) => /^lesson-\d+[a-z]?\.txt$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]) || a.localeCompare(b));
const lessonsByNum = new Map();
for (const f of files) {
  const n = Number(f.match(/\d+/)[0]);
  if (!lessonsByNum.has(n)) lessonsByNum.set(n, []);
  lessonsByNum.get(n).push(...parseFile(fs.readFileSync(path.join(DIR, f), 'utf8')));
}
if (lessonsByNum.size === 0) throw new Error(`no lesson-<n>.txt files in ${DIR}`);

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

  let lesson = db.prepare('SELECT * FROM lessons WHERE course_id = ? AND track = ? AND position = ?').get(course.id, cfg.track, n);
  if (!lesson) {
    const li = db
      .prepare('INSERT INTO lessons (course_id, title, description, position, track) VALUES (?, ?, ?, ?, ?)')
      .run(course.id, title, description, n, cfg.track);
    lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(li.lastInsertRowid);
  } else {
    db.prepare('UPDATE lessons SET title = ?, description = ? WHERE id = ?').run(title, description, lesson.id);
  }
  let pdfRow = db.prepare('SELECT * FROM pdfs WHERE lesson_id = ? ORDER BY position LIMIT 1').get(lesson.id);
  if (!pdfRow) {
    const pi = db
      .prepare("INSERT INTO pdfs (lesson_id, title, teacher, filename, position, status) VALUES (?, ?, ?, ?, 1, 'ready')")
      .run(lesson.id, title, cfg.teacherTag, cfg.filename);
    pdfRow = db.prepare('SELECT * FROM pdfs WHERE id = ?').get(pi.lastInsertRowid);
  } else {
    db.prepare("UPDATE pdfs SET title = ?, teacher = ?, filename = ?, status = 'ready' WHERE id = ?").run(title, cfg.teacherTag, cfg.filename, pdfRow.id);
  }

  const chats = db.prepare('SELECT COUNT(*) n FROM messages WHERE section_id IN (SELECT id FROM sections WHERE pdf_id = ?)').get(pdfRow.id).n;
  if (chats > 0 && !FORCE) throw new Error(`lesson ${n} "${title}" has ${chats} saved chat messages — rerun with --force to wipe them`);

  let pos = 1;
  let blocks = 0;
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM sections WHERE pdf_id = ?').run(pdfRow.id);
    if (intro) insertSection.run(pdfRow.id, 'Before we start', 'tutor_note', intro, null, null, null, null, pos++, 0, null, null, null);
    for (const it of items) {
      if (it.type === 'LESSON') continue;
      if (it.type === 'NOTE') {
        const t = it.get('TITLE');
        const c = it.get('CONTENT');
        if (!t || !c) throw new Error(`lesson ${n}: NOTE needs TITLE and CONTENT`);
        insertSection.run(pdfRow.id, t, 'tutor_note', c, null, null, null, null, pos++, 0, null, null, null);
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
      insertSection.run(pdfRow.id, t, kind, statement, expl, proof, importance, it.get('NOTE'), pos++, highlight, deep, it.get('EXAMPLE'), it.get('REFRESH'));
      blocks++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  console.log(`lesson ${n} "${title}": ${blocks} blocks, ${pos - 1} rows (lesson ${lesson.id}, pdf ${pdfRow.id})`);
}

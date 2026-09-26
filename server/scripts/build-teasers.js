// Rebuilds the teasers table from the sentinel files in content/teasers/.
// Usage: node scripts/build-teasers.js [dir]
// Idempotent: wipes and reinserts the table. User progress and boards are
// keyed by slug, so they survive as long as slugs don't change.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dirArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const dir = path.resolve(dirArg || path.join(__dirname, '..', 'content', 'teasers'));

const BOOK_OF = { G: 'green', R: 'red', H: 'heard' };
const SECTIONS = new Set(['brainteaser', 'probability']);
// Category order within each section (the order the app lists them in).
export const CATEGORIES = {
  brainteaser: [
    'Logic & deduction',
    'Strategy & games',
    'Weighing & searching',
    'Numbers & digits',
    'Invariants, parity & pigeonhole',
    'Induction & recursion',
    'Geometry & space',
    'Clocks, rates & motion',
    'Estimation & lateral thinking',
    'Calculus & algebra',
  ],
  probability: [
    'Counting & combinatorics',
    'Conditional probability & Bayes',
    'Expected value',
    'Variance & correlation',
    'Continuous & geometric probability',
    'Distributions',
    'Order statistics',
    'Games & optimal stopping',
    'Markov chains & random walks',
    'Martingales & stopping times',
    'Brownian motion',
    'Statistics & estimation',
  ],
};

// Sentinel format: one-line fields, multi-line fields, and repeatable
// SOLUTION: <method> / FOLLOWUP: <title> (+ FOLLOWUP_ANSWER:) blocks.
export function parseTeasers(text) {
  const out = [];
  for (const chunk of text.split(/^===TEASER===\s*$/m).slice(1)) {
    const body = chunk.split(/^===END===\s*$/m)[0];
    const t = { solutions: [], followups: [] };
    let field = null; // { kind: 'field' | 'solution' | 'followup' | 'followup_answer', name }
    let buf = [];
    const flush = () => {
      if (!field) return;
      const val = buf.join('\n').trim();
      if (field.kind === 'solution') t.solutions.push({ title: field.name || `Solution ${t.solutions.length + 1}`, body: val });
      else if (field.kind === 'followup') t.followups.push({ title: field.name || `Follow-up ${t.followups.length + 1}`, question: val, answer: '' });
      else if (field.kind === 'followup_answer') {
        if (t.followups.length) t.followups[t.followups.length - 1].answer = val;
      } else t[field.name] = val;
      buf = [];
    };
    for (const line of body.split(/\r?\n/)) {
      const single = line.match(/^(SLUG|IDS|SECTION|CATEGORY|DIFFICULTY|TITLE):\s*(.*)$/);
      const multi = line.match(/^(QUESTION|HINT1|HINT2|ANSWER|REFRESH|EXPLANATION|FOLLOWUP_ANSWER):\s*(.*)$/);
      const block = line.match(/^(SOLUTION|FOLLOWUP):\s*(.*)$/);
      if (single) {
        flush();
        field = null;
        t[single[1].toLowerCase()] = single[2].trim();
      } else if (multi) {
        flush();
        field = multi[1] === 'FOLLOWUP_ANSWER' ? { kind: 'followup_answer' } : { kind: 'field', name: multi[1].toLowerCase() };
        buf = multi[2] ? [multi[2]] : [];
      } else if (block) {
        flush();
        field = { kind: block[1].toLowerCase(), name: block[2].trim() };
        buf = [];
      } else if (field) buf.push(line);
    }
    flush();
    out.push(t);
  }
  return out;
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
const all = [];
for (const f of files) {
  for (const t of parseTeasers(fs.readFileSync(path.join(dir, f), 'utf8'))) all.push({ ...t, file: f });
}

const errors = [];
const slugs = new Set();
for (const t of all) {
  const where = `${t.file} ${t.slug || t.title}`;
  if (!t.slug) errors.push(`${where}: no slug`);
  if (slugs.has(t.slug)) errors.push(`${where}: duplicate slug`);
  slugs.add(t.slug);
  if (!SECTIONS.has(t.section)) errors.push(`${where}: bad section ${t.section}`);
  else if (!CATEGORIES[t.section].includes(t.category)) errors.push(`${where}: bad category "${t.category}"`);
  if (!t.question) errors.push(`${where}: no question`);
  if (!t.solutions.length) errors.push(`${where}: no solution`);
  if (t.refresh && /^none\.?$/i.test(t.refresh)) t.refresh = null;
}
if (errors.length) {
  console.error(errors.join('\n'));
  if (!process.argv.includes('--force')) process.exit(1);
}

// Raw IDs (G2-07, R3A-12, H1B-03) give the books; refs.json maps each to
// its place in the book (section, question number, page).
const refsPath = path.join(dir, 'refs.json');
const rawRefs = new Map(fs.existsSync(refsPath) ? Object.entries(JSON.parse(fs.readFileSync(refsPath, 'utf8'))) : []);
const BOOK_NAME = { green: 'Green book (Zhou)', red: 'Red book (Joshi et al.)', heard: 'Heard on the Street (Crack)' };

const catRank = (t) => CATEGORIES[t.section]?.indexOf(t.category) ?? 99;
all.sort((a, b) => a.section.localeCompare(b.section) || catRank(a) - catRank(b));

const insert = db.prepare(`INSERT INTO teasers
  (slug, section, category, title, difficulty, question, hint1, hint2, answer, refresh, explanation, solutions, followups, books, refs, position)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
db.exec('BEGIN');
db.exec('DELETE FROM teasers');
all.forEach((t, i) => {
  const ids = (t.ids || '').split(/[,\s]+/).filter(Boolean);
  const books = [...new Set(ids.map((id) => BOOK_OF[id[0]]).filter(Boolean))];
  // Follow-ups and footnoted variants sit inside their parent's entry, so
  // only the main questions are cited.
  const isFollowup = (id) => /follow-up|related question|footnote|fn \d|variation/i.test(rawRefs.get(id) || '');
  const refs = ids.filter((id) => !isFollowup(id)).map((id) => {
    const book = BOOK_OF[id[0]];
    return `${BOOK_NAME[book] || book}: ${rawRefs.get(id) || id}`;
  });
  insert.run(
    t.slug, t.section, t.category, t.title, t.difficulty || null, t.question, t.hint1 || null, t.hint2 || null,
    t.answer || null, t.refresh || null, t.explanation || null, JSON.stringify(t.solutions), JSON.stringify(t.followups), JSON.stringify(books), JSON.stringify(refs), i
  );
});
db.exec('COMMIT');
const by = db.prepare('SELECT section, COUNT(*) n FROM teasers GROUP BY section').all();
console.log(`teasers: ${all.length} from ${files.length} files`, JSON.stringify(by));

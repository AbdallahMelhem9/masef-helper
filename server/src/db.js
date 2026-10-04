import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '..', 'data');
export const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(UPLOADS_DIR, { recursive: true });

// On a fresh deploy (e.g. Render, where the disk starts empty), bootstrap the
// database from the committed seed snapshot.
const DB_PATH = path.join(DATA_DIR, 'masef.db');
const SEED_PATH = path.join(__dirname, '..', 'seed', 'masef-seed.db');
if (!existsSync(DB_PATH) && existsSync(SEED_PATH)) {
  copyFileSync(SEED_PATH, DB_PATH);
  console.log('Database bootstrapped from seed snapshot.');
}

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 10000;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    teacher TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS pdfs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    teacher TEXT NOT NULL DEFAULT '',
    filename TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'processing', 'failed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pdf_id INTEGER NOT NULL REFERENCES pdfs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'text',
    page_start INTEGER,
    page_end INTEGER,
    content_text TEXT NOT NULL DEFAULT '',
    ai_explanation TEXT,
    proof TEXT,
    importance TEXT,
    tutor_note TEXT,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Handwritten ink, one document per (user, lesson page, kind): 'page' is
  -- the pen layer drawn over the lesson, 'notes' the lesson's notebook page.
  -- data is JSON (strokes, typed text, paper height); updated_at is the
  -- client's ISO timestamp so the browser copy and this one can be compared.
  CREATE TABLE IF NOT EXISTS ink (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pdf_id INTEGER NOT NULL REFERENCES pdfs(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('page', 'notes')),
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, pdf_id, kind)
  );

  -- A notes page attached to one block ("the board for this slide"), per
  -- user. filled = 1 when it holds any stroke or typed text, so the lesson
  -- can mark which blocks have notes without loading them all.
  CREATE TABLE IF NOT EXISTS section_ink (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    section_id INTEGER NOT NULL,
    pdf_id INTEGER NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    filled INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, section_id)
  );
`);

// Migrations for databases created before these columns existed.
const sectionCols = db.prepare('PRAGMA table_info(sections)').all().map((c) => c.name);
for (const [name, ddl] of [
  ['kind', "ALTER TABLE sections ADD COLUMN kind TEXT NOT NULL DEFAULT 'text'"],
  ['proof', 'ALTER TABLE sections ADD COLUMN proof TEXT'],
  ['importance', 'ALTER TABLE sections ADD COLUMN importance TEXT'],
  ['tutor_note', 'ALTER TABLE sections ADD COLUMN tutor_note TEXT'],
  ['highlight', 'ALTER TABLE sections ADD COLUMN highlight INTEGER NOT NULL DEFAULT 0'],
  ['extra_explanation', 'ALTER TABLE sections ADD COLUMN extra_explanation TEXT'],
  ['extra_example', 'ALTER TABLE sections ADD COLUMN extra_example TEXT'],
  // One short reminder (a definition or result the block relies on), shown
  // before the explanation; NULL when the block needs none.
  ['refresh', 'ALTER TABLE sections ADD COLUMN refresh TEXT'],
]) {
  if (!sectionCols.includes(name)) db.exec(ddl);
}

// Why a course has no material yet (shown on its page with a contact line);
// NULL for courses with content.
const courseCols = db.prepare('PRAGMA table_info(courses)').all().map((c) => c.name);
if (!courseCols.includes('unavailable_reason')) db.exec('ALTER TABLE courses ADD COLUMN unavailable_reason TEXT');

// Courses taught from more than one source (e.g. the teacher's own lectures and
// a reference survey): courses.tracks is a JSON list [{key, label, teacher,
// description}] and lessons.track names the track a lesson belongs to. The
// course page then asks which track to open. NULL = a single-track course.
if (!courseCols.includes('tracks')) db.exec('ALTER TABLE courses ADD COLUMN tracks TEXT');
const lessonCols = db.prepare('PRAGMA table_info(lessons)').all().map((c) => c.name);
if (!lessonCols.includes('track')) db.exec('ALTER TABLE lessons ADD COLUMN track TEXT');

// Interview puzzles from the books and free question banks (content, rebuilt
// by scripts/build-teasers.js). A table created before the 'trading' section
// existed is dropped and recreated: it holds content only, user progress
// lives in teaser_user.
{
  const old = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'teasers'").get();
  if (old && !old.sql.includes("'trading'")) db.exec('DROP TABLE teasers');
}
// slug is the stable key user data hangs on, so rebuilding the table never
// loses progress or boards.
// solutions / followups / firms / books / refs are JSON arrays; books holds
// the sources (the three books, or a question bank / site).
db.exec(`
  CREATE TABLE IF NOT EXISTS teasers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    section TEXT NOT NULL CHECK (section IN ('brainteaser', 'probability', 'trading')),
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    difficulty TEXT,
    question TEXT NOT NULL,
    hint1 TEXT,
    hint2 TEXT,
    answer TEXT,
    refresh TEXT,
    explanation TEXT,
    solutions TEXT NOT NULL DEFAULT '[]',
    followups TEXT NOT NULL DEFAULT '[]',
    firms TEXT NOT NULL DEFAULT '[]',
    illustration TEXT,
    books TEXT NOT NULL DEFAULT '[]',
    refs TEXT NOT NULL DEFAULT '[]',
    position INTEGER NOT NULL DEFAULT 0
  );

  -- Per-user state on one teaser: completed flag and the board (ink JSON).
  CREATE TABLE IF NOT EXISTS teaser_user (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    ink TEXT,
    ink_filled INTEGER NOT NULL DEFAULT 0,
    ink_updated_at TEXT,
    PRIMARY KEY (user_id, slug)
  );

  -- Per-user state on one LeetCode problem (coding prep), keyed by its slug.
  CREATE TABLE IF NOT EXISTS coding_user (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    solved INTEGER NOT NULL DEFAULT 0,
    solved_at TEXT,
    notes TEXT NOT NULL DEFAULT '',
    notes_updated_at TEXT,
    PRIMARY KEY (user_id, slug)
  );
`);
const teaserCols = db.prepare('PRAGMA table_info(teasers)').all().map((c) => c.name);
if (!teaserCols.includes('followups')) db.exec("ALTER TABLE teasers ADD COLUMN followups TEXT NOT NULL DEFAULT '[]'");
// Small SVG drawing shown with the puzzle (content/teasers/illustrations).
if (!teaserCols.includes('illustration')) db.exec('ALTER TABLE teasers ADD COLUMN illustration TEXT');
if (!teaserCols.includes('firms')) db.exec("ALTER TABLE teasers ADD COLUMN firms TEXT NOT NULL DEFAULT '[]'");

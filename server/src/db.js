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

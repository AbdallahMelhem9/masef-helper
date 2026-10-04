// Per-user data: accounts, sessions and handwritten ink.
//
// Course content lives in the SQLite file, which a hosted deploy rebuilds from
// the seed on every restart (Render's free disk is wiped). User data must
// outlive that, so when DATABASE_URL is set it goes to an external Postgres
// instead; without it (the local install) it stays in SQLite.
import { db } from './db.js';

function sqliteStore() {
  return {
    kind: 'sqlite',
    async userCount() {
      return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    },
    async findUserByEmail(email) {
      return db.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
    },
    async findUserById(id) {
      return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
    },
    async createUser(email, passwordHash, name) {
      const info = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)').run(email, passwordHash, name);
      return { id: Number(info.lastInsertRowid), email, name };
    },
    async updatePassword(userId, passwordHash) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
    },
    async createSession(token, userId) {
      db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
    },
    async sessionUser(token) {
      return (
        db
          .prepare('SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?')
          .get(token) || null
      );
    },
    async deleteSession(token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    },
    async deleteUserSessions(userId) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    },
    async latestResetAt(userId) {
      return db.prepare('SELECT MAX(created_at) AS t FROM password_resets WHERE user_id = ?').get(userId).t || null;
    },
    // Keeps a single live reset link per user: a new request replaces the old one.
    async replaceReset(userId, tokenHash, expiresAt, createdAt) {
      db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
      db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(tokenHash, userId, expiresAt, createdAt);
    },
    // Removes the link as it is read, so a token can only be used once.
    async takeReset(tokenHash) {
      return db.prepare('DELETE FROM password_resets WHERE token_hash = ? RETURNING user_id, expires_at').get(tokenHash) || null;
    },
    async deleteUserResets(userId) {
      db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
    },
    async getInk(userId, pdfId, kind) {
      return db.prepare('SELECT data, updated_at FROM ink WHERE user_id = ? AND pdf_id = ? AND kind = ?').get(userId, pdfId, kind) || null;
    },
    async putInk(userId, pdfId, kind, data, stamp) {
      db.prepare(
        `INSERT INTO ink (user_id, pdf_id, kind, data, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, pdf_id, kind) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
      ).run(userId, pdfId, kind, data, stamp);
    },
    async getSectionInk(userId, sectionId) {
      return db.prepare('SELECT data, updated_at FROM section_ink WHERE user_id = ? AND section_id = ?').get(userId, sectionId) || null;
    },
    async putSectionInk(userId, sectionId, pdfId, data, filled, stamp) {
      db.prepare(
        `INSERT INTO section_ink (user_id, section_id, pdf_id, data, filled, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, section_id) DO UPDATE SET data = excluded.data, filled = excluded.filled, updated_at = excluded.updated_at`
      ).run(userId, sectionId, pdfId, data, filled ? 1 : 0, stamp);
    },
    async filledSections(userId, pdfId) {
      return db.prepare('SELECT section_id FROM section_ink WHERE user_id = ? AND pdf_id = ? AND filled = 1').all(userId, pdfId).map((r) => r.section_id);
    },
    async teaserStates(userId) {
      return db.prepare('SELECT slug, completed, ink_filled FROM teaser_user WHERE user_id = ?').all(userId);
    },
    async getTeaserInk(userId, slug) {
      const r = db.prepare('SELECT ink AS data, ink_updated_at AS updated_at FROM teaser_user WHERE user_id = ? AND slug = ?').get(userId, slug);
      return r && r.data ? r : null;
    },
    async putTeaserInk(userId, slug, data, filled, stamp) {
      db.prepare(
        `INSERT INTO teaser_user (user_id, slug, ink, ink_filled, ink_updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, slug) DO UPDATE SET ink = excluded.ink, ink_filled = excluded.ink_filled, ink_updated_at = excluded.ink_updated_at`
      ).run(userId, slug, data, filled ? 1 : 0, stamp);
    },
    async setTeaserCompleted(userId, slug, completed) {
      db.prepare(
        `INSERT INTO teaser_user (user_id, slug, completed, completed_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, slug) DO UPDATE SET completed = excluded.completed, completed_at = excluded.completed_at`
      ).run(userId, slug, completed ? 1 : 0, completed ? new Date().toISOString() : null);
    },
    async codingStates(userId) {
      return db.prepare('SELECT slug, solved, notes FROM coding_user WHERE user_id = ?').all(userId);
    },
    async setCodingSolved(userId, slug, solved) {
      db.prepare(
        `INSERT INTO coding_user (user_id, slug, solved, solved_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, slug) DO UPDATE SET solved = excluded.solved, solved_at = excluded.solved_at`
      ).run(userId, slug, solved ? 1 : 0, solved ? new Date().toISOString() : null);
    },
    async setCodingNotes(userId, slug, notes) {
      db.prepare(
        `INSERT INTO coding_user (user_id, slug, notes, notes_updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, slug) DO UPDATE SET notes = excluded.notes, notes_updated_at = excluded.notes_updated_at`
      ).run(userId, slug, notes, new Date().toISOString());
    },
  };
}

async function postgresStore(url) {
  const { default: pg } = await import('pg');
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 5 });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    -- No foreign key to pdfs: those live in the SQLite content database.
    CREATE TABLE IF NOT EXISTS ink (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pdf_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('page', 'notes')),
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, pdf_id, kind)
    );
    CREATE TABLE IF NOT EXISTS section_ink (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      section_id INTEGER NOT NULL,
      pdf_id INTEGER NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      filled BOOLEAN NOT NULL DEFAULT false,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, section_id)
    );
    CREATE TABLE IF NOT EXISTS teaser_user (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT false,
      completed_at TEXT,
      ink TEXT,
      ink_filled BOOLEAN NOT NULL DEFAULT false,
      ink_updated_at TEXT,
      PRIMARY KEY (user_id, slug)
    );
    CREATE TABLE IF NOT EXISTS coding_user (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      solved BOOLEAN NOT NULL DEFAULT false,
      solved_at TEXT,
      notes TEXT NOT NULL DEFAULT '',
      notes_updated_at TEXT,
      PRIMARY KEY (user_id, slug)
    );
  `);
  const one = async (sql, params) => (await pool.query(sql, params)).rows[0] || null;
  return {
    kind: 'postgres',
    async userCount() {
      return Number((await one('SELECT COUNT(*) AS n FROM users')).n);
    },
    findUserByEmail: (email) => one('SELECT * FROM users WHERE email = $1', [email]),
    findUserById: (id) => one('SELECT * FROM users WHERE id = $1', [id]),
    createUser: (email, passwordHash, name) =>
      one('INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name', [email, passwordHash, name]),
    async updatePassword(userId, passwordHash) {
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
    },
    async createSession(token, userId) {
      await pool.query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, userId]);
    },
    sessionUser: (token) =>
      one('SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1', [token]),
    async deleteSession(token) {
      await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    },
    async deleteUserSessions(userId) {
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    },
    async latestResetAt(userId) {
      return (await one('SELECT MAX(created_at) AS t FROM password_resets WHERE user_id = $1', [userId])).t || null;
    },
    async replaceReset(userId, tokenHash, expiresAt, createdAt) {
      await pool.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
      await pool.query('INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)', [tokenHash, userId, expiresAt, createdAt]);
    },
    takeReset: (tokenHash) =>
      one('DELETE FROM password_resets WHERE token_hash = $1 RETURNING user_id, expires_at', [tokenHash]),
    async deleteUserResets(userId) {
      await pool.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
    },
    getInk: (userId, pdfId, kind) =>
      one('SELECT data, updated_at FROM ink WHERE user_id = $1 AND pdf_id = $2 AND kind = $3', [userId, pdfId, kind]),
    async putInk(userId, pdfId, kind, data, stamp) {
      await pool.query(
        `INSERT INTO ink (user_id, pdf_id, kind, data, updated_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, pdf_id, kind) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        [userId, pdfId, kind, data, stamp]
      );
    },
    getSectionInk: (userId, sectionId) =>
      one('SELECT data, updated_at FROM section_ink WHERE user_id = $1 AND section_id = $2', [userId, sectionId]),
    async putSectionInk(userId, sectionId, pdfId, data, filled, stamp) {
      await pool.query(
        `INSERT INTO section_ink (user_id, section_id, pdf_id, data, filled, updated_at) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, section_id) DO UPDATE SET data = excluded.data, filled = excluded.filled, updated_at = excluded.updated_at`,
        [userId, sectionId, pdfId, data, filled, stamp]
      );
    },
    async filledSections(userId, pdfId) {
      const r = await pool.query('SELECT section_id FROM section_ink WHERE user_id = $1 AND pdf_id = $2 AND filled', [userId, pdfId]);
      return r.rows.map((x) => x.section_id);
    },
    async teaserStates(userId) {
      const r = await pool.query('SELECT slug, completed, ink_filled FROM teaser_user WHERE user_id = $1', [userId]);
      return r.rows.map((x) => ({ slug: x.slug, completed: x.completed ? 1 : 0, ink_filled: x.ink_filled ? 1 : 0 }));
    },
    async getTeaserInk(userId, slug) {
      const r = await one('SELECT ink AS data, ink_updated_at AS updated_at FROM teaser_user WHERE user_id = $1 AND slug = $2', [userId, slug]);
      return r && r.data ? r : null;
    },
    async putTeaserInk(userId, slug, data, filled, stamp) {
      await pool.query(
        `INSERT INTO teaser_user (user_id, slug, ink, ink_filled, ink_updated_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, slug) DO UPDATE SET ink = excluded.ink, ink_filled = excluded.ink_filled, ink_updated_at = excluded.ink_updated_at`,
        [userId, slug, data, filled, stamp]
      );
    },
    async setTeaserCompleted(userId, slug, completed) {
      await pool.query(
        `INSERT INTO teaser_user (user_id, slug, completed, completed_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, slug) DO UPDATE SET completed = excluded.completed, completed_at = excluded.completed_at`,
        [userId, slug, completed, completed ? new Date().toISOString() : null]
      );
    },
    async codingStates(userId) {
      const r = await pool.query('SELECT slug, solved, notes FROM coding_user WHERE user_id = $1', [userId]);
      return r.rows.map((x) => ({ slug: x.slug, solved: x.solved ? 1 : 0, notes: x.notes }));
    },
    async setCodingSolved(userId, slug, solved) {
      await pool.query(
        `INSERT INTO coding_user (user_id, slug, solved, solved_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, slug) DO UPDATE SET solved = excluded.solved, solved_at = excluded.solved_at`,
        [userId, slug, solved, solved ? new Date().toISOString() : null]
      );
    },
    async setCodingNotes(userId, slug, notes) {
      await pool.query(
        `INSERT INTO coding_user (user_id, slug, notes, notes_updated_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, slug) DO UPDATE SET notes = excluded.notes, notes_updated_at = excluded.notes_updated_at`,
        [userId, slug, notes, new Date().toISOString()]
      );
    },
  };
}

export const store = process.env.DATABASE_URL ? await postgresStore(process.env.DATABASE_URL) : sqliteStore();

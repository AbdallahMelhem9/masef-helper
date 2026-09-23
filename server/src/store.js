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
    async createUser(email, passwordHash, name) {
      const info = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)').run(email, passwordHash, name);
      return { id: Number(info.lastInsertRowid), email, name };
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
    async getInk(userId, pdfId, kind) {
      return db.prepare('SELECT data, updated_at FROM ink WHERE user_id = ? AND pdf_id = ? AND kind = ?').get(userId, pdfId, kind) || null;
    },
    async putInk(userId, pdfId, kind, data, stamp) {
      db.prepare(
        `INSERT INTO ink (user_id, pdf_id, kind, data, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, pdf_id, kind) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
      ).run(userId, pdfId, kind, data, stamp);
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
    -- No foreign key to pdfs: those live in the SQLite content database.
    CREATE TABLE IF NOT EXISTS ink (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pdf_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('page', 'notes')),
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, pdf_id, kind)
    );
  `);
  const one = async (sql, params) => (await pool.query(sql, params)).rows[0] || null;
  return {
    kind: 'postgres',
    async userCount() {
      return Number((await one('SELECT COUNT(*) AS n FROM users')).n);
    },
    findUserByEmail: (email) => one('SELECT * FROM users WHERE email = $1', [email]),
    createUser: (email, passwordHash, name) =>
      one('INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name', [email, passwordHash, name]),
    async createSession(token, userId) {
      await pool.query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, userId]);
    },
    sessionUser: (token) =>
      one('SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1', [token]),
    async deleteSession(token) {
      await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
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
  };
}

export const store = process.env.DATABASE_URL ? await postgresStore(process.env.DATABASE_URL) : sqliteStore();

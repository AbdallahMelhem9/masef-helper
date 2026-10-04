// Trading games and mental-math drills: every finished run is saved as a
// score, so the client can show progress over time, personal bests and a
// leaderboard against the other accounts.
//
// The games themselves run in the browser; the server only stores results.
// Like the rest of the per-user data (see store.js), scores go to Postgres
// when DATABASE_URL is set and to the SQLite file otherwise.
import express from 'express';
import { db } from './db.js';

// game id → allowed levels. Scores outside [min, max] are rejected as bogus.
const GAMES = {
  // trading games (score = P&L or points)
  'mm-dice': { levels: ['easy', 'medium', 'hard'], min: -100000, max: 100000 },
  'card-market': { levels: ['easy', 'medium', 'hard'], min: -100000, max: 100000 },
  'etf-arb': { levels: ['easy', 'medium', 'hard'], min: -1000000, max: 1000000 },
  fermi: { levels: ['easy', 'medium', 'hard'], min: -10000, max: 10000 },
  // mental maths & sequences (score = correct − wrong, or correct)
  'ft-arith': { levels: ['test'], min: -100, max: 100 },
  'ft-seq': { levels: ['test'], min: -100, max: 100 },
  'seq-practice': { levels: ['easy', 'medium', 'hard'], min: -100, max: 100 },
  sprint: { levels: ['easy', 'medium', 'hard'], min: -100, max: 1000 },
  'eighty-in-eight': { levels: ['test'], min: -100, max: 100 },
};

const validRun = (b) => {
  const g = GAMES[b?.game];
  return g && g.levels.includes(b.level) && Number.isFinite(b.score) && b.score >= g.min && b.score <= g.max;
};

// What other players see: the account's display name, or a masked email.
const shownName = (name, email) => (name && name.trim()) || String(email).split('@')[0].slice(0, 3) + '•••';

function sqliteScores() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game TEXT NOT NULL,
      level TEXT NOT NULL,
      score REAL NOT NULL,
      stats TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS game_scores_board ON game_scores (game, level, score);
    CREATE INDEX IF NOT EXISTS game_scores_user ON game_scores (user_id, id);
  `);
  return {
    async add(userId, game, level, score, stats) {
      const info = db
        .prepare('INSERT INTO game_scores (user_id, game, level, score, stats) VALUES (?, ?, ?, ?, ?)')
        .run(userId, game, level, score, stats);
      return Number(info.lastInsertRowid);
    },
    async history(userId) {
      return db
        .prepare('SELECT id, game, level, score, stats, created_at FROM game_scores WHERE user_id = ? ORDER BY id DESC LIMIT 1000')
        .all(userId);
    },
    async board(game, level) {
      return db
        .prepare(
          `SELECT g.user_id, MAX(g.score) AS best, COUNT(*) AS plays, u.name, u.email
           FROM game_scores g JOIN users u ON u.id = g.user_id
           WHERE g.game = ? AND g.level = ? GROUP BY g.user_id ORDER BY best DESC`
        )
        .all(game, level);
    },
    async setName(userId, name) {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, userId);
    },
  };
}

async function postgresScores(url) {
  const { default: pg } = await import('pg');
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 2 });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_scores (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game TEXT NOT NULL,
      level TEXT NOT NULL,
      score DOUBLE PRECISION NOT NULL,
      stats TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
    CREATE INDEX IF NOT EXISTS game_scores_board ON game_scores (game, level, score);
    CREATE INDEX IF NOT EXISTS game_scores_user ON game_scores (user_id, id);
  `);
  return {
    async add(userId, game, level, score, stats) {
      const r = await pool.query(
        'INSERT INTO game_scores (user_id, game, level, score, stats) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [userId, game, level, score, stats]
      );
      return r.rows[0].id;
    },
    async history(userId) {
      const r = await pool.query(
        'SELECT id, game, level, score, stats, created_at FROM game_scores WHERE user_id = $1 ORDER BY id DESC LIMIT 1000',
        [userId]
      );
      return r.rows;
    },
    async board(game, level) {
      const r = await pool.query(
        `SELECT g.user_id, MAX(g.score) AS best, COUNT(*) AS plays, u.name, u.email
         FROM game_scores g JOIN users u ON u.id = g.user_id
         WHERE g.game = $1 AND g.level = $2 GROUP BY g.user_id, u.name, u.email ORDER BY best DESC`,
        [game, level]
      );
      return r.rows.map((x) => ({ ...x, plays: Number(x.plays) }));
    },
    async setName(userId, name) {
      await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name, userId]);
    },
  };
}

const scores = process.env.DATABASE_URL ? await postgresScores(process.env.DATABASE_URL) : sqliteScores();

const parseStats = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};

// Mounted at /api/games. `guards` = the auth + password middlewares.
export function gamesRouter(...guards) {
  const r = express.Router();
  r.use(...guards);

  // Save a finished run; answers with the player's place on that board.
  r.post('/scores', async (req, res) => {
    const b = req.body || {};
    if (!validRun(b)) return res.status(400).json({ error: 'Invalid run' });
    const stats = JSON.stringify(b.stats ?? {}).slice(0, 20000);
    try {
      const id = await scores.add(req.user.id, b.game, b.level, b.score, stats);
      const board = await scores.board(b.game, b.level);
      const mine = board.find((x) => x.user_id === req.user.id);
      res.json({
        id,
        best: mine?.best ?? b.score,
        personalBest: mine ? b.score >= mine.best : true,
        rank: board.filter((x) => x.best > (mine?.best ?? b.score)).length + 1, // the player's place on the board
        players: board.length,
      });
    } catch (err) {
      console.error('game score write failed:', err);
      res.status(503).json({ error: 'Score storage unavailable' });
    }
  });

  // This user's runs, newest first.
  r.get('/me', async (req, res) => {
    try {
      const rows = await scores.history(req.user.id);
      res.json({
        name: req.user.name || '',
        shownAs: shownName(req.user.name, req.user.email),
        runs: rows.map((x) => ({ ...x, score: Number(x.score), stats: parseStats(x.stats) })),
      });
    } catch (err) {
      console.error('game history read failed:', err);
      res.status(503).json({ error: 'Score storage unavailable' });
    }
  });

  // Best run per player on one game + level.
  r.get('/leaderboard/:game/:level', async (req, res) => {
    const { game, level } = req.params;
    if (!GAMES[game]?.levels.includes(level)) return res.status(404).json({ error: 'Unknown board' });
    try {
      const board = await scores.board(game, level);
      const rows = board.map((x, i) => ({
        rank: i + 1,
        name: shownName(x.name, x.email),
        best: Number(x.best),
        plays: Number(x.plays),
        me: x.user_id === req.user.id,
      }));
      res.json({ top: rows.slice(0, 25), me: rows.find((x) => x.me) || null, players: rows.length });
    } catch (err) {
      console.error('leaderboard read failed:', err);
      res.status(503).json({ error: 'Score storage unavailable' });
    }
  });

  // The name shown on leaderboards (the account's display name).
  r.put('/name', async (req, res) => {
    const name = String(req.body?.name ?? '').trim().slice(0, 30);
    try {
      await scores.setName(req.user.id, name);
    } catch (err) {
      console.error('name write failed:', err);
      return res.status(503).json({ error: 'Account service unavailable' });
    }
    req.user.name = name; // the cached session object
    res.json({ name, shownAs: shownName(name, req.user.email) });
  });

  return r;
}

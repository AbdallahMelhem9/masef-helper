import crypto from 'node:crypto';
import { db } from './db.js';

const SCRYPT_KEYLEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), candidate);
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

export function userCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

// Express middleware. Accepts "Authorization: Bearer <token>" or ?token=
// (query form is needed for the PDF <iframe> which can't set headers).
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const row = db
    .prepare('SELECT s.token, u.id AS user_id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?')
    .get(token);
  if (!row) return res.status(401).json({ error: 'Invalid session' });
  req.user = { id: row.user_id, email: row.email, name: row.name };
  next();
}

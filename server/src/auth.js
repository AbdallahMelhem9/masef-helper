import crypto from 'node:crypto';
import { store } from './store.js';

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

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await store.createSession(token, userId);
  return token;
}

// Session lookups hit the (possibly remote) user store on every request, so
// resolved tokens are cached for a few minutes.
const SESSION_TTL_MS = 5 * 60 * 1000;
const sessionCache = new Map();

export function forgetSession(token) {
  sessionCache.delete(token);
}

// After a password reset every session of the account must stop working at once.
export function forgetAllSessions() {
  sessionCache.clear();
}

// Reset links: the emailed token is random; only its SHA-256 is stored.
export function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Wrong-password lockout, per email (checked before the account is looked up,
// so it reveals nothing about which emails have accounts). Kept in memory: a
// restart clears it, which is fine for this app. A successful password reset
// clears the lock.
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map(); // email -> { count, lockedUntil }

// Minutes left on the lock for this email, 0 when it is not locked.
export function lockMinutesLeft(email) {
  const f = failures.get(email);
  if (!f || !f.lockedUntil) return 0;
  const left = f.lockedUntil - Date.now();
  if (left <= 0) {
    failures.delete(email);
    return 0;
  }
  return Math.ceil(left / 60000);
}

export function recordFailure(email) {
  if (failures.size > 10000) failures.clear();
  const f = failures.get(email) || { count: 0, lockedUntil: 0 };
  f.count += 1;
  if (f.count >= MAX_FAILURES) {
    f.count = 0;
    f.lockedUntil = Date.now() + LOCK_MS;
  }
  failures.set(email, f);
}

export function clearFailures(email) {
  failures.delete(email);
}

function tokenOf(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
}

// Express middleware. Accepts "Authorization: Bearer <token>" or ?token=
// (query form is needed for the PDF <iframe> which can't set headers).
export async function requireAuth(req, res, next) {
  const token = tokenOf(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    let hit = sessionCache.get(token);
    if (!hit || hit.expires < Date.now()) {
      const user = await store.sessionUser(token);
      if (!user) return res.status(401).json({ error: 'Invalid session' });
      hit = { user: { id: user.id, email: user.email, name: user.name }, expires: Date.now() + SESSION_TTL_MS };
      sessionCache.set(token, hit);
    }
    req.user = hit.user;
    req.token = token;
    next();
  } catch (err) {
    console.error('auth lookup failed:', err);
    res.status(503).json({ error: 'Account service unavailable, try again shortly' });
  }
}

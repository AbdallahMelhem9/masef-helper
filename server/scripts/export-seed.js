// Exports a sanitized snapshot of the database for deployment seeding:
// full course content and saved chats, but NO user accounts or sessions.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { db, DATA_DIR } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.join(__dirname, '..', 'seed');
fs.mkdirSync(SEED_DIR, { recursive: true });
const seedPath = path.join(SEED_DIR, 'masef-seed.db');

db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
fs.copyFileSync(path.join(DATA_DIR, 'masef.db'), seedPath);

const seed = new DatabaseSync(seedPath);
seed.exec('DELETE FROM sessions; DELETE FROM users; VACUUM;');
const counts = {
  courses: seed.prepare('SELECT COUNT(*) n FROM courses').get().n,
  sections: seed.prepare('SELECT COUNT(*) n FROM sections').get().n,
  messages: seed.prepare('SELECT COUNT(*) n FROM messages').get().n,
  users: seed.prepare('SELECT COUNT(*) n FROM users').get().n,
};
seed.close();
console.log('seed written:', seedPath, JSON.stringify(counts));
if (counts.users !== 0) throw new Error('SANITIZATION FAILED: users still present');

// One-off: wipe all sections/messages (format change) and reset pdf statuses.
import { db } from '../src/db.js';

db.prepare('DELETE FROM messages').run();
db.prepare('DELETE FROM sections').run();
db.prepare("UPDATE pdfs SET status = 'ready'").run();
console.log(
  'wiped. pdfs:',
  db.prepare('SELECT COUNT(*) n FROM pdfs').get().n,
  'sections:',
  db.prepare('SELECT COUNT(*) n FROM sections').get().n
);

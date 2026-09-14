// Inspect Definition 7's block: explanation + chat state.
import { db } from '../src/db.js';

const block = db
  .prepare("SELECT id, title, ai_explanation FROM sections WHERE pdf_id = 1 AND title = 'Definition 7'")
  .get();
console.log('BLOCK', block.id, block.title);
console.log('--- EXPLANATION ---');
console.log(block.ai_explanation);
console.log('--- MESSAGES ---');
for (const m of db.prepare('SELECT id, role, substr(content,1,120) AS c FROM messages WHERE section_id = ? ORDER BY id').all(block.id)) {
  console.log(m.id, m.role, ':', m.c.replace(/\s+/g, ' '));
}

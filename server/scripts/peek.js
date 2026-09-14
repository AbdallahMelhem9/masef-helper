// Dev helper: peek at annotation quality. node scripts/peek.js
import { db } from '../src/db.js';

const rows = db
  .prepare(
    "SELECT title, kind, importance, substr(ai_explanation,1,500) AS expl, substr(proof,1,300) AS prf, tutor_note FROM sections WHERE title IN ('Definition 2','Proposition 1')"
  )
  .all();
console.log(JSON.stringify(rows, null, 1));
console.log(
  'progress:',
  db.prepare('SELECT COUNT(*) n FROM sections').get().n,
  'blocks,',
  db.prepare('SELECT COUNT(*) n FROM sections WHERE ai_explanation IS NOT NULL').get().n,
  'annotated'
);

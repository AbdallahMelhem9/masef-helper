// Finds math KaTeX can't render in the teasers table.
// node scripts/scan-teasers.js
import { db } from '../src/db.js';
import { scanText } from './scan-latex.js';

const FIELDS = ['question', 'hint1', 'hint2', 'answer', 'refresh', 'explanation'];
let n = 0;
for (const t of db.prepare('SELECT * FROM teasers ORDER BY position').all()) {
  const texts = FIELDS.map((f) => [f, t[f]]);
  JSON.parse(t.solutions).forEach((s, i) => texts.push([`solution ${i + 1}`, s.body]));
  JSON.parse(t.followups).forEach((f, i) => texts.push([`followup ${i + 1}`, `${f.question}\n${f.answer}`]));
  for (const [f, text] of texts) {
    if (!text) continue;
    const issues = scanText(text);
    if (issues.length) {
      n++;
      console.log(`${t.slug} / ${f}\n   ${issues.join('\n   ')}`);
    }
  }
}
console.log(`\n${n} fields with problems`);

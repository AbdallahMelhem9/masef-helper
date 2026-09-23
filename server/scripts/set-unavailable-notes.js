// Marks the courses that have no material in the app, with the reason shown
// on their page. Idempotent. Run from server/: node scripts/set-unavailable-notes.js
import { db } from '../src/db.js';

const REASONS = {
  'Term Structures: Interest Rates, Commodities and Other Assets':
    "Delphine Lautier's course PDFs are password-protected. The password is given in class, so the notes can't be added until someone shares it.",
  'Reinforcement Learning':
    'The course material is on PSL Moodle, behind the student login, so it can\'t be fetched automatically. Free reference meanwhile: Sutton & Barto, "Reinforcement Learning: An Introduction" (incompleteideas.net/book/RLbook2020.pdf).',
  'Python/Pytorch Project':
    "This is a project course: there are no lecture notes to add. The project brief and any course code will be added once they're shared.",
  'Modélisation Stochastique de la Courbe de Taux':
    'Substitute notes have been found (S. Henon & G. Turinici, "Modèles de taux", Dauphine) and will be added soon. Ben Tahar publishes no notes of her own.',
  'Microstructure des Marchés Financiers':
    'Fabrice Riva publishes no material online. The slides are only handed out in class.',
};

const set = db.prepare('UPDATE courses SET unavailable_reason = ? WHERE title = ?');
db.prepare('UPDATE courses SET unavailable_reason = NULL').run();
for (const [title, reason] of Object.entries(REASONS)) {
  const n = set.run(reason, title).changes;
  console.log(`${n ? 'set' : 'NOT FOUND'}: ${title}`);
}

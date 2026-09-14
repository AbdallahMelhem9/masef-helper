// Updates optional-course metadata after the materials hunt.
import { db } from '../src/db.js';

const set = db.prepare('UPDATE courses SET description = ?, teacher = COALESCE(NULLIF(?, \'\'), teacher) WHERE title = ?');

set.run(
  "S3 optional (6 ECTS, 21h). Ingested: the teacher's own polycopié (Brugière, 'ML in Finance', 182pp — SVM, regression, Ridge/Lasso, gradient methods). His public folder of past MASEF exams with corrections (2015-2021): https://drive.google.com/embeddedfolderview?id=1PYtqUflS0L-_PnybwFsExFWfQj4uA69w . Reference book (free): ISLP, statlearning.com.",
  '',
  'Machine Learning in Finance'
);
set.run(
  "S3 optional (6 ECTS, 30h). Taught by Julien Claisse & Philippe Bergault. Ingested notes: Bruno Bouchard's classic Dauphine polycopié 'Introduction à l'évaluation d'actifs financiers par absence d'opportunité d'arbitrage' (French, 182pp) — the same course by its previous teacher; swap in the current teachers' material when distributed.",
  '',
  'Valuation of Financial Assets and Arbitrage'
);
set.run(
  "S3 optional (6 ECTS, 21h). Ingested: the teacher's own full slide deck 'Markov Chain Monte Carlo Methods' (Robert, 456 slides — Metropolis-Hastings, Gibbs, diagnostics, adaptive MCMC).",
  '',
  'Computational Statistics and MCMC Methods'
);
set.run(
  "S3 optional (6 ECTS, 28h). Rosenbaum publishes no notes; ingested the canonical free survey of the field: Gould et al., 'Limit Order Books' (Quantitative Finance 2013, 42pp). Swap in course material when distributed.",
  '',
  'Finance haute fréquence'
);
set.run(
  "S4 optional (6 ECTS, 24h). MDPs, bandits, value-based RL, policy gradients. Course materials live on PSL Moodle (login: moodle.psl.eu, course id 27164) — upload them here once you have access. Free reference book: Sutton & Barto, 'Reinforcement Learning: An Introduction', incompleteideas.net/book/RLbook2020.pdf.",
  '',
  'Reinforcement Learning'
);
set.run(
  "S4 optional (6 ECTS, 21h). Lepinette publishes no notes. Free reference: Thierry Roncalli's full 'Financial Risk Management' lecture slides (VaR, Basel, market/credit/counterparty/operational risk): thierry-roncalli.com/download/FRM-Lectures.pdf (use http). Upload the teacher's material when distributed.",
  '',
  'Gestion Globale des Risques : VaR'
);
set.run(
  "S4 optional (6 ECTS, 15h). Canonical models in microstructure and econometric models. No public material (slides circulate on login-walled sites only) — upload the teacher's handouts when distributed.",
  'Fabrice Riva',
  'Microstructure des Marchés Financiers'
);
set.run(
  "S4 optional (6 ECTS, 21h). No public notes by Ben Tahar. Candidate substitute found (Turinici's Dauphine 'Cours de taux d'intérêt' polycopié) but the only copy is on the Internet Archive, which is temporarily offline — will retry. Upload the teacher's material when distributed.",
  '',
  'Modélisation Stochastique de la Courbe de Taux'
);
console.log('metadata updated');

// Creates the user's chosen optional courses (S3 + S4). Idempotent.
import { db } from '../src/db.js';

const COURSES = [
  ['Machine Learning in Finance', 'Pierre Brugière', 'S3 optional (6 ECTS, 21h).'],
  ['Valuation of Financial Assets and Arbitrage', 'Julien Claisse & Philippe Bergault', 'S3 optional (6 ECTS, 30h).'],
  ['Computational Statistics and MCMC Methods', 'Christian P. Robert', 'S3 optional (6 ECTS, 21h). Markov Chain Monte Carlo methods.'],
  ['Finance haute fréquence', 'Mathieu Rosenbaum', 'S3 optional (6 ECTS, 28h).'],
  ['Reinforcement Learning', 'Ana Busic', 'S4 optional (6 ECTS, 24h). MDPs, bandits, value-based RL, policy gradients.'],
  ['Python/Pytorch Project', 'Julien Claisse', 'S4 optional (6 ECTS, 15h). Neural networks for stochastic modeling — project course (report + oral defense), no polycopié expected.'],
  ['Gestion Globale des Risques : VaR', 'Emmanuel Lepinette', 'S4 optional (6 ECTS, 21h).'],
  ['Microstructure des Marchés Financiers', '', 'S4 optional (6 ECTS, 15h). Canonical models in microstructure and econometric models.'],
  ['Modélisation Stochastique de la Courbe de Taux', 'Imen Ben Tahar', 'S4 optional (6 ECTS, 21h).'],
];

for (const [title, teacher, description] of COURSES) {
  const existing = db.prepare('SELECT id FROM courses WHERE title = ?').get(title);
  if (existing) {
    console.log(`exists: ${title} (id ${existing.id})`);
    continue;
  }
  const info = db
    .prepare('INSERT INTO courses (title, description, teacher) VALUES (?, ?, ?)')
    .run(title, description + ' Materials load in as they are found or distributed — add PDFs any time via the lesson pages.', teacher);
  console.log(`created: ${title} (id ${info.lastInsertRowid})`);
}

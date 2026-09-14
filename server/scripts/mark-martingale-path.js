// Re-marks the shortcut path in prérentrée lessons 1-5 as the
// "skip to martingales" path, and pins a road-map tutor note at the top of
// lesson 6 (Martingales in discrete time).
import { db } from '../src/db.js';

const course = db.prepare("SELECT * FROM courses WHERE title = 'Prérentrée de probabilités'").get();
const pdfFor = (pos) =>
  db.prepare('SELECT p.* FROM pdfs p JOIN lessons l ON l.id = p.lesson_id WHERE l.course_id = ? AND l.position = ?').get(course.id, pos);

// Wipe existing marks in lessons 1-5.
for (let pos = 1; pos <= 5; pos++) {
  db.prepare('UPDATE sections SET highlight = 0 WHERE pdf_id = ?').run(pdfFor(pos).id);
}

// Title-based marks (lessons 1-3). Bare prefixes match parenthetical titles.
const TITLES = {
  1: ['Definition 1', 'Definition 2', 'Definition 4', 'Definition 5', 'Definition 6', 'Proposition/Definition 1', 'Theorem 2', 'Theorem 5'],
  2: ['Definition 11', 'Proposition 5', 'Proposition 6', 'Definition 12', 'Proposition 7', 'Proposition 8', 'Definition 13', 'Proposition 9'],
  3: ['Definition 14', 'Proposition 10'],
  // Lesson 4: nothing — the whole lesson is skippable on the road to martingales.
};
for (const [pos, titles] of Object.entries(TITLES)) {
  const pdf = pdfFor(Number(pos));
  let n = 0;
  for (const t of titles) {
    const r = db
      .prepare("UPDATE sections SET highlight = 1 WHERE pdf_id = ? AND (title = ? OR title LIKE ? || ' (%')")
      .run(pdf.id, t, t);
    n += r.changes;
    if (r.changes === 0) console.error(`  not matched in lesson ${pos}: "${t}"`);
  }
  console.log(`lesson ${pos}: ${n} marks`);
}

// Lesson 5: everything except the exercise (ids listed explicitly since
// remarks/text blocks share titles).
const L5_IDS = [78, 79, 80, 81, 82, 83, 84, 86];
for (const id of L5_IDS) db.prepare('UPDATE sections SET highlight = 1 WHERE id = ?').run(id);
console.log(`lesson 5: ${L5_IDS.length} marks`);

// Pin the road-map note at the very top of lesson 6.
const pdf6 = pdfFor(6);
db.prepare("DELETE FROM sections WHERE pdf_id = ? AND title = 'Road to martingales'").run(pdf6.id);
const NOTE = String.raw`You are about to define a **martingale**: an adapted, integrable process \((M_n)\) with \(\mathbb{E}[M_{n+1} \mid \mathcal{F}_n] = M_n\). That single line uses three ingredients, and the convergence theorems use four tools. Here is exactly what you need from lessons 1–5 — turn on the **Shortcut** toggle there to see these highlighted.

**Master properly:**
- *Lesson 1:* Definitions 1, 2, 4 (\(\sigma\)-algebras, generated \(\sigma\)-algebras, measurable maps — a **filtration** \(\mathcal{F}_n = \sigma(X_1, \dots, X_n)\) is an increasing family of these, "information at time \(n\)"); Definitions 5–6 and the "almost every" language; Proposition/Definition 1 (the integral = expectation); the Theorem 2 block (monotone convergence, Fatou, dominated convergence — the engine behind martingale convergence).
- *Lesson 2:* Definition 11 (random variables, expectation), Proposition 5 (transfer), Definition 12 (\(L^p\) — martingales live in \(L^1\), the nicest ones in \(L^2\)), Proposition 7 (**Jensen** — its conditional version makes \(|M_n|\) and \(M_n^2\) submartingales), Proposition 8 (Markov/Chebyshev — behind maximal inequalities), Definition 13 (independence — the random-walk examples), Proposition 9 (Borel–Cantelli).
- *Lesson 3:* only Definition 14 (modes of convergence — the convergence theorems speak "a.s." and "\(L^p\)") and Proposition 10 (their implications).
- *Lesson 5:* **everything** — this is the gateway. Proposition 12 (existence and uniqueness of \(\mathbb{E}[X \mid \mathcal{G}]\)), the \(L^2\)-projection remark (conditional expectation = best prediction given the information), Proposition 13 (linearity, **tower property** — the single most used identity in this chapter —, taking out what is known, conditional Jensen, independence \(\Rightarrow \mathbb{E}[X\mid\mathcal{G}] = \mathbb{E}[X]\)), \(\mathbb{E}[X \mid Y]\) and Proposition 14.

**Statement only:** Theorem 1 / Proposition 2 (monotone class — behind uniqueness arguments), Theorem 5 (Radon–Nikodym — it is what makes \(\mathbb{E}[X\mid\mathcal{G}]\) exist in Proposition 12), Theorems 3–4 (Fubini), Proposition 6 (why \(\mathbb{E}[X\mid Y] = h(Y)\)).

**Skip for now:** Propositions 3–4 and the whole second half of lesson 3 (characteristic functions, Lévy, tightness — that is the CLT toolkit, not the martingale one), and **all of lesson 4**: the LLN/CLT are destinations, not prerequisites. If you want one piece of culture from it, read the *statement* of Theorem 10 (strong LLN) — the martingale convergence theorem you are about to meet is its grand generalization.`;
const base = db.prepare('SELECT COALESCE(MIN(position), 1) AS p FROM sections WHERE pdf_id = ?').get(pdf6.id).p;
db.prepare("INSERT INTO sections (pdf_id, title, kind, content_text, position) VALUES (?, 'Road to martingales', 'tutor_note', ?, ?)").run(
  pdf6.id,
  NOTE,
  base - 1
);
console.log('road-map note pinned at top of lesson 6');

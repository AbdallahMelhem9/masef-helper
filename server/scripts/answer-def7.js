// Removes the duplicate question and inserts the tutor's answer in
// Definition 7's chat (monotone classes).
import { db } from '../src/db.js';

const block = db
  .prepare("SELECT id FROM sections WHERE pdf_id = 1 AND title = 'Definition 7'")
  .get();

// Their retry stored the question twice; keep the first (#29), drop the duplicate.
db.prepare("DELETE FROM messages WHERE section_id = ? AND role = 'user' AND id > (SELECT MIN(id) FROM messages WHERE section_id = ? AND role = 'user')").run(block.id, block.id);

const answer = String.raw`Good challenge — let's clear it up point by point.

**1. "Isn't it *more* demanding, since it's for every \(A \subset B\), not just complements?"** No — because a \(\sigma\)-algebra *also* has this property, automatically, and even for **all** pairs, nested or not: if \(A, B\) belong to a \(\sigma\)-algebra then \(B \setminus A = B \cap A^c\) belongs to it too (complement + intersection, which follows from complements and unions by De Morgan). So:

- every \(\sigma\)-algebra **is** a monotone class;
- but a monotone class asks for *less*: differences only for **nested** pairs, unions only for **increasing** sequences, and — this is the real gap — nothing at all about \(A \cup B\) or \(A \cap B\) for two arbitrary members.

The demandingness of a definition is measured by what it forces, and the monotone class axioms force strictly less.

**2. Examples.**

*\(\sigma\)-algebras:* \(\{\varnothing, E\}\) (trivial); \(\mathcal{P}(E)\) (everything); \(\{\varnothing, A, A^c, E\}\) for one fixed \(A\); the Borel \(\sigma\)-algebra \(\mathcal{B}(\mathbb{R})\).

*A monotone class that is NOT a \(\sigma\)-algebra:* take \(E = \{1,2,3,4\}\) and
\[ \mathcal{M} = \{\varnothing,\ E\} \cup \{\text{all six 2-element subsets}\}. \]
Check the axioms: \(E \in \mathcal{M}\); the only *nested* pairs involve \(\varnothing\) or \(E\), and \(E \setminus \{i,j\}\) is the complementary pair, still in \(\mathcal{M}\); increasing unions are trivial on a finite set. But \(\{1,2\} \cup \{1,3\} = \{1,2,3\} \notin \mathcal{M}\) and \(\{1,2\} \cap \{1,3\} = \{1\} \notin \mathcal{M}\): not a \(\sigma\)-algebra, and — notice — not stable by finite intersections either. That last failure is exactly what Theorem 1 says is the missing ingredient.

*The "living" example (this is what the notion is for):* given two probability measures \(\mu, \nu\), the agreement set \(\mathcal{M} = \{A : \mu(A) = \nu(A)\}\) is always a monotone class, usually not obviously a \(\sigma\)-algebra.

**3. What the second paragraph means.** It explains *why the axioms are chosen exactly this way*: they are precisely the stability properties that an agreement set gets **for free** from the axioms of a (probability) measure:

- *Proper differences:* if \(A \subset B\) with \(\mu(A)=\nu(A)\) and \(\mu(B)=\nu(B)\), then additivity gives \(\mu(B \setminus A) = \mu(B) - \mu(A) = \nu(B) - \nu(A) = \nu(B\setminus A)\). This subtraction needs \(A \subset B\) — that's why the axiom is restricted to nested pairs.
- *Increasing unions:* if \(A_n \uparrow A\) and \(\mu(A_n) = \nu(A_n)\) for all \(n\), continuity from below gives \(\mu(A) = \lim \mu(A_n) = \lim \nu(A_n) = \nu(A)\).

So membership in \(\mathcal{M}\) is *easy to verify* — and then the monotone class lemma (Theorem 1) does the heavy lifting: if \(\mathcal{M}\) also contains a family \(\mathcal{C}\) stable by finite intersections (e.g. the intervals \((-\infty, a]\), since \((-\infty,a] \cap (-\infty,b] = (-\infty, a \wedge b]\)), then \(\mathcal{M} \supset \sigma(\mathcal{C})\). That is exactly how Proposition 2 proves that two probability measures agreeing on all intervals \((-\infty,a]\) are equal on all of \(\mathcal{B}(\mathbb{R})\). If the union axiom allowed *arbitrary* countable unions, a monotone class would already be a \(\sigma\)-algebra, membership would be as hard to check as what you're trying to prove, and the tool would be useless — deliberately weak axioms are the whole trick.`;

const a = db.prepare("INSERT INTO messages (section_id, role, content) VALUES (?, 'assistant', ?)").run(block.id, answer);
console.log(`answer inserted (#${a.lastInsertRowid}); messages now:`, db.prepare('SELECT COUNT(*) n FROM messages WHERE section_id = ?').get(block.id).n);

// Curated short explanations for Forien chapters 1–3 only.
// Run: node scripts/shorten-first-three.js [--apply]
// Originals are backed up before the transactional update. Safe to rerun.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR } from '../src/db.js';

const short = {
  7: String.raw`A sigma-algebra lists the sets we are allowed to measure. It contains the whole space and stays closed when we take complements or countable unions; countable intersections follow too. Its elements are sets of outcomes, not individual outcomes.`,
  8: String.raw`These are the two extremes: \(\{\varnothing,E\}\) distinguishes nothing within the space, while \(\mathcal P(E)\) allows every subset. Every other sigma-algebra on \(E\) lies between them.`,
  9: String.raw`Keep only the sets that belong to every sigma-algebra in the family. Complements and countable unions of these sets still belong to every member, so the intersection satisfies the same rules.`,
  10: String.raw`Start with the sets in \(\mathcal F\), then include everything the sigma-algebra rules force you to include. The result, \(\sigma(\mathcal F)\), is the smallest sigma-algebra containing those starting sets.`,
  11: String.raw`Borel sets are the sets generated from open sets using complements and countable unions. On the real line this includes intervals, closed sets and singletons: the usual sets on which we define probabilities.`,
  12: String.raw`A measurable function turns measurable questions about its output into measurable sets of inputs. To ask whether \(f(x)\in A\), we measure the preimage \(f^{-1}(A)\); no inverse function is needed.`,
  13: String.raw`A measure assigns a nonnegative size to each measurable set. Sizes add for countably many disjoint pieces; infinite size is allowed. We also require \(\mu(\varnothing)=0\), which the printed definition leaves implicit.`,
  14: String.raw`Counting measure counts points; a Dirac mass puts all its weight at one point; Lebesgue measure measures length. The same set can therefore have very different sizes depending on the chosen measure.`,
  15: String.raw`Finite means the whole space has finite mass. Sigma-finite means it can be covered by countably many pieces of finite mass: the real line has infinite length, but the intervals \([-n,n]\) give such a cover.`,
  16: String.raw`“Almost everywhere” allows exceptions inside a measurable set of measure zero. The property need not hold at every point, but those exceptions contribute nothing to an integral.`,
  17: String.raw`Here a monotone class is a family closed under differences of nested sets and increasing countable unions, containing the whole space. These rules are weaker than the sigma-algebra rules and are often easier to check in a proof.`,
  18: String.raw`The generated monotone class is the smallest family containing your starting sets and satisfying the monotone-class rules. To prove a property throughout it, find a monotone class of sets with that property containing all the starting sets.`,
  19: String.raw`If the starting family is closed under finite intersections, its generated monotone class is already its generated sigma-algebra. This lets you extend a result from simple sets to all measurable sets by checking the easier monotone-class rules.`,
  20: String.raw`Every sigma-algebra is a monotone class, so one inclusion is automatic. The theorem's real content is the reverse inclusion: intersection-stability of the starting family makes the weaker closure rules sufficient.`,
  21: String.raw`To show two measures are equal, it is enough to compare them on an intersection-stable generating family. You also need equal finite total mass, or a countable cover by generating sets with finite mass; separate sigma-finiteness alone is insufficient.`,
  22: String.raw`The missing condition is a finite-mass cover made from the generating family itself. For a counterexample, try counting measure and twice counting measure on the real line: they agree on every half-line \((-\infty,a]\), but disagree on singletons.`,
  23: String.raw`Build the integral from simple pieces: an indicator integrates to its set's measure, and a nonnegative simple function integrates to a weighted sum of measures. Approximate a general nonnegative function from below by simple functions; its integral may be infinite.`,
  24: String.raw`For a signed function, integrate its positive and negative parts separately, then subtract. Requiring \(\int |f|\,d\mu<\infty\) keeps both parts finite and avoids an undefined infinity minus infinity.`,
  25: String.raw`To move a limit through an integral, check the hypothesis: nonnegative increasing functions use monotone convergence; an integrable bound uses dominated convergence. With nonnegativity alone, Fatou gives only a lower bound for the integral of the limit inferior.`,
  26: String.raw`The three results form a chain. Monotone convergence applied to increasing tail infima gives Fatou; applying Fatou to \(g+f_n\) and \(g-f_n\) gives the two inequalities needed for dominated convergence.`,
  27: String.raw`An integral depends continuously on a parameter if the integrand does almost everywhere and one integrable function bounds it for all parameter values. Apply dominated convergence along any sequence of parameters approaching the point.`,
  28: String.raw`You can differentiate under the integral when the parameter derivative exists almost everywhere and is bounded by one integrable function. The bound controls difference quotients, allowing dominated convergence to move their limit inside.`,
  29: String.raw`The product sigma-algebra describes measurable questions about pairs \((x,y)\). Start with rectangles \(A\times B\), which ask one measurable question about each coordinate, then generate a sigma-algebra from them.`,
  30: String.raw`Product measure gives a rectangle the product of its side measures, just as area is width times height. Sigma-finiteness guarantees that this rule determines a unique measure on the product sigma-algebra.`,
  31: String.raw`For a nonnegative measurable function on sigma-finite spaces, you may integrate in either order. Both iterated integrals equal the product-space integral, even when their common value is infinite.`,
  32: String.raw`For a function with both signs, first check that the integral of its absolute value is finite. Then Fubini lets you swap the integration order; without that check, cancellation can make the two orders disagree.`,
  33: String.raw`A density reweights a measure: \(\nu(A)=\int_A f\,d\mu\). It cannot give mass to a set that has zero \(\mu\)-mass; this preservation of null sets is called absolute continuity.`,
  34: String.raw`For sigma-finite measures, preserving null sets is enough to guarantee a density. Thus \(\nu\ll\mu\) means \(\nu\) can be obtained by reweighting \(\mu\); the density is unique up to \(\mu\)-null sets.`,
  36: String.raw`Probability is measure theory with total mass one. The space lists possible outcomes, the sigma-algebra lists events, and the probability measure assigns each event a number between zero and one.`,
  37: String.raw`A random variable assigns a value to each outcome; its law records how probability is spread over those values. Expectation is its probability-weighted average, variance measures squared spread around that average, and the distribution function records \(\mathbb P(X\le x)\).`,
  38: String.raw`For questions involving one variable's distribution, its law is enough: the underlying outcomes need not be specified. Joint questions are different—identical marginal laws do not tell you how two variables depend on each other.`,
  39: String.raw`To compute \(\mathbb E[h(X)]\), average \(h\) against the law of \(X\), instead of working on the original outcome space. With a density this is \(\int h(x)f(x)\,dx\); for a discrete law it is a probability-weighted sum.`,
  40: String.raw`\(\sigma(X)\) contains exactly the events whose occurrence can be determined by observing \(X\). It describes the information carried by \(X\), rather than the probabilities of its possible values.`,
  41: String.raw`If observing \(X\) tells you \(Y\) completely, then \(Y\) is a measurable function of \(X\). The proposition makes this precise: \(\sigma(X)\)-measurability of \(Y\) implies \(Y=\psi(X)\) for some measurable \(\psi\).`,
  42: String.raw`The \(L^p\) norm measures average size, penalising large values more strongly as \(p\) increases. Variables equal almost surely count as the same element; \(L^\infty\) instead measures the smallest almost-sure bound.`,
  43: String.raw`Jensen compares a convex function of the average with the average of that function. Hölder bounds the expectation of a product using the two factors' norms; Cauchy–Schwarz is its \(p=q=2\) case.`,
  44: String.raw`On a probability space, a finite higher moment guarantees every lower moment is finite. For \(p\le q\), \(\|X\|_p\le\|X\|_q\): controlling large values more strongly also controls them more weakly.`,
  45: String.raw`On the event \(X\ge a\), the nonnegative quantity \(U(X)\) is at least \(U(a)>0\). Its average must therefore be at least \(U(a)\mathbb P(X\ge a)\); rearranging gives the bound.`,
  46: String.raw`Each bound turns an average into a tail estimate. Markov uses absolute size, Chebyshev uses squared distance from the mean, and Chernoff uses an exponential; choose whichever quantity you can control.`,
  47: String.raw`Independence means joint probabilities factor into individual probabilities. For a family, this must hold for every finite selection of distinct indices; checking pairs alone is weaker. For variables, test every measurable question about their values.`,
  48: String.raw`Independent variables have a product joint law, so expectations of products factor whenever integrable (also for nonnegative factors). Separately, \(\limsup A_n\) means the event that \(A_n\) happens infinitely often—not that it happens eventually every time.`,
  49: String.raw`If the sum of event probabilities is finite, only finitely many occur almost surely; independence is unnecessary. If the sum diverges and the events are independent, infinitely many occur almost surely.`,
  50: String.raw`The second Borel–Cantelli conclusion remains true under the weaker assumption of pairwise independence. The next exercise proves this by controlling the variance of the number of events that have occurred.`,
  51: String.raw`Variance of a sum equals the sum of variances plus covariance terms. Pairwise independence makes those cross terms zero, so the variances add; full joint independence is unnecessary.`,
  52: String.raw`Count occurrences with \(S_n\). Pairwise independence gives \(\operatorname{Var}(S_n)\le m_n\), and Chebyshev makes the probability of seeing fewer than \(m_n/2\) occurrences tend to zero as \(m_n\to\infty\). Use \(S\ge S_n\) to conclude that the total count is infinite almost surely.`,
  55: String.raw`Putting the variables on one probability space lets us compare their values for the same outcome. This is needed for almost-sure, probability and \(L^p\) convergence; convergence in law compares distributions alone.`,
  56: String.raw`Almost-sure convergence follows each outcome's sequence; convergence in probability makes a noticeable error unlikely. \(L^p\) convergence makes the average powered error vanish. Convergence in law asks only that distributions approach one another.`,
  57: String.raw`Two variables may have the same law without being close on individual outcomes. For example, if \(X\) is equally likely to be \(-1\) or \(1\), then \(-X\) has the same law, but \(|X-(-X)|=2\) always.`,
  58: String.raw`Almost-sure or \(L^p\) convergence implies convergence in probability, which implies convergence in law. Reverse directions need extra conditions, such as an integrable bound or a constant limit. In item 7, the \(L^1\) limit is \(X\), not the bound \(Z\).`,
  59: String.raw`The characteristic function \(\phi_X(t)=\mathbb E[e^{itX}]\) encodes the law using complex exponentials. It always exists because \(|e^{itX}|=1\), and it turns convergence of distributions into a pointwise calculation.`,
  60: String.raw`Finite moments let you differentiate the characteristic function under the expectation. At zero, \(\phi_X^{(k)}(0)=i^k\mathbb E[X^k]\), so derivatives recover moments; the absolute-moment assumption justifies the interchange.`,
  61: String.raw`To prove convergence in law to a given \(X\), it is enough to show \(\phi_{X_n}(t)\to\phi_X(t)\) for every real \(t\). Make sure the candidate limit really is a characteristic function; an arbitrary pointwise limit is not enough.`,
  62: String.raw`Convergence in law is equivalent to convergence of distribution functions at every continuity point of the limit's distribution function. Jumps are excluded because mass can approach an atom from either side.`,
  63: String.raw`Tightness means probability mass cannot escape arbitrarily far away. For each allowed error, one bounded interval must contain all but that much probability for every variable in the family.`,
  64: String.raw`A finite family is tight: choose a large enough interval for each variable, then take the largest one. For an infinite family this may fail because the required intervals can grow without bound.`,
  65: String.raw`Convergence in law guarantees tightness. Conversely, tightness guarantees a subsequence that converges in law; it does not force the whole sequence to converge, since different subsequences may have different limits.`,
  66: String.raw`A distribution function accumulates probability from left to right: it must be nondecreasing, right-continuous, and go from zero to one. Conversely, any such function describes a law, which can be realised by applying a generalised inverse to a uniform variable.`,
};

const rows = db.prepare(`SELECT s.* FROM sections s
  JOIN pdfs p ON p.id=s.pdf_id JOIN lessons l ON l.id=p.lesson_id
  JOIN courses c ON c.id=l.course_id
  WHERE c.title='Prérentrée de probabilités' AND c.teacher='Nicolas Forien'
    AND l.position IN (1,2,3) AND s.kind NOT IN ('heading','tutor_note')
  ORDER BY s.id`).all();
assert.deepEqual(rows.map(r => r.id), Object.keys(short).map(Number), 'Unexpected chapter content; no changes applied');
const refreshHeading = '**Refresh (prerequisites).**';
const moreHeading = '**Explaining more.**';
const changes = rows.filter(r => r.ai_explanation !== short[r.id]).map(r => {
  const start = r.ai_explanation?.indexOf(refreshHeading) ?? -1;
  const end = r.ai_explanation?.indexOf(moreHeading, start) ?? -1;
  assert(start >= 0 && end > start, `Missing recap boundaries in ${r.id}`);
  assert(r.extra_explanation?.trim(), `Missing expanded explanation in ${r.id}`);
  assert(short[r.id].split(/\s+/).length <= 85, `Short explanation too long: ${r.id}`);
  return { id: r.id, explanation: short[r.id], refresh: r.ai_explanation.slice(start + refreshHeading.length, end).trim() };
});
if (!process.argv.includes('--apply')) {
  console.log(`Preview: ${changes.length} explanations to shorten; recaps extracted; existing expanded versions retained. Pass --apply to save.`);
} else if (!changes.length) {
  console.log('Already applied; no changes.');
} else {
  const backupDir = path.join(DATA_DIR, 'backups');
  mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `first-three-before-short-${Date.now()}.json`);
  writeFileSync(backup, JSON.stringify(rows, null, 2), { flag: 'wx' });
  const before = db.prepare('SELECT * FROM sections ORDER BY id').all();
  db.exec('BEGIN IMMEDIATE');
  try {
    const update = db.prepare('UPDATE sections SET ai_explanation=?, refresh=? WHERE id=?');
    for (const r of changes) update.run(r.explanation, r.refresh, r.id);
    const after = db.prepare('SELECT * FROM sections ORDER BY id').all();
    const expected = new Map(changes.map(r => [r.id, r]));
    const expectedRows = before.map(r => expected.has(r.id)
      ? { ...r, ai_explanation: expected.get(r.id).explanation, refresh: expected.get(r.id).refresh }
      : r);
    assert.equal(after.length, expectedRows.length, 'Section count changed');
    for (let i = 0; i < after.length; i++) {
      assert(JSON.stringify(after[i]) === JSON.stringify(expectedRows[i]), `Unexpected change in section ${after[i].id}`);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  console.log(`Updated ${changes.length} blocks in chapters 1–3. Original content: ${backup}`);
}

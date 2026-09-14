// Regenerates explanations + tutor notes (and the intro) of the
// "Preliminaries" lesson of Stochastic Calculus for a student who has ONLY
// done chapter 1 of the prérentrée (measure theory basics). Statements,
// proofs and chats are untouched. Idempotent-ish: safe to re-run.
import { db } from '../src/db.js';
import { annotateBlock, lessonIntro } from '../src/ai.js';

const AUDIENCE = `The student has studied ONLY chapter 1 of the probability prérentrée: sigma-algebras, measurable maps, measures, the Lebesgue integral, monotone/dominated convergence, Fubini, Radon-Nikodym. In short: they know what a measure is and how to integrate — nothing more. They have NOT yet studied: the random-variable language (laws, the notation \\(\\mathbb{E}[X]\\), \\(L^p\\) spaces), independence, modes of convergence, conditional expectation, martingales, Gaussian vectors — and no Brownian motion. Whenever this block uses one of those concepts, briefly build it from measure-theoretic ground before using it (e.g. "a random variable is just a measurable map \\(X : (\\Omega, \\mathcal{F}, \\mathbb{P}) \\to \\mathbb{R}\\)", "\\(\\mathbb{E}[X]\\) is nothing but \\(\\int_\\Omega X \\, d\\mathbb{P}\\)", "\\(\\mathbb{E}[X\\mid\\mathcal{G}]\\) is the unique \\(\\mathcal{G}\\)-measurable variable with \\(\\int_G X d\\mathbb{P} = \\int_G \\mathbb{E}[X\\mid\\mathcal{G}] d\\mathbb{P}\\)"). Be gentle and self-contained; slightly longer explanations are fine here.`;

const course = db.prepare("SELECT * FROM courses WHERE title = 'Stochastic Calculus'").get();
const lesson = db.prepare('SELECT * FROM lessons WHERE course_id = ? AND position = 1').get(course.id);
const pdf = db.prepare('SELECT * FROM pdfs WHERE lesson_id = ? ORDER BY position LIMIT 1').get(lesson.id);
const sections = db.prepare('SELECT * FROM sections WHERE pdf_id = ? ORDER BY position').all(pdf.id);
console.log(`Re-annotating "${lesson.title}" (${sections.length} blocks) for measure-theory-only background...`);

// Intro first.
const intro = sections.find((s) => s.kind === 'tutor_note');
if (intro) {
  const overview = sections
    .filter((s) => !['tutor_note', 'text', 'heading'].includes(s.kind))
    .map((s) => `- ${s.title || s.kind}`)
    .join('\n');
  try {
    const text = await lessonIntro({ courseTitle: course.title, lessonTitle: lesson.title, blocksOverview: overview, audience: AUDIENCE });
    db.prepare('UPDATE sections SET content_text = ? WHERE id = ?').run(text, intro.id);
    console.log('intro regenerated');
  } catch (err) {
    console.error('intro failed:', err.message);
  }
}

// Blocks with a small pool.
const targets = sections.filter((s) => !['tutor_note', 'heading'].includes(s.kind));
const queue = [...targets.entries()];
async function worker() {
  while (queue.length > 0) {
    const [i, s] = queue.shift();
    try {
      const ann = await annotateBlock({
        courseTitle: course.title,
        lessonTitle: lesson.title,
        block: { kind: s.kind, title: s.title, statement: s.content_text, proof: s.proof },
        neighbors: targets
          .slice(Math.max(0, i - 2), i)
          .map((b) => `${b.title || b.kind}: ${(b.content_text || '').slice(0, 250)}`)
          .join('\n'),
        audience: AUDIENCE,
      });
      // Keep the proof column untouched; replace explanation + note.
      db.prepare('UPDATE sections SET ai_explanation = ?, tutor_note = ?, importance = COALESCE(?, importance) WHERE id = ?').run(
        ann.explanation || null,
        ann.tutor_note,
        ann.importance,
        s.id
      );
      console.log(`re-annotated ${s.title || s.kind}`);
    } catch (err) {
      console.error(`FAILED ${s.title || s.kind}: ${err.message}`);
    }
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log('REANNOTATION DONE.');

// Regenerates the "Before we start" intros of Stochastic Calculus lessons 1-2
// for a student with NO measure theory (matching the deep-dive layer's level).
import { db } from '../src/db.js';
import { lessonIntro } from '../src/ai.js';

const AUDIENCE = `The student knows calculus, linear algebra and coin-flip probability, and has NOT internalized measure theory at all — do not say "the measure theory you already know", do not lean on measurable maps, Lebesgue integrals, null sets or Radon-Nikodym as familiar objects. Where such an object is unavoidable, introduce it as an intuition in one clause (Ω = the set of all possible histories of the world; P = how likelihood-weight is spread over them; a random variable = a quantity whose value is determined by which history occurs; E[X] = the weighted average over histories; a σ-algebra = the collection of yes/no questions answerable with the information available). Reassure the student that the violet "Deep dive" panels below build every such object from scratch exactly where it is needed. Keep the road-map function of the intro (what story the chapter tells and why it matters for finance), stay mathematically honest, warm, and concrete.`;

const course = db.prepare("SELECT * FROM courses WHERE title = 'Stochastic Calculus'").get();
for (const pos of [1, 2]) {
  const lesson = db.prepare('SELECT * FROM lessons WHERE course_id = ? AND position = ?').get(course.id, pos);
  const pdf = db.prepare('SELECT * FROM pdfs WHERE lesson_id = ? ORDER BY position LIMIT 1').get(lesson.id);
  const intro = db.prepare("SELECT * FROM sections WHERE pdf_id = ? AND kind = 'tutor_note' ORDER BY position LIMIT 1").get(pdf.id);
  if (!intro) { console.log(`no intro for "${lesson.title}"`); continue; }
  const overview = db
    .prepare("SELECT title, kind FROM sections WHERE pdf_id = ? AND kind NOT IN ('tutor_note', 'text', 'heading') ORDER BY position")
    .all(pdf.id)
    .map((b) => `- ${b.title || b.kind}`)
    .join('\n');
  try {
    const text = await lessonIntro({ courseTitle: course.title, lessonTitle: lesson.title, blocksOverview: overview, audience: AUDIENCE });
    db.prepare('UPDATE sections SET content_text = ? WHERE id = ?').run(text, intro.id);
    console.log(`intro re-leveled: "${lesson.title}"`);
  } catch (err) {
    console.error(`"${lesson.title}" FAILED: ${err.message}`);
  }
}
console.log('INTROS DONE');

// Ingests substitute notes for two optional S4 courses whose teachers publish
// nothing online:
//  - VaR (Lepinette): Part 2 "Market Risk" of Thierry Roncalli's Financial
//    Risk Management lecture slides (slides 60-172 of 1695; the deck's slide
//    numbers are its PDF page numbers).
//  - Courbe de taux (Ben Tahar): S. Henon & G. Turinici's Dauphine polycopié
//    "Modèles de taux" (2019/20, 74pp; Wayback Machine copy, PDF page =
//    printed page + 1).
// One lesson per chapter, decomposed in page windows, intro written from the
// whole chapter. Idempotent: skips lessons that already have blocks.
// Run from server/: node scripts/ingest-var-courbe.js
import { db } from '../src/db.js';
import { ingestChapter } from '../src/ingest.js';
import { lessonIntro } from '../src/ai.js';

const COURSES = [
  {
    title: 'Gestion Globale des Risques : VaR',
    notesAuthor: 'Thierry Roncalli',
    filename: 'var-roncalli.pdf',
    description:
      "S4 optional (6 ECTS, 21h). Lepinette publishes no notes. Ingested substitute: Part 2 'Market Risk' of Thierry Roncalli's 'Financial Risk Management' lecture slides (Paris-Saclay, 2023-24): Basel capital requirements, VaR and expected shortfall estimation (historical, analytical, Monte Carlo), options, risk allocation. The full 1695-slide deck (credit, counterparty, operational, liquidity risk, copulas/EVT...) is at thierry-roncalli.com/download/FRM-Lectures.pdf. Upload the teacher's material when distributed.",
    chapters: [
      { number: 1, title: 'Market risk: capital requirements (Basel I to III)', windows: [[58, 72], [73, 86], [87, 100]] },
      { number: 2, title: 'Statistical estimation of risk measures (VaR, ES)', windows: [[101, 115], [116, 132], [133, 145], [146, 158]] },
      { number: 3, title: 'Risk allocation', windows: [[159, 172]] },
    ],
  },
  {
    title: 'Modélisation Stochastique de la Courbe de Taux',
    notesAuthor: 'S. Henon & G. Turinici',
    filename: 'courbe-turinici.pdf',
    description:
      "S4 optional (6 ECTS, 21h). No public notes by Ben Tahar. Ingested substitute: S. Henon & G. Turinici's Dauphine polycopié 'Modèles de taux' (Master ISF, 2019/20, French, 74pp): zero-coupons, short-rate models (Vasicek, CIR), HJM, caps/swaptions and change of numéraire, LGM, BGM/LMM, SABR, Heston. Recovered from the Internet Archive copy of Turinici's page. Upload the teacher's material when distributed.",
    chapters: [
      { number: 1, title: 'Quelques rappels de calcul stochastique', windows: [[5, 10]] },
      { number: 2, title: 'Généralités sur les modèles de taux', windows: [[11, 17], [18, 24]] },
      { number: 3, title: 'Produits de taux classiques', windows: [[25, 33], [34, 42]] },
      { number: 4, title: 'Le modèle LGM', windows: [[43, 51]] },
      { number: 5, title: 'Le modèle BGM', windows: [[52, 59]] },
      { number: 6, title: 'Modèle SABR', windows: [[60, 65]] },
      { number: 7, title: "Modèle d'Heston", windows: [[66, 73]] },
    ],
  },
];

for (const c of COURSES) {
  const course = db.prepare('SELECT * FROM courses WHERE title = ?').get(c.title);
  if (!course) {
    console.error(`course not found: ${c.title}`);
    continue;
  }
  db.prepare('UPDATE courses SET description = ? WHERE id = ?').run(c.description, course.id);

  for (const ch of c.chapters) {
    let lesson = db.prepare('SELECT * FROM lessons WHERE course_id = ? AND position = ?').get(course.id, ch.number);
    if (!lesson) {
      const li = db.prepare('INSERT INTO lessons (course_id, title, position) VALUES (?, ?, ?)').run(course.id, ch.title, ch.number);
      lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(li.lastInsertRowid);
    }
    let pdfRow = db.prepare('SELECT * FROM pdfs WHERE lesson_id = ? ORDER BY position LIMIT 1').get(lesson.id);
    if (!pdfRow) {
      const pi = db
        .prepare("INSERT INTO pdfs (lesson_id, title, teacher, filename, position, status) VALUES (?, ?, ?, ?, 1, 'processing')")
        .run(lesson.id, ch.title, c.notesAuthor, c.filename);
      pdfRow = db.prepare('SELECT * FROM pdfs WHERE id = ?').get(pi.lastInsertRowid);
    }
    const existing = db.prepare('SELECT COUNT(*) n FROM sections WHERE pdf_id = ?').get(pdfRow.id).n;
    if (existing > 0) {
      console.log(`[${ch.title}] already has ${existing} blocks — skipping.`);
      continue;
    }

    try {
      for (const [start, end] of ch.windows) {
        await ingestChapter({
          pdfRowId: pdfRow.id,
          chapter: { number: ch.number, title: ch.title, page_start: start, page_end: end, windowNote: `pages ${start}-${end}` },
          withAnnotations: true,
          withIntro: false,
        });
      }
      const blocks = db
        .prepare("SELECT kind, title FROM sections WHERE pdf_id = ? AND kind NOT IN ('text', 'tutor_note') ORDER BY position")
        .all(pdfRow.id);
      const overview = blocks.map((b) => `- ${b.title || b.kind}`).join('\n');
      console.log(`[${ch.title}] writing intro from ${blocks.length} statements...`);
      const intro = await lessonIntro({ courseTitle: course.title, lessonTitle: ch.title, blocksOverview: overview });
      db.prepare("INSERT INTO sections (pdf_id, title, kind, content_text, position) VALUES (?, 'Before we start', 'tutor_note', ?, 1)").run(
        pdfRow.id,
        intro
      );
      console.log(`[${ch.title}] done.`);
    } catch (err) {
      console.error(`[${ch.title}] failed: ${err.message}`);
    }
  }
  console.log(`[${c.title}] course done.`);
}
console.log('VAR + COURBE INGEST DONE.');

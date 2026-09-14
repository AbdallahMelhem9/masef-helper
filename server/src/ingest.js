import path from 'node:path';
import { db, UPLOADS_DIR } from './db.js';
import { runClaude, parseJsonLoose, annotateBlock, lessonIntro } from './ai.js';

// Decomposes a chapter of a teacher's PDF into statement-level blocks
// (definitions, propositions, examples, prose...), then annotates each block:
// a brief explanation, a proof with importance tag for provable statements,
// and sparse tutor notes. A lecture-style intro opens the lesson.

const READER_SYSTEM = `You are a meticulous assistant digitizing a mathematics course PDF. You follow output format instructions exactly. When asked for JSON you output ONLY raw JSON — no markdown fences, no commentary.`;

const KINDS = ['definition', 'proposition', 'theorem', 'lemma', 'corollary', 'example', 'exercise', 'remark', 'heading', 'text'];

// Chapter-level outline of the whole document (titles + page ranges).
export async function getChapterOutline(absPath) {
  const prompt = `Read the PDF at "${absPath}" (use the Read tool; read in chunks of at most 20 pages until you have seen every page).

It is a university mathematics course document with numbered top-level chapters/sections. Return JSON:

{"chapters": [{"number": 1, "title": "...", "page_start": 1, "page_end": 4}]}

- One entry per top-level numbered chapter, in order, with the document's own title (without the number).
- page_start/page_end = the PDF pages the chapter spans (inclusive; a page shared with the next chapter belongs to both).
- Output ONLY the raw JSON.`;
  const out = await runClaude(prompt, { system: READER_SYSTEM, allowedTools: ['Read'], maxTurns: 20, cwd: UPLOADS_DIR });
  const parsed = parseJsonLoose(out);
  if (!Array.isArray(parsed.chapters) || parsed.chapters.length === 0) throw new Error('Chapter outline came back empty');
  return parsed.chapters;
}

// Split one chapter into statement-level blocks, faithfully transcribed.
async function decomposeChapter(absPath, { chapterNumber, chapterTitle, pageStart, pageEnd, windowNote }) {
  const scope = windowNote
    ? `Extract ALL content on these pages (${windowNote} of chapter ${chapterNumber}, "${chapterTitle}" — it is fine to start or stop mid-chapter).`
    : `Extract ONLY the content of chapter ${chapterNumber} ("${chapterTitle}") — start at its heading, stop where the next chapter's heading begins.`;
  const prompt = `Read pages ${pageStart}-${pageEnd} of the PDF at "${absPath}" (use the Read tool with the pages parameter).

${scope}

Decompose it into an ordered list of blocks. Each numbered statement is its own block: every Definition, Proposition, Theorem, Lemma, Corollary, Example, Exercise, Remark. Prose between statements becomes "text" blocks (attach a short lead-in sentence that only introduces the next statement to that statement's block instead of making a tiny text block). Subsection headings become "heading" blocks.

Output the blocks in this EXACT line-based format (NOT JSON), one after another:

===BLOCK===
KIND: definition
TITLE: Definition 1
STATEMENT:
faithful transcription in Markdown, as many lines as needed
PROOF:
the document's own printed proof if there is one, otherwise leave empty

Rules:
- KIND: one of ${KINDS.join(', ')}.
- TITLE: the statement's own label from the document, including any parenthetical name ("Theorem 1 (Monotone class lemma)"). For text blocks leave it empty. For headings put the heading text.
- STATEMENT: faithful, complete transcription in Markdown. Do NOT include the label itself. Keep the original language and wording — transcribe, don't summarize. All math in LaTeX: inline \\( ... \\), display \\[ ... \\]. Never use $ delimiters. Preserve italics/bold and bullet lists. For heading blocks leave it empty.
- PROOF: only the document's own printed proof (without the leading "Proof." and trailing box); leave empty otherwise. A proof belongs to its statement's block, never to a separate text block.
- Never begin a content line with "===BLOCK===", "KIND:", "TITLE:", "STATEMENT:" or "PROOF:".
- Skip page headers, footers, page numbers. Cover everything in scope — no content may be dropped.
- Output ONLY blocks in this format, no preamble, no trailing commentary.`;

  const out = await runClaude(prompt, { system: READER_SYSTEM, allowedTools: ['Read'], maxTurns: 16, cwd: UPLOADS_DIR });
  const blocks = parseBlocksOutput(out);
  if (blocks.length === 0) throw new Error('Chapter decomposition came back empty');
  return blocks;
}

// Exported for tests.
export function parseBlocksOutput(out) {
  const blocks = [];
  for (const chunk of out.split(/^===BLOCK===\s*$/m)) {
    const kindMatch = chunk.match(/^KIND:\s*(\S+)\s*$/m);
    if (!kindMatch) continue;
    const kind = kindMatch[1].toLowerCase();
    if (!KINDS.includes(kind)) continue;
    const titleMatch = chunk.match(/^TITLE:[^\S\n]*(.*)$/m);
    const proofSplit = chunk.split(/^PROOF:\s*$/m);
    const stmtMatch = proofSplit[0].match(/^STATEMENT:\s*\n?([\s\S]*)$/m);
    const statement = (stmtMatch?.[1] || '').trim();
    const proof = (proofSplit[1] || '').trim();
    if (!statement && kind !== 'heading') continue;
    blocks.push({
      kind,
      title: (titleMatch?.[1] || '').trim(),
      statement,
      proof: proof || null,
    });
  }
  return blocks;
}

async function withPool(items, size, worker) {
  const queue = [...items.entries()];
  const runners = Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length > 0) {
      const [index, item] = queue.shift();
      await worker(item, index);
    }
  });
  await Promise.all(runners);
}

// Ingest one chapter into one pdf row: blocks first (fast), then intro +
// annotations streaming in.
export async function ingestChapter({ pdfRowId, chapter, withAnnotations = true, withIntro = true }) {
  const pdf = db.prepare('SELECT * FROM pdfs WHERE id = ?').get(pdfRowId);
  if (!pdf) throw new Error(`PDF row ${pdfRowId} not found`);
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(pdf.lesson_id);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(lesson.course_id);
  const absPath = path.join(UPLOADS_DIR, pdf.filename);
  const tag = `[ingest] ${lesson.title}`;

  db.prepare("UPDATE pdfs SET status = 'processing' WHERE id = ?").run(pdfRowId);
  try {
    console.log(`${tag}: decomposing pages ${chapter.page_start}-${chapter.page_end}...`);
    const blocks = await decomposeChapter(absPath, {
      chapterNumber: chapter.number,
      chapterTitle: chapter.title,
      pageStart: chapter.page_start,
      pageEnd: chapter.page_end,
      windowNote: chapter.windowNote,
    });
    console.log(`${tag}: ${blocks.length} blocks.`);

    // Tutor intro placeholder first (unless this is a continuation window),
    // real blocks after it. Positions continue from whatever is already there.
    const base = db.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM sections WHERE pdf_id = ?').get(pdfRowId).p;
    let introInfo = null;
    if (withIntro) {
      introInfo = db
        .prepare("INSERT INTO sections (pdf_id, title, kind, content_text, position) VALUES (?, 'Before we start', 'tutor_note', '', ?)")
        .run(pdfRowId, base + 1);
    }
    const rowIds = [];
    blocks.forEach((b, i) => {
      const info = db
        .prepare('INSERT INTO sections (pdf_id, title, kind, content_text, proof, position) VALUES (?, ?, ?, ?, ?, ?)')
        .run(pdfRowId, b.title || '', b.kind, b.statement || '', b.proof || null, base + i + 2);
      rowIds.push(info.lastInsertRowid);
    });

    if (withAnnotations) {
      const overview = blocks
        .filter((b) => b.kind !== 'text')
        .map((b) => `- ${b.title || b.kind}${b.kind === 'heading' ? ` (subsection: ${b.title})` : ''}`)
        .join('\n');
      if (introInfo) {
        try {
          console.log(`${tag}: writing intro...`);
          const intro = await lessonIntro({ courseTitle: course.title, lessonTitle: lesson.title, blocksOverview: overview });
          db.prepare('UPDATE sections SET content_text = ? WHERE id = ?').run(intro, introInfo.lastInsertRowid);
        } catch (err) {
          console.error(`${tag}: intro failed (${err.message})`);
          db.prepare('DELETE FROM sections WHERE id = ?').run(introInfo.lastInsertRowid);
        }
      }

      const annotatable = blocks
        .map((b, i) => ({ block: b, rowId: rowIds[i], index: i }))
        .filter(({ block }) => !['heading', 'tutor_note'].includes(block.kind));

      await withPool(annotatable, 3, async ({ block, rowId, index }) => {
        try {
          const neighbors = blocks
            .slice(Math.max(0, index - 2), index)
            .filter((b) => b.kind !== 'heading')
            .map((b) => `${b.title || b.kind}: ${b.statement.slice(0, 300)}`)
            .join('\n');
          const ann = await annotateBlock({
            courseTitle: course.title,
            lessonTitle: lesson.title,
            block: { kind: block.kind, title: block.title, statement: block.statement, proof: block.proof || null },
            neighbors,
          });
          db.prepare('UPDATE sections SET ai_explanation = ?, proof = ?, importance = ?, tutor_note = ? WHERE id = ?').run(
            ann.explanation || null,
            ann.proof,
            ann.importance,
            ann.tutor_note,
            rowId
          );
          console.log(`${tag}: annotated ${block.title || block.kind}.`);
        } catch (err) {
          console.error(`${tag}: annotation of "${block.title || block.kind}" failed: ${err.message}`);
        }
      });
    }

    db.prepare("UPDATE pdfs SET status = 'ready' WHERE id = ?").run(pdfRowId);
    console.log(`${tag}: ready.`);
  } catch (err) {
    db.prepare("UPDATE pdfs SET status = 'failed' WHERE id = ?").run(pdfRowId);
    console.error(`${tag}: FAILED — ${err.message}`);
    throw err;
  }
}

// Single uploaded PDF (via the UI): treat the whole file as one chapter.
export async function ingestPdf(pdfId, { withAnnotations = true } = {}) {
  const pdf = db.prepare('SELECT * FROM pdfs WHERE id = ?').get(pdfId);
  if (!pdf) throw new Error(`PDF ${pdfId} not found`);
  const absPath = path.join(UPLOADS_DIR, pdf.filename);
  const chapters = await getChapterOutline(absPath);
  // Whole file under one pdf row: merge all chapters into one span per chapter
  // run, sequentially, appending blocks.
  for (const chapter of chapters) {
    await ingestChapter({ pdfRowId: pdfId, chapter, withAnnotations });
  }
}

import { query } from '@anthropic-ai/claude-agent-sdk';

// Uses the local Claude Code subscription login (the `claude` CLI must be
// installed and logged in). No API key required.

const TUTOR_SYSTEM = `You are a patient, rigorous mathematics tutor for a student starting the MASEF master's program (Master in Mathematics Applied to Finance) at Université Paris-Dauphine. The student has no background in stochastic calculus yet and is reviewing prerequisite material (probability theory first).

Rules:
- Explain intuitively FIRST, then formally. Assume a smart student who is new to the topic.
- Use LaTeX for all math: inline math in \\( ... \\) and display math in \\[ ... \\]. Never use $ delimiters.
- Use Markdown structure (short paragraphs, bullet points, bold key terms).
- Concrete examples beat abstraction.
- Answer in the language the student writes in (default: English).
- Be honest when a question goes beyond the provided material, and answer it anyway with clearly-marked outside context.`;

const TRANSIENT = /overloaded|529|rate.?limit|429|5\d\d|ENOTFOUND|ETIMEDOUT|ECONNRESET|fetch failed|Can't reach the API/i;

async function runClaudeOnce(prompt, { system, allowedTools = [], maxTurns = 1, cwd, model } = {}) {
  const q = query({
    prompt,
    options: {
      ...(system ? { systemPrompt: system } : {}),
      allowedTools,
      ...(allowedTools.length > 0 ? { permissionMode: 'bypassPermissions' } : {}),
      maxTurns,
      settingSources: [],
      ...(cwd ? { cwd } : {}),
      ...(model ? { model } : {}),
    },
  });

  for await (const message of q) {
    if (message.type === 'result') {
      if (message.subtype === 'success') {
        // The CLI sometimes reports API failures as a "successful" result
        // whose text is the error message — treat those as failures so the
        // retry logic sees them.
        if (/^\s*API Error:/i.test(message.result || '')) {
          throw new Error(message.result.trim());
        }
        return message.result;
      }
      const detail = message.result ? `: ${message.result}` : '';
      throw new Error(`Claude query failed: ${message.subtype}${detail}`);
    }
  }
  throw new Error('Claude query produced no result');
}

// Retries transient failures (Anthropic 529 Overloaded, rate limits, network
// blips) with backoff before giving up.
export async function runClaude(prompt, opts = {}) {
  const delays = [2000, 8000, 20000];
  for (let attempt = 0; ; attempt++) {
    // Anthropic incidents are often model-specific (usually Opus-tier): after
    // one failed attempt on the default model, fall back to Sonnet.
    const fallback = attempt >= 1 && !opts.model;
    try {
      return await runClaudeOnce(prompt, fallback ? { ...opts, model: 'claude-sonnet-5' } : opts);
    } catch (err) {
      const transient = TRANSIENT.test(err.message || '');
      if (!transient || attempt >= delays.length) throw err;
      console.warn(`runClaude transient error (attempt ${attempt + 1}${fallback ? ', sonnet fallback' : ''}): ${err.message} — retrying in ${delays[attempt] / 1000}s`);
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}

export function parseJsonLoose(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON found in Claude output: ${text.slice(0, 200)}`);
  const raw = text.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch (err) {
    // LaTeX-heavy output sometimes carries illegal JSON escapes (a lone
    // backslash before "(" etc.). Repair by doubling only the trailing
    // unpaired backslash of a run when it starts an invalid escape —
    // an even-length run is fully paired and must stay untouched.
    const repaired = raw.replace(/(\\+)(.)/gs, (m, slashes, ch) => {
      if (slashes.length % 2 === 0) return m;
      if ('"\\/bfnrtu'.includes(ch)) return m;
      return slashes + '\\' + ch;
    });
    return JSON.parse(repaired);
  }
}

const PROVABLE = new Set(['proposition', 'theorem', 'lemma', 'corollary']);

// One statement block (definition, proposition, example...) → its annotation:
// a brief explanation, a proof with an importance tag for provable statements,
// and an optional tutor note (clearly-marked personal addition).
export async function annotateBlock({ courseTitle, lessonTitle, block, neighbors, audience }) {
  const provable = PROVABLE.has(block.kind);
  const hasOwnProof = provable && !!block.proof;
  const kindGuidance = {
    definition:
      'Explain briefly and clearly: what the definition says in plain words, the intuition behind it, and — when the defined object requires justification (e.g. it is built as an intersection, a supremum, "the smallest such...") — why it is well defined / why it exists. If the definition has a design choice worth noticing (e.g. countable rather than finite), point it out in one or two sentences.',
    proposition: 'Explain briefly what the statement means and when it is used. Then give a clean proof at the level of this course.',
    theorem: 'Explain briefly what the theorem says, why it matters in this course, and how to think about it. Then give a proof at the level of this course (or a faithful sketch if the full proof is genuinely beyond these notes — say so if so).',
    lemma: 'Explain briefly what the lemma says and what it is for. Then give a clean proof at the level of this course.',
    corollary: 'Explain briefly how it follows and why it is useful. Then give the (short) derivation.',
    example: 'Walk through the example briefly: what it illustrates and why it works. Verify any claim it makes.',
    exercise: 'Give a hint first, then a concise solution sketch. Do not spoil more than needed for a student who wants to try it first.',
    remark: 'One or two sentences unpacking why this remark is worth making.',
    text: 'If this passage needs any clarification, give it in at most three sentences; otherwise return an empty explanation.',
  }[block.kind] || 'Explain briefly and clearly.';

  const prompt = `Course: ${courseTitle}
Lesson: ${lessonTitle}
${neighbors ? `\nFor context, the statements just before this one:\n${neighbors}\n` : ''}
The block to annotate — ${block.kind}${block.title ? ` (${block.title})` : ''}:

--- BLOCK START ---
${block.statement}
--- BLOCK END ---
${hasOwnProof ? `\nThe document gives its own proof (it will be shown to the student as-is, do NOT rewrite it):\n--- DOCUMENT PROOF ---\n${block.proof}\n--- END PROOF ---\n` : ''}
${kindGuidance}
${audience ? `\nAUDIENCE (overrides your default assumptions about the student): ${audience}\n` : ''}
BE BRIEF: the explanation should be a few sentences to a short paragraph or two — this sits directly under the statement on the page. No headings inside the explanation, no restating the statement.

Additionally, you may include a SHORT tutor note ONLY if you have something genuinely additional to say beyond explaining: a connection to mathematical finance / what comes later in MASEF, essential outside context, or a typo you spotted in the notes. Most blocks should NOT have one — use it sparingly, at most one in three blocks.

Return ONLY raw JSON (no fences):
{"explanation": "markdown", ${provable ? `${hasOwnProof ? '' : '"proof": "markdown proof", '}"importance": "imp" | "half imp" | "not imp",` : ''} "tutor_note": "markdown or null"}
${provable ? '\nThe importance tag rates how important it is for the student to KNOW THIS PROOF (not the statement): "imp" = classic proof technique worth mastering, "half imp" = worth reading once, "not imp" = safe to skip the proof.' : ''}`;

  const out = await runClaude(prompt, { system: TUTOR_SYSTEM });
  const parsed = parseJsonLoose(out);
  return {
    explanation: parsed.explanation || '',
    proof: provable ? (hasOwnProof ? block.proof : parsed.proof || null) : null,
    importance: provable ? parsed.importance || null : null,
    tutor_note: parsed.tutor_note || null,
  };
}

// Regenerate only the explanation, optionally steered by the student's
// instructions ("shorter", "more examples", "en français"...).
export async function reExplainBlock({ courseTitle, lessonTitle, block, currentExplanation, instructions }) {
  const prompt = `Course: ${courseTitle}
Lesson: ${lessonTitle}

The block — ${block.kind}${block.title ? ` (${block.title})` : ''}:

--- BLOCK START ---
${block.statement}
--- BLOCK END ---
${currentExplanation ? `\n--- CURRENT EXPLANATION (to be replaced) ---\n${currentExplanation}\n` : ''}
Write a new explanation of this block to sit directly under it on the page. Brief but clear: a few sentences to a short paragraph or two, no headings, no restating the statement.
${instructions ? `\nTHE STUDENT'S INSTRUCTIONS for this rewrite (follow them): ${instructions}` : ''}
Output ONLY the new explanation in Markdown.`;
  return runClaude(prompt, { system: TUTOR_SYSTEM });
}

// A short lecture-style intro for a lesson, shown as the tutor's own note at
// the top of the page.
export async function lessonIntro({ courseTitle, lessonTitle, blocksOverview, audience }) {
  const prompt = `Course: ${courseTitle}
Lesson: ${lessonTitle}

Here are the statements this lesson covers, in order:
${blocksOverview}
${audience ? `\nAUDIENCE (overrides your default assumptions about the student): ${audience}\n` : ''}
Write a short lecture-style introduction for this lesson (2-4 paragraphs max): why this topic exists, the story connecting the statements above, and where it leads in mathematical finance / the MASEF program. Speak directly to the student. No headings, no bullet-point dump — a warm, precise opening like a great teacher's first five minutes. Output ONLY the intro in Markdown.`;
  return runClaude(prompt, { system: TUTOR_SYSTEM });
}

export async function answerQuestion({ courseTitle, pdfTitle, sectionTitle, contentText, aiExplanation, proof, extraExplanation, extraExample, history, question }) {
  const historyText = history
    .map((m) => `${m.role === 'user' ? 'STUDENT' : 'TUTOR'}: ${m.content}`)
    .join('\n\n');

  const prompt = `Course: ${courseTitle}
Lesson: ${pdfTitle}
Block: ${sectionTitle || '(untitled passage)'}

The student is reading this block of the teacher's notes and asked a question about it in the block's chat.

--- BLOCK CONTENT ---
${contentText}
${proof ? `\n--- PROOF SHOWN TO THE STUDENT ---\n${proof}\n` : ''}${aiExplanation ? `\n--- YOUR EXPLANATION SHOWN TO THE STUDENT ---\n${aiExplanation}\n` : ''}${extraExplanation ? `\n--- YOUR "DEEP DIVE" PANEL SHOWN TO THE STUDENT (intuition, no measure theory assumed) ---\n${extraExplanation}\n` : ''}${extraExample ? `\n--- YOUR "WORKED EXAMPLE" PANEL SHOWN TO THE STUDENT ---\n${extraExample}\n` : ''}
${historyText ? `--- CHAT HISTORY SO FAR ---\n${historyText}\n` : ''}
--- STUDENT'S NEW QUESTION ---
${question}

Answer the question directly, grounded in this block. Keep it focused — this is a small chat under one statement, not a full lecture.`;
  return runClaude(prompt, { system: TUTOR_SYSTEM });
}

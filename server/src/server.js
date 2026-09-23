import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, UPLOADS_DIR } from './db.js';
import { hashPassword, verifyPassword, createSession, forgetSession, requireAuth } from './auth.js';
import { store } from './store.js';
import { annotateBlock, reExplainBlock, answerQuestion, ANSWER_LENGTHS } from './ai.js';
import { ingestPdf } from './ingest.js';
import { GLOSSARY } from './glossary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
// On hosted deploys there is no Claude subscription login — AI endpoints are
// disabled and the app serves the saved content read-only.
const AI_ENABLED = !process.env.AI_DISABLED;
const AI_OFF_MSG = 'The AI tutor only runs on the local install (it uses the local Claude subscription). Saved answers remain readable here.';

const app = express();
// 25mb: handwritten ink documents can be large.
app.use(express.json({ limit: '25mb' }));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.-]+/g, '_');
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// ---------- Auth ----------
// Anyone can create an account; each account has its own notes and ink.
const cleanEmail = (email) => String(email || '').toLowerCase().trim();

app.post('/api/auth/signup', async (req, res) => {
  const { password, name } = req.body || {};
  const email = cleanEmail(req.body?.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    if (await store.findUserByEmail(email)) {
      return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
    }
    const user = await store.createUser(email, hashPassword(password), String(name || '').trim());
    const token = await createSession(user.id);
    res.json({ token, email: user.email, name: user.name, created: true });
  } catch (err) {
    console.error('signup failed:', err);
    res.status(503).json({ error: 'Account service unavailable, try again shortly' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { password } = req.body || {};
  const email = cleanEmail(req.body?.email);
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const user = await store.findUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = await createSession(user.id);
    res.json({ token, email: user.email, name: user.name, created: false });
  } catch (err) {
    console.error('login failed:', err);
    res.status(503).json({ error: 'Account service unavailable, try again shortly' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ ...req.user, firstRun: false });
});

// Tells the login page whether any account exists yet (it then opens on
// "Create account"), and whether the AI tutor runs on this server.
app.get('/api/auth/status', async (_req, res) => {
  let firstRun = false;
  try {
    firstRun = (await store.userCount()) === 0;
  } catch {
    /* store unreachable — the login form reports it on submit */
  }
  res.json({ firstRun, aiEnabled: AI_ENABLED });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  forgetSession(req.token);
  await store.deleteSession(req.token).catch(() => {});
  res.json({ ok: true });
});

// ---------- Glossary (hover definitions) ----------
app.get('/api/glossary', requireAuth, (_req, res) => {
  res.json(GLOSSARY);
});

// ---------- Courses / lessons / pdfs ----------
app.get('/api/courses', requireAuth, (_req, res) => {
  const courses = db.prepare('SELECT * FROM courses ORDER BY position, id').all();
  const counts = db.prepare('SELECT course_id, COUNT(*) AS n FROM lessons GROUP BY course_id').all();
  const byId = Object.fromEntries(counts.map((c) => [c.course_id, c.n]));
  res.json(courses.map((c) => ({ ...c, lessonCount: byId[c.id] || 0 })));
});

app.post('/api/courses', requireAuth, (req, res) => {
  const { title, description = '', teacher = '' } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title required' });
  const info = db
    .prepare('INSERT INTO courses (title, description, teacher) VALUES (?, ?, ?)')
    .run(title, description, teacher);
  res.json(db.prepare('SELECT * FROM courses WHERE id = ?').get(info.lastInsertRowid));
});

app.get('/api/courses/:id', requireAuth, (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const lessons = db
    .prepare('SELECT * FROM lessons WHERE course_id = ? ORDER BY position, id')
    .all(req.params.id);
  const pdfCounts = db.prepare('SELECT lesson_id, COUNT(*) AS n FROM pdfs GROUP BY lesson_id').all();
  const byId = Object.fromEntries(pdfCounts.map((c) => [c.lesson_id, c.n]));
  res.json({ ...course, lessons: lessons.map((l) => ({ ...l, pdfCount: byId[l.id] || 0 })) });
});

app.post('/api/courses/:id/lessons', requireAuth, (req, res) => {
  const { title, description = '' } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title required' });
  const course = db.prepare('SELECT id FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM lessons WHERE course_id = ?').get(req.params.id).p;
  const info = db
    .prepare('INSERT INTO lessons (course_id, title, description, position) VALUES (?, ?, ?, ?)')
    .run(req.params.id, title, description, pos);
  res.json(db.prepare('SELECT * FROM lessons WHERE id = ?').get(info.lastInsertRowid));
});

app.get('/api/lessons/:id', requireAuth, (req, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(lesson.course_id);
  const pdfs = db
    .prepare('SELECT id, lesson_id, title, teacher, position, created_at FROM pdfs WHERE lesson_id = ? ORDER BY position, id')
    .all(req.params.id);
  res.json({ ...lesson, course, pdfs });
});

app.post('/api/lessons/:id/pdfs', requireAuth, upload.single('file'), (req, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  if (!req.file) return res.status(400).json({ error: 'PDF file required (field name: file)' });
  const title = req.body.title || req.file.originalname.replace(/\.pdf$/i, '');
  const teacher = req.body.teacher || '';
  const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM pdfs WHERE lesson_id = ?').get(req.params.id).p;
  const info = db
    .prepare("INSERT INTO pdfs (lesson_id, title, teacher, filename, position, status) VALUES (?, ?, ?, ?, ?, 'processing')")
    .run(req.params.id, title, teacher, req.file.filename, pos);
  const pdfId = info.lastInsertRowid;
  // Decompose + transcribe in the background; the viewer polls for progress.
  if (AI_ENABLED) {
    setImmediate(() => ingestPdf(pdfId).catch((err) => console.error('ingest failed:', err.message)));
  } else {
    db.prepare("UPDATE pdfs SET status = 'ready' WHERE id = ?").run(pdfId);
  }
  res.json(db.prepare('SELECT * FROM pdfs WHERE id = ?').get(pdfId));
});

app.post('/api/pdfs/:id/ingest', requireAuth, (req, res) => {
  const pdf = db.prepare('SELECT * FROM pdfs WHERE id = ?').get(req.params.id);
  if (!pdf) return res.status(404).json({ error: 'PDF not found' });
  if (pdf.status === 'processing') return res.status(409).json({ error: 'Already processing' });
  db.prepare('DELETE FROM sections WHERE pdf_id = ?').run(pdf.id);
  setImmediate(() => ingestPdf(pdf.id).catch((err) => console.error('ingest failed:', err.message)));
  res.json({ ok: true });
});

// ---------- PDF viewing + sections ----------
app.get('/api/pdfs/:id', requireAuth, (req, res) => {
  const pdf = db.prepare('SELECT * FROM pdfs WHERE id = ?').get(req.params.id);
  if (!pdf) return res.status(404).json({ error: 'PDF not found' });
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(pdf.lesson_id);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(lesson.course_id);
  const sections = db
    .prepare('SELECT * FROM sections WHERE pdf_id = ? ORDER BY position, id')
    .all(req.params.id);
  const counts = db
    .prepare('SELECT section_id, COUNT(*) AS n FROM messages WHERE section_id IN (SELECT id FROM sections WHERE pdf_id = ?) GROUP BY section_id')
    .all(req.params.id);
  const countById = Object.fromEntries(counts.map((c) => [c.section_id, c.n]));
  res.json({ ...pdf, lesson, course, aiEnabled: AI_ENABLED, sections: sections.map((s) => ({ ...s, messageCount: countById[s.id] || 0 })) });
});

app.get('/api/pdfs/:id/file', requireAuth, (req, res) => {
  const pdf = db.prepare('SELECT filename FROM pdfs WHERE id = ?').get(req.params.id);
  if (!pdf) return res.status(404).json({ error: 'PDF not found' });
  const filePath = path.join(UPLOADS_DIR, pdf.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on disk' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  fs.createReadStream(filePath).pipe(res);
});

app.post('/api/pdfs/:id/sections', requireAuth, (req, res) => {
  const pdf = db.prepare('SELECT * FROM pdfs WHERE id = ?').get(req.params.id);
  if (!pdf) return res.status(404).json({ error: 'PDF not found' });
  const { title, page_start = null, page_end = null, content_text = '' } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title required' });
  const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM sections WHERE pdf_id = ?').get(req.params.id).p;
  const info = db
    .prepare('INSERT INTO sections (pdf_id, title, page_start, page_end, content_text, position) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.params.id, title, page_start, page_end, content_text, pos);
  res.json(db.prepare('SELECT * FROM sections WHERE id = ?').get(info.lastInsertRowid));
});

// ---------- AI: explanation + per-section chat ----------
function sectionContext(sectionId) {
  const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(sectionId);
  if (!section) return null;
  const pdf = db.prepare('SELECT * FROM pdfs WHERE id = ?').get(section.pdf_id);
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(pdf.lesson_id);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(lesson.course_id);
  return { section, pdf, lesson, course };
}

// Marker flag for the "Shortcut" reading mode.
app.post('/api/sections/:id/highlight', requireAuth, (req, res) => {
  const section = db.prepare('SELECT id FROM sections WHERE id = ?').get(req.params.id);
  if (!section) return res.status(404).json({ error: 'Section not found' });
  const on = req.body?.highlight ? 1 : 0;
  db.prepare('UPDATE sections SET highlight = ? WHERE id = ?').run(on, section.id);
  res.json({ ok: true, highlight: on });
});

app.get('/api/sections/:id', requireAuth, (req, res) => {
  const ctx = sectionContext(req.params.id);
  if (!ctx) return res.status(404).json({ error: 'Section not found' });
  res.json(ctx.section);
});

app.post('/api/sections/:id/explain', requireAuth, async (req, res) => {
  if (!AI_ENABLED) return res.status(503).json({ error: AI_OFF_MSG });
  const ctx = sectionContext(req.params.id);
  if (!ctx) return res.status(404).json({ error: 'Section not found' });
  const { section, lesson, course } = ctx;
  const { force = false, instructions = '' } = req.body || {};
  if (section.ai_explanation && !force && !instructions) {
    return res.json({ ai_explanation: section.ai_explanation, cached: true });
  }
  try {
    if (section.ai_explanation || instructions) {
      // Rewrite only the explanation, following the student's instructions.
      const explanation = await reExplainBlock({
        courseTitle: course.title,
        lessonTitle: lesson.title,
        block: { kind: section.kind, title: section.title, statement: section.content_text },
        currentExplanation: section.ai_explanation,
        instructions,
      });
      db.prepare('UPDATE sections SET ai_explanation = ? WHERE id = ?').run(explanation, section.id);
      return res.json({ ai_explanation: explanation, cached: false });
    }
    // First-time annotation: explanation + proof/importance + tutor note.
    const ann = await annotateBlock({
      courseTitle: course.title,
      lessonTitle: lesson.title,
      block: { kind: section.kind, title: section.title, statement: section.content_text, proof: section.proof },
      neighbors: '',
    });
    db.prepare('UPDATE sections SET ai_explanation = ?, proof = ?, importance = ?, tutor_note = ? WHERE id = ?').run(
      ann.explanation || null,
      ann.proof,
      ann.importance,
      ann.tutor_note,
      section.id
    );
    res.json({ ...ann, ai_explanation: ann.explanation, cached: false });
  } catch (err) {
    console.error('explain failed:', err);
    res.status(500).json({ error: `AI explanation failed: ${err.message}` });
  }
});

app.get('/api/sections/:id/messages', requireAuth, (req, res) => {
  const ctx = sectionContext(req.params.id);
  if (!ctx) return res.status(404).json({ error: 'Section not found' });
  res.json(db.prepare('SELECT * FROM messages WHERE section_id = ? ORDER BY id').all(req.params.id));
});

app.post('/api/sections/:id/messages', requireAuth, async (req, res) => {
  if (!AI_ENABLED) return res.status(503).json({ error: AI_OFF_MSG });
  const ctx = sectionContext(req.params.id);
  if (!ctx) return res.status(404).json({ error: 'Section not found' });
  const question = (req.body?.content || '').trim();
  if (!question) return res.status(400).json({ error: 'Message content required' });

  const { section, pdf, course } = ctx;
  const history = db.prepare('SELECT role, content FROM messages WHERE section_id = ? ORDER BY id').all(section.id);
  // 'auto' (default) lets the tutor detect short / mid / expanded from the
  // question; the chat's length chips can force one.
  const length = ANSWER_LENGTHS.includes(req.body?.length) ? req.body.length : 'auto';

  const userInfo = db.prepare('INSERT INTO messages (section_id, role, content) VALUES (?, ?, ?)').run(section.id, 'user', question);
  try {
    const answer = await answerQuestion({
      length,
      courseTitle: course.title,
      pdfTitle: pdf.title,
      sectionTitle: section.title,
      contentText: section.content_text,
      aiExplanation: section.ai_explanation,
      proof: section.proof,
      extraExplanation: section.extra_explanation,
      extraExample: section.extra_example,
      refresh: section.refresh,
      history,
      question,
    });
    const aiInfo = db.prepare('INSERT INTO messages (section_id, role, content) VALUES (?, ?, ?)').run(section.id, 'assistant', answer);
    res.json({
      user: db.prepare('SELECT * FROM messages WHERE id = ?').get(userInfo.lastInsertRowid),
      assistant: db.prepare('SELECT * FROM messages WHERE id = ?').get(aiInfo.lastInsertRowid),
    });
  } catch (err) {
    // Roll back the stored question so the chat doesn't keep an unanswered
    // duplicate when the client restores the draft and resends.
    db.prepare('DELETE FROM messages WHERE id = ?').run(userInfo.lastInsertRowid);
    console.error('chat failed:', err);
    res.status(500).json({ error: `AI answer failed: ${err.message}` });
  }
});

// ---------- Handwritten ink: pen layer over a lesson, and its notebook ----------
const INK_KINDS = new Set(['page', 'notes']);

app.get('/api/pdfs/:id/ink/:kind', requireAuth, async (req, res) => {
  if (!INK_KINDS.has(req.params.kind)) return res.status(400).json({ error: 'Unknown ink kind' });
  let row;
  try {
    row = await store.getInk(req.user.id, Number(req.params.id), req.params.kind);
  } catch (err) {
    console.error('ink read failed:', err);
    return res.status(503).json({ error: 'Notes storage unavailable' });
  }
  if (!row) return res.json({ data: null, updated_at: null });
  let data = null;
  try {
    data = JSON.parse(row.data);
  } catch {
    data = null;
  }
  res.json({ data, updated_at: row.updated_at });
});

app.put('/api/pdfs/:id/ink/:kind', requireAuth, async (req, res) => {
  if (!INK_KINDS.has(req.params.kind)) return res.status(400).json({ error: 'Unknown ink kind' });
  const pdf = db.prepare('SELECT id FROM pdfs WHERE id = ?').get(req.params.id);
  if (!pdf) return res.status(404).json({ error: 'PDF not found' });
  const { data, updated_at } = req.body || {};
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'data object required' });
  const stamp = typeof updated_at === 'string' && updated_at ? updated_at : new Date().toISOString();
  try {
    await store.putInk(req.user.id, pdf.id, req.params.kind, JSON.stringify(data), stamp);
  } catch (err) {
    console.error('ink write failed:', err);
    return res.status(503).json({ error: 'Notes storage unavailable' });
  }
  res.json({ ok: true, updated_at: stamp });
});

// ---------- Static Angular build (production mode) ----------
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist', 'client', 'browser');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`MASEF helper server on http://localhost:${PORT}`);
  console.log(fs.existsSync(CLIENT_DIST) ? 'Serving Angular build from client/dist' : 'No client build found — use ng serve for the frontend');
});

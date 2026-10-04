// Build the coding-prep data: LeetCode problems asked by finance firms,
// merged from four public company-wise lists on GitHub.
//
//   node scripts/build-coding.js <dir with the cloned repos>
//
// The directory must hold shallow clones of
//   liquidslr/leetcode-company-wise-problems          (2025-26, windows 30d/3m/6m/>6m)
//   snehasishroy/leetcode-companywise-interview-questions (2025-26, same windows)
//   krishnadey30/LeetCode-Questions-CompanyWise       (2021-24, 6m/1y/2y/all time)
//   hxu296/leetcode-company-wise-problems-2022        (May 2022, MIT)
// and writes content/coding/coding.json. Problems are keyed by their LeetCode
// slug, which is also what user progress is keyed by — never rename them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2];
if (!ROOT) {
  console.error('usage: node scripts/build-coding.js <repos dir>');
  process.exit(1);
}
const OUT = path.join(__dirname, '..', 'content', 'coding', 'coding.json');

// Finance firms only. Keys are folder/file names lowercased with everything
// but letters and digits removed.
const GROUPS = [
  ['trading', 'Trading firms & hedge funds'],
  ['banks', 'Banks'],
  ['markets', 'Asset managers, exchanges & market data'],
  ['fintech', 'Fintech, payments & crypto'],
];
const FIRMS = [
  // trading & hedge funds
  ['jane-street', 'Jane Street', 'trading', ['janestreet']],
  ['citadel', 'Citadel', 'trading', ['citadel']],
  ['two-sigma', 'Two Sigma', 'trading', ['twosigma']],
  ['de-shaw', 'D. E. Shaw', 'trading', ['deshaw']],
  ['hrt', 'Hudson River Trading', 'trading', ['hrt', 'hudsonrivertrading']],
  ['jump-trading', 'Jump Trading', 'trading', ['jumptrading']],
  ['optiver', 'Optiver', 'trading', ['optiver']],
  ['imc', 'IMC Trading', 'trading', ['imc']],
  ['sig', 'SIG (Susquehanna)', 'trading', ['sig']],
  ['drw', 'DRW', 'trading', ['drw']],
  ['akuna', 'Akuna Capital', 'trading', ['akuna', 'akunacapital']],
  ['tower-research', 'Tower Research Capital', 'trading', ['towerresearch', 'towerresearchcapital']],
  ['virtu', 'Virtu Financial', 'trading', ['virtu', 'virtufinancial']],
  ['squarepoint', 'Squarepoint Capital', 'trading', ['squarepointcapital']],
  ['gsa-capital', 'GSA Capital', 'trading', ['gsacapital']],
  ['point72', 'Point72', 'trading', ['point72']],
  ['millennium', 'Millennium', 'trading', ['millennium']],
  ['worldquant', 'WorldQuant', 'trading', ['worldquant']],
  ['trexquant', 'Trexquant', 'trading', ['trexquant']],
  ['aqr', 'AQR Capital Management', 'trading', ['aqrcapitalmanagement']],
  ['bridgewater', 'Bridgewater Associates', 'trading', ['bridgewaterassociates']],
  ['peak6', 'PEAK6', 'trading', ['peak6']],
  ['ctc', 'CTC (Chicago Trading Company)', 'trading', ['ctc']],
  ['apt-portfolio', 'APT Portfolio', 'trading', ['aptportfolio']],
  ['graviton', 'Graviton Research Capital', 'trading', ['graviton']],
  ['arcesium', 'Arcesium (D. E. Shaw group)', 'trading', ['arcesium']],
  // banks
  ['goldman-sachs', 'Goldman Sachs', 'banks', ['goldmansachs']],
  ['jpmorgan', 'J.P. Morgan', 'banks', ['jpmorgan', 'jpmorganchase']],
  ['morgan-stanley', 'Morgan Stanley', 'banks', ['morganstanley']],
  ['bank-of-america', 'Bank of America', 'banks', ['bankofamerica']],
  ['citi', 'Citi', 'banks', ['citi', 'citigroup']],
  ['barclays', 'Barclays', 'banks', ['barclays']],
  ['bnp-paribas', 'BNP Paribas', 'banks', ['bnpparibas']],
  ['societe-generale', 'Société Générale', 'banks', ['societegenerale']],
  ['deutsche-bank', 'Deutsche Bank', 'banks', ['deutschebank']],
  ['ubs', 'UBS', 'banks', ['ubs']],
  ['hsbc', 'HSBC', 'banks', ['hsbc']],
  ['wells-fargo', 'Wells Fargo', 'banks', ['wellsfargo']],
  ['bny-mellon', 'BNY Mellon', 'banks', ['bnymellon']],
  ['rbc', 'RBC', 'banks', ['rbc']],
  ['natwest', 'NatWest', 'banks', ['natwest']],
  ['capital-one', 'Capital One', 'banks', ['capitalone']],
  ['american-express', 'American Express', 'banks', ['americanexpress']],
  // asset managers, exchanges, market data
  ['blackrock', 'BlackRock', 'markets', ['blackrock']],
  ['blackstone', 'Blackstone', 'markets', ['blackstone']],
  ['vanguard', 'Vanguard', 'markets', ['vanguard']],
  ['fidelity', 'Fidelity', 'markets', ['fidelity']],
  ['bloomberg', 'Bloomberg', 'markets', ['bloomberg']],
  ['cme-group', 'CME Group', 'markets', ['cmegroup']],
  ['nasdaq', 'Nasdaq', 'markets', ['nasdaq']],
  ['msci', 'MSCI', 'markets', ['msci']],
  ['factset', 'FactSet', 'markets', ['factset']],
  ['dtcc', 'DTCC', 'markets', ['dtcc']],
  ['murex', 'Murex', 'markets', ['murex']],
  ['interactive-brokers', 'Interactive Brokers', 'markets', ['interactivebrokers']],
  ['thomson-reuters', 'Thomson Reuters', 'markets', ['thomsonreuters']],
  // fintech
  ['stripe', 'Stripe', 'fintech', ['stripe']],
  ['robinhood', 'Robinhood', 'fintech', ['robinhood']],
  ['coinbase', 'Coinbase', 'fintech', ['coinbase']],
  ['revolut', 'Revolut', 'fintech', ['revolut']],
  ['wise', 'Wise', 'fintech', ['wise']],
  ['paypal', 'PayPal', 'fintech', ['paypal']],
  ['visa', 'Visa', 'fintech', ['visa']],
  ['mastercard', 'Mastercard', 'fintech', ['mastercard']],
  ['block', 'Block (Square)', 'fintech', ['block', 'square']],
  ['plaid', 'Plaid', 'fintech', ['plaid']],
  ['brex', 'Brex', 'fintech', ['brex']],
  ['ramp', 'Ramp', 'fintech', ['ramp2']],
  ['affirm', 'Affirm', 'fintech', ['affirm']],
  ['sofi', 'SoFi', 'fintech', ['sofi']],
  ['chime', 'Chime', 'fintech', ['chime']],
  ['marqeta', 'Marqeta', 'fintech', ['marqeta']],
  ['wealthfront', 'Wealthfront', 'fintech', ['wealthfront']],
  ['okx', 'OKX', 'fintech', ['okx']],
  ['ripple', 'Ripple', 'fintech', ['ripple']],
  ['bitgo', 'BitGo', 'fintech', ['bitgo']],
];
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const FIRM_OF = new Map();
for (const [slug, , , keys] of FIRMS) for (const k of keys) FIRM_OF.set(k, slug);

// Minimal CSV parser (quoted fields with commas, doubled quotes).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let f = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (f += '"'), i++;
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(f), (f = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f);
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      f = '';
    } else f += c;
  }
  if (f || row.length) row.push(f), rows.push(row);
  const [head, ...body] = rows;
  const h = head.map((x) => x.trim().replace(/^﻿/, ''));
  return body.map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])));
}
const read = (p) => parseCsv(fs.readFileSync(p, 'utf8'));
const slugOf = (url) => (url.match(/leetcode\.com\/problems\/([^/?#\s]+)/) || [])[1]?.toLowerCase();
const DIFF = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const pct = (s) => parseFloat(String(s).replace('%', '')) || 0;

// Problem catalogue (title, difficulty, topics, number), filled from every
// file of every company so firms missing a field still get it.
const problems = new Map();
function note(slug, info) {
  const p = problems.get(slug) || { title: '', difficulty: '', topics: [], id: null };
  if (!p.title && info.title) p.title = info.title;
  if (!p.difficulty && info.difficulty) p.difficulty = DIFF[info.difficulty.toLowerCase()] || '';
  if (!p.topics.length && info.topics) p.topics = info.topics.split(',').map((t) => t.trim()).filter(Boolean);
  if (p.id == null && info.id && /^\d+$/.test(info.id)) p.id = Number(info.id);
  problems.set(slug, p);
}

// hits[firm][slug] = [{ source, window, freq (0..1 within its file) }]
const hits = new Map();
function hit(firm, slug, source, window, freq) {
  if (!hits.has(firm)) hits.set(firm, new Map());
  const m = hits.get(firm);
  if (!m.has(slug)) m.set(slug, []);
  m.get(slug).push({ source, window, freq });
}
// Add a file's rows, scaling frequency to the file's maximum.
function addFile(firm, source, window, rows) {
  const max = Math.max(1e-9, ...rows.map((r) => r.freq));
  for (const r of rows) if (r.slug) hit(firm, r.slug, source, window, firm ? r.freq / max : 0);
}

const dirs = (p) => (fs.existsSync(p) ? fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []);

// 1. liquidslr — "<Company>/<n>. <Window>.csv"
{
  const base = path.join(ROOT, 'leetcode-company-wise-problems');
  const WIN = { 'thirty days': '30d', 'three months': '3m', 'six months': '6m', 'more than six months': 'older', all: 'all' };
  for (const company of dirs(base)) {
    const firm = FIRM_OF.get(norm(company));
    for (const file of fs.readdirSync(path.join(base, company))) {
      const w = WIN[file.replace(/^\d+\.\s*/, '').replace(/\.csv$/, '').toLowerCase()];
      if (!w) continue;
      const rows = read(path.join(base, company, file)).map((r) => {
        const slug = slugOf(r.Link);
        if (slug) note(slug, { title: r.Title, difficulty: r.Difficulty, topics: r.Topics });
        return { slug, freq: parseFloat(r.Frequency) || 0 };
      });
      if (firm) addFile(firm, 'liquidslr', w, rows);
    }
  }
}
// 2. snehasishroy — "<company>/<window>.csv"
{
  const base = path.join(ROOT, 'leetcode-companywise-interview-questions');
  const WIN = { 'thirty-days': '30d', 'three-months': '3m', 'six-months': '6m', 'more-than-six-months': 'older', all: 'all' };
  for (const company of dirs(base)) {
    const firm = FIRM_OF.get(norm(company));
    for (const file of fs.readdirSync(path.join(base, company))) {
      const w = WIN[file.replace(/\.csv$/, '')];
      if (!w) continue;
      const rows = read(path.join(base, company, file)).map((r) => {
        const slug = slugOf(r.URL);
        if (slug) note(slug, { title: r.Title, difficulty: r.Difficulty, id: r.ID });
        return { slug, freq: pct(r['Frequency %']) };
      });
      if (firm) addFile(firm, 'snehasishroy', w, rows);
    }
  }
}
// 3. krishnadey30 — "<company>_<window>.csv"
{
  const base = path.join(ROOT, 'LeetCode-Questions-CompanyWise');
  for (const file of fs.readdirSync(base)) {
    const m = file.match(/^(.+)_(6months|1year|2year|alltime)\.csv$/);
    if (!m) continue;
    const firm = FIRM_OF.get(norm(m[1]));
    const w = { '6months': '6m', '1year': '1y', '2year': '2y', alltime: 'all' }[m[2]];
    const rows = read(path.join(base, file)).map((r) => {
      const slug = slugOf(r['Leetcode Question Link']);
      if (slug) note(slug, { title: r.Title, difficulty: r.Difficulty, id: r.ID });
      return { slug, freq: parseFloat(r.Frequency) || 0 };
    });
    if (firm) addFile(firm, 'krishnadey30', w, rows);
  }
}
// 4. hxu296 — "companies/<Company>.csv" (+ a catalogue with difficulties)
{
  const base = path.join(ROOT, 'leetcode-company-wise-problems-2022');
  for (const r of read(path.join(base, 'data', 'leetcode_problems.csv'))) {
    const slug = slugOf(r.link);
    if (slug) note(slug, { title: r.name, difficulty: r.difficulty });
  }
  for (const file of fs.readdirSync(path.join(base, 'companies'))) {
    const rows = read(path.join(base, 'companies', file)).map((r) => {
      const slug = slugOf(r.problem_link);
      if (slug) note(slug, { title: r.problem_name });
      return { slug, freq: parseFloat(r.num_occur) || 0 };
    });
    const firm = FIRM_OF.get(norm(file.replace(/\.csv$/, '')));
    if (firm) addFile(firm, 'hxu296', '2022', rows);
  }
}

// Merge. Score = mean over sources of the problem's best scaled frequency in
// that source, plus a bonus for each extra list it shows up in.
const RECENT = new Set(['30d', '3m']);
const lists = {};
const used = new Set();
const firms = [];
for (const [slug, name, group] of FIRMS) {
  const m = hits.get(slug);
  if (!m) {
    console.warn(`no data: ${name}`);
    continue;
  }
  const items = [];
  for (const [p, hs] of m) {
    const bySource = new Map();
    for (const h of hs) bySource.set(h.source, Math.max(bySource.get(h.source) ?? 0, h.freq));
    const mean = [...bySource.values()].reduce((a, b) => a + b, 0) / bySource.size;
    const score = Math.min(1, mean * 0.8 + (bySource.size - 1) * 0.07);
    const windows = [...new Set(hs.map((h) => h.window))];
    items.push({
      slug: p,
      score: Math.round(score * 1000) / 1000,
      recent: windows.some((w) => RECENT.has(w)),
      windows,
      sources: [...bySource.keys()],
    });
    used.add(p);
  }
  items.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  lists[slug] = items;
  firms.push({ slug, name, group, count: items.length, recent: items.filter((i) => i.recent).length });
}

const catalogue = {};
for (const s of [...used].sort()) {
  const p = problems.get(s);
  catalogue[s] = {
    title: p.title || s.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()),
    difficulty: p.difficulty || '',
    topics: p.topics,
    ...(p.id != null ? { id: p.id } : {}),
  };
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({
    builtAt: new Date().toISOString().slice(0, 10),
    groups: GROUPS.map(([key, label]) => ({ key, label })),
    firms,
    problems: catalogue,
    lists,
  })
);
console.log(`${firms.length} firms, ${used.size} distinct problems, ${Object.values(lists).reduce((a, l) => a + l.length, 0)} firm-problem pairs → ${path.relative(process.cwd(), OUT)}`);
for (const f of firms) console.log(`  ${f.name.padEnd(32)} ${String(f.count).padStart(4)}  (${f.recent} recent)`);

// Downloads the course PDFs from their ORIGINAL public sources into uploads/.
// Used on deploy so the repository does not redistribute the documents.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

const SOURCES = {
  'poly-prerentree-m2.pdf': 'https://www.ceremade.dauphine.fr/~forien/Nicolas_Forien_files/poly-prerentree-m2.pdf',
  'stoc.pdf': 'https://www.ceremade.dauphine.fr/~salez/stoc.pdf',
  'stochastic-control.pdf': 'https://www.ceremade.dauphine.fr/~cardaliaguet/NotesCours2025.pdf',
  'monte-carlo-lapeyre.pdf': 'https://cermics.enpc.fr/~bl/monte-carlo/poly.pdf',
  'ml-finance-brugiere.pdf': 'https://drive.google.com/uc?export=download&id=1aM0xXY9cym3Hr5_8jYxAil8JJKfiBKBk',
  'valuation-bouchard.pdf': 'http://www.ressources-actuarielles.net/EXT/ISFA/fp-isfa.nsf/0/063a577cf80dcbbbc125735000356c88/$FILE/PolyMathFi.pdf',
  'mcmc-robert.pdf': 'https://www.ceremade.dauphine.fr/~xian/coursMC.pdf',
  'lob-survey.pdf': 'https://arxiv.org/pdf/1012.0349',
  'hoffmann-ch1.pdf': 'https://www.ceremade.dauphine.fr/~cosco/Chapter1.pdf',
  'hoffmann-ch2.pdf': 'https://www.ceremade.dauphine.fr/~cosco/Chapter2_in_progress.pdf',
  'var-roncalli.pdf': 'http://www.thierry-roncalli.com/download/FRM-Lectures.pdf',
  // Only surviving copy of the Henon-Turinici notes: the Wayback Machine ('id_' = raw file).
  'courbe-turinici.pdf':
    'http://web.archive.org/web/20221004230340id_/https://www.ceremade.dauphine.fr/~turinici/images/stories/work/cours/tauxP20/cours_taux_Turinici_P20_v2_1_diffuse.pdf',
};

for (const [name, url] of Object.entries(SOURCES)) {
  const dest = path.join(UPLOADS, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 50_000) {
    console.log(`have ${name}`);
    continue;
  }
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.subarray(0, 5).toString().startsWith('%PDF')) throw new Error('not a PDF (login page?)');
    fs.writeFileSync(dest, buf);
    console.log(`fetched ${name} (${Math.round(buf.length / 1024)} KB)`);
  } catch (err) {
    console.error(`FAILED ${name}: ${err.message} — the app works, that PDF's "Original PDF" link won't.`);
  }
}
console.log('uploads fetch done');

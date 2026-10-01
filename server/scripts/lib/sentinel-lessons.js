// Parser for the tutor-written lesson files (sentinel line format: ===LESSON===,
// ===BLOCK===, ===NOTE=== followed by KEY: value fields; multi-line fields run
// until the next key). Shared by build-condensed-course.js and build-track-course.js.
const SINGLE = new Set(['KIND', 'TITLE', 'IMPORTANCE', 'HIGHLIGHT', 'DESCRIPTION']);
const KEYS = ['KIND', 'TITLE', 'IMPORTANCE', 'HIGHLIGHT', 'DESCRIPTION', 'INTRO', 'STATEMENT', 'PROOF', 'REFRESH', 'EXPLANATION', 'DEEP', 'EXAMPLE', 'NOTE', 'CONTENT'];
const KEY_RE = new RegExp(`^(${KEYS.join('|')}):\\s*(.*)$`);

export function parseFile(text) {
  const items = [];
  const chunks = text.split(/^===(LESSON|BLOCK|NOTE)===\s*$/m);
  for (let i = 1; i < chunks.length; i += 2) {
    const type = chunks[i];
    const body = chunks[i + 1] || '';
    const fields = {};
    let current = null;
    for (const line of body.split('\n')) {
      const m = line.match(KEY_RE);
      if (m) {
        current = m[1];
        fields[current] = SINGLE.has(current) ? [m[2]] : m[2].trim() ? [m[2]] : [];
      } else if (current && !SINGLE.has(current)) {
        fields[current].push(line);
      }
    }
    const val = (k) => {
      const t = (fields[k] || []).join('\n').trim();
      if (!t || /^\(none\)$/i.test(t)) return null;
      return t;
    };
    items.push({ type, get: val });
  }
  return items;
}


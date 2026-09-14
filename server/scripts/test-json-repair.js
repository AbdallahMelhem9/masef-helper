import { parseJsonLoose } from '../src/ai.js';

// Valid JSON with properly escaped LaTeX — must parse untouched.
const good = '{"a": "x \\\\alpha y \\\\( z \\\\) w"}';
console.log('good:', JSON.stringify(parseJsonLoose(good)));

// Invalid: lone backslashes before ( and s — must be repaired.
const bad = '{"a": "x \\( y \\sigma z"}';
console.log('bad-repaired:', JSON.stringify(parseJsonLoose(bad)));

// Mixed: valid \\alpha next to invalid \beta.
const mixed = '{"a": "\\\\alpha \\beta"}';
console.log('mixed-repaired:', JSON.stringify(parseJsonLoose(mixed)));

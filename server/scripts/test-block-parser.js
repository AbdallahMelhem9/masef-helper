import { parseBlocksOutput } from '../src/ingest.js';

const sample = `===BLOCK===
KIND: heading
TITLE: 2.1 The Metropolis algorithm
STATEMENT:
PROOF:

===BLOCK===
KIND: definition
TITLE: Definition 3
STATEMENT:
A *Markov chain* with kernel \\(K\\) satisfies "detailed balance" if
\\[ \\pi(x) K(x,y) = \\pi(y) K(y,x). \\]
It has quotes "like this" and $ signs and === inside text.
PROOF:

===BLOCK===
KIND: proposition
TITLE: Proposition 7
STATEMENT:
If detailed balance holds then \\(\\pi\\) is stationary.
PROOF:
Sum both sides over \\(x\\): \\(\\sum_x \\pi(x)K(x,y) = \\pi(y)\\).

===BLOCK===
KIND: text
TITLE:
STATEMENT:
Some connecting prose between statements.
PROOF:
`;

const blocks = parseBlocksOutput(sample);
console.log(JSON.stringify(blocks, null, 1));
console.log(blocks.length === 4 && blocks[2].proof && !blocks[1].proof && blocks[0].kind === 'heading' ? 'PARSER OK' : 'PARSER BROKEN');

import { readFile } from 'node:fs/promises';
import N3 from 'n3';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node validate-ttl.mjs <path-to-ttl>');
  process.exit(1);
}

const content = await readFile(filePath, 'utf8');
const parser = new N3.Parser({ format: 'Turtle' });

const errors = [];
let tripleCount = 0;

parser.parse(content, (err, quad) => {
  if (err) {
    errors.push({ message: err.message, line: err.line, column: err.column });
    return;
  }
  if (quad) tripleCount++;
});

// n3 parser is callback-based; for sync content it completes synchronously.
// Wait one tick to allow any pending callbacks to flush.
await new Promise(resolve => setTimeout(resolve, 50));

if (errors.length > 0) {
  console.error(`PARSE FAILED — ${errors.length} error(s):`);
  for (const e of errors.slice(0, 20)) {
    console.error(`  ${e.message}`);
  }
  process.exit(1);
}
console.log(`PARSE OK — ${tripleCount} triples`);

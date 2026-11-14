import { existsSync } from 'node:fs';
import { results } from './harness.mjs';

const all = ['engine', 'algs', 'validate', 'reduction', 'three', 'solver', 'classify', 'sw'];
const asked = process.argv.slice(2);
const files = asked.length ? asked : all.filter(f => existsSync(new URL(`./${f}.test.mjs`, import.meta.url)));
for (const f of files) {
  const t0 = Date.now();
  await import(`./${f}.test.mjs`);
  console.log(`${f}: done in ${Date.now() - t0} ms`);
}
console.log(`\n${results.pass} passed, ${results.fail} failed`);
process.exit(results.fail ? 1 : 0);

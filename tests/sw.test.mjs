// Checks that sw.js precaches every file the app needs, so a new module can't
// silently break offline loading.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert } from './harness.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const block = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
const precache = block ? [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : [];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

test('sw.js has a PRECACHE list', () => assert(precache.length > 0, 'PRECACHE not found'));

test('every app file is precached', () => {
  const needed = ['index.html', 'styles.css', 'manifest.json', ...walk('src'), ...walk('lib'), ...walk('icons')];
  const missing = needed.filter(f => !precache.includes(f));
  assert(!missing.length, `missing from PRECACHE in sw.js: ${missing.join(', ')}`);
});

test('every precached file exists', () => {
  const gone = precache.filter(f => f !== './' && !existsSync(join(root, f)));
  assert(!gone.length, `PRECACHE lists files that do not exist: ${gone.join(', ')}`);
});

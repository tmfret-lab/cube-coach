import { solvedState, applyMoves } from '../src/puzzles/nxn/state.js';
import { getPieces } from '../src/puzzles/nxn/pieces.js';
import { reduce, isReduced, fixedCentersHome } from '../src/puzzles/nxn/solver/reduce.js';
import { parityAlg } from '../src/puzzles/nxn/solver/parity.js';
import { test, assert, eq } from './harness.mjs';

const N = 7;
const P = getPieces(N);
const S = solvedState(N);

// deterministic PRNG so failures can be reproduced
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
function scramble(len = 300) {
  const ms = [];
  for (let i = 0; i < len; i++) {
    const face = 'URFDLB'[Math.floor(rnd() * 6)];
    const amt = 1 + Math.floor(rnd() * 3);
    const r = rnd();
    if (r < 0.15) ms.push({ face, lo: 1, hi: 2 + Math.floor(rnd() * 2), amt }); // wide
    else { const k = 1 + Math.floor(rnd() * 4); ms.push({ face, lo: k, hi: k, amt }); } // face or slice 2..4
  }
  return ms;
}

for (const depth of [1, 2]) {
  test(`parity alg depth ${depth} swaps only the two UF wings`, () => {
    const s = applyMoves(N, S, parityAlg(N, depth));
    const changed = [];
    for (let i = 0; i < s.length; i++) if (s[i] !== S[i]) changed.push(i);
    eq(changed.length, 4);
    const cubies = new Set(changed.map(i => P.cubies[P.stickerCubie[i]]));
    assert([...cubies].every(c => c.type === 'wing' && c.depth === depth && c.pos[1] > 0 && c.pos[2] > 0), 'wrong pieces');
  });
}

test('solved cube needs no reduction moves', () => {
  const r = reduce(N, S);
  eq(r.steps.reduce((n, s) => n + s.moves.length, 0), 0);
});

const RUNS = +(process.env.REDUCE_RUNS || 200);
let total = 0, max = 0, time = 0, maxTime = 0, parity = 0, fails = 0;
for (let i = 0; i < RUNS; i++) {
  const start = applyMoves(N, S, scramble());
  const t0 = performance.now();
  let r;
  try { r = reduce(N, start); } catch (e) { fails++; console.log(`FAIL reduce #${i}: ${e.message}`); continue; }
  const dt = performance.now() - t0;
  time += dt; maxTime = Math.max(maxTime, dt);
  const moves = r.steps.flatMap(s => s.moves);
  total += moves.length; max = Math.max(max, moves.length);
  parity += r.steps.filter(s => s.stage === 'parity').length;
  const end = applyMoves(N, start, moves);
  const ok = end.join() === Array.from(r.state).join() && isReduced(N, end) && fixedCentersHome(N, end) &&
    r.steps.every(s => s.title && s.explanation && ['centers', 'edges', 'parity'].includes(s.stage));
  if (!ok) { fails++; console.log(`FAIL reduction #${i} produced a bad state`); }
}
test(`reduce ${RUNS} random 7x7 scrambles`, () => eq(fails, 0, 'failed reductions'));
console.log(`reduction: ${RUNS} scrambles, moves avg ${(total / RUNS).toFixed(0)} max ${max}, ` +
  `time avg ${(time / RUNS).toFixed(0)} ms max ${maxTime.toFixed(0)} ms, parity fixes ${parity}`);

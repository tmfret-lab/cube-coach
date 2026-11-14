// End-to-end: random 7x7 scramble -> solve() -> applying every step's moves solves it.
// COUNT env var sets how many scrambles (default 50; the full fuzz run uses 500).
import { solvedState, applyMoves, isSolved } from '../src/puzzles/nxn/state.js';
import { solve } from '../src/puzzles/nxn/solver/index.js';
import { validate } from '../src/puzzles/nxn/validate.js';
import { test, assert } from './harness.mjs';

const N = 7;
const COUNT = +(process.env.COUNT || 50);

let seed = 12345;
const rand = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };

function scramble(len) {
  const moves = [];
  for (let i = 0; i < len; i++) {
    const face = 'URFDLB'[rand(6)];
    const k = 1 + rand(3);
    const wide = rand(4) === 0;
    moves.push({ face, lo: wide ? 1 : k, hi: k, amt: 1 + rand(3) });
  }
  return applyMoves(N, solvedState(N), moves);
}

test('solved cube needs no steps', () => assert(solve(N, solvedState(N)).length === 0));

test(`solves ${COUNT} random 7x7 scrambles`, () => {
  let total = 0, max = 0, maxSteps = 0, t0 = Date.now(), worst = 0;
  const byStage = {};
  for (let i = 0; i < COUNT; i++) {
    const s = scramble(300);
    assert(validate(N, s).ok, `scramble ${i} failed validation`);
    const t = Date.now();
    const steps = solve(N, s);
    worst = Math.max(worst, Date.now() - t);
    const moves = steps.flatMap(st => st.moves);
    assert(isSolved(N, applyMoves(N, s, moves)), `scramble ${i} not solved`);
    for (const st of steps) {
      assert(st.title && st.explanation && st.stage, `step missing fields in scramble ${i}`);
      byStage[st.stage] = (byStage[st.stage] || 0) + st.moves.length;
    }
    total += moves.length; max = Math.max(max, moves.length); maxSteps = Math.max(maxSteps, steps.length);
  }
  const avg = (v) => Math.round(v / COUNT);
  console.log(`  moves avg ${avg(total)} max ${max}; steps max ${maxSteps}; time avg ${avg(Date.now() - t0)} ms, worst ${worst} ms`);
  console.log('  avg moves by stage:', Object.fromEntries(Object.entries(byStage).map(([k, v]) => [k, avg(v)])));
});

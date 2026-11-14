// End-to-end: random NxN scramble -> solve() -> applying every step's moves solves it.
// SIZES env var picks the cube sizes (default "2,3,4,5,6,7"), COUNT how many
// scrambles per size (default 50; the full fuzz run uses 500), e.g.
//   SIZES=2,3,5,7 COUNT=500 node tests/run.mjs solver
import { solvedState, applyMoves, isSolved } from '../src/puzzles/nxn/state.js';
import { solve } from '../src/puzzles/nxn/solver/index.js';
import { validate } from '../src/puzzles/nxn/validate.js';
import { formatAlg, parseAlg } from '../src/core/notation.js';
import { test, assert } from './harness.mjs';

const SIZES = (process.env.SIZES || '2,3,4,5,6,7').split(',').map(Number);
const COUNT = +(process.env.COUNT || 50);

let seed = 12345;
const rand = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >>> 16) % n; };

// Single slices k = 1..floor(N/2) from each face, sometimes wide (1..k).
function scramble(N, len) {
  const moves = [];
  const maxK = Math.max(1, Math.floor(N / 2));
  for (let i = 0; i < len; i++) {
    const face = 'URFDLB'[rand(6)];
    const k = 1 + rand(maxK);
    const wide = rand(4) === 0;
    moves.push({ face, lo: wide ? 1 : k, hi: k, amt: 1 + rand(3) });
  }
  return applyMoves(N, solvedState(N), moves);
}
const scrambleLength = (N) => (N <= 3 ? 25 : 20 * N);

for (const N of SIZES) {
  test(`${N}x${N}: solved cube needs no steps`, () => assert(solve(N, solvedState(N)).length === 0));

  test(`${N}x${N}: solves ${COUNT} random scrambles`, () => {
    let total = 0, max = 0, maxSteps = 0, worst = 0, solved = 0;
    const t0 = Date.now();
    const byStage = {};
    for (let i = 0; i < COUNT; i++) {
      const s = scramble(N, scrambleLength(N));
      assert(validate(N, s).ok, `${N}x${N} scramble ${i} failed validation`);
      const t = Date.now();
      const steps = solve(N, s);
      worst = Math.max(worst, Date.now() - t);
      const moves = steps.flatMap(st => st.moves);
      assert(isSolved(N, applyMoves(N, s, moves)), `${N}x${N} scramble ${i} not solved`);
      for (const st of steps) {
        assert(st.title && st.explanation && st.stage, `${N}x${N} step missing fields in scramble ${i}`);
        const text = formatAlg(st.moves, N);
        assert(formatAlg(parseAlg(text, N), N) === text, `${N}x${N} scramble ${i}: "${text}" does not round-trip`);
        byStage[st.stage] = (byStage[st.stage] || 0) + st.moves.length;
      }
      total += moves.length; max = Math.max(max, moves.length); maxSteps = Math.max(maxSteps, steps.length);
      solved++;
    }
    const avg = (v) => Math.round(v / solved);
    console.log(`  ${N}x${N}: ${solved} solves, moves avg ${avg(total)} max ${max}; steps max ${maxSteps}; time avg ${avg(Date.now() - t0)} ms, worst ${worst} ms`);
    console.log(`  ${N}x${N} avg moves by stage:`, Object.fromEntries(Object.entries(byStage).map(([k, v]) => [k, avg(v)])));
  });
}

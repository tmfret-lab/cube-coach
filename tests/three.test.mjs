import { solvedState, applyMoves, isSolved } from '../src/puzzles/nxn/state.js';
import { solve3x3Stage } from '../src/puzzles/nxn/solver/three.js';
import { test, assert } from './harness.mjs';

// small deterministic PRNG so failures can be reproduced
function rng(seed) { return () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32; }

function scramble(N, rand, len = 30) {
  const faces = 'URFDLB';
  const moves = [];
  let last = '';
  for (let i = 0; i < len; i++) {
    let f;
    do f = faces[Math.floor(rand() * 6)]; while (f === last);
    last = f;
    moves.push({ face: f, lo: 1, hi: 1, amt: 1 + Math.floor(rand() * 3) });
  }
  return applyMoves(N, solvedState(N), moves);
}

function check(N, count, seed) {
  const rand = rng(seed);
  let total = 0, max = 0, maxSteps = 0;
  const t0 = Date.now();
  for (let i = 0; i < count; i++) {
    const s = scramble(N, rand);
    const steps = solve3x3Stage(N, s);
    for (const st of steps) {
      assert(st.stage === '3x3' && st.title && st.explanation && Array.isArray(st.moves), `bad step on ${N}x${N} #${i}`);
      assert(st.moves.length > 0, `empty step "${st.title}" on #${i}`);
    }
    const moves = steps.flatMap(st => st.moves);
    assert(isSolved(N, applyMoves(N, s, moves)), `${N}x${N} scramble #${i} not solved`);
    total += moves.length; max = Math.max(max, moves.length); maxSteps = Math.max(maxSteps, steps.length);
  }
  console.log(`  ${N}x${N}: ${count} solves, avg ${(total / count).toFixed(1)} moves, max ${max}, max ${maxSteps} steps, ${Date.now() - t0} ms`);
}

test('3x3 stage solves 500 random 3x3 states', () => check(3, 500, 1));
test('3x3 stage solves 200 reduced 7x7 states', () => check(7, 200, 2));
test('3x3 stage on a solved cube only flips it', () => {
  const steps = solve3x3Stage(7, solvedState(7));
  const moves = steps.flatMap(st => st.moves);
  assert(isSolved(7, applyMoves(7, solvedState(7), moves)));
  assert(steps.length === 1 && steps[0].title === '3x3: flip the cube', 'expected only the flip step');
});

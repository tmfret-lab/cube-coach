import { solvedState, applyMoves, isSolved } from '../src/puzzles/nxn/state.js';
import { parseAlg, formatAlg } from '../src/core/notation.js';
import { solve3x3Stage, solve2x2, project, fixEvenParity } from '../src/puzzles/nxn/solver/three.js';
import { parity3, evenParityAlgs } from '../src/puzzles/nxn/solver/evenParity.js';
import { evenParityText } from '../src/puzzles/nxn/parityText.js';
import { test, assert } from './harness.mjs';

// small deterministic PRNG so failures can be reproduced
function rng(seed) { return () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32; }

// random outer-face moves (these keep a reduced big cube reduced)
function outerMoves(rand, len) {
  const faces = 'URFDLB';
  const moves = [];
  let last = '';
  for (let i = 0; i < len; i++) {
    let f;
    do f = faces[Math.floor(rand() * 6)]; while (f === last);
    last = f;
    moves.push({ face: f, lo: 1, hi: 1, amt: 1 + Math.floor(rand() * 3) });
  }
  return moves;
}
function scramble(N, rand, len = 30) { return applyMoves(N, solvedState(N), outerMoves(rand, len)); }

const ROTS = ['', 'x', 'x2', "x'", 'y', 'y2', "y'", 'z', "z'", 'x y', 'x y2', "x y'", "x' y", "x' y2", "x' y'",
  'z y', 'z y2', "z y'", "z' y", "z' y2", "z' y'", 'x2 y', 'x2 y2', "x2 y'"];
const rotMoves = (N, rand) => parseAlg(ROTS[Math.floor(rand() * 24)], N);

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

// ---------- 2x2 (corners only)
test('2x2: solves 3000 random states (with random whole-cube turns)', () => {
  const rand = rng(7);
  let total = 0, max = 0, maxSteps = 0;
  for (let i = 0; i < 3000; i++) {
    const s = applyMoves(2, scramble(2, rand, 25), rotMoves(2, rand));
    const steps = solve2x2(s);
    for (const st of steps) {
      assert(st.stage === '3x3' && st.title && st.explanation && st.moves.length, `bad step on 2x2 #${i}`);
      for (const m of st.moves) assert(m.lo === 1 && (m.hi === 1 || m.hi === 2), `bad 2x2 move on #${i}`);
    }
    const moves = steps.flatMap(st => st.moves);
    assert(isSolved(2, applyMoves(2, s, moves)), `2x2 #${i} not solved`);
    total += moves.length; max = Math.max(max, moves.length); maxSteps = Math.max(maxSteps, steps.length);
  }
  console.log(`  2x2: 3000 solves, avg ${(total / 3000).toFixed(1)} moves, max ${max}, max ${maxSteps} steps`);
});
test('2x2: odd corner permutation (a single U turn) is solved', () => {
  const s = applyMoves(2, solvedState(2), parseAlg('U', 2));
  assert(isSolved(2, applyMoves(2, s, solve2x2(s).flatMap(st => st.moves))));
});

// ---------- even cubes: parity algs, verified on the engine
function reduced(N, s) {
  const nn = N * N;
  for (let f = 0; f < 6; f++) {
    const at = (r, c) => s[f * nn + r * N + c];
    const c0 = at(1, 1);
    for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) if (at(r, c) !== c0) return false;
    const strips = [(k) => at(0, k), (k) => at(N - 1, k), (k) => at(k, 0), (k) => at(k, N - 1)];
    for (const g of strips) for (let k = 2; k < N - 1; k++) if (g(k) !== g(1)) return false;
  }
  return true;
}
const diff = (a, b) => { const d = []; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d.push(i); return d; };
const swapStickers = (s, pairs) => { const t = Uint8Array.from(s); for (const [a, b] of pairs) { t[a] = s[b]; t[b] = s[a]; } return t; };
// 3x3 sticker indices: U7 / F1 = the UF edge, U1 / B1 = the UB edge
const FLIP_UF = [[7, 19]], SWAP_UF_UB = [[7, 1], [19, 46]];
const where = (N, i) => { const nn = N * N; return { f: Math.floor(i / nn), r: Math.floor((i % nn) / N), c: i % N }; };

for (const N of [4, 6]) {
  const text = evenParityText(N), algs = evenParityAlgs(N);

  test(`${N}x${N}: parity alg text round-trips through the notation`, () => {
    assert(formatAlg(algs.oll, N) === text.oll, formatAlg(algs.oll, N));
    assert(formatAlg(algs.pll, N) === text.pll, formatAlg(algs.pll, N));
  });

  test(`${N}x${N}: OLL parity alg flips only the UF edge, keeps centers and pairs`, () => {
    const S = solvedState(N), s = applyMoves(N, S, algs.oll);
    assert(reduced(N, s), 'centers or pairs broken');
    const s3 = project(N, s);
    assert(diff(s3, swapStickers(project(N, S), FLIP_UF)).length === 0, 'projected effect is not a UF flip');
    for (const i of diff(s, S)) { // on the real cube only UF wing stickers change color
      const { f, r, c } = where(N, i);
      assert((f === 0 && r === N - 1 || f === 2 && r === 0) && c > 0 && c < N - 1, `sticker ${i} changed`);
    }
    const p = parity3(s3);
    assert(p.flip === 1 && p.edgePerm === 0 && p.cornerPerm === 0);
  });

  test(`${N}x${N}: PLL parity alg swaps only UF and UB, keeps centers and pairs`, () => {
    const S = solvedState(N), s = applyMoves(N, S, algs.pll);
    assert(reduced(N, s), 'centers or pairs broken');
    const s3 = project(N, s);
    assert(diff(s3, swapStickers(project(N, S), SWAP_UF_UB)).length === 0, 'projected effect is not a UF-UB swap');
    for (const i of diff(s, S)) {
      const { f, r, c } = where(N, i);
      const onU = f === 0 && (r === 0 || r === N - 1), onSide = (f === 2 || f === 5) && r === 0;
      assert((onU || onSide) && c > 0 && c < N - 1, `sticker ${i} changed`);
    }
    const p = parity3(s3);
    assert(p.flip === 0 && p.edgePerm === 1 && p.cornerPerm === 0);
  });

  test(`${N}x${N}: parity algs on 300 random reduced states keep it reduced and toggle parity`, () => {
    const rand = rng(100 + N);
    for (let i = 0; i < 300; i++) {
      const s = applyMoves(N, scramble(N, rand, 30), rotMoves(N, rand));
      const p0 = parity3(project(N, s));
      const a = applyMoves(N, s, algs.oll), b = applyMoves(N, s, algs.pll);
      assert(reduced(N, a) && reduced(N, b), `#${i} not reduced after parity alg`);
      const pa = parity3(project(N, a)), pb = parity3(project(N, b));
      const mis = (p) => p.edgePerm ^ p.cornerPerm;
      assert(pa.flip !== p0.flip && mis(pa) === mis(p0), `#${i} OLL effect`);
      assert(pb.flip === p0.flip && mis(pb) !== mis(p0), `#${i} PLL effect`);
    }
  });

  test(`${N}x${N}: 3x3 stage (with parity) solves 400 synthetic reduced states`, () => {
    const rand = rng(200 + N);
    const seen = { oll: 0, pll: 0 };
    let total = 0, max = 0;
    for (let i = 0; i < 400; i++) {
      // reduced state with random parity: outer scramble, parity algs in random
      // spots, more outer moves, then a random way of holding it
      let s = scramble(N, rand, 20);
      if (rand() < 0.5) s = applyMoves(N, s, algs.oll);
      s = applyMoves(N, s, [...rotMoves(N, rand), ...outerMoves(rand, 5)]);
      if (rand() < 0.5) s = applyMoves(N, s, algs.pll);
      s = applyMoves(N, s, [...outerMoves(rand, 15), ...rotMoves(N, rand)]);
      assert(reduced(N, s));
      const p = parity3(project(N, s));
      const steps = solve3x3Stage(N, s);
      const par = steps.filter(st => st.stage === 'parity');
      assert(par.length === p.flip + (p.edgePerm ^ p.cornerPerm), `#${i} parity step count`);
      if (p.flip) seen.oll++;
      if (p.edgePerm !== p.cornerPerm) seen.pll++;
      for (const st of steps) {
        assert(st.title && st.explanation && st.moves.length && (st.stage === '3x3' || st.stage === 'parity'), `bad step #${i}`);
        if (st.stage === '3x3') for (const m of st.moves) assert(m.lo === 1 && (m.hi === 1 || m.hi === N), `#${i} inner move in 3x3 stage`);
        const t = formatAlg(st.moves, N);
        assert(formatAlg(parseAlg(t, N), N) === t, `#${i} moves do not round-trip`);
      }
      const moves = steps.flatMap(st => st.moves);
      assert(isSolved(N, applyMoves(N, s, moves)), `${N}x${N} #${i} not solved`);
      total += moves.length; max = Math.max(max, moves.length);
    }
    assert(seen.oll > 50 && seen.pll > 50, `parity cases not covered ${JSON.stringify(seen)}`);
    console.log(`  ${N}x${N} reduced: 400 solves, avg ${(total / 400).toFixed(1)} moves, max ${max}, OLL parity ${seen.oll}x, PLL parity ${seen.pll}x`);
  });

  test(`${N}x${N}: fixEvenParity leaves a parity-free reduced cube`, () => {
    const rand = rng(300 + N);
    for (let i = 0; i < 100; i++) {
      let s = scramble(N, rand, 25);
      if (i & 1) s = applyMoves(N, s, algs.oll);
      if (i & 2) s = applyMoves(N, s, [...outerMoves(rand, 3), ...algs.pll]);
      const { state, steps } = fixEvenParity(N, s);
      const p = parity3(project(N, state));
      assert(reduced(N, state) && p.flip === 0 && p.edgePerm === p.cornerPerm, `#${i}`);
      assert(steps.every(st => st.stage === 'parity' && st.algId), `#${i} step fields`);
    }
  });
}

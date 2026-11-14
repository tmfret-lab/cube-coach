import { solvedState, applyMoves } from '../src/puzzles/nxn/state.js';
import { getPieces } from '../src/puzzles/nxn/pieces.js';
import { reduce, isReduced, fixedCentersHome } from '../src/puzzles/nxn/solver/reduce.js';
import { centersSolved } from '../src/puzzles/nxn/solver/centers.js';
import { edgesPaired } from '../src/puzzles/nxn/solver/edges.js';
import { parityAlg } from '../src/puzzles/nxn/solver/parity.js';
import { test, assert, eq } from './harness.mjs';

// deterministic PRNG so failures can be reproduced
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

// the original 7x7 scramble (face or slice 2..4, some wide moves)
function scramble7(len = 300) {
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

// any N: random face, single-slice (any layer) and wide moves, ~20*N long
function scrambleN(N, len = 20 * N) {
  const ms = [];
  for (let i = 0; i < len; i++) {
    const face = 'URFDLB'[Math.floor(rnd() * 6)];
    const amt = 1 + Math.floor(rnd() * 3);
    const k = 1 + Math.floor(rnd() * (N - 1));
    ms.push(rnd() < 0.2 ? { face, lo: 1, hi: Math.max(2, k), amt } : { face, lo: k, hi: k, amt });
  }
  return ms;
}

// Independent check (not using the solver's own helpers): every center sticker
// has its face's color, and along every edge of every face, the non-corner
// stickers all have one color (so each edge shows one color pair).
function reducedByEye(N, s) {
  const nn = N * N;
  for (let f = 0; f < 6; f++) {
    for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) if (s[f * nn + r * N + c] !== f) return false;
    const lines = [[0, null], [N - 1, null], [null, 0], [null, N - 1]];
    for (const [r, c] of lines) {
      const at = (i) => s[f * nn + (r ?? i) * N + (c ?? i)];
      for (let i = 2; i < N - 1; i++) if (at(i) !== at(1)) return false;
    }
  }
  return true;
}

for (const [N, depths] of [[7, [1, 2]], [4, [1]], [6, [1, 2]]]) {
  for (const depth of depths) {
    test(`${N}x${N} parity alg depth ${depth} swaps only the two UF wings`, () => {
      const P = getPieces(N), S = solvedState(N);
      const s = applyMoves(N, S, parityAlg(N, depth));
      const changed = [];
      for (let i = 0; i < s.length; i++) if (s[i] !== S[i]) changed.push(i);
      eq(changed.length, 4);
      const cubies = new Set(changed.map(i => P.cubies[P.stickerCubie[i]]));
      assert([...cubies].every(c => c.type === 'wing' && c.depth === depth && c.pos[1] > 0 && c.pos[2] > 0), 'wrong pieces');
    });
  }
}

for (const N of [4, 5, 6, 7]) {
  test(`${N}x${N} solved cube needs no reduction moves`, () => {
    const S = solvedState(N);
    assert(isReduced(N, S), 'solved cube should count as reduced');
    const r = reduce(N, S);
    eq(r.steps.reduce((n, s) => n + s.moves.length, 0), 0);
  });
}

test('isReduced rejects an unpaired 4x4 edge and unsolved 4x4 centers', () => {
  const N = 4, S = solvedState(N);
  const sliced = applyMoves(N, S, [{ face: 'R', lo: 2, hi: 2, amt: 1 }]);
  assert(!isReduced(N, sliced) && !centersSolved(N, sliced) && !edgesPaired(N, sliced), 'r should break it');
  // a "flipped" dedge (two wings swapped) is still paired: that is OLL parity for the 3x3 stage
  const flipped = applyMoves(N, S, parityAlg(N, 1));
  assert(isReduced(N, flipped), 'swapped wings still form a paired edge');
});

const RUNS = {
  4: +(process.env.REDUCE_RUNS_4 || 200),
  5: +(process.env.REDUCE_RUNS_5 || 50),
  6: +(process.env.REDUCE_RUNS_6 || 200),
  7: +(process.env.REDUCE_RUNS || 200),
};
for (const N of [7, 4, 5, 6]) {
  const runs = RUNS[N];
  const S = solvedState(N);
  reduce(N, applyMoves(N, S, [{ face: 'R', lo: 2, hi: 2, amt: 1 }, { face: 'U', lo: 1, hi: 1, amt: 1 }, { face: 'F', lo: 2, hi: 2, amt: 3 }])); // warm the caches
  const stage = { centers: 0, edges: 0, parity: 0 };
  const stageMax = { centers: 0, edges: 0, parity: 0 };
  let total = 0, max = 0, time = 0, maxTime = 0, parity = 0, fails = 0;
  for (let i = 0; i < runs; i++) {
    const start = applyMoves(N, S, N === 7 ? scramble7() : scrambleN(N));
    const t0 = performance.now();
    let r;
    try { r = reduce(N, start); } catch (e) { fails++; console.log(`FAIL ${N}x${N} reduce #${i}: ${e.message}`); continue; }
    const dt = performance.now() - t0;
    time += dt; maxTime = Math.max(maxTime, dt);
    const moves = r.steps.flatMap(s => s.moves);
    total += moves.length; max = Math.max(max, moves.length);
    const per = { centers: 0, edges: 0, parity: 0 };
    for (const s of r.steps) per[s.stage] += s.moves.length;
    for (const k in per) { stage[k] += per[k]; stageMax[k] = Math.max(stageMax[k], per[k]); }
    parity += r.steps.filter(s => s.stage === 'parity').length;
    const end = applyMoves(N, start, moves);
    const ok = end.join() === Array.from(r.state).join() && isReduced(N, end) && fixedCentersHome(N, end) &&
      (N % 2 === 1 || reducedByEye(N, end)) &&
      r.steps.every(s => s.title && s.explanation && s.moves.length && ['centers', 'edges', 'parity'].includes(s.stage)) &&
      r.steps.every(s => !/7x7/.test(s.explanation) || N === 7);
    if (!ok) { fails++; console.log(`FAIL ${N}x${N} reduction #${i} produced a bad state`); }
  }
  test(`reduce ${runs} random ${N}x${N} scrambles`, () => eq(fails, 0, 'failed reductions'));
  const avg = (v) => (v / runs).toFixed(0);
  console.log(`reduction ${N}x${N}: ${runs} scrambles, moves avg ${avg(total)} max ${max} ` +
    `(centers avg ${avg(stage.centers)} max ${stageMax.centers}, edges avg ${avg(stage.edges)} max ${stageMax.edges}, ` +
    `parity avg ${avg(stage.parity)} max ${stageMax.parity}), ` +
    `time avg ${(time / runs).toFixed(0)} ms max ${maxTime.toFixed(0)} ms, parity fixes ${parity}`);
}

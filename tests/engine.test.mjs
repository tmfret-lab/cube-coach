import { solvedState, applyMoves, isSolved, idx } from '../src/puzzles/nxn/state.js';
import { parseAlg, formatAlg, invertAlg } from '../src/core/notation.js';
import { test, assert, eq } from './harness.mjs';

const N = 7;
const S = solvedState(N);
const run = (alg, s = S) => applyMoves(N, s, parseAlg(alg, N));

test('sexy move x6 is identity', () => assert(isSolved(N, run("(R U R' U')6"))));
test('R4 identity', () => assert(isSolved(N, run('R R R R'))));
test('every face x4 identity, all depths', () => {
  for (const f of 'URFDLB') for (let k = 1; k <= 7; k++) {
    assert(isSolved(N, run(`${k}${f} ${k}${f} ${k}${f} ${k}${f}`)), `${k}${f}`);
  }
});
test('3Rw = R 2R 3R', () => eq(run('3Rw').join(), run('R 2R 3R').join()));
test('x = all R layers', () => eq(run('x').join(), run('7Rw').join()));
test('R equals x 6Lw', () => eq(run('R').join(), run('x 6Lw').join()));
test('R moves front to top', () => {
  const s = run('R');
  // sticker at F row0 col6 (green) should now be at U row0? -> F column 6 goes to U column 6
  eq(s[idx(N, 'U', 3, 6)], 2);
  eq(s[idx(N, 'U', 3, 5)], 0);
});
test('U moves front to left', () => eq(run('U')[idx(N, 'L', 0, 3)], 2));
test('F moves top to right', () => eq(run('F')[idx(N, 'R', 3, 0)], 0));
test('D moves front to right', () => eq(run('D')[idx(N, 'R', 6, 3)], 2));
test('L moves top to front', () => eq(run('L')[idx(N, 'F', 3, 0)], 0));
test('B moves top to left', () => eq(run('B')[idx(N, 'L', 3, 0)], 0));
test('alg then inverse is identity', () => {
  const a = parseAlg("3Rw U2 2L' F 3D2 Bw' x y' z2 M E' S", N);
  assert(isSolved(N, applyMoves(N, applyMoves(N, S, a), invertAlg(a))));
});
test('format round trip', () => {
  const t = "R U' 3Rw2 2L Rw' x y2 z' M";
  eq(formatAlg(parseAlg(t, N), N), t);
});

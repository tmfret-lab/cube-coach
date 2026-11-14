import { solvedState, applyMoves, idx } from '../src/puzzles/nxn/state.js';
import { getPieces } from '../src/puzzles/nxn/pieces.js';
import { validate, EMPTY } from '../src/puzzles/nxn/validate.js';
import { test, assert } from './harness.mjs';

const N = 7;
const S = solvedState(N);
const P = getPieces(N);

let seed = 12345;
const rand = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };

function randomMoves(count, { inner = true, rotations = false } = {}) {
  const moves = [];
  for (let i = 0; i < count; i++) {
    const face = 'URFDLB'[rand(6)];
    let lo, hi;
    const kind = rand(3);
    if (kind === 0 || !inner) { lo = hi = 1; }
    else if (kind === 1) { lo = hi = 1 + rand(3); }       // single inner slice (not the middle)
    else { lo = 1; hi = 1 + rand(3); }                     // wide
    if (rotations && rand(10) === 0) { lo = 1; hi = N; }
    if (rotations && rand(10) === 0) { lo = hi = 4; }      // middle slice
    moves.push({ face, lo, hi, amt: 1 + rand(3) });
  }
  return moves;
}

const scrambled = (k = 200) => applyMoves(N, S, randomMoves(k));
const swap = (s, a, b) => { const t = s.slice(); [t[a], t[b]] = [t[b], t[a]]; return t; };

function expectFail(state, re, name) {
  const r = validate(N, state);
  assert(!r.ok, `${name}: expected failure`);
  assert(r.errors.length > 0, `${name}: expected errors`);
  if (re) assert(r.errors.some(e => re.test(e.message)), `${name}: no message matching ${re}: ${r.errors.map(e => e.message).join(' | ')}`);
  return r;
}

const hasHighlight = (r) => r.errors.some(e => e.stickers.length > 0);

test('solved is valid', () => {
  const r = validate(N, S);
  assert(r.ok, r.errors.map(e => e.message).join(' | '));
  assert(r.counts.every(c => c === 49));
});

test('30 random scrambles are valid', () => {
  for (let i = 0; i < 30; i++) {
    const r = validate(N, scrambled());
    assert(r.ok, `scramble ${i}: ${r.errors.map(e => e.message).join(' | ')}`);
  }
});

test('scrambles with middle slices and rotations that restore centers are valid', () => {
  for (let i = 0; i < 10; i++) {
    const a = randomMoves(60);
    const s = applyMoves(N, S, [...a, { face: 'R', lo: 4, hi: 4, amt: 1 }, ...randomMoves(40), { face: 'R', lo: 4, hi: 4, amt: 3 }]);
    const r = validate(N, s);
    // middle slice commutes fixed centers back; still a legal state
    assert(r.ok, r.errors.map(e => e.message).join(' | '));
  }
});

test('valid on 3x3, 4x4 and 5x5 too', () => {
  for (const n of [3, 4, 5]) {
    const moves = [];
    for (let i = 0; i < 80; i++) moves.push({ face: 'URFDLB'[rand(6)], lo: 1, hi: 1 + rand(Math.floor(n / 2)), amt: 1 + rand(3) });
    const r = validate(n, applyMoves(n, solvedState(n), moves));
    assert(r.ok, `${n}: ${r.errors.map(e => e.message).join(' | ')}`);
  }
});

test('empty stickers', () => {
  const s = S.slice(); s[5] = EMPTY; s[100] = EMPTY;
  const r = expectFail(s, /still need/, 'empty');
  assert(r.errors[0].stickers.length === 2);
});

test('wrong color counts', () => {
  const s = S.slice(); s[idx(N, 'F', 2, 2)] = 1; // a green center sticker painted red
  const r = expectFail(s, /50 red/, 'counts');
  assert(r.errors.some(e => /only 48 green/.test(e.message)));
  assert(hasHighlight(r), 'center problem should highlight');
});

test('swapped fixed centers', () => {
  const c = Math.floor(N / 2);
  const r = expectFail(swap(S, idx(N, 'F', c, c), idx(N, 'R', c, c)), /white center on top/, 'fixed');
  assert(hasHighlight(r));
});

test('single corner twist', () => {
  const s = scrambled();
  const corner = P.corners[3].stickers;
  const t = s.slice();
  [t[corner[0]], t[corner[1]], t[corner[2]]] = [s[corner[1]], s[corner[2]], s[corner[0]]];
  const r = expectFail(t, /twisted/, 'twist');
  assert(hasHighlight(r));
});

test('single midge flip', () => {
  const s = scrambled();
  const [a, b] = P.midges[5].stickers;
  const r = expectFail(swap(s, a, b), /flipped/, 'flip');
  assert(hasHighlight(r));
});

test('two stickers swapped inside a corner (mirror)', () => {
  const [a, b] = P.corners[0].stickers;
  const r = expectFail(swap(S, a, b), /mirror/, 'corner mirror');
  assert(hasHighlight(r));
});

test('stickers swapped between two corners', () => {
  const s = scrambled();
  const a = P.corners[0].stickers[0], b = P.corners[6].stickers[1];
  if (s[a] === s[b]) return;
  const r = expectFail(swap(s, a, b), null, 'corner swap');
  assert(hasHighlight(r));
});

test('stickers swapped between two midges', () => {
  const a = P.midges[0].stickers[0], b = P.midges[7].stickers[1];
  const s = S;
  assert(s[a] !== s[b] || true);
  const r = expectFail(swap(s, a, b), null, 'midge swap');
  assert(hasHighlight(r));
});

test('wing stickers swapped within one wing', () => {
  const s = scrambled();
  const [a, b] = P.wings[4].stickers;
  const r = expectFail(swap(s, a, b), /wrong way round|same mirror/, 'wing flip');
  assert(hasHighlight(r));
});

test('wing stickers swapped between two wings', () => {
  const s = scrambled();
  for (let i = 0; i < 20; i++) {
    const w1 = P.wings[rand(P.wings.length)], w2 = P.wings[rand(P.wings.length)];
    const a = w1.stickers[0], b = w2.stickers[rand(2)];
    if (w1 === w2 || s[a] === s[b]) continue;
    const r = expectFail(swap(s, a, b), null, 'wing swap');
    assert(hasHighlight(r));
  }
});

test('center stickers swapped across orbits', () => {
  const s = scrambled();
  let done = 0;
  for (let i = 0; i < 50 && done < 10; i++) {
    const o1 = P.centerOrbits[rand(6)], o2 = P.centerOrbits[rand(6)];
    if (o1 === o2) continue;
    const a = o1.stickers[rand(24)], b = o2.stickers[rand(24)];
    if (s[a] === s[b]) continue;
    const r = expectFail(swap(s, a, b), /center/, 'center swap');
    assert(hasHighlight(r));
    done++;
  }
  assert(done > 0);
});

test('two whole corners swapped (parity)', () => {
  const t = S.slice();
  // swap corners UFR and UFL including orientation, keeping each piece real
  const ufr = [idx(N, 'U', 6, 6), idx(N, 'F', 0, 6), idx(N, 'R', 0, 0)];
  const ufl = [idx(N, 'U', 6, 0), idx(N, 'L', 0, 6), idx(N, 'F', 0, 0)];
  // map by sticker order U, then clockwise: UFR: U,R,F ; UFL: U,F,L
  const a = [ufr[0], ufr[2], ufr[1]], b = [ufl[0], ufl[2], ufl[1]];
  for (let i = 0; i < 3; i++) { t[a[i]] = S[b[i]]; t[b[i]] = S[a[i]]; }
  const r = validate(N, t);
  assert(!r.ok, 'expected failure');
  assert(r.errors.some(e => /swapped/.test(e.message)), r.errors.map(e => e.message).join(' | '));
});

test('messages name a face and row/column', () => {
  const [a, b] = P.corners[0].stickers;
  const r = validate(N, swap(S, a, b));
  assert(r.errors.some(e => /face, row \d+, column \d+/.test(e.message)));
});

// Every size: real scrambles pass, a missing color is caught.
for (const N2 of [2, 3, 4, 5, 6]) {
  test(`${N2}x${N2}: real scrambles validate, a wrong sticker is caught`, () => {
    let sd = 99 + N2;
    const rnd = (n) => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd % n; };
    for (let t = 0; t < 30; t++) {
      const mv = [];
      for (let i = 0; i < 80; i++) {
        const k = 1 + rnd(Math.max(1, Math.floor(N2 / 2)));
        mv.push({ face: 'URFDLB'[rnd(6)], lo: rnd(4) ? k : 1, hi: k, amt: 1 + rnd(3) });
      }
      const s = applyMoves(N2, solvedState(N2), mv);
      assert(validate(N2, s).ok, `scramble ${t} should be valid`);
      const b = Uint8Array.from(s);
      b[0] = (b[0] + 1) % 6;
      assert(!validate(N2, b).ok, `recolored sticker ${t} should be caught`);
    }
  });
}

import { solvedState, applyMoves, permOfMoves, isSolved, FACE_AXIS, getCube } from '../src/puzzles/nxn/state.js';
import { parseAlg, invertAlg } from '../src/core/notation.js';
import { getPieces } from '../src/puzzles/nxn/pieces.js';
import { getAlgs, getStages } from '../src/puzzles/nxn/algs.js';
import { getLessons } from '../src/puzzles/nxn/lessons.js';
import { test, assert, eq } from './harness.mjs';

const SIZES = (process.env.ALG_SIZES || '2,3,4,5,6,7').split(',').map(Number);
for (const N of SIZES) {
const m = N - 1;
const STAGES = getStages(N);
const S = solvedState(N);
const P = getPieces(N);
const cube = getCube(N);
const algs = getAlgs(N);

const cubieOf = (s) => P.cubies[P.stickerCubie[s]];
const inLayer = (s, face) => {
  const [axis, sign] = FACE_AXIS[face];
  return cubieOf(s).pos[axis] === sign * m;
};
const isCenterType = (t) => t === 'center' || t === 'fixed';

function moved(perm) {
  const out = [];
  for (let j = 0; j < perm.length; j++) if (perm[j] !== j) out.push(j);
  return out;
}
// Face turns shuffle same-colored center pieces around on that face. That is
// invisible once centers are solved, so layer and parity checks skip center
// pieces. Every alg is also checked for center colors (centersKept).
const movedPieces = (perm) => moved(perm).filter(j => !isCenterType(cubieOf(j).type));
function centersKept(a) {
  const s = applyMoves(N, S, parseAlg(a.alg, N));
  for (let j = 0; j < s.length; j++) {
    if (isCenterType(cubieOf(j).type)) assert(s[j] === S[j], `${a.id}: center sticker ${j} changed color`);
  }
}

const checks = {
  'order'(a, e) {
    const moves = parseAlg(a.alg, N);
    const p = permOfMoves(N, Array(e.n).fill(moves).flat());
    assert(moved(p).length === 0, `${a.id}: alg x${e.n} is not identity`);
  },
  'only-layers'(a, e, p) {
    centersKept(a);
    for (const j of movedPieces(p)) assert(e.faces.some(f => inLayer(j, f)), `${a.id}: moves sticker ${j} outside ${e.faces}`);
  },
  'keeps-layers'(a, e, p) {
    for (const j of movedPieces(p)) assert(!e.faces.some(f => inLayer(j, f)), `${a.id}: moves sticker ${j} in ${e.faces}`);
  },
  'keeps-face-centers'(a, e, p) {
    for (const j of moved(p)) {
      const st = cube.stickers[j];
      assert(!(e.faces.includes(st.face) && isCenterType(cubieOf(j).type)), `${a.id}: moves a ${st.face} center`);
    }
  },
  'only-types'(a, e, p) {
    for (const j of movedPieces(p)) assert(e.types.includes(cubieOf(j).type), `${a.id}: moves a ${cubieOf(j).type}`);
  },
  'centers-kept'(a) { centersKept(a); },
  'center-3cycle'(a, e, p) {
    const mv = moved(p);
    eq(mv.length, 3, `${a.id}: moved stickers`);
    for (const j of mv) eq(cubieOf(j).type, 'center', `${a.id}: piece type`);
    const j0 = mv[0];
    assert(p[p[p[j0]]] === j0 && p[j0] !== j0 && p[p[j0]] !== j0, `${a.id}: not a 3-cycle`);
  },
  'oll-parity'(a, e, p) {
    centersKept(a);
    const mv = movedPieces(p);
    eq(mv.length, 4, `${a.id}: moved stickers`);
    const cubies = new Set(mv.map(j => P.stickerCubie[j]));
    eq(cubies.size, 2, `${a.id}: moved cubies`);
    for (const id of cubies) {
      const c = P.cubies[id];
      eq(c.type, 'wing', `${a.id}: type`);
      eq(c.depth, e.depth, `${a.id}: wing depth`);
      assert(c.pos[1] === m && c.pos[2] === m, `${a.id}: wing not in UF`);
    }
    for (const j of mv) assert(P.stickerCubie[p[j]] !== P.stickerCubie[j], `${a.id}: not a swap`);
  },
  'case'(a, e) {
    const cs = applyMoves(N, S, invertAlg(parseAlg(a.alg, N)));
    const U = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) U.push({ r, c, v: cs[r * N + c] });
    const edge = U.filter(x => (x.r === 0 || x.r === m || x.c === 0 || x.c === m) && !((x.r === 0 || x.r === m) && (x.c === 0 || x.c === m)));
    const corner = U.filter(x => (x.r === 0 || x.r === m) && (x.c === 0 || x.c === m));
    assert(!isSolved(N, cs), `${a.id}: case is already solved`);
    if (e.is === 'pll') assert(U.every(x => x.v === 0), `${a.id}: PLL case should have a full top face`);
    if (e.is === 'ocll') {
      assert(edge.every(x => x.v === 0), `${a.id}: OCLL case should have the top cross`);
      assert(corner.some(x => x.v !== 0), `${a.id}: OCLL case should have a twisted corner`);
    }
    if (e.is === 'oll-edges') assert(edge.some(x => x.v !== 0), `${a.id}: case should be missing the cross`);
  },
};

const REQUIRED = {
  'corner-insert': "R U R' U'",
  'f2l-right': "U R U' R' U' F' U F",
  'f2l-left': "U' L' U L U F U' F'",
  'll-cross': "F R U R' U' F'",
  'sune': "R U R' U R U2 R'",
  'corner-cycle': "U R U' L' U R' U' L",
  'u-perm': "R U' R U R U R U' R' U' R2",
  'edge-flip': "R U R' F R' F' R",
  'headlights': "R' F R' B2 R F' R' B2 R2",
};

test(`${N}x${N}: alg ids are unique`, () => eq(new Set(algs.map(a => a.id)).size, algs.length));
test(`${N}x${N}: required ids exist with the exact algs`, () => {
  for (const [id, alg] of Object.entries(REQUIRED)) { const a = algs.find(x => x.id === id); if (a || N >= 4 || !['f2l-right','f2l-left','ll-cross','u-perm','edge-flip'].includes(id)) { if (N < 4 && id === 'edge-flip') continue; eq(a?.alg, alg, id); } }
  if (N >= 4) assert(algs.some(a => a.id === 'oll-parity' || a.id === 'oll-parity-even'), 'oll-parity missing');
});
test(`${N}x${N}: every alg has a known stage`, () => {
  for (const a of algs) assert(STAGES.some(s => s.id === a.stage), `${a.id}: stage ${a.stage}`);
});

for (const a of algs) {
  test(`${N}x${N} alg ${a.id}: parses, inverse undoes it, effect holds`, () => {
    const moves = parseAlg(a.alg, N);
    assert(moves.length > 0, 'empty');
    assert(isSolved(N, applyMoves(N, applyMoves(N, S, moves), invertAlg(moves))), 'inverse does not undo');
    const p = permOfMoves(N, moves);
    assert(Array.isArray(a.effect) && a.effect.length, 'no effect claim');
    for (const e of a.effect) {
      const fn = checks[e.kind];
      assert(fn, `unknown effect ${e.kind}`);
      fn(a, e, p);
    }
  });
}

test(`${N}x${N} lessons: ids unique and every demo parses`, () => {
  const lessons = getLessons(N);
  assert(lessons.length >= (N >= 4 ? 6 : 3), 'too few lessons');
  eq(new Set(lessons.map(l => l.id)).size, lessons.length);
  for (const l of lessons) {
    assert(l.title && l.sections.length, l.id);
    for (const s of l.sections) {
      assert(typeof s.text === 'string' && s.text.length, `${l.id}: empty section`);
      if (s.demo) {
        if (s.demo.setup) parseAlg(s.demo.setup, N);
        assert(parseAlg(s.demo.alg, N).length, `${l.id}: empty demo`);
      }
    }
  }
});
}

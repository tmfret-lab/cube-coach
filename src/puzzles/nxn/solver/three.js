// 3x3 stage of the reduction method: beginner layer-by-layer.
// Works on a REDUCED NxN state (odd N; centers solved, edges paired) by
// projecting it to a 3x3 (corners, midges, fixed centers), solving that with
// the method a kid learns, and lifting the moves back to N.
import { solvedState, applyMoves, FACES, FACE_INDEX, COLOR_NAMES, movePerm } from '../state.js';
import { parseAlg, simplify } from '../../../core/notation.js';
import { getPieces } from '../pieces.js';

const N3 = 3;
const ALG = {
  'corner-insert': "R U R' U'",
  'f2l-right': "U R U' R' U' F' U F",
  'f2l-left': "U' L' U L U F U' F'",
  'll-cross': "F R U R' U' F'",
  'sune': "R U R' U R U2 R'",
  'headlights': "R' F R' B2 R F' R' B2 R2",
  'u-perm': "R U' R U R U R U' R' U' R2",
};
const P = (t) => parseAlg(t, N3);
const SIDE_WORD = { F: 'front', R: 'right', B: 'back', L: 'left' };

// ---------- 3x3 geometry helpers
const pieces = getPieces(N3);
const faceOf = (i) => FACES[Math.floor(i / 9)];
const slot = new Map(); // 'DFR' (sorted) -> cubie
for (const c of pieces.cubies) slot.set(c.stickers.map(faceOf).sort().join(''), c);
const at = (faces) => slot.get(faces.split('').sort().join(''));
const stickerOn = (cub, face) => cub.stickers.find(i => faceOf(i) === face);
const center = (s, f) => s[FACE_INDEX[f] * 9 + 4];
const colorsOf = (s, cub) => cub.stickers.map(i => s[i]);
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const solvedPiece = (s, cub) => cub.stickers.every(i => s[i] === center(s, faceOf(i)));
const name = (c) => COLOR_NAMES[c];
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const D_EDGES = ['DF', 'DR', 'DB', 'DL'].map(at);
const D_CORNERS = ['DFR', 'DRB', 'DBL', 'DLF'].map(at);
const MID_EDGES = ['FR', 'RB', 'BL', 'LF'].map(at);
const U_EDGES = ['UF', 'UR', 'UB', 'UL'].map(at);
const U_CORNERS = ['UFR', 'URB', 'UBL', 'ULF'].map(at);
function findPiece(s, list, colors) { return list.find(c => sameSet(colorsOf(s, c), colors)); }
const EDGES = pieces.midges, CORNERS = pieces.corners;

// sticker destination maps for the 18 outer moves (for the cross search)
const OUTER = [];
for (const face of FACES) for (const amt of [1, 2, 3]) {
  const src = movePerm(N3, { face, lo: 1, hi: 1, amt });
  const dest = new Int8Array(54);
  for (let j = 0; j < 54; j++) dest[src[j]] = j;
  OUTER.push({ move: { face, lo: 1, hi: 1, amt }, dest });
}

// ---------- step builder
class Builder {
  constructor(s) { this.s = s; this.steps = []; this.cur = null; }
  begin(title, explanation, algId) { this.cur = { stage: '3x3', title, explanation, moves: [] }; if (algId) this.cur.algId = algId; }
  apply(moves) {
    if (typeof moves === 'string') moves = P(moves);
    this.s = applyMoves(N3, this.s, moves);
    this.cur.moves.push(...moves.map(m => ({ ...m })));
  }
  end() {
    const c = this.cur; this.cur = null;
    c.moves = simplify(c.moves);
    if (c.moves.length) this.steps.push(c);
  }
}
// y-like rotation helper: amount k (0..3) of a face letter or rotation
function rotStr(base, k) { return k === 0 ? '' : k === 1 ? base : k === 2 ? base + '2' : base + "'"; }
function tryTurns(b, base, test) {
  for (let k = 0; k < 4; k++) {
    const m = rotStr(base, k);
    const t = m ? applyMoves(N3, b.s, P(m)) : b.s;
    if (test(t)) { if (m) b.apply(m); return k; }
  }
  return -1;
}

// ---------- stages
function flip(b) {
  const white = 0;
  const where = FACES.find(f => center(b.s, f) === white);
  const rot = { U: 'z2', D: '', F: "x'", B: 'x', R: 'z', L: "z'" }[where];
  if (!rot) return;
  b.begin('3x3: flip the cube',
    where === 'U'
      ? 'The 3x3 part starts with white on the bottom. Turn the whole cube upside down like a steering wheel (z2), so white goes to the bottom and yellow comes to the top. Keep the same color facing you.'
      : 'Turn the whole cube so the white center is on the bottom and yellow is on top.');
  b.apply(rot);
  b.end();
}

function crossSearch(s, tracked) {
  // tracked: [{ pos, goal }] sticker positions; BFS over outer moves
  const n = tracked.length;
  const start = tracked.map(t => t.pos), goal = tracked.map(t => t.goal);
  const key = (p) => { let k = 0; for (const v of p) k = k * 54 + v; return k; };
  const goalKey = key(goal);
  const sk = key(start);
  if (sk === goalKey) return [];
  const prev = new Map([[sk, null]]);
  let frontier = [{ p: start, k: sk, last: -1 }];
  while (frontier.length) {
    const next = [];
    for (const node of frontier) {
      for (let mi = 0; mi < OUTER.length; mi++) {
        const face = Math.floor(mi / 3);
        if (node.last >= 0 && Math.floor(node.last / 3) === face) continue;
        const d = OUTER[mi].dest;
        const p = new Array(n);
        for (let i = 0; i < n; i++) p[i] = d[node.p[i]];
        const k = key(p);
        if (prev.has(k)) continue;
        prev.set(k, [node.k, mi]);
        if (k === goalKey) {
          const path = [];
          let cur = k;
          while (prev.get(cur)) { const [pk, m] = prev.get(cur); path.push(OUTER[m].move); cur = pk; }
          return path.reverse();
        }
        next.push({ p, k, last: mi });
      }
    }
    frontier = next;
  }
  throw new Error('cross search failed');
}

function describeEdgeSpot(cub) {
  const fs = cub.stickers.map(faceOf);
  if (fs.includes('U')) return `on the top layer, ${SIDE_WORD[fs.find(f => f !== 'U')]} side`;
  if (fs.includes('D')) return `on the bottom layer, ${SIDE_WORD[fs.find(f => f !== 'D')]} side`;
  return `in the middle layer, between the ${SIDE_WORD[fs[0]]} and ${SIDE_WORD[fs[1]]} faces`;
}

function whiteCross(b) {
  const white = center(b.s, 'D');
  const solvedSides = [];
  const goalOf = (s, side) => { // side color -> goal positions of white sticker & side sticker
    const f = ['F', 'R', 'B', 'L'].find(x => center(s, x) === side);
    const cub = at('D' + f);
    return { w: stickerOn(cub, 'D'), c: stickerOn(cub, f) };
  };
  const posOf = (s, side) => {
    const cub = findPiece(s, EDGES, [white, side]);
    const w = cub.stickers.find(i => s[i] === white);
    return { cub, w };
  };
  let shown = 0;
  const crossTotal = ['F', 'R', 'B', 'L'].filter(f => { const c = findPiece(b.s, EDGES, [white, center(b.s, f)]); const w = c.stickers.find(i => b.s[i] === white); return w !== goalOf(b.s, center(b.s, f)).w; }).length;
  for (let n = 1; n <= 4; n++) {
    const remaining = ['F', 'R', 'B', 'L'].map(f => center(b.s, f)).filter(c => !solvedSides.includes(c));
    let best = null;
    for (const side of remaining) {
      const tracked = [...solvedSides, side].map(c => ({ pos: posOf(b.s, c).w, goal: goalOf(b.s, c).w }));
      const path = crossSearch(b.s, tracked);
      if (!best || path.length < best.path.length) best = { side, path };
      if (path.length === 0) break;
    }
    const { cub } = posOf(b.s, best.side);
    const sideName = name(best.side);
    if (best.path.length) shown++;
    b.begin(`White cross: edge ${shown} of ${crossTotal}`,
      best.path.length === 0
        ? `The white-${sideName} edge is already in place under the ${sideName} center. Nothing to do!`
        : `Find the white and ${sideName} edge piece. It is ${describeEdgeSpot(cub)}. Move it down to the bottom so the white sticker is on the bottom and the ${sideName} sticker sits under the ${sideName} center. Keep yellow on top while you turn.`);
    b.apply(best.path);
    b.end();
    solvedSides.push(best.side);
  }
}

function whiteCorners(b) {
  const white = center(b.s, 'D');
  const total = D_CORNERS.filter(c => !solvedPiece(b.s, c)).length;
  for (let n = 1; n <= 4; n++) {
    const unsolved = D_CORNERS.filter(c => !solvedPiece(b.s, c));
    if (!unsolved.length) break;
    // prefer a white corner already on the top layer
    let piece = U_CORNERS.find(c => colorsOf(b.s, c).includes(white));
    b.begin(`White corners: corner ${n} of ${total}`, '', 'corner-insert');
    let text = '';
    if (!piece) {
      // a white corner is stuck in the bottom layer in the wrong spot: pop it out
      const stuck = unsolved[0];
      const cols = colorsOf(b.s, stuck).filter(c => c !== white);
      tryTurns(b, 'y', t => sameSet([center(t, 'F'), center(t, 'R')], cols) || sameSet(colorsOf(t, at('DFR')), colorsOf(b.s, stuck)));
      text += `A white corner is stuck in the bottom layer in the wrong spot. Hold it at the front-right bottom and do R U R' U' once to lift it to the top. `;
      b.apply(ALG['corner-insert']);
      piece = U_CORNERS.find(c => colorsOf(b.s, c).includes(white));
    }
    const target = colorsOf(b.s, piece);
    const others = target.filter(c => c !== white);
    tryTurns(b, 'y', t => sameSet([center(t, 'F'), center(t, 'R')], others));
    tryTurns(b, 'U', t => sameSet(colorsOf(t, at('UFR')), target));
    const front = name(center(b.s, 'F')), right = name(center(b.s, 'R'));
    text += `Hold the cube with ${front} facing you (yellow on top). The white-${front}-${right} corner goes in the bottom-front-right spot. Turn the top so the corner sits right above that spot. Then repeat R U R' U' until the corner is in with white on the bottom.`;
    let reps = 0;
    while (!solvedPiece(b.s, at('DFR'))) {
      b.apply(ALG['corner-insert']);
      if (++reps > 6) throw new Error('corner insert loop');
    }
    b.cur.explanation = text + (reps === 1 ? ' (Here you only need to do it once.)' : reps ? ` (Here you need to do it ${reps} times.)` : '');
    b.end();
  }
}

function middleLayer(b) {
  const yellow = center(b.s, 'U');
  const total = MID_EDGES.filter(c => !solvedPiece(b.s, c)).length;
  for (let n = 1; n <= 6; n++) {
    if (MID_EDGES.every(c => solvedPiece(b.s, c))) break;
    let piece = U_EDGES.find(c => !colorsOf(b.s, c).includes(yellow));
    let text = '';
    b.begin(`Middle layer: edge ${Math.min(n, total)} of ${total}`, '');
    if (!piece) {
      const stuck = MID_EDGES.find(c => !solvedPiece(b.s, c));
      const fs = stuck.stickers.map(faceOf);
      const k = { FR: 0, RB: 1, BL: 2, LF: 3 }[['FR', 'RB', 'BL', 'LF'].find(x => sameSet(x.split(''), fs))];
      if (k) b.apply(rotStr('y', k));
      text += `An edge is stuck in the middle layer in the wrong spot. Hold it at the front-right and do U R U' R' U' F' U F once to pop it out to the top. `;
      b.apply(ALG['f2l-right']);
      piece = U_EDGES.find(c => !colorsOf(b.s, c).includes(yellow));
    }
    const top = b.s[stickerOn(piece, 'U')];
    const side = b.s[piece.stickers.find(i => faceOf(i) !== 'U')];
    tryTurns(b, 'y', t => center(t, 'F') === side);
    tryTurns(b, 'U', t => { const c = at('UF'); return t[stickerOn(c, 'F')] === side && t[stickerOn(c, 'U')] === top; });
    const goRight = center(b.s, 'R') === top;
    const front = name(side);
    text += `Find the ${front}-${name(top)} edge on the top. Hold ${front} facing you and turn the top until the edge's ${front} sticker lines up with the ${front} center (it makes an upside-down T). Its top sticker is ${name(top)}, so it goes to the ${goRight ? 'right' : 'left'}.`;
    b.cur.algId = goRight ? 'f2l-right' : 'f2l-left';
    b.apply(ALG[b.cur.algId]);
    b.cur.explanation = text;
    b.end();
  }
}

function yellowCross(b) {
  const Y = () => center(b.s, 'U');
  const up = (c) => b.s[stickerOn(c, 'U')] === Y();
  for (let guard = 0; guard < 4; guard++) {
    const e = U_EDGES.map(up); // F R B L
    const count = e.filter(Boolean).length;
    if (count === 4) break;
    let text;
    b.begin('Yellow cross', '', 'll-cross');
    if (count === 0) {
      text = 'There is only a yellow dot in the middle. Do F R U R\' U\' F\' from any side. You will get an L shape or a line next.';
    } else {
      const line = (e[0] && e[2]) || (e[1] && e[3]);
      if (line) {
        tryTurns(b, 'U', t => t[stickerOn(at('UL'), 'U')] === Y() && t[stickerOn(at('UR'), 'U')] === Y());
        text = 'There is a yellow line. Turn the top so the line goes left to right (sideways), then do F R U R\' U\' F\'.';
      } else {
        tryTurns(b, 'U', t => t[stickerOn(at('UL'), 'U')] === Y() && t[stickerOn(at('UB'), 'U')] === Y());
        text = 'There is a yellow L shape. Turn the top so the L points to the back and the left (like the hands of a clock at 9 and 12), then do F R U R\' U\' F\'.';
      }
    }
    b.cur.explanation = text;
    b.apply(ALG['ll-cross']);
    b.end();
  }
}

function yellowFace(b) {
  const Y = center(b.s, 'U');
  for (let guard = 0; guard < 8; guard++) {
    const oriented = U_CORNERS.filter(c => b.s[stickerOn(c, 'U')] === Y).length;
    if (oriented === 4) break;
    let text;
    b.begin('Yellow face', '', 'sune');
    const ULF = at('ULF');
    if (oriented === 1) {
      tryTurns(b, 'U', t => t[stickerOn(ULF, 'U')] === Y);
      text = 'Only one corner has yellow on top (you see a little fish). Turn the top so that corner is at the front-left, then do R U R\' U R U2 R\'.';
    } else if (oriented === 0) {
      tryTurns(b, 'U', t => t[stickerOn(ULF, 'L')] === Y);
      text = 'No corners have yellow on top. Turn the top until the front-left corner has its yellow sticker facing left, then do R U R\' U R U2 R\'.';
    } else {
      tryTurns(b, 'U', t => t[stickerOn(ULF, 'F')] === Y);
      text = 'Two corners have yellow on top. Turn the top until the front-left corner has its yellow sticker facing you, then do R U R\' U R U2 R\'.';
    }
    b.cur.explanation = text;
    b.apply(ALG['sune']);
    b.end();
  }
  if (U_CORNERS.some(c => b.s[stickerOn(c, 'U')] !== Y)) throw new Error('yellow face did not finish');
}

// corners match each other (some U turn solves them all)?
function cornersAligned(s) {
  for (let k = 0; k < 4; k++) {
    const t = k ? applyMoves(N3, s, P(rotStr('U', k))) : s;
    if (U_CORNERS.every(c => solvedPiece(t, c))) return k;
  }
  return -1;
}
// side faces that have "headlights" (both top corners show the same color)
function headlights(s) {
  const pairs = { F: ['ULF', 'UFR'], R: ['UFR', 'URB'], B: ['URB', 'UBL'], L: ['UBL', 'ULF'] };
  return Object.keys(pairs).filter(f => s[stickerOn(at(pairs[f][0]), f)] === s[stickerOn(at(pairs[f][1]), f)]);
}

function yellowCorners(b) {
  for (let guard = 0; guard < 4; guard++) {
    if (cornersAligned(b.s) >= 0) break;
    const hl = headlights(b.s);
    let text;
    b.begin('Yellow corners', '', 'headlights');
    if (hl.length) {
      // pick the U turn that puts headlights where the alg wants them, preferring one that finishes
      let done = false;
      for (let k = 0; k < 4 && !done; k++) {
        const m = rotStr('U', k);
        const t = applyMoves(N3, b.s, P((m + ' ' + ALG.headlights).trim()));
        if (cornersAligned(t) >= 0) { if (m) b.apply(m); done = true; }
      }
      if (!done) tryTurns(b, 'U', t => headlights(t).includes('B'));
      const where = SIDE_WORD[headlights(b.s)[0]];
      text = `Look at the sides of the top layer: one side has "headlights" (two corners with the same color). Turn the top so the headlights are on the ${where} side, then do R' F R' B2 R F' R' B2 R2.`;
    } else {
      text = "No side has headlights (two matching corner colors) yet. Do R' F R' B2 R F' R' B2 R2 from any side and headlights will appear.";
    }
    b.apply(ALG.headlights);
    b.cur.explanation = text;
    b.end();
  }
  const k = cornersAligned(b.s);
  if (k < 0) throw new Error('corners not solved');
  if (k) {
    b.begin('Line up the corners', 'All the yellow corners are in the right order now. Turn the top so each corner matches the colors of the sides.');
    b.apply(rotStr('U', k));
    b.end();
  }
}

function yellowEdges(b) {
  const done = (s) => U_EDGES.every(c => solvedPiece(s, c));
  const bar = (s) => ['F', 'R', 'B', 'L'].filter(f => solvedPiece(s, at('U' + f)));
  for (let guard = 0; guard < 4; guard++) {
    if (done(b.s)) break;
    b.begin('Yellow edges', '', 'u-perm');
    let text;
    if (bar(b.s).length) {
      let ok = false;
      for (let k = 0; k < 4 && !ok; k++) {
        const m = rotStr('y', k);
        const t = applyMoves(N3, b.s, P((m + ' ' + ALG['u-perm']).trim()));
        if (done(t)) { if (m) b.apply(m); ok = true; }
      }
      if (!ok) tryTurns(b, 'y', t => bar(t).includes('B'));
      const back = name(center(b.s, 'B')), front = name(center(b.s, 'F'));
      text = `One side is already fully solved (the ${back} side). Turn the whole cube so that solved side is at the back and ${front} faces you, then do R U' R U R U R U' R' U' R2.`;
    } else {
      text = "No side is fully solved yet. Do R U' R U R U R U' R' U' R2 from any side. After that, one side will be solved.";
    }
    b.apply(ALG['u-perm']);
    b.cur.explanation = text;
    b.end();
  }
  if (!done(b.s)) throw new Error('edges not solved');
}

// ---------- projection / lifting
function project(N, state) {
  if (N === 3) return Uint8Array.from(state);
  if (N % 2 === 0) throw new Error('3x3 stage needs an odd cube');
  const h = (N - 1) / 2, nn = N * N;
  const s = new Uint8Array(54);
  for (let f = 0; f < 6; f++) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
    s[f * 9 + r * 3 + c] = state[f * nn + r * h * N + c * h];
  return s;
}
function lift(N, m) { return { face: m.face, lo: m.lo, hi: m.hi === 3 ? N : m.hi, amt: m.amt }; }

export function solve3x3Stage(N, state) {
  const b = new Builder(project(N, state));
  flip(b);
  whiteCross(b);
  whiteCorners(b);
  middleLayer(b);
  yellowCross(b);
  yellowFace(b);
  yellowCorners(b);
  yellowEdges(b);
  return b.steps.map(st => ({ ...st, moves: st.moves.map(m => lift(N, m)) }));
}

export const THREE_STAGE_ALGS = ALG;
void solvedState; void CORNERS; void cap;

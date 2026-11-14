// Generic step engine for the reduction solver.
//
// A "candidate" is a short move sequence plus its sparse effect on the
// stickers: entries (to[i], from[i]) meaning newState[to] = oldState[from].
// Stages evaluate candidates cheaply against the current state, pick the
// best one (most progress per move), apply it, and repeat. Pure 3-cycle
// commutators are generated from the move group itself: [A, B] where the
// supports of A and B meet in exactly one cubie is always a 3-cycle.
import { getCube, movePerm, composeSrc, permOfMoves } from '../state.js';
import { getPieces } from '../pieces.js';
import { invertMove, invertAlg } from '../../../core/notation.js';

export function identity(size) {
  const p = new Int16Array(size);
  for (let i = 0; i < size; i++) p[i] = i;
  return p;
}

// Every single-layer move on layers `layers` (1 = outer), all three amounts.
export function sliceMoves(layers, faces = 'URFDLB', amts = [1, 2, 3]) {
  const out = [];
  for (const face of faces) for (const k of layers) for (const amt of amts) {
    out.push({ face, lo: k, hi: k, amt });
  }
  return out;
}

// Sparse effect of a src-permutation: only the stickers that move.
export function sparseOf(perm) {
  const to = [], from = [];
  for (let j = 0; j < perm.length; j++) if (perm[j] !== j) { to.push(j); from.push(perm[j]); }
  return { to: Int16Array.from(to), from: Int16Array.from(from) };
}

export function makeCandidate(N, moves, kind) {
  const perm = permOfMoves(N, moves);
  return { moves, kind, ...sparseOf(perm) };
}

// Apply a candidate's sparse effect to a state (returns a new state).
export function applySparse(state, cand) {
  const out = state.slice();
  for (let i = 0; i < cand.to.length; i++) out[cand.to[i]] = state[cand.from[i]];
  return out;
}

// Relabel a candidate by a setup sequence S, giving S C S'.
// If C maps (to <- from) then S C S' maps (q[to] <- q[from]) where q is the
// src-permutation of S.
export function conjugate(cand, setup, q) {
  const to = new Int16Array(cand.to.length), from = new Int16Array(cand.from.length);
  for (let i = 0; i < cand.to.length; i++) { to[i] = q[cand.to[i]]; from[i] = q[cand.from[i]]; }
  return { moves: [...setup, ...cand.moves, ...invertAlg(setup)], kind: cand.kind, to, from, setup: true };
}

// Pure 3-cycles [A, X Y X'] whose supports meet in exactly one cubie of a
// wanted type. `filter(cubie)` picks the type (center, wing, ...).
const commCache = new Map();
export function threeCycles(N, key, layers, filter) {
  const ck = N + ':' + key;
  if (commCache.has(ck)) return commCache.get(ck);
  const cube = getCube(N);
  const P = getPieces(N);
  const size = cube.size;
  const ms = sliceMoves(layers);
  const supp = (p) => {
    const s = new Uint8Array(P.cubies.length);
    for (let j = 0; j < size; j++) if (p[j] !== j) s[P.stickerCubie[j]] = 1;
    const list = [];
    for (let c = 0; c < s.length; c++) if (s[c]) list.push(c);
    return { mask: s, list };
  };
  const As = ms.map(m => ({ moves: [m], p: movePerm(N, m), ...supp(movePerm(N, m)) }));
  const out = [];
  const seen = new Set();
  for (const X of ms) for (const Y of ms) {
    if (X.face === Y.face && X.lo === Y.lo) continue;
    const bm = [X, Y, invertMove(X)];
    const bp = permOfMoves(N, bm);
    const bs = supp(bp);
    for (const a of As) {
      let hit = -1, n = 0;
      for (const c of a.list) if (bs.mask[c]) { hit = c; if (++n > 1) break; }
      if (n !== 1 || !filter(P.cubies[hit])) continue;
      const moves = [...a.moves, ...bm, invertMove(a.moves[0]), ...invertAlg(bm)];
      const p = composeSrc(composeSrc(composeSrc(a.p, bp), movePerm(N, invertMove(a.moves[0]))), permOfMoves(N, invertAlg(bm)));
      const sp = sparseOf(p);
      if (!sp.to.length) continue;
      const sig = Array.from(sp.to).join(',') + '|' + Array.from(sp.from).join(',');
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({ moves, kind: 'commutator', ...sp });
    }
  }
  commCache.set(ck, out);
  return out;
}

// Pick the candidate with the best gain per move. `evaluate(c)` returns the
// gain (<= 0 means useless or forbidden). Ties go to the shorter sequence.
export function pickBest(cands, evaluate) {
  let best = null, bestScore = 0, bestGain = 0;
  for (const c of cands) {
    const g = evaluate(c);
    if (g <= 0) continue;
    const score = g / c.moves.length;
    if (score > bestScore + 1e-9 || (Math.abs(score - bestScore) < 1e-9 && best && c.moves.length < best.moves.length)) {
      best = c; bestScore = score; bestGain = g;
    }
  }
  return best ? { cand: best, gain: bestGain } : null;
}

// Setup sequences (as {moves, q}) of length 1 from a move list.
export function setups(N, moves) {
  return moves.map(m => ({ moves: [m], q: movePerm(N, m) }));
}

// ---- targeted 3-cycles -------------------------------------------------
// Index commutators by the exact cycle they make on a set of stickers
// (`inSet[sticker]` = 1 for the stickers we care about, e.g. one wing orbit).
const keyOf = (pairs) => pairs.slice().sort((a, b) => a[0] - b[0]).map(p => p[0] + '<' + p[1]).join(',');

export function cycleIndex(comms, inSet) {
  const index = new Map();
  for (const c of comms) {
    const pairs = [];
    for (let i = 0; i < c.to.length; i++) if (inSet[c.to[i]]) pairs.push([c.to[i], c.from[i]]);
    if (pairs.length !== 3) continue;
    const k = keyOf(pairs);
    const old = index.get(k);
    if (!old || old.moves.length > c.moves.length) index.set(k, c);
  }
  return index;
}

// Setup sequences of length 0..2 (no two moves on the same face in a row),
// with their src permutation q and its inverse.
const setupCache2 = new Map();
export function setupsUpTo2(N, moves) {
  const key = N + ':' + moves.length;
  if (setupCache2.has(key)) return setupCache2.get(key);
  const size = getCube(N).size;
  const list = [{ moves: [], q: identity(size) }];
  for (const a of moves) list.push({ moves: [a], q: movePerm(N, a) });
  for (const a of moves) for (const b of moves) {
    if (a.face === b.face) continue;
    list.push({ moves: [a, b], q: composeSrc(movePerm(N, a), movePerm(N, b)) });
  }
  for (const s of list) {
    const inv = new Int16Array(size);
    for (let j = 0; j < size; j++) inv[s.q[j]] = j;
    s.qinv = inv;
  }
  setupCache2.set(key, list);
  return list;
}

// Find setup S and commutator C so that S C S' does exactly `pairs`
// ([to, from] x3) on the indexed sticker set. Returns a conjugated candidate.
export function findConjugated(index, setupList, pairs) {
  for (const s of setupList) {
    const k = keyOf(pairs.map(([t, f]) => [s.qinv[t], s.qinv[f]]));
    const c = index.get(k);
    if (c) return conjugate(c, s.moves, s.q);
  }
  return null;
}

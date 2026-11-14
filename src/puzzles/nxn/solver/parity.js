// Edge parity ("OLL parity") on big cubes.
// Each wing orbit (depth d = 1 next to the corners, 2, ...) has its own
// parity. Commutators can only make even changes, so an odd orbit ends with
// two wings that are swapped. The fix is the classic big-cube OLL parity alg
// with single inner slices at layer d+1. Verified on the engine (see
// tests/reduction.test.mjs): it swaps the two depth-d wings in the UF edge and
// leaves every other piece where it was (centers keep their colors).
import { getPieces } from '../pieces.js';
import { parseAlg } from '../../../core/notation.js';

export function parityAlgText(depth) {
  const k = depth + 1;
  const r = `${k}R`, l = `${k}L`;
  return `${r}2 B2 U2 ${l} U2 ${r}' U2 ${r} U2 F2 ${r} F2 ${l}' B2 ${r}2`;
}

export function parityAlg(N, depth) {
  return parseAlg(parityAlgText(depth), N);
}

const edgeCache = new Map();
// Edge slots: each midge with the wings that share its edge.
export function edgeSlots(N) {
  if (edgeCache.has(N)) return edgeCache.get(N);
  const P = getPieces(N), m = N - 1, nn = N * N;
  const faceOf = (s) => Math.floor(s / nn);
  const slots = P.midges.map((mid, i) => ({ id: i, pos: mid.pos, mid, faces: mid.stickers.map(faceOf), m: mid.stickers, wings: [] }));
  const keyOf = (pos) => pos.map(v => (Math.abs(v) === m ? v : 0)).join(',');
  const byKey = new Map(slots.map(s => [keyOf(s.pos), s]));
  // the two sticker orbits of each wing depth: alpha = lower id
  const alphaOrbit = new Map();
  for (const o of P.wingOrbits) {
    if (!alphaOrbit.has(o.depth) || o.id < alphaOrbit.get(o.depth)) alphaOrbit.set(o.depth, o.id);
  }
  const wingPos = [];
  for (const w of P.wings) {
    const slot = byKey.get(keyOf(w.pos));
    const st = slot.faces.map(f => w.stickers.find(s => faceOf(s) === f)); // aligned with slot.m
    const a = w.stickers.find(s => P.stickerOrbit[s] === alphaOrbit.get(w.depth));
    const b = w.stickers.find(s => s !== a);
    const wp = { slot: slot.id, depth: w.depth, s: st, a, b, aFace: faceOf(a) };
    slot.wings.push(wp);
    wingPos.push(wp);
  }
  const res = { slots, wingPos, depths: [...alphaOrbit.keys()].sort() };
  edgeCache.set(N, res);
  return res;
}

// For one wing depth, the permutation "position -> where its wing belongs".
// Returns { parity: 0|1, wrong: [wing positions not yet correct] }.
export function wingOrbitInfo(N, state, depth) {
  const { slots, wingPos } = edgeSlots(N);
  const midgeByColors = new Map();
  for (const s of slots) {
    const [c0, c1] = s.m.map(x => state[x]);
    midgeByColors.set(Math.min(c0, c1) * 8 + Math.max(c0, c1), s);
  }
  const list = wingPos.filter(w => w.depth === depth);
  const index = new Map(list.map((w, i) => [w, i]));
  const target = new Int16Array(list.length);
  const wrong = [];
  list.forEach((w, i) => {
    const ca = state[w.a], cb = state[w.b];
    const slot = midgeByColors.get(Math.min(ca, cb) * 8 + Math.max(ca, cb));
    if (!slot) throw new Error('edge pieces do not match any middle edge');
    const dest = slot.wings.find(x => x.depth === depth && state[slot.m[slot.faces.indexOf(x.aFace)]] === ca);
    if (!dest) throw new Error('impossible wing');
    target[i] = index.get(dest);
    if (target[i] !== i) wrong.push(w);
  });
  // parity by cycle decomposition
  const seen = new Uint8Array(list.length);
  let parity = 0;
  for (let i = 0; i < list.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = target[j]) { seen[j] = 1; len++; }
    if (len % 2 === 0) parity ^= 1;
  }
  return { parity, wrong, list, target };
}

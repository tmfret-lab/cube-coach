// Edge pairing stage of the reduction method (centers must already be solved).
// Goal: every edge acts like one 3x3 edge. On odd cubes every wing must match
// the middle edge piece (midge) of its edge. Even cubes have no midges: edges
// are paired one at a time around an "anchor" wing (see pairEdgesEven), and
// an edge is paired when all of its wings show the same two colors on the
// same two faces. Candidate moves:
//   - "slice, insert, slice back": an inner slice, a 3-move insert or the
//     edge-flip alg, then the slice goes back, which keeps all centers solved
//   - pure wing 3-cycles (8-move commutators)
//   - a wing commutator after one setup move (a fallback that always works)
// An orbit with odd parity gets the OLL parity alg as its own step (odd cubes;
// on 6x6+ the same alg fixes a last edge whose inner and outer wing pairs
// disagree. A 4x4 never needs it here: its OLL parity shows up later as a
// single flipped edge in the 3x3 stage).
import { getPieces } from '../pieces.js';
import { solvedState, applyMoves } from '../state.js';
import { simplify, invertMove, parseAlg } from '../../../core/notation.js';
import { innerLayers, sliceMoves, makeCandidate, threeCycles, pickBest, applySparse, cycleIndex, setupsUpTo2, findConjugated } from './search.js';
import { edgeSlots, wingOrbitInfo, parityAlg, parityAlgText } from './parity.js';

const MAX_PART = 34;

// face relabelings for the 24 rotations (+ mirrors) of an alg
function rotations() {
  const X = { U: 'F', F: 'D', D: 'B', B: 'U', R: 'R', L: 'L' };
  const Y = { F: 'R', R: 'B', B: 'L', L: 'F', U: 'U', D: 'D' };
  const id = { U: 'U', R: 'R', F: 'F', D: 'D', L: 'L', B: 'B' };
  const key = (m) => 'URFDLB'.split('').map(f => m[f]).join('');
  const seen = new Map([[key(id), id]]);
  const queue = [id];
  while (queue.length) {
    const m = queue.shift();
    for (const g of [X, Y]) {
      const n = {};
      for (const f in m) n[f] = g[m[f]];
      if (!seen.has(key(n))) { seen.set(key(n), n); queue.push(n); }
    }
  }
  return [...seen.values()];
}

function relabel(moves, map, mirror) {
  const M = { R: 'L', L: 'R', U: 'U', D: 'D', F: 'F', B: 'B' };
  return moves.map(m => {
    let face = map[m.face], amt = m.amt;
    if (mirror) { face = M[face]; amt = amt === 2 ? 2 : 4 - amt; }
    return { ...m, face, amt };
  });
}

const poolCache = new Map();
function pool(N) {
  if (poolCache.has(N)) return poolCache.get(N);
  const P = getPieces(N), nn = N * N;
  const { slots } = edgeSlots(N);
  const solved = solvedState(N);
  const isCenter = new Uint8Array(6 * nn);
  for (const c of [...P.centers, ...P.fixed]) for (const s of c.stickers) isCenter[s] = 1;
  const slotOf = new Int8Array(6 * nn).fill(-1);
  const wingAt = new Array(6 * nn).fill(null);
  for (const sl of slots) {
    if (sl.m) for (const s of sl.m) slotOf[s] = sl.id;
    for (const w of sl.wings) for (const s of w.s) { slotOf[s] = sl.id; wingAt[s] = w; }
  }
  const keepsCenters = (c) => {
    for (let i = 0; i < c.to.length; i++) {
      if (isCenter[c.to[i]] && solved[c.from[i]] !== solved[c.to[i]]) return false;
    }
    return true;
  };
  const outer = sliceMoves([1]);
  const inner = innerLayers(N);
  const Xs = [];
  for (const Y of outer) for (const Z of outer) if (Y.face !== Z.face) Xs.push({ moves: [Y, Z, invertMove(Y)], kind: 'insert' });
  const flip = parseAlg("R U R' F R' F' R", N);
  const seenFlip = new Set();
  for (const r of rotations()) for (const mir of [false, true]) {
    const ms = relabel(flip, r, mir);
    const k = ms.map(m => m.face + m.amt).join();
    if (!seenFlip.has(k)) { seenFlip.add(k); Xs.push({ moves: ms, kind: 'flip' }); }
  }
  const cands = [];
  for (const S of sliceMoves(inner)) for (const X of Xs) {
    const c = makeCandidate(N, [S, ...X.moves, invertMove(S)], X.kind);
    if (c.to.length && keepsCenters(c)) cands.push(c);
  }
  const comms = threeCycles(N, 'wing', [1, ...inner], c => c.type === 'wing');
  cands.push(...comms);
  const finish = (c) => {
    const touched = new Set();
    for (const t of c.to) if (slotOf[t] >= 0) touched.add(slotOf[t]);
    c.slots = Int8Array.from(touched);
    return c;
  };
  cands.forEach(finish);
  const res = { cands: cands.filter(c => c.slots.length), comms, slotOf, wingAt, finish, outer, wingIdx: new Map() };
  poolCache.set(N, res);
  return res;
}

// Wings of a slot that match its midge (odd N) or its first wing (even N).
export function slotScore(arr, sl) {
  const ref = sl.m || sl.wings[0].s;
  const m0 = arr[ref[0]], m1 = arr[ref[1]];
  let n = 0;
  for (const w of sl.wings) if (arr[w.s[0]] === m0 && arr[w.s[1]] === m1) n++;
  return n;
}

export function edgesPaired(N, state) {
  const { slots } = edgeSlots(N);
  return slots.every(sl => slotScore(state, sl) === sl.wings.length);
}

// Outer-move setup that brings edge slot `id` to UF (front-top). Cached BFS.
const setupCache = new Map();
function slotToUF(N, id) {
  const key = N;
  if (!setupCache.has(key)) {
    const { slots } = edgeSlots(N);
    const uf = slots.find(s => s.pos[1] > 0 && s.pos[2] > 0).id;
    const outer = sliceMoves([1]);
    // track where each slot's cubie goes under move sequences (BFS by depth)
    const solved = solvedState(N);
    const best = new Array(slots.length).fill(null);
    best[uf] = [];
    let frontier = [[]];
    for (let d = 1; d <= 3 && best.some(b => !b); d++) {
      const next = [];
      for (const seq of frontier) for (const m of outer) {
        if (seq.length && seq[seq.length - 1].face === m.face) continue;
        const s2 = [...seq, m];
        next.push(s2);
        // which slot ends up at UF? mark midge colors and look
        const st = applyMoves(N, solved, s2);
        // (outer moves carry a whole edge, so any one of its pieces says which)
        const ufSlot = slots[uf];
        const cols = ufSlot.wings[0].s.map(x => st[x]);
        const src = slots.find(s => {
          const c = s.faces; // solved colors = faces
          return (c[0] === cols[0] && c[1] === cols[1]) || (c[0] === cols[1] && c[1] === cols[0]);
        });
        if (!best[src.id]) best[src.id] = s2;
      }
      frontier = next;
    }
    setupCache.set(key, { uf, best });
  }
  return setupCache.get(key).best[id];
}

export function pairEdges(N, state) {
  if (N % 2 === 0) return pairEdgesEven(N, state);
  const { slots, depths } = edgeSlots(N);
  const { cands } = pool(N);
  const setupList2 = fallbackSetups(N);
  let st = state;
  const steps = [];
  const fullCount = (s) => slots.reduce((n, sl) => n + (slotScore(s, sl) === sl.wings.length), 0);
  const scratch = st.slice();
  const evaluate = (c) => {
    const { to, from } = c;
    for (let i = 0; i < to.length; i++) scratch[to[i]] = st[from[i]];
    let g = 0;
    for (const id of c.slots) {
      const sl = slots[id];
      g += slotScore(scratch, sl) - slotScore(st, sl);
    }
    for (let i = 0; i < to.length; i++) scratch[to[i]] = st[to[i]];
    return g;
  };
  let cur = [], curFull = fullCount(st), stepStart = curFull;
  const flush = (title, explanation, extra = {}) => {
    const moves = simplify(cur);
    if (moves.length) steps.push({ stage: 'edges', title, explanation, moves, ...extra });
    cur = [];
  };
  const pairTitle = (a, b) => (b - a <= 1 ? `Pair edge ${b} of 12` : `Pair edges ${a + 1} to ${b} of 12`);
  let guard = 0;
  while (!edgesPaired(N, st)) {
    if (++guard > 3000) throw new Error('edges: no progress');
    scratch.set(st);
    let pick = pickBest(cands, evaluate);
    if (!pick) {
      // odd orbit? apply the parity fix
      let fixed = false;
      for (const d of depths) {
        const info = wingOrbitInfo(N, st, d);
        if (!info.parity) continue;
        // prefer an edge whose two depth-d wings are swapped with each other
        let slotId = info.wrong[0].slot;
        for (const w of info.wrong) {
          const sl = slots[w.slot];
          const pair = sl.wings.filter(x => x.depth === d);
          if (pair.every(x => info.wrong.includes(x))) { slotId = w.slot; break; }
        }
        if (cur.length) { flush(pairTitle(stepStart, fullCount(st)), pairExplanation(N)); stepStart = fullCount(st); }
        const setup = slotToUF(N, slotId);
        const alg = parityAlg(N, d);
        const moves = [...setup, ...alg, ...setup.slice().reverse().map(invertMove)];
        st = applyMoves(N, st, moves);
        steps.push({
          stage: 'parity',
          title: 'Parity fix',
          explanation: (setup.length ? 'First turn the outside so the edge with two swapped pieces is on top, in front. ' : 'The edge on top in front has two swapped pieces. ') +
            `This is "OLL parity", which only happens on big cubes. The long alg (${parityAlgText(d)}) swaps the two pieces in that edge and puts everything else back.` +
            (setup.length ? ' Then the outside turns go back.' : ''),
          moves: simplify(moves),
          algId: 'oll-parity',
        });
        stepStart = fullCount(st);
        fixed = true;
        break;
      }
      if (fixed) continue;
      // fallback: the exact wing 3-cycle we need, with up to 2 setup moves
      let best = null;
      for (const d of depths) {
        const info = wingOrbitInfo(N, st, d);
        if (info.wrong.length < 3) continue;
        const { list, target } = info;
        const i = list.indexOf(info.wrong[0]);
        const j = target[i];
        let k = target[j];
        if (k === i) k = list.indexOf(info.wrong.find(w => w !== list[i] && w !== list[j]));
        const pairs = [[list[j].a, list[i].a], [list[k].a, list[j].a], [list[i].a, list[k].a]];
        best = findConjugated(wingIndex(N, d), setupList2, pairs);
        if (best) break;
      }
      if (!best) throw new Error('edges: stuck');
      pool(N).finish(best);
      pick = { cand: best, gain: evaluate(best) };
    }
    st = applySparse(st, pick.cand);
    cur.push(...pick.cand.moves);
    const nowFull = fullCount(st);
    if (nowFull > curFull || cur.length >= MAX_PART) {
      if (nowFull > stepStart) {
        flush(pairTitle(stepStart, nowFull), pairExplanation(N));
        stepStart = nowFull;
      } else if (cur.length >= MAX_PART) {
        flush(`Pair edge ${Math.min(12, stepStart + 1)} of 12, getting pieces ready`, 'Move matching edge pieces next to each other. Slice moves always go back, so the centers stay solved.');
      }
    }
    curFull = nowFull;
  }
  if (cur.length) flush(pairTitle(stepStart, 12), pairExplanation(N));
  return { steps, state: st };
}

function pairExplanation(N) {
  const n = N - 2;
  if (N % 2) {
    const pairs = (N - 3) / 2;
    return `Each ${N}x${N} edge is ${n} pieces: a middle piece plus ${pairs === 1 ? 'a pair' : `${pairs} pairs`} of side pieces. ` +
      'Match the side pieces to the middle one: slice down, swap the matching piece in, then slice back up, so the centers stay solved.';
  }
  return `Each ${N}x${N} edge is ${n} pieces and there is no middle piece. ` +
    (n === 2 ? 'Put the two matching pieces side by side' : `Pick one piece and match the other ${n - 1} to it`) +
    ': slice down, swap the matching piece in, then slice back up, so the centers stay solved. Edges that are already paired can move around, they stay paired.';
}

function fallbackSetups(N) {
  const hi = N % 2 ? (N - 1) / 2 : N / 2;
  return setupsUpTo2(N, sliceMoves([1, 2, 3].filter(k => k <= hi)));
}

// commutators indexed by their cycle on the alpha stickers of one wing depth
function wingIndex(N, depth) {
  const p = pool(N);
  if (!p.wingIdx.has(depth)) {
    const { wingPos } = edgeSlots(N);
    const inSet = new Uint8Array(6 * N * N);
    for (const w of wingPos) if (w.depth === depth) inSet[w.a] = 1;
    p.wingIdx.set(depth, cycleIndex(p.comms, inSet));
  }
  return p.wingIdx.get(depth);
}

// ---- even cubes ----------------------------------------------------------
// No midges, so edges are paired one at a time, the way people do it on a
// 4x4 or 6x6. The edge being worked on has an "anchor": one of its wings
// (followed as it moves around) whose two colors say what the other wings of
// that edge must show. A candidate scores
//   1000 for every edge that becomes fully paired (paired edges may move
//        around but must stay paired, so this never goes down),
//   +1 for every wing of the anchor's edge that matches the anchor,
//   +EPS for every wing elsewhere that joins the biggest matching group of
//        its edge (a tie-break that favors moves which help later edges).
// Any wing can be the anchor of an unpaired edge (both wings of its color
// pair at every depth are still free), so the target never conflicts with a
// finished edge, and the fallback 3-cycle always exists while two edges are
// unpaired. On the last edge, a swapped pair of non-anchor-depth wings (6x6+
// only) is fixed with the OLL parity alg.
const EPS = 0.2;

function groupSize(arr, sl) {
  const ws = sl.wings;
  let best = 0;
  for (let i = 0; i < ws.length; i++) {
    const a = arr[ws[i].s[0]], b = arr[ws[i].s[1]];
    let n = 0;
    for (const w of ws) if (arr[w.s[0]] === a && arr[w.s[1]] === b) n++;
    if (n > best) best = n;
  }
  return best;
}

// which of the 12 color pairs a (paired) slot shows: 0..11
const PAIR_ID = (() => {
  const t = new Int8Array(64).fill(-1);
  let n = 0;
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) if (b !== a + 3) { t[a * 8 + b] = t[b * 8 + a] = n++; }
  return t;
})();
function pairKey(arr, sl) {
  const w = sl.wings[0];
  return PAIR_ID[arr[w.s[0]] * 8 + arr[w.s[1]]];
}

function matchesOf(arr, sl, c0, c1) {
  let n = 0;
  for (const w of sl.wings) if (arr[w.s[0]] === c0 && arr[w.s[1]] === c1) n++;
  return n;
}

function pairEdgesEven(N, state) {
  const { slots, wingPos } = edgeSlots(N);
  const p = pool(N);
  const { cands, wingAt } = p;
  const setupList2 = fallbackSetups(N);
  const total = slots.length;
  const innermost = Math.max(...wingPos.map(w => w.depth));
  let st = state;
  const steps = [];
  const scratch = st.slice();
  const paired = new Uint8Array(total), group = new Int8Array(total);
  let anc = -1; // alpha sticker position of the anchor wing
  let ancScore = 0;
  const refresh = () => {
    for (const sl of slots) {
      paired[sl.id] = slotScore(st, sl) === sl.wings.length ? 1 : 0;
      group[sl.id] = groupSize(st, sl);
    }
  };
  const fullCount = () => paired.reduce((n, v) => n + v, 0);
  const ancMatches = (arr, a) => {
    const w = wingAt[a];
    return matchesOf(arr, slots[w.slot], arr[w.s[0]], arr[w.s[1]]);
  };
  const chooseAnchor = () => {
    let best = null;
    for (const sl of slots) if (!paired[sl.id] && (!best || group[sl.id] > group[best.id])) best = sl;
    let bw = null, bn = -1;
    for (const w of best.wings) {
      const n = matchesOf(st, best, st[w.s[0]], st[w.s[1]]) * 2 + (w.depth === innermost ? 1 : 0);
      if (n > bn) { bn = n; bw = w; }
    }
    anc = bw.a;
  };
  const track = (cand) => {
    for (let i = 0; i < cand.from.length; i++) if (cand.from[i] === anc) return cand.to[i];
    return anc;
  };
  const evaluate = (c) => {
    const { to, from } = c;
    for (let i = 0; i < to.length; i++) scratch[to[i]] = st[from[i]];
    let prim = 0, sec = 0, lost = 0, gained = 0;
    const ancSlot = wingAt[anc].slot;
    let touchesAnc = false;
    for (const id of c.slots) {
      const sl = slots[id];
      const pNew = slotScore(scratch, sl) === sl.wings.length ? 1 : 0;
      if (paired[id]) lost |= 1 << pairKey(st, sl);
      if (pNew) gained |= 1 << pairKey(scratch, sl);
      prim += 1000 * (pNew - paired[id]);
      sec += groupSize(scratch, sl) - group[id];
      if (id === ancSlot) touchesAnc = true;
    }
    // a paired edge may move to another place, but it must stay paired
    if (lost & ~gained) prim = 0;
    else if (touchesAnc) prim += ancMatches(scratch, track(c)) - ancScore;
    for (let i = 0; i < to.length; i++) scratch[to[i]] = st[to[i]];
    return prim > 0 ? prim + EPS * sec : 0;
  };

  // The exact wing 3-cycle (with up to 2 setup moves) that puts a wing of the
  // anchor's edge in place. Returns a candidate, or { parity } when only a
  // swap inside the last edge is left.
  const fallback = () => {
    const w0 = wingAt[anc], sl = slots[w0.slot];
    const c0 = st[w0.s[0]], c1 = st[w0.s[1]];
    const ok = (w) => st[w.s[0]] === c0 && st[w.s[1]] === c1;
    const free = (w) => !paired[w.slot] && !(w.slot === sl.id && ok(w));
    let best = null, bestScore = 0, found = 0, parity = null;
    for (const i of sl.wings) {
      if (ok(i)) continue;
      const needA = i.aFace === sl.faces[0] ? c0 : c1, needB = needA === c0 ? c1 : c0;
      const j = wingPos.find(w => w.depth === i.depth && st[w.a] === needA && st[w.b] === needB);
      const ks = wingPos.filter(w => w.depth === i.depth && w !== i && w !== j && free(w));
      if (!ks.length) { parity = parity || { slot: sl.id, depth: i.depth }; continue; }
      for (const k of ks) {
        const c = findConjugated(wingIndex(N, i.depth), setupList2, [[i.a, j.a], [j.a, k.a], [k.a, i.a]]);
        if (!c) continue;
        p.finish(c);
        scratch.set(st);
        const score = evaluate(c) / c.moves.length;
        if (score > bestScore) { bestScore = score; best = c; }
        if (++found >= 8) return best;
      }
    }
    return best || (parity ? { parity } : null);
  };

  let cur = [], curFull, stepStart;
  const flush = (title, explanation, extra = {}) => {
    const moves = simplify(cur);
    if (moves.length) steps.push({ stage: 'edges', title, explanation, moves, ...extra });
    cur = [];
  };
  const pairTitle = (a, b) => (b - a <= 1 ? `Pair edge ${b} of ${total}` : `Pair edges ${a + 1} to ${b} of ${total}`);
  refresh();
  curFull = stepStart = fullCount();
  let guard = 0;
  while (fullCount() < total) {
    if (++guard > 3000) throw new Error('edges: no progress');
    if (anc < 0 || paired[wingAt[anc].slot]) chooseAnchor();
    ancScore = ancMatches(st, anc);
    scratch.set(st);
    let pick = pickBest(cands, evaluate);
    if (!pick) {
      const fb = fallback();
      if (!fb) throw new Error('edges: stuck');
      if (fb.parity) {
        const { slot, depth } = fb.parity;
        if (cur.length) { flush(pairTitle(stepStart, fullCount()), pairExplanation(N)); stepStart = fullCount(); }
        const setup = slotToUF(N, slot);
        const moves = [...setup, ...parityAlg(N, depth), ...setup.slice().reverse().map(invertMove)];
        st = applyMoves(N, st, moves);
        steps.push({
          stage: 'parity',
          title: 'Parity fix',
          explanation: (setup.length ? 'First turn the outside so the last edge is on top, in front. ' : 'The last edge is on top, in front. ') +
            `Two of its pieces are swapped. This is "OLL parity", which only happens on big cubes. The long alg (${parityAlgText(depth)}) swaps those two pieces and puts everything else back.` +
            (setup.length ? ' Then the outside turns go back.' : ''),
          moves: simplify(moves),
          algId: 'oll-parity',
        });
        anc = -1;
        refresh();
        stepStart = curFull = fullCount();
        continue;
      }
      pick = { cand: fb };
    }
    anc = track(pick.cand);
    st = applySparse(st, pick.cand);
    cur.push(...pick.cand.moves);
    refresh();
    const nowFull = fullCount();
    if (nowFull > curFull || cur.length >= MAX_PART) {
      if (nowFull > stepStart) {
        flush(pairTitle(stepStart, nowFull), pairExplanation(N));
        stepStart = nowFull;
      } else if (cur.length >= MAX_PART) {
        flush(`Pair edge ${Math.min(total, stepStart + 1)} of ${total}, getting pieces ready`, 'Move matching edge pieces next to each other. Slice moves always go back, so the centers stay solved.');
      }
    }
    curFull = nowFull;
  }
  if (cur.length) flush(pairTitle(stepStart, total), pairExplanation(N));
  return { steps, state: st };
}

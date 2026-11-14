// Edge pairing stage of the reduction method (centers must already be solved).
// Goal: every wing matches the middle edge piece (midge) of its edge, so each
// edge acts like one 3x3 edge. Candidate moves:
//   - "slice, insert, slice back": an inner slice, a 3-move insert or the
//     edge-flip alg, then the slice goes back, which keeps all centers solved
//   - pure wing 3-cycles (8-move commutators)
//   - a wing commutator after one setup move (a fallback that always works)
// An orbit with odd parity gets the OLL parity alg as its own step.
import { getPieces } from '../pieces.js';
import { solvedState, applyMoves } from '../state.js';
import { simplify, invertMove, parseAlg } from '../../../core/notation.js';
import { sliceMoves, makeCandidate, threeCycles, pickBest, applySparse, cycleIndex, setupsUpTo2, findConjugated } from './search.js';
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
  for (const sl of slots) {
    for (const s of sl.m) slotOf[s] = sl.id;
    for (const w of sl.wings) for (const s of w.s) slotOf[s] = sl.id;
  }
  const keepsCenters = (c) => {
    for (let i = 0; i < c.to.length; i++) {
      if (isCenter[c.to[i]] && solved[c.from[i]] !== solved[c.to[i]]) return false;
    }
    return true;
  };
  const outer = sliceMoves([1]);
  const inner = [];
  for (let k = 2; k <= Math.floor((N - 1) / 2); k++) inner.push(k);
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
  const res = { cands: cands.filter(c => c.slots.length), comms, slotOf, finish, outer, wingIdx: new Map() };
  poolCache.set(N, res);
  return res;
}

export function slotScore(arr, sl) {
  const m0 = arr[sl.m[0]], m1 = arr[sl.m[1]];
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
        const ufSlot = slots[uf];
        const cols = ufSlot.m.map(x => st[x]);
        const src = slots.find(s => {
          const c = s.m.map(x => solved[x]);
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
  const { slots, depths } = edgeSlots(N);
  const { cands } = pool(N);
  const setupList2 = setupsUpTo2(N, sliceMoves([1, 2, 3].filter(k => k <= Math.floor((N - 1) / 2))));
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
        if (cur.length) { flush(pairTitle(stepStart, fullCount(st)), pairExplanation()); stepStart = fullCount(st); }
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
        flush(pairTitle(stepStart, nowFull), pairExplanation());
        stepStart = nowFull;
      } else if (cur.length >= MAX_PART) {
        flush(`Pair edge ${Math.min(12, stepStart + 1)} of 12, getting pieces ready`, 'Move matching edge pieces next to each other. Slice moves always go back, so the centers stay solved.');
      }
    }
    curFull = nowFull;
  }
  if (cur.length) flush(pairTitle(stepStart, 12), pairExplanation());
  return { steps, state: st };
}

function pairExplanation() {
  return 'Each 7x7 edge is 5 pieces: a middle piece plus two pairs of side pieces. Match the side pieces to the middle one: slice down, swap the matching piece in, then slice back up, so the centers stay solved.';
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

// Center stage of the reduction method.
// Faces are solved in teaching order: white (U), yellow (D), green (F),
// red (R), then blue (B) and orange (L) together. Each move choice is the
// candidate that fixes the most center pieces per move without breaking a
// finished face:
//   - single slice/face turns and "slice, turn, slice back" inserts (early on,
//     these bring several pieces at once, like a person would)
//   - pure 3-piece commutators (later on, these swap exactly 3 centers)
//   - commutators with a setup move, as a fallback that always works.
import { getPieces } from '../pieces.js';
import { COLOR_NAMES, FACES } from '../state.js';
import { simplify, invertMove } from '../../../core/notation.js';
import { sliceMoves, makeCandidate, threeCycles, pickBest, applySparse, conjugate, setups, cycleIndex, setupsUpTo2, findConjugated } from './search.js';

const ORDER = [[0], [3], [2], [1], [5, 4]]; // U, D, F, R, then B + L
const MAX_PART = 32; // split long steps into parts a kid can follow

const poolCache = new Map();
function pool(N) {
  if (poolCache.has(N)) return poolCache.get(N);
  const P = getPieces(N);
  const isCenter = new Uint8Array(6 * N * N);
  for (const c of P.centers) for (const s of c.stickers) isCenter[s] = 1;
  const inner = [];
  for (let k = 2; k <= Math.floor((N - 1) / 2); k++) inner.push(k); // never the middle slice
  const outerAndInner = sliceMoves([1, ...inner]);
  const cands = [];
  for (const m of outerAndInner) cands.push(makeCandidate(N, [m], 'turn'));
  for (const S of sliceMoves(inner)) for (const X of outerAndInner) {
    if (X.face === S.face && X.lo === S.lo) continue;
    cands.push(makeCandidate(N, [S, X, invertMove(S)], 'insert'));
  }
  const layers = [];
  for (let k = 1; k <= Math.ceil(N / 2); k++) layers.push(k);
  const comms = threeCycles(N, 'center', layers, c => c.type === 'center');
  cands.push(...comms);
  // keep only the center part of each effect for fast scoring
  for (const c of cands) {
    const to = [], from = [];
    for (let i = 0; i < c.to.length; i++) if (isCenter[c.to[i]]) { to.push(c.to[i]); from.push(c.from[i]); }
    c.cto = Int16Array.from(to); c.cfrom = Int16Array.from(from);
  }
  const res = {
    cands: cands.filter(c => c.cto.length),
    comms, isCenter,
    setupList: setups(N, outerAndInner),
  };
  poolCache.set(N, res);
  return res;
}

export function centersSolved(N, state) {
  const P = getPieces(N), nn = N * N;
  for (const c of P.centers) for (const s of c.stickers) if (state[s] !== Math.floor(s / nn)) return false;
  return true;
}

export function solveCenters(N, state) {
  const P = getPieces(N), nn = N * N;
  const { cands, comms, setupList } = pool(N);
  const size = 6 * nn;
  const want = new Int8Array(size).fill(-1);
  for (const c of P.centers) for (const s of c.stickers) want[s] = Math.floor(s / nn);
  const weight = new Float32Array(size);
  let st = state;
  const steps = [];

  const evalCenters = (c, to, from) => {
    let g = 0;
    for (let i = 0; i < to.length; i++) {
      const t = to[i], w = weight[t];
      if (!w) continue;
      g += w * ((st[from[i]] === want[t]) - (st[t] === want[t]));
    }
    return g;
  };

  ORDER.forEach((group, gi) => {
    weight.fill(0);
    for (let g2 = 0; g2 < gi; g2++) for (const f of ORDER[g2]) for (const c of P.centers) {
      if (Math.floor(c.stickers[0] / nn) === f) weight[c.stickers[0]] = 1000;
    }
    const targets = [];
    for (const c of P.centers) {
      const s = c.stickers[0];
      if (group.includes(Math.floor(s / nn))) { weight[s] = 1; targets.push(s); }
    }
    // a little credit for helping faces still to come keeps later work shorter
    for (let g2 = gi + 1; g2 < ORDER.length; g2++) for (const f of ORDER[g2]) for (const c of P.centers) {
      if (Math.floor(c.stickers[0] / nn) === f) weight[c.stickers[0]] = 0.02;
    }
    const doneCount = () => targets.reduce((n, s) => n + (st[s] === want[s]), 0);
    let parts = [[]];
    let guard = 0;
    while (doneCount() < targets.length) {
      if (++guard > 2000) throw new Error('centers: no progress');
      let pick = pickBest(cands, c => evalCenters(c, c.cto, c.cfrom));
      if (!pick || pick.gain < 0.5) {
        // fallback 1: the exact 3-cycle that fixes one piece, with up to 2 setup moves
        const targeted = targetedCenter(N, st, want, weight, targets);
        if (targeted) {
          st = applySparse(st, targeted);
          let cur = parts[parts.length - 1];
          if (cur.length + targeted.moves.length > MAX_PART && cur.length) { cur = []; parts.push(cur); }
          cur.push(...targeted.moves);
          continue;
        }
        // fallback 2: best commutator with one setup move
        let best = null, bestG = 0.5;
        for (const su of setupList) for (const c of comms) {
          const to = c.to, from = c.from, q = su.q;
          let g = 0;
          for (let i = 0; i < to.length; i++) {
            const t = q[to[i]], w = weight[t];
            if (w) g += w * ((st[q[from[i]]] === want[t]) - (st[t] === want[t]));
          }
          if (g > bestG) { bestG = g; best = { su, c }; }
        }
        if (!best) throw new Error('centers: stuck');
        pick = { cand: conjugate(best.c, best.su.moves, best.su.q), gain: bestG };
      }
      st = applySparse(st, pick.cand);
      let cur = parts[parts.length - 1];
      if (cur.length + pick.cand.moves.length > MAX_PART && cur.length) { cur = []; parts.push(cur); }
      cur.push(...pick.cand.moves);
    }
    parts = parts.map(p => simplify(p)).filter(p => p.length);
    const names = group.map(f => COLOR_NAMES[f]);
    const label = names.join(' and ');
    const faceWords = group.map(f => ({ U: 'top', D: 'bottom', F: 'front', R: 'right', B: 'back', L: 'left' })[FACES[f]]);
    parts.forEach((moves, pi) => {
      const partTxt = parts.length > 1 ? `, part ${pi + 1} of ${parts.length}` : '';
      steps.push({
        stage: 'centers',
        title: gi < 4 ? `Centers: ${label} (${gi + 1} of 6)${partTxt}` : `Centers: last two, ${label} (5 and 6 of 6)${partTxt}`,
        explanation: centerExplanation(gi, label, faceWords, pi, parts.length),
        moves,
      });
    });
  });
  return { steps, state: st };
}

function centerExplanation(gi, label, faceWords, pi, n) {
  const where = faceWords.join(' and ');
  if (gi === 0) {
    return pi === 0
      ? `Build the white center on the ${where}. It is 25 pieces with the white middle already in place. Slice moves bring white pieces up from the sides. Anything that isn't solved yet can get mixed up, that's fine.`
      : `Keep filling in the white center on the ${where}. Toward the end, a "swap trick" (a commutator) moves just 3 center pieces and puts everything else back.`;
  }
  if (gi === 1) {
    return `Now the yellow center on the ${where}. Each insert slices a piece out of the way, turns, and slices back, so the white center on top stays solved.`;
  }
  if (gi < 4) {
    return `Build the ${label} center on the ${where}. White and yellow are done, so every move is planned to put them back. Watch them stay solved!`;
  }
  return `The last two centers, ${label}, are built together. These are mostly 8-move swap tricks: each one moves 3 center pieces and puts everything else back.`;
}

function targetedCenter(N, st, want, weight, targets) {
  const P = getPieces(N);
  const p = pool(N);
  if (!p.index) {
    p.index = cycleIndex(p.comms, p.isCenter);
    const inner = [];
    for (let k = 2; k <= Math.floor((N - 1) / 2); k++) inner.push(k);
    p.setups2 = setupsUpTo2(N, sliceMoves([1, ...inner]));
  }
  const free = (j) => weight[j] < 1000 && !(weight[j] === 1 && st[j] === want[j]);
  let tries = 0;
  for (const t of targets) {
    if (st[t] === want[t]) continue;
    const orbit = P.orbits[P.stickerOrbit[t]].stickers;
    const sources = orbit.filter(s => s !== t && st[s] === want[t] && free(s));
    const thirds = orbit.filter(x => x !== t && free(x));
    for (const s of sources) for (const x of thirds) {
      if (x === s) continue;
      if (++tries > 400) return null;
      const c = findConjugated(p.index, p.setups2, [[t, s], [x, t], [s, x]]);
      if (c) return c;
    }
  }
  return null;
}

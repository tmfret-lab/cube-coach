// Reduction: turn a big cube into a "giant 3x3".
//   reduce(N, state) -> { steps, state }
// When it's done, every center is solved and every edge is paired. Corners
// (and midges on odd cubes) can be anywhere (the 3x3 stage handles them).
// Odd N: the cube is first turned so the fixed middle centers say white on
// top, green in front. Even N has no fixed centers: the cube is never turned,
// face f simply gets color f (white U, red R, green F, yellow D, orange L,
// blue B), so the user must keep holding the cube the same way.
import { applyMoves } from '../state.js';
import { formatAlg } from '../../../core/notation.js';
import { solveCenters, centersSolved } from './centers.js';
import { pairEdges, edgesPaired } from './edges.js';

export function fixedCentersHome(N, state) {
  if (N % 2 === 0) return true; // no fixed centers
  const nn = N * N, mid = (N - 1) / 2;
  for (let f = 0; f < 6; f++) if (state[f * nn + mid * N + mid] !== f) return false;
  return true;
}

// Works for any N: centers solved in the fixed frame (face f = color f) and
// every edge paired (each edge shows one color pair on all of its pieces).
export function isReduced(N, state) {
  return fixedCentersHome(N, state) && centersSolved(N, state) && edgesPaired(N, state);
}

// Whole-cube turns that put white on top and green in front.
function orient(N, state) {
  if (fixedCentersHome(N, state)) return [];
  const rots = [];
  for (const face of ['R', 'U', 'F']) for (const amt of [1, 2, 3]) rots.push({ face, lo: 1, hi: N, amt });
  const seqs = [[]];
  for (const a of rots) seqs.push([a]);
  for (const a of rots) for (const b of rots) if (a.face !== b.face) seqs.push([a, b]);
  const nn = N * N, mid = (N - 1) / 2;
  for (const s of seqs) {
    const st = applyMoves(N, state, s);
    if (st[mid * N + mid] === 0 && st[2 * nn + mid * N + mid] === 2) return s;
  }
  throw new Error('cannot orient: the middle centers are not a real cube');
}

export function reduce(N, state) {
  const steps = [];
  let st = state;
  const rot = N % 2 ? orient(N, st) : [];
  if (rot.length) {
    st = applyMoves(N, st, rot);
    steps.push({
      stage: 'centers',
      title: 'Hold the cube the right way',
      explanation: `Turn the whole cube (${formatAlg(rot, N)}) so the white middle center is on top and the green middle center faces you. Keep holding it like this.`,
      moves: rot,
    });
  }
  const c = solveCenters(N, st);
  steps.push(...c.steps);
  const e = pairEdges(N, c.state);
  steps.push(...e.steps);
  return { steps, state: e.state };
}

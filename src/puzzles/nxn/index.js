import { solvedState, applyMove, applyMoves, isSolved } from './state.js';
import { parseAlg, formatMove, formatAlg, describeMove } from '../../core/notation.js';
import { validate } from './validate.js';
import { getAlgs } from './algs.js';
import { getLessons } from './lessons.js';
import { solveAsync } from './solver/client.js';

export function makeNxN(N) {
  return {
    id: `${N}x${N}`,
    name: `${N}x${N} Cube`,
    N,
    active: true,
    solvedState: () => solvedState(N),
    applyMove: (s, m) => applyMove(N, s, m),
    applyMoves: (s, ms) => applyMoves(N, s, ms),
    parseAlg: (t) => parseAlg(t, N),
    formatMove: (m) => formatMove(m, N),
    formatAlg: (ms) => formatAlg(ms, N),
    describeMove: (m) => describeMove(m, N),
    isSolved: (s) => isSolved(N, s),
    validate: (s) => validate(N, s),
    solve: (s) => solveAsync(N, s),
    get algs() { return getAlgs(N); },
    get lessons() { return getLessons(N); },
  };
}

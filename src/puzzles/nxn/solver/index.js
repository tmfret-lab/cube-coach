// Full solve, by cube size:
//   2x2: corners only (beginner white corners, yellow face, yellow corners)
//   3x3: the 3x3 stage
//   bigger: reduction (centers, edges, wing parity) + 3x3 stage (which first
//   fixes OLL/PLL parity on even cubes).
import { applyMoves, isSolved } from '../state.js';
import { simplify } from '../../../core/notation.js';
import { reduce } from './reduce.js';
import { solve3x3Stage, solve2x2 } from './three.js';

export function solve(N, state) {
  const start = Uint8Array.from(state);
  if (isSolved(N, start)) return [];
  let steps;
  if (N === 2) steps = solve2x2(start);
  else if (N === 3) steps = solve3x3Stage(3, start);
  else {
    const red = reduce(N, start);
    steps = [...red.steps, ...solve3x3Stage(N, red.state)];
  }
  steps = steps.map(s => ({ ...s, moves: simplify(s.moves) })).filter(s => s.moves.length > 0);
  const end = applyMoves(N, start, steps.flatMap(s => s.moves));
  if (!isSolved(N, end)) throw new Error('Solver self-check failed: the moves do not solve the cube.');
  return steps;
}

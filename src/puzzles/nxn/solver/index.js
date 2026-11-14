// Full solve = reduction (centers, edges, parity) + 3x3 stage.
import { applyMoves, isSolved } from '../state.js';
import { simplify } from '../../../core/notation.js';
import { reduce } from './reduce.js';
import { solve3x3Stage } from './three.js';

export function solve(N, state) {
  const start = Uint8Array.from(state);
  if (isSolved(N, start)) return [];
  const red = reduce(N, start);
  const steps = [...red.steps, ...solve3x3Stage(N, red.state)]
    .map(s => ({ ...s, moves: simplify(s.moves) }))
    .filter(s => s.moves.length > 0);
  const end = applyMoves(N, start, steps.flatMap(s => s.moves));
  if (!isSolved(N, end)) throw new Error('Solver self-check failed: the moves do not solve the cube.');
  return steps;
}

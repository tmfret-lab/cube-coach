// Even-cube parity (4x4, 6x6, ...), checked on the 3x3 projection of a
// REDUCED even cube (centers solved, edges paired).
//
// A reduced even cube can be in two "impossible for a 3x3" states:
//   OLL parity: the edge flips add up to an odd number (one edge looks flipped).
//   PLL parity: edge permutation parity != corner permutation parity
//               (two edges look swapped).
// Both are normal on even cubes. The fixes below are verified on the engine in
// tests/three.test.mjs for N = 4 and 6: they keep every center solved and every
// edge paired.
// The alg text lives in ../parityText.js (shared with the lessons and the alg
// library). Effects on the 3x3 projection:
//   OLL fix: flips the UF edge only (flip parity toggles, permutations unchanged).
//   PLL fix: swaps the UF and UB edges only (edge permutation parity toggles).
import { getPieces } from '../pieces.js';
import { parseAlg } from '../../../core/notation.js';
import { evenParityText } from '../parityText.js';

export const evenParityAlgText = evenParityText;

export function evenParityAlgs(N) {
  const t = evenParityText(N);
  return { oll: parseAlg(t.oll, N), pll: parseAlg(t.pll, N) };
}

// ---------- parity of a 3x3 state (54 stickers, centers give the color scheme)
const P3 = getPieces(3);
const faceOf = (i) => Math.floor(i / 9);
const UD = new Set([0, 3]), FB = new Set([2, 5]); // face indices U,D / F,B

function cyclesParity(target) {
  const seen = new Uint8Array(target.length);
  let p = 0;
  for (let i = 0; i < target.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = target[j]) { seen[j] = 1; len++; }
    if (len % 2 === 0) p ^= 1;
  }
  return p;
}

// { flip: 0|1 (sum of edge flips mod 2), edgePerm: 0|1, cornerPerm: 0|1 }
export function parity3(s) {
  const home = new Int8Array(6).fill(-1); // color -> face index whose center has it
  for (let f = 0; f < 6; f++) home[s[f * 9 + 4]] = f;
  if ([...home].some(f => f < 0)) throw new Error('centers are not six different colors');
  const keyOf = (fs) => fs.slice().sort().join('');
  const perm = (list) => {
    const index = new Map(list.map((c, i) => [keyOf(c.stickers.map(faceOf)), i]));
    return list.map(c => {
      const i = index.get(keyOf(c.stickers.map(x => home[s[x]])));
      if (i === undefined) throw new Error('piece colors do not match the centers');
      return i;
    });
  };
  let flip = 0;
  for (const e of P3.midges) {
    const [a, b] = e.stickers;
    const pos = UD.has(faceOf(a)) ? a : UD.has(faceOf(b)) ? b : FB.has(faceOf(a)) ? a : b;
    const cols = e.stickers.map(x => s[x]);
    const prim = cols.find(c => UD.has(home[c])) ?? cols.find(c => FB.has(home[c]));
    if (s[pos] !== prim) flip ^= 1;
  }
  return { flip, edgePerm: cyclesParity(perm(P3.midges)), cornerPerm: cyclesParity(perm(P3.corners)) };
}

export const PARITY_TEXT = {
  oll: (N) => ({
    title: 'Parity fix: one flipped edge (OLL parity)',
    explanation: `Your ${N}x${N} has OLL parity. If you solved it like a 3x3 now, at the very end ONE edge would look flipped, and that can never happen on a real 3x3. Don't worry, this is normal on even cubes (4x4, 6x6). Hold the cube with white on top and green facing you and do this long algorithm. It flips the top-front edge over and keeps the centers and all the edge pairs together.`,
  }),
  pll: (N) => ({
    title: 'Parity fix: two swapped edges (PLL parity)',
    explanation: `Your ${N}x${N} has PLL parity. If you solved it like a 3x3 now, at the end TWO edges would be swapped with each other, which a real 3x3 can't do. This is also normal on even cubes. Hold the cube with white on top and green facing you and do this algorithm. It swaps the top-front and top-back edges (nothing else changes) and keeps the centers and edge pairs together. After this, the cube solves just like a 3x3.`,
  }),
};

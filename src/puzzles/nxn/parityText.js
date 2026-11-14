// Even-cube (4x4, 6x6, ...) parity algs as text, shared by the solver, the
// algorithm library and the lessons. Verified on the engine in
// tests/three.test.mjs (N = 4 and 6): both keep every center solved and every
// edge paired. Inner block r / l / u = layers 2..N/2 (4x4: 2R, 6x6: 2-3R);
// Uw = outer N/2 layers (4x4: Uw, 6x6: 3Uw).
//   oll: flips the top-front (UF) edge and changes nothing else.
//        4x4  2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2
//        6x6  2-3R2 B2 U2 2-3L U2 2-3R' U2 2-3R U2 F2 2-3R F2 2-3L' B2 2-3R2
//   pll: swaps the top-front (UF) and top-back (UB) edges, nothing else.
//        4x4  2R2 U2 2R2 Uw2 2R2 2U2
//        6x6  2-3R2 U2 2-3R2 3Uw2 2-3R2 2-3U2
// (Center pieces may trade places with others of the same color; colors stay.)
export function evenParityText(N) {
  if (N % 2 || N < 4) throw new Error('even parity algs need an even cube of 4x4 or bigger');
  const h = N / 2;
  const inner = (f) => (h === 2 ? `2${f}` : `2-${h}${f}`);
  const r = inner('R'), l = inner('L'), u = inner('U');
  const uw = h === 2 ? 'Uw' : `${h}Uw`;
  return {
    oll: `${r}2 B2 U2 ${l} U2 ${r}' U2 ${r} U2 F2 ${r} F2 ${l}' B2 ${r}2`,
    pll: `${r}2 U2 ${r}2 ${uw}2 ${r}2 ${u}2`,
  };
}

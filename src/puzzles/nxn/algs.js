// Algorithm library for the NxN (written for the 7x7).
// Each alg has a machine-checked `effect` (a list of claims) that
// tests/algs.test.mjs verifies on the engine:
//   { kind: 'order', n }                 alg repeated n times = identity
//   { kind: 'only-layers', faces }       only pieces in these outer layers move, and
//                                        center colors don't change
//   { kind: 'keeps-layers', faces }      no piece in these outer layers moves
//   { kind: 'only-types', types }        only pieces of these types move
//   (these three ignore center pieces shuffled within one face, which can't be
//    seen once centers are solved)
//   { kind: 'keeps-face-centers', faces } no center piece on these faces moves
//   { kind: 'centers-kept' }             from solved, every center keeps its color
//   { kind: 'center-3cycle' }            exactly three center pieces trade places
//   { kind: 'oll-parity', depth }        swaps exactly the two wings of that depth in UF
//   { kind: 'case', is: 'pll'|'ocll'|'oll-edges' }  property of the case it solves
// `view` says how to hold the cube for the diagram: 'yellow-top' = z2 from home.

export const STAGES = [
  { id: 'notation', name: 'Moves', blurb: 'The new big-cube moves. Watch each one in 3D.' },
  { id: 'centers', name: 'Centers', blurb: 'Tricks for building the 5x5 centers.' },
  { id: 'edges', name: 'Edge pairing', blurb: 'Match up the 5 pieces of every edge.' },
  { id: 'parity', name: 'Parity', blurb: 'The fix for a single flipped edge pair.' },
  { id: '3x3', name: '3x3 stage', blurb: 'The beginner algorithms you already know.' },
  { id: 'levelup', name: 'Level up', blurb: '2-look OLL and PLL. Faster last layer!' },
];

const ONLY_U = { kind: 'only-layers', faces: ['U'] };
const KEEP_D = { kind: 'keeps-layers', faces: ['D'] };
const CENTERS_KEPT = { kind: 'centers-kept' };

const ALGS = [
  // ---- notation
  { id: 'move-r', stage: 'notation', name: 'R (outer layer)', alg: 'R',
    description: 'Just like a 3x3: only the outside right layer turns.',
    effect: [{ kind: 'order', n: 4 }] },
  { id: 'move-rw', stage: 'notation', name: 'Rw (two layers)', alg: 'Rw',
    description: 'Grab the right TWO layers together and turn them like R.',
    effect: [{ kind: 'order', n: 4 }] },
  { id: 'move-3rw', stage: 'notation', name: '3Rw (three layers)', alg: '3Rw',
    description: 'The number says how many layers to grab. 3Rw = the right three layers.',
    effect: [{ kind: 'order', n: 4 }] },
  { id: 'move-3r', stage: 'notation', name: '3R (only the 3rd layer)', alg: '3R',
    description: 'No "w" means a single inner slice. Only the 3rd layer from the right turns. The outer two stay still.',
    effect: [{ kind: 'order', n: 4 }, { kind: 'keeps-layers', faces: ['R', 'L'] }] },
  { id: 'move-x', stage: 'notation', name: 'x, y, z (turn the whole cube)', alg: "x y z'",
    description: 'x turns the whole cube like R. y turns it like U. z turns it like F.',
    effect: [{ kind: 'order', n: 4 }] },

  // ---- centers
  { id: 'center-comm', stage: 'centers', name: 'Center swap (outer ring)', alg: "2R U 2L' U' 2R' U 2L U'",
    description: 'Moves one center piece from the front to the top. Only three center pieces move, nothing else gets messed up. Good for the last few pieces.',
    effect: [{ kind: 'center-3cycle' }] },
  { id: 'center-comm-3', stage: 'centers', name: 'Center swap (inner ring)', alg: "3R U 3L' U' 3R' U 3L U'",
    description: 'Same trick, one ring closer to the middle. Use slice 3 instead of slice 2.',
    effect: [{ kind: 'center-3cycle' }] },
  { id: 'center-comm-mix', stage: 'centers', name: 'Center swap (mixed)', alg: "2R U 3L' U' 2R' U 3L U'",
    description: 'Mix slice 2 and slice 3 to reach the in-between (oblique) center pieces.',
    effect: [{ kind: 'center-3cycle' }] },
  { id: 'bar-insert', stage: 'centers', name: 'Bar insert (slice 3)', alg: "3R U2 3R'",
    description: 'Build a 1x5 bar on the front in the 3rd column from the right. Slice it up, turn the top twice, slice back down. The bottom center stays safe.',
    effect: [{ kind: 'keeps-face-centers', faces: ['D'] }, { kind: 'order', n: 2 }] },
  { id: 'bar-insert-2', stage: 'centers', name: 'Bar insert (slice 2)', alg: "2R U2 2R'",
    description: 'Same idea for a bar in the 2nd column from the right.',
    effect: [{ kind: 'keeps-face-centers', faces: ['D'] }, { kind: 'order', n: 2 }] },
  { id: 'bar-insert-1', stage: 'centers', name: 'Bar move (keep it safe)', alg: "3R U 3R'",
    description: 'Slice a bar up, move it aside with U, slice back. The bottom center is never touched.',
    effect: [{ kind: 'keeps-face-centers', faces: ['D'] }] },

  // ---- edges
  { id: 'edge-flip', stage: 'edges', name: 'Edge flip', alg: "R U R' F R' F' R",
    description: 'Takes the front-right edge out to the top layer and puts a top edge in its place, flipped. Only outer turns, so the centers stay solved.',
    effect: [{ kind: 'only-layers', faces: ['U', 'R'] }] },
  { id: 'edge-pair', stage: 'edges', name: 'Slice, flip, slice (slice 2)', alg: "2U' R U R' F R' F' R 2U",
    description: 'Line up two matching pieces in the front-left and front-right edges. Slice down, flip the right edge out, slice back. The pieces join up!',
    effect: [CENTERS_KEPT] },
  { id: 'edge-pair-3', stage: 'edges', name: 'Slice, flip, slice (slice 3)', alg: "3U' R U R' F R' F' R 3U",
    description: 'Same trick when the matching pieces are one layer further in.',
    effect: [CENTERS_KEPT] },

  // ---- parity
  { id: 'oll-parity', stage: 'parity', view: 'yellow-top', name: 'OLL parity (outer wings)',
    alg: "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2",
    description: 'Fixes a front-top edge where the two outer wing pieces (next to the corners) are swapped. Long, but it only moves those two pieces.',
    effect: [{ kind: 'oll-parity', depth: 1 }] },
  { id: 'oll-parity-3', stage: 'parity', view: 'yellow-top', name: 'OLL parity (inner wings)',
    alg: "3R2 B2 U2 3L U2 3R' U2 3R U2 F2 3R F2 3L' B2 3R2",
    description: 'Same alg with slice 3 instead of slice 2. Use it when the two wings next to the middle piece are swapped.',
    effect: [{ kind: 'oll-parity', depth: 2 }] },

  // ---- 3x3 stage (beginner)
  { id: 'corner-insert', stage: '3x3', view: 'yellow-top', name: 'Corner trick', alg: "R U R' U'",
    description: 'Repeat until the white corner drops in. Six times brings everything back.',
    effect: [{ kind: 'order', n: 6 }] },
  { id: 'f2l-right', stage: '3x3', view: 'yellow-top', name: 'Middle edge to the right', alg: "U R U' R' U' F' U F",
    description: 'Moves the top-front edge down into the right slot of the middle layer.',
    effect: [KEEP_D, CENTERS_KEPT] },
  { id: 'f2l-left', stage: '3x3', view: 'yellow-top', name: 'Middle edge to the left', alg: "U' L' U L U F U' F'",
    description: 'Moves the top-front edge down into the left slot of the middle layer.',
    effect: [KEEP_D, CENTERS_KEPT] },
  { id: 'll-cross', stage: '3x3', view: 'yellow-top', name: 'Yellow cross', alg: "F R U R' U' F'",
    description: 'Dot, L or line: hold it right and do this until you get the yellow cross.',
    effect: [ONLY_U, { kind: 'case', is: 'oll-edges' }] },
  { id: 'sune', stage: '3x3', view: 'yellow-top', name: 'Sune (yellow face)', alg: "R U R' U R U2 R'",
    description: 'Twists the yellow corners. Repeat until the whole top is yellow.',
    effect: [ONLY_U, { kind: 'case', is: 'ocll' }] },
  { id: 'headlights', stage: '3x3', view: 'yellow-top', name: 'Yellow corners (headlights)', alg: "R' F R' B2 R F' R' B2 R2",
    description: 'Yellow top done? Find two corners with matching colors on one side (headlights). Put them at the back and do this. Moves three corners, yellow stays on top.',
    effect: [ONLY_U, { kind: 'only-types', types: ['corner'] }, { kind: 'case', is: 'pll' }] },
  { id: 'corner-cycle', stage: '3x3', view: 'yellow-top', name: 'Corner cycle (beginner)', alg: "U R U' L' U R' U' L",
    description: 'Another beginner way: moves three top corners into place but also twists them. Do it before the yellow face, then fix the twists.',
    effect: [ONLY_U, { kind: 'only-types', types: ['corner'] }] },
  { id: 'u-perm', stage: '3x3', view: 'yellow-top', name: 'Edge cycle (U perm)', alg: "R U' R U R U R U' R' U' R2",
    description: 'Moves three top edges around. Put the solved edge at the back.',
    effect: [ONLY_U, { kind: 'case', is: 'pll' }] },

  // ---- level up: 2-look OLL (edges)
  { id: 'oll-line', stage: 'levelup', view: 'yellow-top', name: 'OLL edges: line', alg: "F R U R' U' F'",
    description: 'Yellow line going left-right? One go and you have the cross.',
    effect: [ONLY_U, { kind: 'case', is: 'oll-edges' }] },
  { id: 'oll-l', stage: 'levelup', view: 'yellow-top', name: 'OLL edges: L shape', alg: "F U R U' R' F'",
    description: 'Hold the L at the back-left and do this once for the cross.',
    effect: [ONLY_U, { kind: 'case', is: 'oll-edges' }] },
  { id: 'oll-dot', stage: 'levelup', view: 'yellow-top', name: 'OLL edges: dot', alg: "F R U R' U' F' U2 F U R U' R' F'",
    description: 'Just a yellow dot? The line alg, U2, then the L alg.',
    effect: [ONLY_U, { kind: 'case', is: 'oll-edges' }] },
  // 2-look OLL (corners, OCLL)
  { id: 'ocll-sune', stage: 'levelup', view: 'yellow-top', name: 'OCLL: Sune', alg: "R U R' U R U2 R'",
    description: 'One yellow corner up (the fish). Put it front-left.',
    effect: [ONLY_U, { kind: 'case', is: 'ocll' }] },
  { id: 'ocll-antisune', stage: 'levelup', view: 'yellow-top', name: 'OCLL: Antisune', alg: "R U2 R' U' R U' R'",
    description: 'The fish the other way. Put the yellow corner front-right.',
    effect: [ONLY_U, { kind: 'case', is: 'ocll' }] },
  { id: 'ocll-h', stage: 'levelup', view: 'yellow-top', name: 'OCLL: H', alg: "R U R' U R U' R' U R U2 R'",
    description: 'No yellow corners up, two headlights on the left and on the right.',
    effect: [ONLY_U, { kind: 'case', is: 'ocll' }] },
  { id: 'ocll-pi', stage: 'levelup', view: 'yellow-top', name: 'OCLL: Pi', alg: "R U2 R2 U' R2 U' R2 U2 R",
    description: 'No yellow corners up, headlights on the left side.',
    effect: [ONLY_U, { kind: 'case', is: 'ocll' }] },
  { id: 'ocll-headlights', stage: 'levelup', view: 'yellow-top', name: 'OCLL: Headlights', alg: "R2 D R' U2 R D' R' U2 R'",
    description: 'Two yellow corners up, headlights facing you.',
    effect: [ONLY_U, { kind: 'case', is: 'ocll' }] },
  { id: 'ocll-t', stage: 'levelup', view: 'yellow-top', name: 'OCLL: T (chameleon)', alg: "R U R D R' U' R D' R2",
    description: 'Two yellow corners up next to each other, their stickers facing left and right.',
    effect: [ONLY_U, { kind: 'case', is: 'ocll' }] },
  { id: 'ocll-bowtie', stage: 'levelup', view: 'yellow-top', name: 'OCLL: Bowtie', alg: "R' F R B' R' F' R B",
    description: 'Two yellow corners up, corner to corner (diagonal).',
    effect: [ONLY_U, { kind: 'case', is: 'ocll' }] },
  // 2-look PLL
  { id: 'pll-a', stage: 'levelup', view: 'yellow-top', name: 'PLL corners: A perm', alg: "R' F R' B2 R F' R' B2 R2",
    description: 'Headlights on one side: put them at the back.',
    effect: [ONLY_U, { kind: 'case', is: 'pll' }] },
  { id: 'pll-y', stage: 'levelup', view: 'yellow-top', name: 'PLL corners: Y perm', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'",
    description: 'No headlights anywhere: swaps two corners across the diagonal.',
    effect: [ONLY_U, { kind: 'case', is: 'pll' }] },
  { id: 'pll-ua', stage: 'levelup', view: 'yellow-top', name: 'PLL edges: Ua', alg: "R U' R U R U R U' R' U' R2",
    description: 'Three edges cycle. Solved edge at the back.',
    effect: [ONLY_U, { kind: 'case', is: 'pll' }] },
  { id: 'pll-ub', stage: 'levelup', view: 'yellow-top', name: 'PLL edges: Ub', alg: "R2 U R U R' U' R' U' R' U R'",
    description: 'Three edges cycle the other way. Solved edge at the back.',
    effect: [ONLY_U, { kind: 'case', is: 'pll' }] },
  { id: 'pll-h', stage: 'levelup', view: 'yellow-top', name: 'PLL edges: H perm', alg: "R2 U2 R U2 R2 U2 R2 U2 R U2 R2",
    description: 'Opposite edges swap both ways. Written without middle slices so it works on the 7x7.',
    effect: [ONLY_U, { kind: 'case', is: 'pll' }] },
  { id: 'pll-z', stage: 'levelup', view: 'yellow-top', name: 'PLL edges: Z perm', alg: "R U R' U R' U' R' U R U' R' U' R2 U R",
    description: 'Neighbor edges swap in pairs.',
    effect: [ONLY_U, { kind: 'case', is: 'pll' }] },
];

export function getAlgs(N) {
  // The library is written for odd cubes of size 7; slice numbers are kept
  // only if they fit the cube.
  return ALGS.map(a => ({ ...a }));
}

export function getAlg(id) {
  const a = ALGS.find(x => x.id === id);
  return a ? { ...a } : undefined;
}

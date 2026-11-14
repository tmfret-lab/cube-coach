// Lessons for the 7x7 reduction method. Written for a kid who already
// solves the 3x3. Each section can have a 3D demo: `setup` is applied
// instantly, then `alg` is animated.

const LESSONS = [
  {
    id: 'notation',
    title: 'Big-cube moves',
    blurb: 'R, Rw, 3Rw, 3R and x y z.',
    sections: [
      { text: 'You already know R, U, F, L, D and B. On a 7x7 they mean the same thing: turn only the OUTSIDE layer.', demo: { alg: "R U R' U'" } },
      { text: "A ' (prime) means turn the other way. A 2 means turn it twice.", demo: { alg: "R' U2" } },
      { text: 'Rw means grab the right TWO layers and turn them together. The "w" stands for "wide".', demo: { alg: "Rw Rw'" } },
      { text: 'A number in front says how many layers to grab. 3Rw = the right three layers.', demo: { alg: "3Rw 3Rw'" } },
      { text: 'No "w" means a single inner slice. 3R turns ONLY the 3rd layer from the right. The two outside layers stay still.', demo: { alg: "3R 3R'" } },
      { text: 'x, y and z turn the whole cube in your hands. x is like R, y is like U, z is like F.', demo: { alg: "x x' y y'" } },
    ],
  },
  {
    id: 'overview',
    title: 'How to solve a 7x7',
    blurb: 'Make it into a giant 3x3.',
    sections: [
      { text: 'The big secret: we turn the 7x7 into a 3x3. This is called the reduction method.' },
      { text: 'Step 1: Centers. Make each face have a solid 5x5 center of one color.' },
      { text: 'Step 2: Edges. Every edge has 5 pieces. Match them up so each edge is one long piece.' },
      { text: 'Step 3: Solve it like a 3x3, using only outer turns. You already know how!' },
      { text: 'Sometimes one edge looks flipped at the end. That is called parity. There is a special alg for it.' },
      { text: 'The middle center piece never moves. So white is always opposite yellow, and green is always opposite blue.', demo: { alg: "R U F' L D' B" } },
    ],
  },
  {
    id: 'centers',
    title: 'Centers',
    blurb: 'Build six 5x5 centers.',
    sections: [
      { text: 'Start with white. Hold white on top. Find white center pieces on the other faces and bring them up.' },
      { text: 'Build a bar first: a line of white pieces on the front face. Then slice it up into the top.', demo: { alg: "3R U2 3R'" } },
      { text: 'Before you slice up, turn the top so the slot you bring the bar into is still empty.' },
      { text: 'Next, do yellow on the opposite side. Flip the cube (x2) so yellow is on top and white is on the bottom. Only use slices that keep the white center safe.' },
      { text: 'Then do the last four centers: blue, red, green and orange. Check the order! Look at the middle pieces. Green is in front, red is on the right.' },
      { text: 'For the last few pieces, use the center swap. It moves only three center pieces, so nothing else breaks.', demo: { alg: "2R U 2L' U' 2R' U 2L U'" } },
    ],
  },
  {
    id: 'edges',
    title: 'Edge pairing',
    blurb: 'Match 5 pieces into one edge.',
    sections: [
      { text: 'Each edge has a middle piece (the midge) and four wings. We want all five to show the same two colors.' },
      { text: 'Hold an edge you are building on the front-left. Find a matching wing and bring it to the front-right, at the same height.' },
      { text: 'Slice down, flip the right edge out, slice back up. The pieces join together!', demo: { alg: "2U' R U R' F R' F' R 2U" } },
      { text: 'The flip in the middle swaps the front-right edge with one from the top. It only uses outer turns, so your centers stay safe.', demo: { alg: "R U R' F R' F' R" } },
      { text: 'Pieces one layer further in need slice 3 instead of slice 2.', demo: { alg: "3U' R U R' F R' F' R 3U" } },
      { text: 'Do this 12 times, once per edge. The last two edges are the trickiest. Keep both of them in the front-left and front-right.' },
    ],
  },
  {
    id: 'parity',
    title: 'Parity',
    blurb: 'The flipped edge at the end.',
    sections: [
      { text: 'Sometimes you solve it like a 3x3 and ONE edge looks flipped. The two halves of that edge show different colors on top. That is OLL parity. A real 3x3 can never do this, so it is not your fault!' },
      { text: 'Put the bad edge at the front of the top. Do this long alg. Take it slow, it uses slice 2 and slice 3 moves.', demo: { setup: "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2", alg: "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2" } },
      { text: 'If the swapped pieces are the ones next to the middle, do the same alg with 3R and 3L instead of 2R and 2L.' },
      { text: 'Good news: on an odd cube like the 7x7, PLL parity (two edges swapped) cannot happen. The middle edge pieces stop it.' },
    ],
  },
  {
    id: 'three',
    title: 'The 3x3 stage',
    blurb: 'It is just a 3x3 now.',
    sections: [
      { text: 'With centers done and edges paired, your 7x7 is a big 3x3. Use only outer turns from now on: R, U, F, L, D, B.' },
      { text: 'Never do a slice or a wide turn now, or you will break the edges apart.' },
      { text: 'First flip the cube over (z2) so white is on the bottom and yellow is on top.', demo: { alg: 'z2' } },
      { text: 'Then go in this order, exactly like your 3x3: white cross, white corners, middle layer, yellow cross, yellow face, yellow corners, yellow edges.' },
      { text: 'White corners: hold the corner above its spot (front-right) and repeat the corner trick until it drops in.', demo: { alg: "R U R' U'" } },
      { text: 'Middle layer: line up the top edge with its center, then send it right or left.', demo: { alg: "U R U' R' U' F' U F" } },
      { text: 'Yellow cross, then yellow face.', demo: { alg: "F R U R' U' F' R U R' U R U2 R'" } },
      { text: 'Yellow corners: find the headlights (two corners with the same color on one side), put them at the back, and do the headlights alg.', demo: { alg: "R' F R' B2 R F' R' B2 R2" } },
      { text: 'Yellow edges: put the solved edge at the back and do the U perm. Done!', demo: { alg: "R U' R U R U R U' R' U' R2" } },
      { text: 'The 7x7 is heavy. Turn with your whole hand, not just one finger.' },
    ],
  },
  {
    id: 'tips',
    title: 'Tips',
    blurb: 'Make it easier.',
    sections: [
      { text: 'Take breaks. A 7x7 solve is long. Pausing is fine, the app remembers where you are.' },
      { text: 'Before each slice move, look at which layer it is. Count from the outside: the outside is 1.' },
      { text: 'If you get lost, scramble and try again. Every solve makes you faster.' },
      { text: 'A little cube lube helps a lot on a big cube.' },
    ],
  },
];

export function getLessons(N) {
  return LESSONS.map(l => ({ ...l, sections: l.sections.map(s => ({ ...s })) }));
}

// Lessons for NxN cubes, written for a kid who already solves the 3x3.
// getLessons(N) builds the lessons for one size. Each section can have a 3D
// demo: `setup` is applied instantly, then `alg` is animated.
import { evenParityText } from './parityText.js';

const notation = (N) => ({
  id: 'notation',
  title: N >= 4 ? 'Big-cube moves' : 'Moves',
  blurb: N >= 6 ? 'R, Rw, 3Rw, 3R and x y z.' : N >= 4 ? 'R, Rw, 2R and x y z.' : 'R, U, F and x y z.',
  sections: [
    { text: N >= 4 ? `You already know R, U, F, L, D and B. On a ${N}x${N} they mean the same thing: turn only the OUTSIDE layer.` : 'R, U, F, L, D and B each turn one face a quarter turn, clockwise as you look at that face.', demo: { alg: "R U R' U'" } },
    { text: "A ' (prime) means turn the other way. A 2 means turn it twice.", demo: { alg: "R' U2" } },
    ...(N >= 4 ? [
      { text: 'Rw means grab the right TWO layers and turn them together. The "w" stands for "wide".', demo: { alg: "Rw Rw'" } },
    ] : []),
    ...(N >= 6 ? [
      { text: 'A number in front says how many layers to grab. 3Rw = the right three layers.', demo: { alg: "3Rw 3Rw'" } },
      { text: 'No "w" means a single inner slice. 3R turns ONLY the 3rd layer from the right. The two outside layers stay still.', demo: { alg: "3R 3R'" } },
    ] : N >= 4 ? [
      { text: 'A number but no "w" means a single inner slice. 2R turns ONLY the 2nd layer from the right. The outside layer stays still.', demo: { alg: "2R 2R'" } },
    ] : []),
    { text: 'x, y and z turn the whole cube in your hands. x is like R, y is like U, z is like F.', demo: { alg: "x x' y y'" } },
  ],
});

const overview = (N) => {
  const odd = N % 2 === 1;
  return {
    id: 'overview',
    title: `How to solve a ${N}x${N}`,
    blurb: 'Make it into a giant 3x3.',
    sections: [
      { text: `The big secret: we turn the ${N}x${N} into a 3x3. This is called the reduction method.` },
      { text: `Step 1: Centers. Make each face have a solid ${N - 2}x${N - 2} center of one color.` },
      { text: `Step 2: Edges. Every edge has ${N - 2} pieces. Match them up so each edge is one long piece.` },
      { text: 'Step 3: Solve it like a 3x3, using only outer turns. You already know how!' },
      { text: odd
        ? 'Sometimes one edge looks flipped at the end. That is called parity. There is a special alg for it.'
        : 'Even cubes can have two kinds of parity at the end: one edge that looks flipped, or two edges that are swapped. There is a special alg for each.' },
      odd
        ? { text: 'The middle center piece never moves. So white is always opposite yellow, and green is always opposite blue.', demo: { alg: "R U F' L D' B" } }
        : { text: `A ${N}x${N} has no middle center piece! So a corner tells you where each color goes: hold the white-green-red corner at the top-front-right, and white goes on top, green in front, red on the right.`, demo: { alg: "R U F' L D' B" } },
    ],
  };
};

const centers = (N) => {
  const k = N >= 6 ? 3 : 2;
  return {
    id: 'centers',
    title: 'Centers',
    blurb: `Build six ${N - 2}x${N - 2} centers.`,
    sections: [
      { text: N % 2
        ? 'Start with white. Hold white on top. Find white center pieces on the other faces and bring them up.'
        : 'Start with white. Hold the white-green-red corner at the top-front-right, so the top is the white side. Find white center pieces on the other faces and bring them up.' },
      { text: 'Build a bar first: a line of white pieces on the front face. Then slice it up into the top.', demo: { alg: `${k}R U2 ${k}R'` } },
      { text: 'Before you slice up, turn the top so the slot you bring the bar into is still empty.' },
      { text: 'Next, do yellow on the opposite side. Flip the cube (x2) so yellow is on top and white is on the bottom. Only use slices that keep the white center safe.' },
      { text: N % 2
        ? 'Then do the last four centers: blue, red, green and orange. Check the order! Look at the middle pieces. Green is in front, red is on the right.'
        : 'Then do the last four centers: green, red, blue and orange. Check the order! With white on top, the white-green-red corner shows you: green in front, red on the right.' },
      { text: 'For the last few pieces, use the center swap. It moves only three center pieces, so nothing else breaks.', demo: { alg: "2R U 2L' U' 2R' U 2L U'" } },
    ],
  };
};

const edges = (N) => {
  const n = N - 2;
  const sections = [
    { text: N % 2
      ? `Each edge has a middle piece (the midge) and ${n - 1} side pieces (wings). We want all ${n} to show the same two colors.`
      : `Each edge has ${n} side pieces (wings) and no middle piece. We want all ${n} to show the same two colors.` },
    { text: 'Hold an edge you are building on the front-left. Find a matching wing and bring it to the front-right, at the same height.' },
    { text: 'Slice down, flip the right edge out, slice back up. The pieces join together!', demo: { alg: "2U' R U R' F R' F' R 2U" } },
    { text: 'The flip in the middle swaps the front-right edge with one from the top. It only uses outer turns, so your centers stay safe.', demo: { alg: "R U R' F R' F' R" } },
  ];
  if (N >= 6) sections.push({ text: 'Pieces one layer further in need slice 3 instead of slice 2.', demo: { alg: "3U' R U R' F R' F' R 3U" } });
  sections.push({ text: 'Do this 12 times, once per edge. The last two edges are the trickiest. Keep both of them in the front-left and front-right.' });
  return { id: 'edges', title: 'Edge pairing', blurb: `Match ${n} pieces into one edge.`, sections };
};

const parity = (N) => {
  if (N % 2 === 1) {
    const oll = "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2";
    const sections = [
      { text: 'Sometimes you solve it like a 3x3 and ONE edge looks flipped. The two halves of that edge show different colors on top. That is OLL parity. A real 3x3 can never do this, so it is not your fault!' },
      { text: `Put the bad edge at the front of the top. Do this long alg. Take it slow, it uses ${N >= 7 ? 'slice 2 and slice 3' : 'slice 2'} moves.`, demo: { setup: oll, alg: oll } },
    ];
    if (N >= 7) sections.push({ text: 'If the swapped pieces are the ones next to the middle, do the same alg with 3R and 3L instead of 2R and 2L.' });
    sections.push({ text: `Good news: on an odd cube like the ${N}x${N}, PLL parity (two edges swapped) cannot happen. The middle edge pieces stop it.` });
    return { id: 'parity', title: 'Parity', blurb: 'The flipped edge at the end.', sections };
  }
  const { oll, pll } = evenParityText(N);
  return {
    id: 'parity',
    title: 'Parity',
    blurb: 'The flipped edge and the swapped edges.',
    sections: [
      { text: 'Even cubes have two kinds of parity. They happen a lot, so it is not your fault!' },
      { text: 'OLL parity: you solve it like a 3x3 and ONE edge looks flipped. Put that edge at the front of the top and do this long alg.', demo: { setup: oll, alg: oll } },
      { text: 'PLL parity: at the very end two edges look swapped. Put them at the front and back of the top and do this alg.', demo: { setup: pll, alg: pll } },
      { text: 'When you solve along with the app, it tells you when you need them.' },
    ],
  };
};

const three = (N) => ({
  id: 'three',
  title: N === 3 ? 'Layer by layer' : 'The 3x3 stage',
  blurb: N === 3 ? 'The beginner method, step by step.' : 'It is just a 3x3 now.',
  sections: [
    ...(N === 3
      ? [{ text: 'The beginner method solves the cube one layer at a time, starting with white.' }]
      : [
        { text: `With centers done and edges paired, your ${N}x${N} is a big 3x3. Use only outer turns from now on: R, U, F, L, D, B.` },
        { text: 'Never do a slice or a wide turn now, or you will break the edges apart.' },
      ]),
    { text: 'Make the white cross first. Then flip the cube over (z2) so white is on the bottom and yellow is on top.', demo: { alg: 'z2' } },
    { text: 'Then go in this order: white corners, middle layer, yellow cross, yellow face, yellow corners, yellow edges.' },
    { text: 'White corners: hold the corner above its spot (front-right) and repeat the corner trick until it drops in.', demo: { alg: "R U R' U'" } },
    { text: 'Middle layer: line up the top edge with its center, then send it right or left.', demo: { alg: "U R U' R' U' F' U F" } },
    { text: 'Yellow cross, then yellow face.', demo: { alg: "F R U R' U' F' R U R' U R U2 R'" } },
    { text: 'Yellow corners: find the headlights (two corners with the same color on one side), put them at the back, and do the headlights alg.', demo: { alg: "R' F R' B2 R F' R' B2 R2" } },
    { text: 'Yellow edges: put the solved edge at the back and do the U perm. Done!', demo: { alg: "R U' R U R U R U' R' U' R2" } },
    ...(N >= 6 ? [{ text: `The ${N}x${N} is heavy. Turn with your whole hand, not just one finger.` }] : []),
  ],
});

const twoByTwo = () => ([
  {
    id: 'overview',
    title: 'How to solve a 2x2',
    blurb: 'It is just the corners of a 3x3.',
    sections: [
      { text: 'A 2x2 is a 3x3 with only the corners. No edges, no centers. If you can do the corners of a 3x3, you can do this!' },
      { text: 'There is no center to tell you which color goes where. Use one corner: hold the white-green-red corner at the top-front-right, white on top.', demo: { alg: "R U F' R2" } },
      { text: 'Step 1: the white layer. Put all four white corners together, each one between its colors.' },
      { text: 'Step 2: the yellow face. Use Sune until the whole top is yellow.' },
      { text: 'Step 3: the yellow corners. Use headlights to put each corner in its place. Done!' },
    ],
  },
  {
    id: 'corners',
    title: 'Corners',
    blurb: 'White layer, yellow face, yellow corners.',
    sections: [
      { text: 'Flip the cube (z2) so white is on the bottom. Hold a white corner above its spot at the front-right.', demo: { alg: 'z2' } },
      { text: 'Repeat the corner trick until the corner drops in, white side down.', demo: { alg: "R U R' U'" } },
      { text: 'Yellow face: hold it right and do Sune. Repeat until all of the top is yellow.', demo: { alg: "R U R' U R U2 R'" } },
      { text: 'Yellow corners: find the headlights, put them at the back, and do the headlights alg. Then turn the top to finish.', demo: { alg: "R' F R' B2 R F' R' B2 R2" } },
    ],
  },
]);

const tips = (N) => ({
  id: 'tips',
  title: 'Tips',
  blurb: 'Make it easier.',
  sections: [
    { text: N >= 5 ? `Take breaks. A ${N}x${N} solve is long. Pausing is fine, the app remembers where you are.` : 'Pausing is fine, the app remembers where you are.' },
    ...(N >= 4 ? [{ text: 'Before each slice move, look at which layer it is. Count from the outside: the outside is 1.' }] : []),
    { text: 'If you get lost, scramble and try again. Every solve makes you faster.' },
    ...(N >= 5 ? [{ text: 'A little cube lube helps a lot on a big cube.' }] : []),
  ],
});

export function getLessons(N) {
  if (N === 2) return [notation(N), ...twoByTwo(), tips(N)];
  if (N === 3) return [notation(N), three(N), tips(N)];
  return [notation(N), overview(N), centers(N), edges(N), parity(N), three(N), tips(N)];
}

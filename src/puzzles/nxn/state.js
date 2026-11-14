// Generic NxN cube model. A state is a Uint8Array of N*N*6 sticker colors.
// Sticker index = face*N*N + row*N + col, faces in order U R F D L B.
// Coordinates: x right, y up, z toward the viewer (front). Cubie centers use
// odd integers from -(N-1) to N-1 so every N works with integer math.
//
// Face layouts (how each face looks when you hold it in front of you):
//   U: looking down, green/front edge at the bottom of the grid
//   F, R, B, L: white/top up
//   D: looking at the bottom, green/front edge at the top of the grid

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
export const FACE_INDEX = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
// [axis (0=x,1=y,2=z), sign]
export const FACE_AXIS = { U: [1, 1], D: [1, -1], R: [0, 1], L: [0, -1], F: [2, 1], B: [2, -1] };
// Standard color scheme: color index = face index of the solved cube.
export const COLOR_NAMES = ['white', 'red', 'green', 'yellow', 'orange', 'blue'];
export const COLOR_HEX = ['#ffffff', '#e8202a', '#15a84a', '#ffd500', '#ff7a00', '#1a5fe0'];

function stickerGeometry(face, r, c, N) {
  const m = N - 1;
  const a = -m + 2 * c, b = m - 2 * r;
  switch (face) {
    case 'U': return { pos: [-m + 2 * c, m, -m + 2 * r], normal: [0, 1, 0] };
    case 'D': return { pos: [-m + 2 * c, -m, m - 2 * r], normal: [0, -1, 0] };
    case 'F': return { pos: [a, b, m], normal: [0, 0, 1] };
    case 'B': return { pos: [m - 2 * c, b, -m], normal: [0, 0, -1] };
    case 'R': return { pos: [m, b, m - 2 * c], normal: [1, 0, 0] };
    case 'L': return { pos: [-m, b, -m + 2 * c], normal: [-1, 0, 0] };
  }
}

// +90 degrees (counter-clockwise looking from the + end of the axis)
function rotPlus(v, axis) {
  const [x, y, z] = v;
  if (axis === 0) return [x, -z, y];
  if (axis === 1) return [z, y, -x];
  return [-y, x, z];
}
function rotMinus(v, axis) {
  const [x, y, z] = v;
  if (axis === 0) return [x, z, -y];
  if (axis === 1) return [-z, y, x];
  return [y, -x, z];
}

const cubes = new Map();

export function getCube(N) {
  if (cubes.has(N)) return cubes.get(N);
  const stickers = [];
  const lookup = new Map();
  for (const face of FACES) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const g = stickerGeometry(face, r, c, N);
      const s = { index: stickers.length, face, f: FACE_INDEX[face], r, c, pos: g.pos, normal: g.normal };
      stickers.push(s);
      lookup.set(g.pos.join(',') + '|' + g.normal.join(','), s.index);
    }
  }
  const cube = { N, size: stickers.length, stickers, lookup, permCache: new Map() };
  cubes.set(N, cube);
  return cube;
}

export function solvedState(N) {
  const s = new Uint8Array(6 * N * N);
  for (let i = 0; i < s.length; i++) s[i] = Math.floor(i / (N * N));
  return s;
}

// A move: { face: 'R', lo: 1, hi: 1, amt: 1|2|3 }  (amt 3 = prime)
// Layers lo..hi are counted from that face (1 = outer layer).
// Returns src array: newState[j] = oldState[src[j]].
export function movePerm(N, move) {
  const cube = getCube(N);
  const key = `${move.face}${move.lo}-${move.hi}:${move.amt}`;
  let p = cube.permCache.get(key);
  if (p) return p;
  const [axis, sign] = FACE_AXIS[move.face];
  const m = N - 1;
  // coordinate along axis for depth k: sign*(m - 2(k-1))
  const inLayer = (coord) => {
    const k = (m - sign * coord) / 2 + 1; // depth from this face
    return k >= move.lo && k <= move.hi;
  };
  const quarter = new Int16Array(cube.size);
  for (let i = 0; i < cube.size; i++) quarter[i] = i;
  for (const s of cube.stickers) {
    if (!inLayer(s.pos[axis])) continue;
    const rot = sign > 0 ? rotMinus : rotPlus; // clockwise viewed from the face
    const np = rot(s.pos, axis), nn = rot(s.normal, axis);
    const j = cube.lookup.get(np.join(',') + '|' + nn.join(','));
    quarter[j] = s.index;
  }
  p = quarter;
  for (let t = 1; t < move.amt; t++) p = composeSrc(p, quarter);
  cube.permCache.set(key, p);
  return p;
}

// apply a then b: result[j] = a[b[j]]
export function composeSrc(a, b) {
  const out = new Int16Array(a.length);
  for (let j = 0; j < a.length; j++) out[j] = a[b[j]];
  return out;
}

export function applyPerm(state, src) {
  const out = new Uint8Array(state.length);
  for (let j = 0; j < state.length; j++) out[j] = state[src[j]];
  return out;
}

export function applyMove(N, state, move) {
  return applyPerm(state, movePerm(N, move));
}

export function applyMoves(N, state, moves) {
  let s = state;
  for (const m of moves) s = applyMove(N, s, m);
  return s;
}

export function permOfMoves(N, moves) {
  const cube = getCube(N);
  let p = new Int16Array(cube.size);
  for (let i = 0; i < cube.size; i++) p[i] = i;
  for (const m of moves) p = composeSrc(p, movePerm(N, m));
  return p;
}

export function isSolved(N, state) {
  const nn = N * N;
  for (let f = 0; f < 6; f++) {
    const c = state[f * nn];
    for (let i = 1; i < nn; i++) if (state[f * nn + i] !== c) return false;
  }
  return true;
}

export function idx(N, face, r, c) {
  return FACE_INDEX[face] * N * N + r * N + c;
}

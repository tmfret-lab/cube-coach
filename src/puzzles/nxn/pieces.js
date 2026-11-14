// Piece and orbit maps for an NxN cube.
// A cubie is identified by its center position (same odd-integer coords as
// sticker.pos). Each sticker belongs to exactly one cubie.
// Sticker orbits are computed from the move group itself (union-find over
// every single-layer quarter turn), so they are correct for any N, including
// the two mirror-image "oblique" center orbits on 6x6+.
//
// Piece types:
//   corner  3 stickers
//   midge   2 stickers, middle edge of an odd cube (fixed orbit, like a 3x3 edge)
//   wing    2 stickers, the other edge pieces (orbit = distance from the middle)
//   center  1 sticker, movable center piece
//   fixed   1 sticker, the fixed middle center of an odd cube
import { getCube, movePerm, FACES } from './state.js';

const cache = new Map();

export function getPieces(N) {
  if (cache.has(N)) return cache.get(N);
  const cube = getCube(N);
  const m = N - 1;

  // --- cubies
  const byPos = new Map();
  for (const s of cube.stickers) {
    const k = s.pos.join(',');
    if (!byPos.has(k)) byPos.set(k, { pos: s.pos, stickers: [] });
    byPos.get(k).stickers.push(s.index);
  }
  const cubies = [...byPos.values()];
  const stickerCubie = new Int16Array(cube.size);
  cubies.forEach((c, i) => {
    c.id = i;
    const outer = c.pos.filter(v => Math.abs(v) === m).length;
    if (outer === 3) c.type = 'corner';
    else if (outer === 2) {
      const t = c.pos.find(v => Math.abs(v) !== m);
      c.type = t === 0 ? 'midge' : 'wing';
      c.depth = (m - Math.abs(t)) / 2; // wing: 1 = next to corner
    } else {
      const inner = c.pos.filter(v => Math.abs(v) !== m);
      c.type = inner.every(v => v === 0) ? 'fixed' : 'center';
    }
    for (const s of c.stickers) stickerCubie[s] = i;
  });

  // --- sticker orbits (union-find over all single-layer quarter turns)
  const parent = new Int16Array(cube.size);
  for (let i = 0; i < cube.size; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  for (const face of ['U', 'R', 'F']) {
    for (let k = 1; k <= N; k++) {
      const p = movePerm(N, { face, lo: k, hi: k, amt: 1 });
      for (let j = 0; j < p.length; j++) {
        const a = find(j), b = find(p[j]);
        if (a !== b) parent[a] = b;
      }
    }
  }
  const rootToOrbit = new Map();
  const orbits = [];
  const stickerOrbit = new Int16Array(cube.size);
  for (let i = 0; i < cube.size; i++) {
    const r = find(i);
    if (!rootToOrbit.has(r)) {
      const c = cubies[stickerCubie[i]];
      rootToOrbit.set(r, orbits.length);
      orbits.push({ id: orbits.length, type: c.type, depth: c.depth, stickers: [], cubies: new Set() });
    }
    const o = orbits[rootToOrbit.get(r)];
    o.stickers.push(i);
    o.cubies.add(stickerCubie[i]);
    stickerOrbit[i] = o.id;
  }
  for (const o of orbits) o.cubies = [...o.cubies];
  // fixed centers each form their own orbit; merge them into one logical group
  const result = {
    N, cubies, stickerCubie, orbits, stickerOrbit,
    corners: cubies.filter(c => c.type === 'corner'),
    midges: cubies.filter(c => c.type === 'midge'),
    wings: cubies.filter(c => c.type === 'wing'),
    centers: cubies.filter(c => c.type === 'center'),
    fixed: cubies.filter(c => c.type === 'fixed'),
    centerOrbits: orbits.filter(o => o.type === 'center'),
    wingOrbits: orbits.filter(o => o.type === 'wing'),
  };
  cache.set(N, result);
  return result;
}

// Colors of a cubie in a state, in the cubie's sticker order.
export function cubieColors(state, cubie) {
  return cubie.stickers.map(s => state[s]);
}

// The face letter a sticker sits on.
export function stickerFace(N, s) {
  return FACES[Math.floor(s / (N * N))];
}

// Checks that an entered NxN state is a real, solvable cube.
// validate(N, state) -> { ok, errors: [{ message, stickers: [] }], counts: number[6] }
// Empty (not yet painted) stickers use the value EMPTY (255).
import { getCube, solvedState, FACES, COLOR_NAMES } from './state.js';
import { getPieces } from './pieces.js';

export const EMPTY = 255;
const MAX_ERRORS = 10;
const opp = (c) => (c + 3) % 6;
const cname = (c) => COLOR_NAMES[c] ?? '?';
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// Where a sticker is, in words matching the face editor (face named by its center color).
export function whereIs(N, s) {
  const nn = N * N;
  const f = Math.floor(s / nn), r = Math.floor((s % nn) / N), c = s % N;
  return `the ${COLOR_NAMES[f]} face, row ${r + 1}, column ${c + 1}`;
}

function det3(a, b, c) {
  return a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
}

function permParity(perm) {
  const seen = new Array(perm.length).fill(false);
  let parity = 0;
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = perm[j]) { seen[j] = true; len++; }
    parity ^= (len - 1) & 1;
  }
  return parity;
}

const tables = new Map();
function getTables(N) {
  if (tables.has(N)) return tables.get(N);
  const cube = getCube(N);
  const P = getPieces(N);
  const solved = solvedState(N);
  const normal = (s) => cube.stickers[s].normal;

  // Corners: sticker order = U/D sticker first, then right-handed.
  const corners = P.corners.map(c => {
    const st = c.stickers.slice();
    const i0 = st.findIndex(s => normal(s)[1] !== 0);
    const first = st.splice(i0, 1)[0];
    let order = [first, st[0], st[1]];
    if (det3(normal(order[0]), normal(order[1]), normal(order[2])) < 0) order = [first, st[1], st[0]];
    return order;
  });
  const cornerKey = new Map();
  corners.forEach((o, id) => cornerKey.set(o.map(s => solved[s]).join(','), id));

  // Midges: primary sticker = U/D one, else F/B one.
  const midges = P.midges.map(c => {
    const [a, b] = c.stickers;
    const prim = normal(a)[1] !== 0 ? a : normal(b)[1] !== 0 ? b : normal(a)[2] !== 0 ? a : b;
    return { prim, other: prim === a ? b : a, stickers: c.stickers };
  });
  const midgeKey = new Map();
  midges.forEach((m, id) => {
    const cols = [solved[m.prim], solved[m.other]].sort();
    midgeKey.set(cols.join(','), id);
  });

  // Wings: per depth, sticker orbit "A" = lower orbit id. Ordered pair (A color, B color).
  const depths = [...new Set(P.wings.map(w => w.depth))].sort((a, b) => a - b);
  const wingGroups = depths.map(d => {
    const orbitIds = P.wingOrbits.filter(o => o.depth === d).map(o => o.id).sort((a, b) => a - b);
    const A = orbitIds[0];
    const wings = P.wings.filter(w => w.depth === d).map(w => {
      const [s0, s1] = w.stickers;
      return P.stickerOrbit[s0] === A ? [s0, s1] : [s1, s0];
    });
    const expected = new Set(wings.map(([a, b]) => solved[a] + ',' + solved[b]));
    return { depth: d, wings, expected };
  });

  const centerOrbits = P.centerOrbits.map(o => o.stickers);
  const fixed = P.fixed.map(c => c.stickers[0]);
  const t = { corners, cornerKey, midges, midgeKey, wingGroups, centerOrbits, fixed };
  tables.set(N, t);
  return t;
}

// Explains why a set of colors can't be a real piece, or returns null.
function badColors(cols) {
  for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
    if (cols[i] === cols[j]) return `has two ${cname(cols[i])} stickers, but every piece has different colors`;
    if (opp(cols[i]) === cols[j]) return `has ${cname(cols[i])} and ${cname(cols[j])}, but those are opposite colors, so they are never on the same piece`;
  }
  return null;
}

export function validate(N, state) {
  const nn = N * N;
  const T = getTables(N);
  const errors = [];
  const add = (message, stickers = []) => errors.push({ message, stickers });
  const counts = [0, 0, 0, 0, 0, 0];

  // 1. Empty stickers
  const empty = [];
  for (let i = 0; i < state.length; i++) {
    if (state[i] === EMPTY || state[i] > 5) empty.push(i);
    else counts[state[i]]++;
  }
  if (empty.length) {
    const faces = [...new Set(empty.map(s => COLOR_NAMES[Math.floor(s / nn)]))];
    add(`${empty.length} sticker${empty.length > 1 ? 's' : ''} still need${empty.length > 1 ? '' : 's'} a color (on the ${faces.join(', ')} face${faces.length > 1 ? 's' : ''}).`, empty);
    return { ok: false, errors, counts };
  }

  // 2. Color counts
  for (let c = 0; c < 6; c++) {
    if (counts[c] > nn) add(`There are ${counts[c]} ${cname(c)} stickers, but a ${N}x${N} has exactly ${nn}. ${counts[c] - nn} ${cname(c)} sticker${counts[c] - nn > 1 ? 's are' : ' is'} really another color.`);
    else if (counts[c] < nn) add(`There are only ${counts[c]} ${cname(c)} stickers, but there should be ${nn}. Look for ${nn - counts[c]} more.`);
  }

  // 3. Fixed centers
  if (T.fixed.length) {
    const wrong = T.fixed.filter(s => state[s] !== Math.floor(s / nn));
    if (wrong.length) {
      add('The middle stickers of the faces are not where they should be. Hold the cube with the white center on top and the green center facing you, then enter the faces again in that position.', wrong);
      return { ok: false, errors: errors.slice(0, MAX_ERRORS), counts };
    }
  }

  // 4. Pieces
  const cornerPerm = [], cornerTwist = [];
  let piecesOk = true;
  const cornerSeen = new Map();
  T.corners.forEach((order, slot) => {
    const cols = order.map(s => state[s]);
    const names = cols.map(cname).join(', ');
    const bad = badColors(cols);
    if (bad) { piecesOk = false; return add(`The corner at ${whereIs(N, order[0])} ${bad}.`, order); }
    const k = cols.findIndex(c => c === 0 || c === 3);
    const key = [cols[k], cols[(k + 1) % 3], cols[(k + 2) % 3]].join(',');
    const id = T.cornerKey.get(key);
    if (id === undefined) {
      piecesOk = false;
      return add(`The ${names} corner at ${whereIs(N, order[0])} is backwards, like a mirror image. Two of its stickers are probably swapped.`, order);
    }
    if (cornerSeen.has(id)) {
      piecesOk = false;
      return add(`There are two ${names} corners, but a cube has only one. One of them has a wrong sticker.`, [...cornerSeen.get(id), ...order]);
    }
    cornerSeen.set(id, order);
    cornerPerm[slot] = id; cornerTwist[slot] = k;
  });

  const midgePerm = [], midgeFlip = [];
  const midgeSeen = new Map();
  T.midges.forEach((m, slot) => {
    const cols = [state[m.prim], state[m.other]];
    const bad = badColors(cols);
    if (bad) { piecesOk = false; return add(`The middle edge at ${whereIs(N, m.prim)} ${bad}.`, m.stickers); }
    const id = T.midgeKey.get(cols.slice().sort().join(','));
    if (midgeSeen.has(id)) {
      piecesOk = false;
      return add(`There are two ${cname(cols[0])}-${cname(cols[1])} middle edges, but a cube has only one. One of them has a wrong sticker.`, [...midgeSeen.get(id), ...m.stickers]);
    }
    midgeSeen.set(id, m.stickers);
    midgePerm[slot] = id;
    const primColor = cols.find(c => c === 0 || c === 3) ?? cols.find(c => c === 2 || c === 5);
    midgeFlip[slot] = state[m.prim] === primColor ? 0 : 1;
  });

  for (const g of T.wingGroups) {
    const seen = new Map();
    for (const [a, b] of g.wings) {
      const cols = [state[a], state[b]];
      const bad = badColors(cols);
      if (bad) { piecesOk = false; add(`The edge piece at ${whereIs(N, a)} ${bad}.`, [a, b]); continue; }
      const key = cols.join(',');
      if (!g.expected.has(key)) { piecesOk = false; add(`The edge piece at ${whereIs(N, a)} can't exist.`, [a, b]); continue; }
      if (seen.has(key)) {
        piecesOk = false;
        add(`Two ${cname(cols[0])}-${cname(cols[1])} edge pieces are the same mirror shape, which can't happen. One of them probably has its two stickers the wrong way round.`, [...seen.get(key), a, b]);
      } else seen.set(key, [a, b]);
    }
  }

  const per = (o) => o.length / 6;
  for (const orbit of T.centerOrbits) {
    const cc = [0, 0, 0, 0, 0, 0];
    for (const s of orbit) cc[state[s]]++;
    const need = per(orbit);
    const extra = [];
    for (let c = 0; c < 6; c++) if (cc[c] > need) extra.push(c);
    if (extra.length) {
      piecesOk = false;
      const missing = [0, 1, 2, 3, 4, 5].filter(c => cc[c] < need);
      const hl = orbit.filter(s => extra.includes(state[s]));
      add(`Some center stickers don't add up: in this ring of centers there should be ${need} of each color, but there are too many ${extra.map(cname).join(' and ')} and not enough ${missing.map(cname).join(' and ')}. One of the highlighted stickers is wrong.`, hl);
    }
  }

  // 5. Twist / flip / parity (only meaningful when every piece is real)
  if (piecesOk && !errors.length) {
    if (T.corners.length === 8) {
      const twist = cornerTwist.reduce((a, b) => a + b, 0) % 3;
      if (twist) add('One corner looks twisted. That can only happen if a corner was popped out and put back. Check the corner stickers again.', T.corners.filter((_, i) => cornerTwist[i]).flat());
    }
    if (T.midges.length === 12) {
      const flip = midgeFlip.reduce((a, b) => a + b, 0) % 2;
      if (flip) add('One middle edge looks flipped. Check the middle edge stickers again.', T.midges.filter((_, i) => midgeFlip[i]).flatMap(m => m.stickers));
      if (permParity(cornerPerm) !== permParity(midgePerm)) add('It looks like two pieces have been swapped. That can\'t happen by turning the cube. Check the corners and middle edges again.');
    }
  }

  const ok = errors.length === 0;
  if (errors.length > MAX_ERRORS) {
    const more = errors.length - MAX_ERRORS;
    errors.length = MAX_ERRORS;
    errors.push({ message: `…and ${more} more problem${more > 1 ? 's' : ''}.`, stickers: [] });
  }
  return { ok, errors, counts };
}

export { FACES };

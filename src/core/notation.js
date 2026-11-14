// WCA-style big-cube notation.
//   R R' R2      outer layer
//   Rw / r       outer 2 layers
//   3Rw          outer 3 layers
//   3R           only the 3rd layer from the right (an inner slice)
//   x y z        whole cube (like R, U, F)
//   M E S        middle slice (odd cubes), turning like L, D, F

const MOVE_RE = /^(\d*)([URFDLBurfdlbxyzMES])(w?)(2'|'2|2|'|)$/;

export function parseMove(token, N) {
  const m = MOVE_RE.exec(token.trim());
  if (!m) throw new Error(`Bad move "${token}"`);
  const [, num, letter, w, suffix] = m;
  const amt = suffix === '' ? 1 : suffix === "'" ? 3 : 2;
  let face, lo, hi;
  if ('xyz'.includes(letter)) {
    face = { x: 'R', y: 'U', z: 'F' }[letter]; lo = 1; hi = N;
  } else if ('MES'.includes(letter)) {
    if (N % 2 === 0) throw new Error(`${letter} needs an odd cube`);
    face = { M: 'L', E: 'D', S: 'F' }[letter];
    lo = hi = (N + 1) / 2;
    if (letter === 'S') face = 'F';
  } else if (letter === letter.toLowerCase()) {
    face = letter.toUpperCase(); lo = 1; hi = num ? +num : 2;
  } else {
    face = letter;
    if (w) { lo = 1; hi = num ? +num : 2; }
    else if (num) { lo = hi = +num; }
    else { lo = hi = 1; }
  }
  if (hi > N || lo < 1) throw new Error(`Move "${token}" does not fit a ${N}x${N}`);
  return { face, lo, hi, amt };
}

export function parseAlg(text, N) {
  return expand(text).map(t => parseMove(t, N));
}

// Expands simple groups like (R U R' U')3 into a token list.
function expand(text) {
  const tokens = [];
  const re = /\(([^()]*)\)(\d*)('?)|(\S+)/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[4]) { tokens.push(m[4]); continue; }
    const inner = expand(m[1]);
    const times = m[2] ? +m[2] : 1;
    for (let i = 0; i < times; i++) tokens.push(...inner);
  }
  return tokens;
}

const SUFFIX = { 1: '', 2: '2', 3: "'" };

export function formatMove(mv, N) {
  const s = SUFFIX[mv.amt];
  if (mv.lo === 1 && mv.hi === N) {
    const r = { R: 'x', U: 'y', F: 'z', L: "x'", D: "y'", B: "z'" }[mv.face];
    // L-based whole rotations are rare; normalise to x/y/z
    if (r.length === 2) return r[0] + SUFFIX[invAmt(mv.amt)];
    return r + s;
  }
  if (N % 2 === 1 && mv.lo === mv.hi && mv.lo === (N + 1) / 2 && N > 1) {
    const mid = { L: 'M', D: 'E', F: 'S' }[mv.face];
    if (mid) return mid + s;
  }
  if (mv.lo === 1 && mv.hi === 1) return mv.face + s;
  if (mv.lo === 1 && mv.hi === 2) return mv.face + 'w' + s;
  if (mv.lo === 1) return mv.hi + mv.face + 'w' + s;
  if (mv.lo === mv.hi) return mv.lo + mv.face + s;
  return `${mv.lo}-${mv.hi}${mv.face}w${s}`;
}

export function formatAlg(moves, N) {
  return moves.map(m => formatMove(m, N)).join(' ');
}

export function invAmt(a) { return a === 2 ? 2 : 4 - a; }

export function invertMove(m) { return { ...m, amt: invAmt(m.amt) }; }

export function invertAlg(moves) { return moves.slice().reverse().map(invertMove); }

const OPP = { R: 'L', L: 'R', U: 'D', D: 'U', F: 'B', B: 'F' };

// Merge consecutive moves that turn exactly the same layers.
export function simplify(moves) {
  const out = [];
  for (const m of moves) {
    const last = out[out.length - 1];
    if (last && last.face === m.face && last.lo === m.lo && last.hi === m.hi) {
      const amt = (last.amt + m.amt) % 4;
      out.pop();
      if (amt) out.push({ ...m, amt });
    } else out.push({ ...m });
  }
  return out.length === moves.length ? out : simplify(out);
}

export function sameAxis(a, b) {
  return a.face === b.face || OPP[a.face] === b.face;
}

// Kid-friendly description of a move.
const FACE_WORD = { R: 'right', L: 'left', U: 'top', D: 'bottom', F: 'front', B: 'back' };
export function describeMove(mv, N) {
  const dir = mv.amt === 2 ? 'twice (half turn)' : mv.amt === 1 ? 'clockwise' : 'counter-clockwise';
  const look = mv.amt === 2 ? '' : ` (as if you were looking at the ${FACE_WORD[mv.face]} face)`;
  if (mv.lo === 1 && mv.hi === N) {
    const turn = { R: 'forward-over, like an R move', U: 'to the left, like a U move', F: 'clockwise, like an F move' };
    const t = formatMove(mv, N);
    return `Turn the WHOLE cube ${mv.amt === 2 ? 'twice ' : ''}${mv.amt === 3 ? 'the other way (backwards from ' + t[0] + ')' : turn[mv.face] || ''}. Hold it in your hands and rotate everything.`;
  }
  const w = FACE_WORD[mv.face];
  if (mv.lo === 1 && mv.hi === 1) return `Turn the ${w} face ${dir}${look}.`;
  if (mv.lo === 1) return `Grab the ${w} ${mv.hi} layers together and turn them ${dir}${look}.`;
  if (mv.lo === mv.hi) {
    const ord = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][mv.lo] || mv.lo + 'th';
    return `Turn only the ${ord} layer in from the ${w} ${dir}${look}. The outer layer stays still.`;
  }
  return `Turn layers ${mv.lo} to ${mv.hi} from the ${w} ${dir}${look}.`;
}

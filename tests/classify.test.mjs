// Camera color classification: synthetic photos of real scrambles, N = 2..7.
import { solvedState, applyMoves } from '../src/puzzles/nxn/state.js';
import { classify, sampleGrid, cropSquare, srgbToLinear, srgbToLab } from '../src/ui/colorClassify.js';
import { test, assert, eq } from './harness.mjs';

let seed = +(process.env.SEED || 987654321);
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
const uni = (a, b) => a + (b - a) * rnd();
const gauss = () => { const u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const toS = (l) => { const c = Math.max(0, Math.min(1, l)); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); };

// What a phone camera roughly reports for each sticker color (sRGB)
const BASE = [[210, 212, 205], [170, 25, 35], [20, 140, 70], [220, 200, 30], [230, 100, 20], [20, 65, 165]];

// Odd N: keep the middle centers in place. Even N: keep the white-green-red corner at
// top-front-right (that's how the hold guide says to hold an even cube): turn only L, D, B layers.
function scramble(N) {
  const odd = N % 2 === 1;
  const maxDepth = odd ? Math.max(1, (N - 1) / 2) : Math.max(1, N - 1);
  const faces = odd ? 'URFDLB' : 'LDB';
  const moves = [];
  for (let i = 0; i < 120; i++) {
    const k = 1 + Math.floor(rnd() * maxDepth);
    const wide = rnd() < 0.3;
    moves.push({ face: faces[Math.floor(rnd() * faces.length)], lo: wide ? 1 : k, hi: k, amt: 1 + Math.floor(rnd() * 3) });
  }
  return applyMoves(N, solvedState(N), moves);
}

// cond: { bright: [lo,hi], wb, faceBright, faceWb, noise, stickerVar, drift, glare }
function synth(state, N, cond) {
  const nn = N * N;
  const gB = uni(...cond.bright);
  const gW = [0, 1, 2].map(() => uni(1 - cond.wb, 1 + cond.wb));
  const face = Array.from({ length: 6 }, () => {
    const b = uni(1 - cond.faceBright, 1 + cond.faceBright);
    return [0, 1, 2].map(ch => gB * gW[ch] * b * uni(1 - cond.faceWb, 1 + cond.faceWb));
  });
  return Array.from(state, (c, i) => {
    let rgb = BASE[c].slice();
    if (cond.drift && (c === 1 || c === 4)) { // red drifts toward orange and vice versa
      const t = uni(0, cond.drift), other = BASE[c === 1 ? 4 : 1];
      rgb = rgb.map((v, ch) => v + (other[ch] - v) * t);
    }
    const sv = uni(1 - cond.stickerVar, 1 + cond.stickerVar);
    const g = face[Math.floor(i / nn)];
    let out = rgb.map((v, ch) => toS(srgbToLinear(v) * g[ch] * sv) + gauss() * cond.noise);
    if (cond.glare && rnd() < cond.glare) { const a = uni(0.15, 0.4); out = out.map(v => v + (250 - v) * a); } // glare the patch median didn't fully reject
    return out.map(v => Math.max(0, Math.min(255, Math.round(v))));
  });
}

const NORMAL = { bright: [0.75, 1.2], wb: 0.08, faceBright: 0.1, faceWb: 0.04, noise: 6, stickerVar: 0.05, drift: 0, glare: 0 };
const HARD = { bright: [0.55, 1.35], wb: 0.15, faceBright: 0.2, faceWb: 0.08, noise: 8, stickerVar: 0.1, drift: 0.3, glare: 0.03 };

const counts = (s) => { const c = new Array(6).fill(0); for (const v of s) c[v]++; return c; };

for (let N = 2; N <= 7; N++) {
  test(`classify ${N}x${N}: exact in normal light`, () => {
    let flags = 0;
    for (let t = 0; t < 6; t++) {
      const st = scramble(N);
      const r = classify(synth(st, N, NORMAL), N);
      const wrong = [];
      for (let i = 0; i < st.length; i++) if (r.state[i] !== st[i]) wrong.push(i);
      eq(wrong.length, 0, `N=${N} trial ${t} wrong stickers ${JSON.stringify(wrong)}`);
      counts(r.state).forEach(c => eq(c, N * N, 'balanced counts'));
      eq(r.confidence.length, st.length, 'confidence length');
      flags += r.flagged.length;
    }
    if (process.env.VERBOSE) console.log(`  ${N}x${N} normal: ${flags} flagged of ${6 * 6 * N * N}`);
    assert(flags <= 6 * 6 * N * N * 0.1, `too many flags in normal light: ${flags}`);
  });

  test(`classify ${N}x${N}: hard light -> every wrong sticker is flagged`, () => {
    let wrongTotal = 0, flagTotal = 0;
    for (let t = 0; t < 10; t++) {
      const st = scramble(N);
      const r = classify(synth(st, N, HARD), N);
      const fl = new Set(r.flagged);
      for (let i = 0; i < st.length; i++) {
        if (r.state[i] !== st[i]) {
          wrongTotal++;
          assert(fl.has(i), `N=${N} trial ${t}: sticker ${i} wrong (${r.state[i]} vs ${st[i]}) but not flagged (conf ${r.confidence[i].toFixed(3)}, ${st.reduce((n, v, j) => n + (r.state[j] !== v), 0)} wrong, ${r.flagged.length} flagged)`);
        }
      }
      counts(r.state).forEach(c => eq(c, N * N, 'balanced counts'));
      flagTotal += r.flagged.length;
    }
    assert(flagTotal <= 10 * 6 * N * N * 0.5, `flagging nearly everything is cheating: ${flagTotal}`);
    if (process.env.VERBOSE) console.log(`  ${N}x${N} hard: ${wrongTotal} wrong, ${flagTotal} flagged of ${10 * 6 * N * N}`);
  });
}

test('sampleGrid: medians reject glare and borders; row/col match sticker order', () => {
  const N = 3, S = 90, W = 120, H = 90; // landscape frame: the face is the centered square
  const data = new Uint8ClampedArray(W * H * 4);
  const off = (W - S) / 2;
  const colorAt = (r, c) => BASE[(r * N + c) % 6];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 4;
    const fx = x - off;
    let rgb = [0, 0, 0];
    if (fx >= 0 && fx < S) {
      const c = Math.floor(fx / 30), r = Math.floor(y / 30), lx = fx % 30, ly = y % 30;
      rgb = lx < 3 || ly < 3 ? [10, 10, 10] : colorAt(r, c);
      if (lx >= 13 && lx <= 14 && ly >= 13 && ly <= 15) rgb = [255, 255, 255]; // glare spot
    }
    data[k] = rgb[0]; data[k + 1] = rgb[1]; data[k + 2] = rgb[2]; data[k + 3] = 255;
  }
  const crop = cropSquare(W, H);
  eq(crop.x, 15); eq(crop.size, 90);
  const s = sampleGrid(data, W, H, N);
  eq(s.length, 9);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const want = colorAt(r, c);
    s[r * N + c].forEach((v, ch) => assert(Math.abs(v - want[ch]) <= 1, `cell ${r},${c} ch ${ch}: ${v} vs ${want[ch]}`));
  }
});

test('classify: degenerate photos (all black / all the same / pure colors) still give a balanced state', () => {
  for (const N of [2, 3, 4, 7]) {
    const n = 6 * N * N;
    const inputs = [
      Array.from({ length: n }, () => [0, 0, 0]),
      Array.from({ length: n }, () => [120, 200, 40]),
      Array.from({ length: n }, (_, i) => [[255, 0, 0], [0, 255, 0], [0, 0, 255]][i % 3]),
    ];
    for (const s of inputs) {
      const r = classify(s, N);
      counts(r.state).forEach(c => eq(c, N * N, `N=${N} balanced`));
      assert(r.confidence.every(c => c >= 0 && c <= 1), 'confidence in 0..1');
    }
  }
});

test('srgbToLab sanity', () => {
  const w = srgbToLab([255, 255, 255]);
  assert(Math.abs(w[0] - 100) < 0.1 && Math.abs(w[1]) < 0.1 && Math.abs(w[2]) < 0.1, `white ${w}`);
  const r = srgbToLab([255, 0, 0]);
  assert(Math.abs(r[0] - 53.24) < 0.1 && Math.abs(r[1] - 80.09) < 0.2, `red ${r}`);
});

// Small 2D SVG diagrams of cube states (for algorithm cases and lessons).
import { COLOR_HEX, FACE_INDEX } from '../puzzles/nxn/state.js';

const NS = 'http://www.w3.org/2000/svg';
const PLASTIC = '#1c1b22';
const RING = '#ff2bd6';

function el(name, attrs = {}) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function svgRoot(w, h, size, label) {
  const scale = size / Math.max(w, h);
  const svg = el('svg', {
    viewBox: `0 0 ${w} ${h}`, width: Math.round(w * scale), height: Math.round(h * scale),
    role: 'img', 'aria-label': label, class: 'net2d',
  });
  return svg;
}

// One sticker cell. Units: each sticker is 1x1 with a small gap.
function sticker(svg, x, y, color, { ring, dim, w = 1, h = 1 } = {}) {
  const g = 0.08;
  const r = el('rect', {
    x: x + g, y: y + g, width: w - 2 * g, height: h - 2 * g, rx: 0.16,
    fill: COLOR_HEX[color] ?? '#888', opacity: dim ? 0.25 : 1,
  });
  svg.appendChild(r);
  if (ring) {
    svg.appendChild(el('rect', {
      x: x + g / 2, y: y + g / 2, width: w - g, height: h - g, rx: 0.2,
      fill: 'none', stroke: RING, 'stroke-width': 0.14,
    }));
  }
}

function drawFace(svg, state, N, face, ox, oy, opts = {}) {
  const base = FACE_INDEX[face] * N * N;
  svg.appendChild(el('rect', { x: ox, y: oy, width: N, height: N, rx: 0.3, fill: PLASTIC }));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const i = base + r * N + c;
    sticker(svg, ox + c, oy + r, state[i], { ring: opts.highlight?.has(i), dim: opts.dim?.has(i) });
  }
}

export function faceSVG(state, N, face, { size = 120, highlight, dim } = {}) {
  const svg = svgRoot(N, N, size, `${face} face`);
  drawFace(svg, state, N, face, 0, 0, { highlight, dim });
  return svg;
}

// Last-layer view: the U face with the top rows of F (below), B (above),
// L (left) and R (right), each drawn as a thin strip.
export function caseSVG(state, N, { size = 150, highlight, dim } = {}) {
  const t = 0.55; // strip thickness
  const W = N + 2 * t + 0.4;
  const svg = svgRoot(W, W, size, 'Top layer');
  const o = t + 0.2;
  drawFace(svg, state, N, 'U', o, o, { highlight, dim });
  const at = (face, c) => FACE_INDEX[face] * N * N + c; // top row, column c
  const strip = (i, x, y, w, h) => sticker(svg, x, y, state[i], { w, h, ring: highlight?.has(i), dim: dim?.has(i) });
  for (let c = 0; c < N; c++) {
    strip(at('F', c), o + c, o + N + 0.1, 1, t);                // below U, left to right
    strip(at('B', c), o + (N - 1 - c), 0.1, 1, t);               // above U, mirrored
    strip(at('L', c), 0.1, o + c, t, 1);                         // left of U, back to front
    strip(at('R', c), o + N + 0.1, o + (N - 1 - c), t, 1);       // right of U, front to back
  }
  return svg;
}

// Cross-shaped net:      U
//                      L F R B
//                        D
export function netSVG(state, N, { size = 220, highlight, dim } = {}) {
  const gap = 0.25, s = N + gap;
  const svg = svgRoot(4 * s, 3 * s, size, 'Cube net');
  const place = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
  for (const [face, [cx, cy]] of Object.entries(place)) {
    drawFace(svg, state, N, face, cx * s, cy * s, { highlight, dim });
  }
  return svg;
}

// Stickers that differ between two states (useful for highlight rings).
export function changedStickers(a, b) {
  const out = new Set();
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.add(i);
  return out;
}

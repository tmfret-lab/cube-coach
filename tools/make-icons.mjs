// Generates the app icons (PNG + SVG) with no dependencies: node tools/make-icons.mjs
// Design: a 3x3 face of colored rounded tiles on a purple rounded square.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const out = new URL('../icons/', import.meta.url);
mkdirSync(out, { recursive: true });

const BG = [0x5b, 0x4b, 0xdb];
const COLORS = [
  [0xe8, 0x20, 0x2a], [0xff, 0xff, 0xff], [0x15, 0xa8, 0x4a],
  [0xff, 0xd5, 0x00], [0x1a, 0x5f, 0xe0], [0xff, 0x7a, 0x00],
  [0x15, 0xa8, 0x4a], [0xe8, 0x20, 0x2a], [0xff, 0xd5, 0x00],
];

// Geometry in a 0..1 square. full=true fills the whole square (maskable/apple).
function shapes(full) {
  const list = [];
  list.push({ x: 0, y: 0, w: 1, h: 1, r: full ? 0 : 0.22, c: BG });
  const pad = 0.2, gap = 0.035, cell = (1 - 2 * pad - 2 * gap) / 3;
  // dark plate behind the tiles
  list.push({ x: pad - 0.03, y: pad - 0.03, w: 1 - 2 * pad + 0.06, h: 1 - 2 * pad + 0.06, r: 0.06, c: [0x16, 0x14, 0x24] });
  for (let i = 0; i < 9; i++) {
    const r = Math.floor(i / 3), c = i % 3;
    list.push({ x: pad + c * (cell + gap), y: pad + r * (cell + gap), w: cell, h: cell, r: 0.035, c: COLORS[i] });
  }
  return list;
}

function inRoundRect(px, py, s) {
  if (px < s.x || py < s.y || px > s.x + s.w || py > s.y + s.h) return false;
  const r = s.r;
  if (!r) return true;
  const cx = Math.min(Math.max(px, s.x + r), s.x + s.w - r);
  const cy = Math.min(Math.max(py, s.y + r), s.y + s.h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function render(size, full) {
  const list = shapes(full);
  const px = Buffer.alloc(size * size * 4);
  const SS = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let R = 0, G = 0, B = 0, A = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
      let col = null;
      for (const s of list) if (inRoundRect(u, v, s)) col = s.c;
      if (col) { R += col[0]; G += col[1]; B += col[2]; A += 255; }
    }
    const n = SS * SS, k = (y * size + x) * 4, a = A / n;
    const cov = A / 255 || 1;
    px[k] = Math.round(R / cov); px[k + 1] = Math.round(G / cov); px[k + 2] = Math.round(B / cov); px[k + 3] = Math.round(a);
  }
  return png(size, size, px);
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg() {
  const hex = (c) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  const body = shapes(false).map(s =>
    `<rect x="${(s.x * 512).toFixed(1)}" y="${(s.y * 512).toFixed(1)}" width="${(s.w * 512).toFixed(1)}" height="${(s.h * 512).toFixed(1)}" rx="${(s.r * 512).toFixed(1)}" fill="${hex(s.c)}"/>`,
  ).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n  ${body}\n</svg>\n`;
}

// 512 is full-bleed so it also works as a maskable icon (tiles stay in the safe zone).
writeFileSync(new URL('icon-192.png', out), render(192, false));
writeFileSync(new URL('icon-512.png', out), render(512, true));
writeFileSync(new URL('apple-touch-icon.png', out), render(180, true));
writeFileSync(new URL('icon.svg', out), svg());
console.log('icons written');

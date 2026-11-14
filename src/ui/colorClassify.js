// Camera color reading: pure logic, no DOM (Node-testable).
//
// sampleGrid(data, width, height, N, { patch?, crop? }) -> [[r,g,b], ...] (N*N, row-major)
//   data: RGBA bytes (ImageData.data). Reads the middle `patch` fraction (default 0.4) of
//   each grid cell inside `crop` ({ x, y, size }, default: the centered square) and takes the
//   per-channel median (rejects glare and sticker borders).
// cropSquare(width, height, fraction = 1) -> { x, y, size }: centered square crop.
// classify(samples, N, { threshold?, faceHint?, anchors? }) -> { state, confidence, flagged }
//   samples: 6*N*N [r,g,b] (sRGB 0..255) in sticker order face*N*N + row*N + col
//   (faces U R F D L B, rows/cols exactly as the face editor shows them).
//   state: Uint8Array of colors 0..5 with each color exactly N*N times
//   confidence: Float32Array 0..1 per sticker
//   flagged: sorted sticker indices worth checking (low confidence, or moved by the
//            "each color N*N times" balancing step, or competing with a moved sticker)
//   anchors: [[stickerIdx, color], ...] known from the hold guide. Default: odd N the six
//            middle centers (also locked to their color); even N the white-green-red corner
//            held at top-front-right (U bottom-right, F top-right, R top-left).
// How: sRGB -> linear -> CIELAB; distance in LCh with hue weighted most. Balanced k-means
// (k = 6, every color exactly N*N stickers: greedy by confidence margin + pair swaps), with a
// per-photo white-balance/exposure correction, from several starts (odd N: the 6 middle
// centers; even N: each face's central 2x2; plus farthest-point starts). Clusters get their
// color names from the hold-guide anchors (each anchor's vote is weighted by how clearly it
// belongs to its cluster, so a logo or glare on a center can't flip red and orange) and from
// how they look after white-balancing on the least colorful cluster (white). `faceHint` only
// breaks near-ties toward "face f mostly holds color f" (even N).

export const PATCH = 0.4;
export const FLAG_THRESHOLD = 0.36;
const OUTLIER = 3; // distance (in group spreads) from its group's average that counts as odd
const Z_FULL = 4; // margin (in group spreads) that counts as fully confident

// ---------- color math
export function srgbToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const fLab = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
export function linearToLab(r, g, b) {
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const Z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const fx = fLab(X), fy = fLab(Y), fz = fLab(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function srgbToLab([r, g, b]) {
  return linearToLab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
}

// Distance in LCh with hue weighted most (separates red/orange), chroma next (white/yellow),
// lightness least (exposure changes it a lot between photos).
const WL = 1.0, WC = 1.0, WH = 2.0;
export function colorDistance(p, q) {
  const dL = p[0] - q[0];
  const C1 = Math.hypot(p[1], p[2]), C2 = Math.hypot(q[1], q[2]);
  const dC = C1 - C2;
  const da = p[1] - q[1], db = p[2] - q[2];
  const dH2 = Math.max(0, da * da + db * db - dC * dC);
  return Math.sqrt(WL * WL * dL * dL + WC * WC * dC * dC + WH * WH * dH2);
}

// ---------- sampling
export function cropSquare(width, height, fraction = 1) {
  const size = Math.floor(Math.min(width, height) * fraction);
  return { x: Math.floor((width - size) / 2), y: Math.floor((height - size) / 2), size };
}

function median(arr, n) {
  const a = arr.subarray(0, n).sort();
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

export function sampleGrid(data, width, height, N, { patch = PATCH, crop = null } = {}) {
  const { x: cx, y: cy, size } = crop || cropSquare(width, height);
  const cell = size / N;
  const half = Math.max(0.5, (cell * patch) / 2);
  const maxPix = Math.ceil(2 * half + 2) ** 2;
  const R = new Uint8Array(maxPix), G = new Uint8Array(maxPix), B = new Uint8Array(maxPix);
  const out = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const mx = cx + (c + 0.5) * cell, my = cy + (r + 0.5) * cell;
    const x0 = Math.max(0, Math.round(mx - half)), x1 = Math.min(width - 1, Math.round(mx + half) - 1);
    const y0 = Math.max(0, Math.round(my - half)), y1 = Math.min(height - 1, Math.round(my + half) - 1);
    let n = 0;
    for (let y = y0; y <= Math.max(y0, y1); y++) for (let x = x0; x <= Math.max(x0, x1); x++) {
      const k = (y * width + x) * 4;
      R[n] = data[k]; G[n] = data[k + 1]; B[n] = data[k + 2]; n++;
    }
    out.push([median(R, n), median(G, n), median(B, n)]);
  }
  return out;
}

// ---------- balanced assignment
// D: Float64Array n*k distances; each of the k groups gets exactly `cap` members.
// fixed: Map(index -> group) assigned up front. Greedy by confidence margin, then pair swaps.
function balancedAssign(D, n, k, cap, fixed) {
  const assign = new Int8Array(n).fill(-1);
  const count = new Array(k).fill(0);
  for (const [i, g] of fixed) { assign[i] = g; count[g]++; }
  let left = [];
  for (let i = 0; i < n; i++) if (assign[i] < 0) left.push(i);
  while (left.length) {
    const open = [];
    for (let g = 0; g < k; g++) if (count[g] < cap) open.push(g);
    const cand = left.map(i => {
      let b = -1, d1 = Infinity, d2 = Infinity;
      for (const g of open) {
        const d = D[i * k + g];
        if (d < d1) { d2 = d1; d1 = d; b = g; } else if (d < d2) d2 = d;
      }
      return { i, b, m: (d2 === Infinity ? 1e9 : d2 - d1) };
    }).sort((a, b) => b.m - a.m);
    const rest = [];
    let filled = false;
    for (const c of cand) {
      if (!filled && count[c.b] < cap) {
        assign[c.i] = c.b;
        if (++count[c.b] === cap) filled = true; // open set changed: recompute margins
      } else rest.push(c.i);
    }
    left = rest;
  }
  // pair-swap improvement
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (fixed.has(i)) continue;
      for (let j = i + 1; j < n; j++) {
        const a = assign[i], b = assign[j];
        if (a === b || fixed.has(j)) continue;
        if (D[i * k + b] + D[j * k + a] < D[i * k + a] + D[j * k + b] - 1e-9) {
          assign[i] = b; assign[j] = a; changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return assign;
}

// ---------- k-means helpers
function distMatrix(labs, means) {
  const n = labs.length, k = means.length;
  const D = new Float64Array(n * k);
  for (let i = 0; i < n; i++) for (let g = 0; g < k; g++) D[i * k + g] = colorDistance(labs[i], means[g]);
  return D;
}
function groupMeans(vecs, assign, k, fallback) {
  const sum = Array.from({ length: k }, () => [0, 0, 0]), cnt = new Array(k).fill(0);
  vecs.forEach((v, i) => { const g = assign[i]; sum[g][0] += v[0]; sum[g][1] += v[1]; sum[g][2] += v[2]; cnt[g]++; });
  return sum.map((s, g) => (cnt[g] ? s.map(x => x / cnt[g]) : fallback[g]));
}
function farthestPointSeeds(labs, k, first) {
  const seeds = [labs[first]];
  const dmin = labs.map(p => colorDistance(p, seeds[0]));
  while (seeds.length < k) {
    let best = 0;
    for (let i = 1; i < labs.length; i++) if (dmin[i] > dmin[best]) best = i;
    seeds.push(labs[best]);
    labs.forEach((p, i) => { dmin[i] = Math.min(dmin[i], colorDistance(p, labs[best])); });
  }
  return seeds;
}

// Reference colors for naming clusters on even cubes (sRGB of typical stickers).
const REF_RGB = [[235, 235, 235], [185, 20, 35], [0, 155, 72], [255, 213, 0], [255, 110, 0], [0, 70, 173]];
const REF_HUE = REF_RGB.map(c => { const l = srgbToLab(c); return Math.atan2(l[2], l[1]); });
const angDiff = (a, b) => { let d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };

function* permutations(arr) {
  if (arr.length <= 1) { yield arr.slice(); return; }
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) yield [arr[i], ...p];
  }
}

// ---------- main
export function defaultAnchors(N) {
  const nn = N * N;
  if (N % 2) { const mid = (N - 1) / 2; return [0, 1, 2, 3, 4, 5].map(f => [f * nn + mid * N + mid, f]); }
  return [[0 * nn + (N - 1) * N + N - 1, 0], [2 * nn + N - 1, 2], [1 * nn, 1]]; // U, F, R stickers of the UFR corner
}

export function classify(samples, N, { threshold = FLAG_THRESHOLD, faceHint = true, perFace = N >= 3, iterations = 8, anchors = defaultAnchors(N) } = {}) {
  const nn = N * N, n = 6 * nn, k = 6;
  if (samples.length !== n) throw new Error(`classify: expected ${n} samples, got ${samples.length}`);
  const lin = samples.map(([r, g, b]) => [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]);
  const faceOf = (i) => Math.floor(i / nn);
  const odd = N % 2 === 1;
  const mid = (N - 1) >> 1;
  const centerIdx = (f) => f * nn + mid * N + mid;
  const fixed = new Map();
  if (odd) for (let f = 0; f < 6; f++) fixed.set(centerIdx(f), f);
  const noFixed = new Map();

  const corrected = (gains) => lin.map((v, i) => { const g = gains[faceOf(i)]; return [v[0] * g[0], v[1] * g[1], v[2] * g[2]]; });
  const toLabs = (cl) => cl.map(v => linearToLab(v[0], v[1], v[2]));

  // balanced k-means with per-photo white balance, from the given seeds
  function run(seeds) {
    let gains = Array.from({ length: 6 }, () => [1, 1, 1]);
    let means = seeds.map(s => s.slice());
    let assign = null;
    for (let it = 0; it < iterations; it++) {
      const cl = corrected(gains);
      const labs = toLabs(cl);
      const next = balancedAssign(distMatrix(labs, means), n, k, nn, noFixed);
      const same = assign && next.every((g, i) => g === assign[i]);
      assign = next;
      means = groupMeans(labs, assign, k, means);
      if (same && it > 1) break;
      if (!perFace) continue;
      // per-photo gains: each face's stickers should match their group's average color
      const linMeans = groupMeans(cl, assign, k, [[1, 1, 1]]);
      const ng = gains.map((g, f) => g.map((gc, ch) => {
        const ratios = [];
        for (let i = f * nn; i < (f + 1) * nn; i++) {
          const t = linMeans[assign[i]][ch], s = cl[i][ch];
          if (t > 0.03 && s > 0.03) ratios.push(t / s);
        }
        if (ratios.length < 2) return gc;
        ratios.sort((a, b) => a - b);
        return gc * Math.min(1.4, Math.max(0.7, ratios[ratios.length >> 1]));
      }));
      for (let ch = 0; ch < 3; ch++) { // keep the overall exposure where it was
        const gm = Math.exp(ng.reduce((s, g) => s + Math.log(g[ch]), 0) / 6);
        ng.forEach(g => { g[ch] /= gm; });
      }
      gains = ng;
    }
    const cl = corrected(gains);
    const labs = toLabs(cl);
    const D = distMatrix(labs, means);
    assign = balancedAssign(D, n, k, nn, noFixed);
    let cost = 0;
    for (let i = 0; i < n; i++) cost += D[i * k + assign[i]];
    return { assign, means, gains, cl, labs, cost };
  }

  // several starts; keep the tightest clustering
  const labs0 = toLabs(lin);
  const inits = [];
  if (odd) inits.push([0, 1, 2, 3, 4, 5].map(f => labs0[centerIdx(f)]));
  else {
    const c0 = N / 2 - 1;
    inits.push([0, 1, 2, 3, 4, 5].map(f => {
      const ids = [0, 1, N, N + 1].map(d => f * nn + c0 * N + c0 + d);
      return [0, 1, 2].map(ch => ids.map(i => labs0[i][ch]).sort((a, b) => a - b)).map(a => (a[1] + a[2]) / 2);
    }));
  }
  const dull = (p) => Math.hypot(p[1], p[2]) - 0.2 * p[0];
  let w = 0;
  labs0.forEach((p, i) => { if (dull(p) < dull(labs0[w])) w = i; });
  inits.push(farthestPointSeeds(labs0, k, w));
  for (let t = 1; t <= 3; t++) inits.push(farthestPointSeeds(labs0, k, Math.floor((t * n) / 4)));
  let res = null;
  for (const s of inits) { const r = run(s); if (!res || r.cost < res.cost) res = r; }

  // name the clusters: odd N by which face centers they hold (hold guide), then by how they
  // look after white-balancing on the least colorful cluster (white)
  const linMeans = groupMeans(res.cl, res.assign, k, [[1, 1, 1]]);
  const labMeans = linMeans.map(v => linearToLab(v[0], v[1], v[2]));
  let white = 0;
  labMeans.forEach((p, g) => { if (Math.hypot(p[1], p[2]) < Math.hypot(labMeans[white][1], labMeans[white][2])) white = g; });
  const wv = linMeans[white].map(v => Math.max(v, 1e-4)), wm = (wv[0] + wv[1] + wv[2]) / 3;
  const look = linMeans.map(v => linearToLab(v[0] * wm / wv[0], v[1] * wm / wv[1], v[2] * wm / wv[2]));
  const lookCost = look.map(p => {
    const C = Math.hypot(p[1], p[2]), h = Math.atan2(p[2], p[1]);
    return [0, 1, 2, 3, 4, 5].map(c => (c === 0
      ? (C / 25) ** 2
      : angDiff(h, REF_HUE[c]) ** 2 + Math.max(0, (25 - C) / 25) ** 2));
  });
  const share = Array.from({ length: k }, () => new Array(6).fill(0));
  res.assign.forEach((g, i) => { share[g][faceOf(i)] += 1 / nn; });
  // an anchor's vote counts fully only when it clearly sits in its cluster (logos, glare)
  const D0 = distMatrix(res.labs, res.means);
  const sp = new Array(k).fill(0), cnt0 = new Array(k).fill(0);
  res.assign.forEach((g, i) => { sp[g] += D0[i * k + g] ** 2; cnt0[g]++; });
  for (let g = 0; g < k; g++) sp[g] = Math.sqrt(sp[g] / Math.max(1, cnt0[g])) + 1;
  const votes = anchors.map(([i, c]) => {
    const g = res.assign[i];
    let z = Infinity;
    for (let h = 0; h < k; h++) if (h !== g) z = Math.min(z, (D0[i * k + h] - D0[i * k + g]) / (sp[g] + sp[h]));
    return { g, c, w: 2 * Math.max(0, Math.min(1, z)) };
  });
  let map = null, bestCost = Infinity, lookMap = null, lookBest = Infinity;
  for (const perm of permutations([0, 1, 2, 3, 4, 5])) { // perm[g] = color of cluster g
    let cost = 0;
    for (let g = 0; g < k; g++) {
      const c = perm[g];
      cost += lookCost[g][c];
      if (!odd && faceHint) cost -= 0.15 * share[g][c];
    }
    for (const v of votes) if (perm[v.g] === v.c) cost -= v.w;
    if (!map || cost < bestCost) { bestCost = cost; map = perm; }
    const lc = perm.reduce((t, c, g) => t + lookCost[g][c], 0);
    if (!lookMap || lc < lookBest) { lookBest = lc; lookMap = perm; }
  }
  const means = new Array(k);
  for (let g = 0; g < k; g++) means[map[g]] = res.means[g];
  const D = distMatrix(res.labs, means);
  const assign = balancedAssign(D, n, k, nn, fixed);

  // ---------- confidence and flags
  const state = new Uint8Array(n);
  const confidence = new Float32Array(n);
  const flagged = new Set();
  const best = new Int8Array(n);
  // spread of each color group (RMS distance to its mean): margins are measured against it,
  // so close pairs like red/orange need a wider margin than e.g. blue/yellow
  const spread = new Array(k).fill(0), cnt = new Array(k).fill(0);
  for (let i = 0; i < n; i++) { const d = D[i * k + assign[i]]; spread[assign[i]] += d * d; cnt[assign[i]]++; }
  for (let g = 0; g < k; g++) spread[g] = Math.sqrt(spread[g] / Math.max(1, cnt[g])) + 1;
  for (let i = 0; i < n; i++) {
    const a = assign[i];
    state[i] = a;
    let b = 0;
    for (let g = 1; g < k; g++) if (D[i * k + g] < D[i * k + b]) b = g;
    best[i] = b;
    if (fixed.has(i)) { confidence[i] = 1; continue; }
    let z = Infinity;
    for (let g = 0; g < k; g++) if (g !== a) z = Math.min(z, (D[i * k + g] - D[i * k + a]) / (spread[a] + spread[g]));
    const conf = b === a ? Math.max(0, Math.min(1, z / Z_FULL)) : 0;
    confidence[i] = conf;
    if (conf < threshold) flagged.add(i);
    // far from its own color's average: glare, shadow or a logo — doesn't look like anything well
    if (D[i * k + a] > OUTLIER * spread[a]) { flagged.add(i); confidence[i] = Math.min(confidence[i], threshold / 2); }
  }
  // A sticker moved from color X (its best) to Y by balancing: the true culprit may be a
  // sticker that kept X but looks a bit like Y. Flag the two most Y-like members of X.
  for (let i = 0; i < n; i++) {
    const x = best[i], y = assign[i];
    if (x === y) continue;
    const members = [];
    for (let j = 0; j < n; j++) if (assign[j] === x && !fixed.has(j)) members.push([D[j * k + y] - D[j * k + x], j]);
    members.sort((p, q) => p[0] - q[0]);
    for (const [, j] of members.slice(0, 2)) flagged.add(j);
  }
  // The anchors named some clusters differently than their looks suggest (e.g. a center that
  // reads orange-ish on the red face): every sticker of those colors is worth a check.
  const doubtful = new Set();
  for (let g = 0; g < k; g++) if (map[g] !== lookMap[g]) { doubtful.add(map[g]); doubtful.add(lookMap[g]); }
  if (doubtful.size) for (let i = 0; i < n; i++) if (doubtful.has(state[i]) && !fixed.has(i)) { flagged.add(i); confidence[i] = Math.min(confidence[i], threshold / 2); }
  return { state, confidence, flagged: [...flagged].sort((p, q) => p - q) };
}

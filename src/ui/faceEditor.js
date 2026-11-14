// Face editor: an N x N grid for one face + a color palette.
// createFaceEditor(container, { N, state, face, onChange, color })
//   state: Uint8Array (EMPTY = 255 for unpainted); edited in place.
// Returns { setFace(face), getFace(), getState(), setState(s), setHighlight(idx[]|null),
//           setColor(c), getColor(), undo(), canUndo(), fillFace(), clearFace(), destroy() }
import { FACE_INDEX, COLOR_NAMES, COLOR_HEX } from '../puzzles/nxn/state.js';
import { EMPTY } from '../puzzles/nxn/validate.js';

const STYLE_ID = 'face-editor-style';
const CSS = `
.fe { display: flex; flex-direction: column; gap: 12px; align-items: stretch; }
.fe-grid { display: grid; gap: 3px; width: 100%; max-width: 420px; margin: 0 auto; aspect-ratio: 1;
  background: #111; padding: 4px; border-radius: 10px; touch-action: none; user-select: none; -webkit-user-select: none; box-sizing: border-box; }
.fe-cell { border: 0; border-radius: 4px; padding: 0; margin: 0; min-width: 0; min-height: 0; cursor: pointer; position: relative; }
.fe-cell.empty { background: repeating-linear-gradient(45deg, #3a3a3a, #3a3a3a 4px, #2c2c2c 4px, #2c2c2c 8px); }
.fe-cell.locked::after { content: ''; position: absolute; inset: 32%; border-radius: 50%; background: rgba(0,0,0,.35); }
.fe-cell.hl { outline: 3px solid #ff2fd0; outline-offset: -3px; animation: fe-pulse 1s ease-in-out infinite alternate; }
@keyframes fe-pulse { from { filter: brightness(1); } to { filter: brightness(.6); } }
.fe-palette { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.fe-color { display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 6px 10px; border-radius: 10px;
  border: 2px solid rgba(128,128,128,.35); background: transparent; color: inherit; font: inherit; cursor: pointer; text-align: left; }
.fe-color.active { border-color: currentColor; box-shadow: 0 0 0 2px rgba(128,128,128,.4) inset; font-weight: 700; }
.fe-swatch { width: 28px; height: 28px; border-radius: 6px; flex: none; border: 1px solid rgba(0,0,0,.3); }
.fe-color .fe-name { display: block; font-size: 14px; line-height: 1.1; }
.fe-color .fe-count { display: block; font-size: 12px; opacity: .75; }
.fe-color .fe-count.over { color: #e8202a; opacity: 1; font-weight: 700; }
.fe-color .fe-count.done { color: #15a84a; opacity: 1; }
.fe-tools { display: flex; gap: 8px; }
.fe-tools button { flex: 1; min-height: 44px; border-radius: 10px; border: 2px solid rgba(128,128,128,.35);
  background: transparent; color: inherit; font: inherit; cursor: pointer; }
.fe-tools button:disabled { opacity: .4; }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID; st.textContent = CSS;
  document.head.appendChild(st);
}

export function createFaceEditor(container, { N, state, face = 'F', onChange = () => {}, color = 0 }) {
  ensureStyle();
  const nn = N * N;
  let cur = face;
  let active = color;
  let highlight = new Set();
  const history = []; // [{ changes: [[idx, oldValue]] }]
  const lockedIdx = (f) => (N % 2 ? FACE_INDEX[f] * nn + ((N - 1) / 2) * N + (N - 1) / 2 : -1);

  const root = document.createElement('div');
  root.className = 'fe';
  const grid = document.createElement('div');
  grid.className = 'fe-grid';
  grid.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${N}, 1fr)`;
  const cells = [];
  for (let i = 0; i < nn; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fe-cell';
    b.dataset.i = i;
    cells.push(b);
    grid.appendChild(b);
  }

  const palette = document.createElement('div');
  palette.className = 'fe-palette';
  const colorBtns = COLOR_NAMES.map((name, c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fe-color';
    b.innerHTML = `<span class="fe-swatch" style="background:${COLOR_HEX[c]}"></span><span><span class="fe-name">${name[0].toUpperCase() + name.slice(1)}</span><span class="fe-count"></span></span>`;
    b.setAttribute('aria-label', name);
    b.addEventListener('click', () => api.setColor(c));
    palette.appendChild(b);
    return b;
  });

  const tools = document.createElement('div');
  tools.className = 'fe-tools';
  const undoBtn = mkBtn('↶ Undo', () => api.undo());
  const fillBtn = mkBtn('Fill face', () => api.fillFace());
  const clearBtn = mkBtn('Clear face', () => api.clearFace());
  tools.append(undoBtn, fillBtn, clearBtn);

  root.append(grid, palette, tools);
  container.appendChild(root);

  function mkBtn(label, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  function globalIdx(local) { return FACE_INDEX[cur] * nn + local; }

  function render() {
    const lock = lockedIdx(cur);
    for (let i = 0; i < nn; i++) {
      const g = globalIdx(i);
      const v = state[g];
      const cell = cells[i];
      cell.classList.toggle('empty', v === EMPTY);
      cell.style.background = v === EMPTY ? '' : COLOR_HEX[v];
      cell.classList.toggle('locked', g === lock);
      cell.classList.toggle('hl', highlight.has(g));
      const r = Math.floor(i / N) + 1, c = (i % N) + 1;
      cell.setAttribute('aria-label', `row ${r}, column ${c}: ${v === EMPTY ? 'empty' : COLOR_NAMES[v]}`);
    }
    const counts = [0, 0, 0, 0, 0, 0];
    for (const v of state) if (v < 6) counts[v]++;
    colorBtns.forEach((b, c) => {
      b.classList.toggle('active', c === active);
      const el = b.querySelector('.fe-count');
      el.textContent = `${counts[c]} / ${nn}`;
      el.classList.toggle('over', counts[c] > nn);
      el.classList.toggle('done', counts[c] === nn);
    });
    undoBtn.disabled = history.length === 0;
  }

  // ---- painting
  let stroke = null; // { changes: [], seen: Set }
  function paint(local) {
    const g = globalIdx(local);
    if (g === lockedIdx(cur) || !stroke || stroke.seen.has(g)) return;
    stroke.seen.add(g);
    if (state[g] === active) return;
    stroke.changes.push([g, state[g]]);
    state[g] = active;
    highlight.delete(g);
    render();
  }
  function endStroke() {
    if (!stroke) return;
    if (stroke.changes.length) { history.push({ changes: stroke.changes }); onChange(state); }
    stroke = null;
    render();
  }
  function cellAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || !el.classList || !el.classList.contains('fe-cell') || !grid.contains(el)) return -1;
    return +el.dataset.i;
  }
  grid.addEventListener('pointerdown', (e) => {
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0) return;
    e.preventDefault();
    try { grid.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    stroke = { changes: [], seen: new Set() };
    paint(i);
  });
  grid.addEventListener('pointermove', (e) => {
    if (!stroke) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i >= 0) paint(i);
  });
  grid.addEventListener('pointerup', endStroke);
  grid.addEventListener('pointercancel', endStroke);
  grid.addEventListener('lostpointercapture', endStroke);
  // keyboard / accessibility: click without pointer events (e.g. Enter key)
  grid.addEventListener('click', (e) => {
    if (e.detail !== 0) return; // real pointer clicks are handled by pointerdown
    const t = e.target.closest('.fe-cell');
    if (!t) return;
    stroke = { changes: [], seen: new Set() };
    paint(+t.dataset.i);
    endStroke();
  });

  function applyBatch(indices, value) {
    const lock = lockedIdx(cur);
    const changes = [];
    for (const g of indices) {
      if (g === lock || state[g] === value) continue;
      changes.push([g, state[g]]);
      state[g] = value;
    }
    if (changes.length) { history.push({ changes }); onChange(state); }
    render();
  }
  const faceIndices = () => Array.from({ length: nn }, (_, i) => globalIdx(i));

  const api = {
    setFace(f) { cur = f; render(); },
    getFace: () => cur,
    getState: () => state,
    setState(s) {
      state = s;
      history.length = 0;
      render();
    },
    setHighlight(list) { highlight = new Set(list || []); render(); },
    setColor(c) { active = c; render(); },
    getColor: () => active,
    undo() {
      const h = history.pop();
      if (!h) return;
      for (let k = h.changes.length - 1; k >= 0; k--) { const [g, v] = h.changes[k]; state[g] = v; }
      onChange(state);
      render();
    },
    canUndo: () => history.length > 0,
    fillFace() { applyBatch(faceIndices(), active); },
    clearFace() { applyBatch(faceIndices(), EMPTY); },
    destroy() { root.remove(); },
  };
  render();
  return api;
}

// Camera mode: read all six faces from photos, then classify the colors.
// openCamera({ N, order, guideHTML(face), upLabel(face), onDone(result), onCancel() }) -> close()
//   order: faces to shoot, e.g. ['F','R','B','L','U','D'] (the editor's ORDER)
//   guideHTML(face): hold-guide HTML for that face; upLabel(face): what the top edge touches
//   onDone({ state, confidence, flagged }) — see colorClassify.js classify()
// Live preview via getUserMedia (rear camera); if that is missing or denied (e.g. iOS home-screen
// app) it falls back to <input type=file capture> per face. Either way the face must fill the
// centered square: grid cell (row, col) on screen = editor row/col = sticker face*N*N + row*N + col.
import { FACE_INDEX, COLOR_NAMES, COLOR_HEX } from '../puzzles/nxn/state.js';
import { sampleGrid, cropSquare, classify } from './colorClassify.js';

export const GRID_FRACTION = 0.8; // the grid covers the middle 80% of the square view

const STYLE_ID = 'camera-style';
const CSS = `
.cam { position: fixed; inset: 0; z-index: 60; background: var(--bg); color: var(--text); overflow-y: auto; -webkit-overflow-scrolling: touch; }
.cam-in { max-width: 520px; margin: 0 auto; padding: 10px 16px 28px; display: flex; flex-direction: column; gap: 10px; box-sizing: border-box; }
.cam-top { display: flex; align-items: center; gap: 8px; }
.cam-step { flex: 1; font-weight: 700; font-size: 16px; }
.cam-close { min-width: 48px; min-height: 48px; border-radius: 12px; border: 2px solid var(--border); background: var(--surface); font-size: 20px; cursor: pointer; }
.cam-guide { margin: 0; font-size: 15px; line-height: 1.35; }
.cam-view { position: relative; width: 100%; max-width: min(100%, 62vh); margin: 0 auto; aspect-ratio: 1; border-radius: 14px; overflow: hidden; background: #000; }
.cam-view video, .cam-view canvas.cam-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.cam-grid { position: absolute; inset: ${(1 - GRID_FRACTION) * 50}%; display: grid; pointer-events: none;
  outline: 3px solid #fff; box-shadow: 0 0 0 1px #000, 0 0 0 9999px rgba(0,0,0,.35); }
.cam-grid span { border: 1px solid rgba(255,255,255,.75); box-shadow: inset 0 0 0 1px rgba(0,0,0,.35); }
.cam-grid span.mid { background: radial-gradient(circle, rgba(255,255,255,.9) 0 3px, transparent 4px); }
.cam-up { position: absolute; top: 4px; left: 50%; transform: translateX(-50%); max-width: 94%; background: rgba(0,0,0,.65); color: #fff;
  font-size: 13px; font-weight: 700; padding: 3px 10px; border-radius: 999px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cam-msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 20px; color: #fff; font-size: 15px; }
.cam-flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; transition: opacity .25s; }
.cam-flash.on { opacity: .8; transition: none; }
.cam-hint { margin: 0; font-size: 14px; color: var(--muted); text-align: center; }
.cam-snapbox { display: flex; flex-direction: column; gap: 8px; }
.cam-snap { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 60px; border-radius: 16px; border: 0; cursor: pointer;
  background: var(--primary); color: var(--primary-text); font-size: 20px; font-weight: 800; position: relative; }
.cam-snap input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.cam-snap[aria-disabled="true"] { opacity: .5; }
.cam-snap.cam-second { min-height: 48px; font-size: 16px; background: var(--surface); color: var(--text); border: 2px solid var(--border); }
.cam-thumbs { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
.cam-thumb { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 4px 2px; min-height: 64px; min-width: 0;
  border-radius: 10px; border: 2px solid var(--border); background: var(--surface); cursor: pointer; font-size: 11px; }
.cam-thumb.cur { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
.cam-thumb canvas { image-rendering: pixelated; width: 100%; max-width: 44px; aspect-ratio: 1; border-radius: 4px; background: repeating-linear-gradient(45deg, #3a3a3a, #3a3a3a 4px, #2c2c2c 4px, #2c2c2c 8px); }
.cam-thumb .dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(0,0,0,.4); }
.cam-thumb .ck { position: absolute; top: -6px; right: -6px; background: var(--ok); color: #fff; border-radius: 50%; width: 18px; height: 18px; font-size: 12px; line-height: 18px; text-align: center; display: none; }
.cam-thumb.done .ck { display: block; }
.cam-row { display: flex; gap: 8px; }
.cam-row button { flex: 1; min-height: 48px; border-radius: 12px; border: 2px solid var(--border); background: var(--surface); font-size: 15px; cursor: pointer; }
.cam-done { min-height: 56px; border-radius: 14px; border: 0; background: var(--ok); color: #fff; font-size: 18px; font-weight: 800; cursor: pointer; }
.cam-done:disabled { opacity: .45; cursor: default; }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID; st.textContent = CSS;
  document.head.appendChild(st);
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// Read the face from any drawable (video frame or photo) of the given pixel size.
function readFace(source, w, h, N) {
  const crop = cropSquare(w, h, GRID_FRACTION);
  const S = Math.max(128, N * 36);
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(source, crop.x, crop.y, crop.size, crop.size, 0, 0, S, S);
  const samples = sampleGrid(cx.getImageData(0, 0, S, S).data, S, S, N);
  return { samples, image: cv };
}

export function openCamera({ N, order, guideHTML = () => '', upLabel = () => '', onDone = () => {}, onCancel = () => {} }) {
  ensureStyle();
  const nn = N * N;
  const shots = {}; // face -> { samples, image }
  let cur = 0;
  let stream = null;
  let mode = 'starting'; // 'live' | 'file'
  let closed = false;

  const root = document.createElement('div');
  root.className = 'cam';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Read the cube with the camera');
  root.innerHTML = `
    <div class="cam-in">
      <div class="cam-top"><div class="cam-step"></div><button type="button" class="cam-close" aria-label="Close camera">✕</button></div>
      <p class="cam-guide"></p>
      <div class="cam-view">
        <video playsinline muted autoplay></video>
        <canvas class="cam-photo" hidden></canvas>
        <div class="cam-msg" hidden></div>
        <div class="cam-grid" aria-hidden="true"></div>
        <div class="cam-up"></div>
        <div class="cam-flash"></div>
      </div>
      <p class="cam-hint"></p>
      <div class="cam-snapbox"></div>
      <div class="cam-thumbs"></div>
      <button type="button" class="cam-done" disabled>✓ Use these colors</button>
      <div class="cam-row"><button type="button" class="cam-switch" hidden>Use a photo instead</button></div>
    </div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const video = $('video');
  const photo = $('.cam-photo');

  const grid = $('.cam-grid');
  grid.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${N}, 1fr)`;
  for (let i = 0; i < nn; i++) {
    const s = document.createElement('span');
    if (N % 2 && i === (nn - 1) / 2) s.className = 'mid';
    grid.appendChild(s);
  }

  const thumbs = order.map((f, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cam-thumb';
    b.setAttribute('aria-label', `Face ${i + 1}: ${COLOR_NAMES[FACE_INDEX[f]]}`);
    const cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    b.innerHTML = '<span class="ck">✓</span>';
    b.append(cv);
    const lab = document.createElement('span');
    lab.innerHTML = `<span class="dot" style="display:inline-block;vertical-align:middle;background:${COLOR_HEX[FACE_INDEX[f]]}"></span> ${i + 1}`;
    b.append(lab);
    b.addEventListener('click', () => select(i));
    $('.cam-thumbs').appendChild(b);
    return { b, cv };
  });

  function drawThumb(i) {
    const s = shots[order[i]];
    const cx = thumbs[i].cv.getContext('2d');
    cx.clearRect(0, 0, N, N);
    if (!s) return;
    s.samples.forEach(([r, g, b], k) => { cx.fillStyle = `rgb(${r},${g},${b})`; cx.fillRect(k % N, Math.floor(k / N), 1, 1); });
  }

  // ---- snap button (live) or file picker (fallback)
  function renderSnap() {
    const box = $('.cam-snapbox');
    box.innerHTML = '';
    const again = !!shots[order[cur]];
    if (mode === 'file') {
      const next = order.findIndex((f, k) => k > cur && !shots[f]);
      const todo = next >= 0 ? next : order.findIndex(f => !shots[f]);
      if (again && todo >= 0) { // photo read: let him check it, then move on
        const nb = document.createElement('button');
        nb.type = 'button'; nb.className = 'cam-snap';
        nb.textContent = 'Next face →';
        nb.addEventListener('click', () => select(todo));
        box.appendChild(nb);
      }
      const lab = document.createElement('label');
      lab.className = 'cam-snap';
      if (again && todo >= 0) lab.classList.add('cam-second');
      lab.innerHTML = `<span>${again ? '📷 Retake photo of this face' : '📷 Take photo of this face'}</span>`;
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture', 'environment');
      inp.setAttribute('aria-label', lab.textContent);
      inp.addEventListener('change', () => { if (inp.files && inp.files[0]) readFile(inp.files[0]); });
      lab.appendChild(inp);
      box.appendChild(lab);
    } else {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cam-snap';
      b.textContent = again ? '📸 Retake' : '📸 Snap';
      b.setAttribute('aria-disabled', mode === 'live' ? 'false' : 'true');
      b.addEventListener('click', snapLive);
      box.appendChild(b);
    }
  }

  function render() {
    const f = order[cur];
    const done = order.filter(x => shots[x]).length;
    $('.cam-step').textContent = `Face ${cur + 1} of 6 · ${cap(COLOR_NAMES[FACE_INDEX[f]])}`;
    $('.cam-guide').innerHTML = guideHTML(f);
    $('.cam-up').textContent = `⬆ top edge: ${upLabel(f)}`;
    $('.cam-hint').textContent = done === 6
      ? 'All 6 faces read! Tap ✓ below, or tap a face to retake it.'
      : mode === 'file'
        ? 'Take the photo close up and straight on, so the face fills the square. Check the grid lines up.'
        : 'Fill the square with the face. Hold still and avoid shiny reflections.';
    const showPhoto = mode === 'file' || (mode !== 'live' && shots[f]);
    video.hidden = mode !== 'live';
    photo.hidden = !showPhoto;
    if (showPhoto) {
      const s = shots[f];
      if (s) {
        // show the read square, scaled to sit exactly under the grid
        const S = 300, g = Math.round(S * GRID_FRACTION), o = Math.round((S - g) / 2);
        photo.width = S; photo.height = S;
        const cx = photo.getContext('2d');
        cx.fillStyle = '#000'; cx.fillRect(0, 0, S, S);
        cx.drawImage(s.image, o, o, g, g);
      } else { photo.width = 1; photo.height = 1; }
    }
    thumbs.forEach((t, i) => {
      t.b.classList.toggle('cur', i === cur);
      t.b.classList.toggle('done', !!shots[order[i]]);
    });
    $('.cam-done').disabled = done < 6;
    $('.cam-switch').hidden = mode !== 'live';
    renderSnap();
  }

  function select(i) { cur = i; render(); }

  function flash() {
    const el = $('.cam-flash');
    el.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('on')));
  }

  function store(shot) {
    shots[order[cur]] = shot;
    drawThumb(cur);
    const next = order.findIndex((f, k) => k > cur && !shots[f]);
    const any = order.findIndex(f => !shots[f]);
    if (mode === 'live') cur = next >= 0 ? next : any >= 0 ? any : cur;
    render();
    if (mode === 'file' && order.every(f => shots[f])) $('.cam-done').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function snapLive() {
    if (mode !== 'live' || !video.videoWidth) return;
    flash();
    store(readFace(video, video.videoWidth, video.videoHeight, N));
  }

  function readFile(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try { store(readFace(img, img.naturalWidth, img.naturalHeight, N)); }
      finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); showMsg('Sorry, that photo could not be opened. Try again.'); };
    img.src = url;
  }

  function showMsg(text) {
    const m = $('.cam-msg');
    m.textContent = text || '';
    m.hidden = !text;
  }

  function stopStream() {
    if (stream) stream.getTracks().forEach(t => { try { t.stop(); } catch { /* ignore */ } });
    stream = null;
    video.srcObject = null;
  }

  function useFiles(reason) {
    stopStream();
    mode = 'file';
    showMsg(shots[order[cur]] ? '' : reason || '');
    render();
  }

  async function startLive() {
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) { useFiles('The live camera isn\'t available here, so take a photo of each face instead.'); return; }
    showMsg('Starting the camera…');
    try {
      const s = await md.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      if (closed) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s;
      video.srcObject = s;
      try { await video.play(); } catch { /* autoplay attr covers it */ }
      mode = 'live';
      showMsg('');
      render();
    } catch (err) {
      if (closed) return;
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      useFiles(denied
        ? 'Camera permission was turned off, so take a photo of each face instead.'
        : 'The live camera isn\'t available here, so take a photo of each face instead.');
    }
  }

  function onVisibility() { // don't keep the camera on in the background
    if (document.hidden) { if (mode === 'live') { stopStream(); mode = 'starting'; render(); } }
    else if (mode === 'starting' && !closed) startLive();
  }
  document.addEventListener('visibilitychange', onVisibility);

  function close() {
    if (closed) return;
    closed = true;
    stopStream();
    document.removeEventListener('visibilitychange', onVisibility);
    root.removeEventListener('keydown', onKey);
    root.remove();
  }
  function onKey(e) { if (e.key === 'Escape') { close(); onCancel(); } }
  root.addEventListener('keydown', onKey);

  $('.cam-close').addEventListener('click', () => { close(); onCancel(); });
  $('.cam-switch').addEventListener('click', () => useFiles(''));
  $('.cam-done').addEventListener('click', () => {
    if (!order.every(f => shots[f])) return;
    const samples = new Array(6 * nn);
    for (const f of order) shots[f].samples.forEach((s, k) => { samples[FACE_INDEX[f] * nn + k] = s; });
    let result;
    try { result = classify(samples, N); } catch (err) {
      $('.cam-hint').textContent = `Sorry, reading the colors failed (${err && err.message ? err.message : err}). Try retaking a face.`;
      return;
    }
    close();
    onDone(result);
  });

  render();
  $('.cam-close').focus();
  startLive();
  return close;
}

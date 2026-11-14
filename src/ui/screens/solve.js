// #/solve: enter the scrambled cube face by face, validate, solve, go to follow mode.
import { createFaceEditor } from '../faceEditor.js';
import { EMPTY } from '../../puzzles/nxn/validate.js';
import { FACE_INDEX, COLOR_NAMES, COLOR_HEX } from '../../puzzles/nxn/state.js';
import { openCamera } from '../camera.js'; // camera mode

const ORDER = ['F', 'R', 'B', 'L', 'U', 'D'];
// How to hold the cube for each face, matching the sticker layouts in state.js.
// up/down/left/right = the neighbouring center color seen at that edge of the face.
const GUIDE = {
  F: { text: 'Hold the cube with the <b>white</b> center on top and the <b>green</b> center facing you.', up: 0, down: 3, left: 4, right: 1 },
  R: { text: 'Keep white on top. Turn the whole cube to the left so the <b>red</b> center faces you.', up: 0, down: 3, left: 2, right: 5 },
  B: { text: 'Keep white on top. Turn the cube to the left again so the <b>blue</b> center faces you.', up: 0, down: 3, left: 1, right: 4 },
  L: { text: 'Keep white on top. Turn it to the left once more so the <b>orange</b> center faces you.', up: 0, down: 3, left: 5, right: 2 },
  U: { text: 'Turn back to green facing you. Now tip the top toward you so the <b>white</b> center faces you. Green is now at the bottom.', up: 5, down: 2, left: 4, right: 1 },
  D: { text: 'Start again with white on top and green facing you. Tip the bottom up toward you so the <b>yellow</b> center faces you. Green is now at the top.', up: 2, down: 5, left: 4, right: 1 },
};

// Even cubes have no middle center, so he holds the cube by one corner instead.
const EVEN_TEXT = {
  F: 'Find the corner with <b>white</b>, <b>green</b> and <b>red</b>. Hold the cube so that corner is at the top-front-right: white on top, green facing you, red on the right. Enter the side facing you.',
  R: 'Keep white on top. Turn the whole cube to the left once, so the side that had the red sticker of that corner faces you.',
  B: 'Keep white on top. Turn the cube to the left again.',
  L: 'Keep white on top. Turn it to the left once more.',
  U: 'Turn back to the start (white-green-red corner at the top-front-right). Tip the top toward you, so the white side faces you.',
  D: 'Start again with the white-green-red corner at the top-front-right. Tip the bottom up toward you, so the bottom side faces you.',
};

const STYLE_ID = 'solve-screen-style';
const CSS = `
.sv { display: flex; flex-direction: column; gap: 14px; padding: 12px 16px 32px; max-width: 520px; margin: 0 auto; box-sizing: border-box; }
.sv h2 { margin: 0; font-size: 22px; }
.sv-tabs { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
.sv-tab { position: relative; min-height: 44px; border-radius: 10px; border: 3px solid transparent; cursor: pointer; font: inherit; font-size: 11px; font-weight: 700; color: #000; }
.sv-tab.active { border-color: currentColor; outline: 2px solid rgba(128,128,128,.6); outline-offset: 2px; }
.sv-tab .ck { position: absolute; top: -6px; right: -6px; background: #15a84a; color: #fff; border-radius: 50%; width: 18px; height: 18px; font-size: 12px; line-height: 18px; display: none; }
.sv-tab.done .ck { display: block; }
.sv-guide { display: flex; gap: 12px; align-items: center; padding: 10px; border-radius: 12px; background: rgba(128,128,128,.12); }
.sv-guide svg { flex: none; }
.sv-guide p { margin: 0; font-size: 16px; line-height: 1.35; }
.sv-guide .sv-step { font-size: 12px; opacity: .7; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
.sv-nav { display: flex; gap: 8px; }
.sv-nav button, .sv-actions button { flex: 1; min-height: 48px; border-radius: 12px; border: 2px solid rgba(128,128,128,.35); background: transparent; color: inherit; font: inherit; font-size: 16px; cursor: pointer; }
.sv-actions { display: flex; flex-direction: column; gap: 8px; }
.sv-actions .sv-finish { background: #15a84a; border-color: #15a84a; color: #fff; font-weight: 700; font-size: 18px; min-height: 56px; }
.sv-actions .sv-small { min-height: 40px; font-size: 14px; opacity: .85; }
.sv-errors { display: none; border: 2px solid #e8202a; border-radius: 12px; padding: 10px 12px; }
.sv-errors.show { display: block; }
.sv-errors h3 { margin: 0 0 6px; font-size: 16px; color: #e8202a; }
.sv-errors ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
.sv-errors li button { all: unset; cursor: pointer; text-decoration: underline; text-decoration-color: rgba(128,128,128,.5); }
.sv-busy { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: none; align-items: center; justify-content: center; z-index: 50; }
.sv-busy.show { display: flex; }
.sv-busy div { background: #222; color: #fff; padding: 24px 28px; border-radius: 16px; text-align: center; font-size: 18px; max-width: 80%; }
.sv-spin { width: 44px; height: 44px; margin: 0 auto 12px; border-radius: 50%; border: 5px solid #555; border-top-color: #ffd500; animation: sv-rot 0.9s linear infinite; }
@keyframes sv-rot { to { transform: rotate(360deg); } }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID; st.textContent = CSS;
  document.head.appendChild(st);
}

function guideSVG(face) {
  const g = GUIDE[face];
  const me = FACE_INDEX[face];
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', '92'); svg.setAttribute('height', '92');
  svg.setAttribute('aria-hidden', 'true');
  const rect = (x, y, w, h, fill, rx = 3) => {
    const r = document.createElementNS(ns, 'rect');
    Object.entries({ x, y, width: w, height: h, fill, rx, stroke: '#111', 'stroke-width': 1.5 }).forEach(([k, v]) => r.setAttribute(k, v));
    svg.appendChild(r);
  };
  rect(22, 22, 56, 56, COLOR_HEX[me], 6);              // the face you are looking at
  rect(22, 4, 56, 14, COLOR_HEX[g.up]);               // what is on top
  rect(22, 82, 56, 14, COLOR_HEX[g.down]);
  rect(4, 22, 14, 56, COLOR_HEX[g.left]);
  rect(82, 22, 14, 56, COLOR_HEX[g.right]);
  const t = document.createElementNS(ns, 'text');
  t.setAttribute('x', 50); t.setAttribute('y', 55); t.setAttribute('text-anchor', 'middle');
  t.setAttribute('font-size', 11); t.setAttribute('font-weight', 700);
  t.setAttribute('fill', me === 0 || me === 3 ? '#000' : '#fff');
  t.textContent = 'YOU SEE';
  svg.appendChild(t);
  return svg;
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

function randomScramble(puzzle) {
  const N = puzzle.N;
  // never the middle slice on odd cubes, so the middle centers stay put
  const maxDepth = Math.max(1, N % 2 ? Math.floor((N - 1) / 2) : N / 2);
  const moves = [];
  for (let i = 0; i < 200; i++) {
    const face = 'URFDLB'[Math.floor(Math.random() * 6)];
    const k = 1 + Math.floor(Math.random() * maxDepth);
    const wide = Math.random() < 0.3;
    moves.push({ face, lo: wide ? 1 : k, hi: k, amt: 1 + Math.floor(Math.random() * 3) });
  }
  return puzzle.applyMoves(puzzle.solvedState(), moves);
}

export function mount(el, ctx) {
  ensureStyle();
  const { puzzle, store } = ctx;
  const N = puzzle.N;
  const nn = N * N;
  const draftKey = `editor:${puzzle.id}`;
  const solKey = `solution:${puzzle.id}`;

  const blank = () => {
    const s = new Uint8Array(6 * nn).fill(EMPTY);
    if (N % 2) for (let f = 0; f < 6; f++) s[f * nn + ((N - 1) / 2) * N + (N - 1) / 2] = f;
    return s;
  };

  let state = blank();
  let faceI = 0;
  const draft = store.get(draftKey, null);
  if (draft && Array.isArray(draft.state) && draft.state.length === 6 * nn) {
    state = Uint8Array.from(draft.state);
    if (ORDER.includes(draft.face)) faceI = ORDER.indexOf(draft.face);
  }
  const save = () => store.set(draftKey, { state: Array.from(state), face: ORDER[faceI] });

  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'sv';
  root.innerHTML = `
    <h2>Enter your cube</h2>
    <div class="sv-tabs" role="tablist"></div>
    <div class="sv-guide"><div class="sv-pic"></div><div><div class="sv-step"></div><p class="sv-text"></p></div></div>
    <div class="sv-editor"></div>
    <div class="sv-nav"><button type="button" class="sv-prev">← Previous face</button><button type="button" class="sv-next">Next face →</button></div>
    <div class="sv-errors" aria-live="polite"><h3>Something doesn't look right</h3><ol></ol></div>
    <div class="sv-actions">
      <button type="button" class="sv-finish">Finish → Solve it!</button>
      <button type="button" class="sv-small sv-random">Test: fill with a random scramble</button>
      <button type="button" class="sv-small sv-reset">Start over (clear all faces)</button>
    </div>
    <div class="sv-busy" role="alert"><div><div class="sv-spin"></div><span class="sv-busy-text">Working out your solution…</span></div></div>`;
  el.appendChild(root);
  const $ = (s) => root.querySelector(s);

  const tabs = ORDER.map((f, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sv-tab';
    b.style.background = COLOR_HEX[FACE_INDEX[f]];
    b.innerHTML = `<span class="ck">✓</span>${i + 1}`;
    b.setAttribute('aria-label', `${COLOR_NAMES[FACE_INDEX[f]]} face`);
    b.addEventListener('click', () => go(i));
    $('.sv-tabs').appendChild(b);
    return b;
  });

  let errorStickers = [];
  const editor = createFaceEditor($('.sv-editor'), {
    N, state, face: ORDER[faceI],
    color: FACE_INDEX[ORDER[faceI]],
    onChange: () => { save(); updateTabs(); },
  });

  function faceDone(f) {
    const base = FACE_INDEX[f] * nn;
    for (let i = 0; i < nn; i++) if (state[base + i] === EMPTY) return false;
    return true;
  }
  function updateTabs() {
    tabs.forEach((t, i) => {
      t.classList.toggle('active', i === faceI);
      t.classList.toggle('done', faceDone(ORDER[i]));
    });
  }
  function go(i) {
    faceI = Math.max(0, Math.min(5, i));
    const f = ORDER[faceI];
    editor.setFace(f);
    editor.setHighlight(errorStickers);
    $('.sv-pic').replaceChildren(guideSVG(f));
    const g = GUIDE[f];
    if (N % 2) {
      $('.sv-step').textContent = `Face ${faceI + 1} of 6 · ${cap(COLOR_NAMES[FACE_INDEX[f]])} center`;
      $('.sv-text').innerHTML = `${g.text} Check that <b>${COLOR_NAMES[g.up]}</b> is above it and <b>${COLOR_NAMES[g.right]}</b> is on the right.`;
    } else {
      $('.sv-step').textContent = `Face ${faceI + 1} of 6 · the ${cap(COLOR_NAMES[FACE_INDEX[f]])} side`;
      $('.sv-text').innerHTML = EVEN_TEXT[f];
    }
    $('.sv-prev').disabled = faceI === 0;
    $('.sv-next').textContent = faceI === 5 ? 'Back to face 1' : 'Next face →';
    updateTabs();
    save();
  }
  $('.sv-prev').addEventListener('click', () => go(faceI - 1));
  $('.sv-next').addEventListener('click', () => go(faceI === 5 ? 0 : faceI + 1));

  function showErrors(errors) {
    const box = $('.sv-errors');
    const ol = box.querySelector('ol');
    ol.innerHTML = '';
    box.classList.toggle('show', errors.length > 0);
    errorStickers = errors.flatMap(e => e.stickers);
    for (const e of errors) {
      const li = document.createElement('li');
      if (e.stickers.length) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = e.message;
        b.addEventListener('click', () => {
          errorStickers = e.stickers;
          go(ORDER.indexOf('URFDLB'[Math.floor(e.stickers[0] / nn)]));
          $('.sv-editor').scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        li.appendChild(b);
      } else li.textContent = e.message;
      ol.appendChild(li);
    }
    editor.setHighlight(errorStickers);
  }

  $('.sv-random').addEventListener('click', () => {
    if (!confirm('Replace all six faces with a random scramble? (This is for testing.)')) return;
    state.set(randomScramble(puzzle));
    editor.setState(state);
    showErrors([]);
    save(); go(faceI);
  });
  $('.sv-reset').addEventListener('click', () => {
    if (!confirm('Clear all six faces and start again?')) return;
    state.set(blank());
    editor.setState(state);
    showErrors([]);
    go(0);
  });

  let busy = false;
  $('.sv-finish').addEventListener('click', async () => {
    if (busy) return;
    const res = puzzle.validate(state);
    if (!res.ok) {
      showErrors(res.errors);
      const first = res.errors.find(e => e.stickers.length);
      if (first) go(ORDER.indexOf('URFDLB'[Math.floor(first.stickers[0] / nn)]));
      $('.sv-errors').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    showErrors([]);
    const old = store.get(solKey, null);
    if (old && Array.isArray(old.steps) && old.steps.length &&
        !confirm('You already have a solution in progress. Start a new one for this cube instead?')) return;
    if (puzzle.isSolved(state)) { alert('This cube is already solved! 🎉 Scramble it and enter it again.'); return; }
    busy = true;
    $('.sv-busy').classList.add('show');
    try {
      const steps = await puzzle.solve(state.slice());
      store.set(solKey, { startState: Array.from(state), steps, progress: { step: 0, move: 0 } });
      ctx.navigate('follow');
    } catch (err) {
      showErrors([{ message: `Sorry, the solver got stuck: ${err && err.message ? err.message : err}. Check the faces and try again.`, stickers: [] }]);
    } finally {
      busy = false;
      $('.sv-busy').classList.remove('show');
    }
  });

  // ---- camera mode (src/ui/camera.js): read all six faces from photos, then check flagged stickers
  let closeCamera = () => {};
  {
    if (!document.getElementById('solve-camera-style')) {
      const st = document.createElement('style');
      st.id = 'solve-camera-style';
      st.textContent = `.sv-cam { min-height: 56px; border-radius: 14px; border: 0; background: var(--primary); color: var(--primary-text); font: inherit; font-size: 18px; font-weight: 800; cursor: pointer; }
.sv-cam-note { margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--primary-soft); font-size: 15px; }`;
      document.head.appendChild(st);
    }
    const camBtn = document.createElement('button');
    camBtn.type = 'button';
    camBtn.className = 'sv-cam';
    camBtn.textContent = '📷 Use camera';
    const camNote = document.createElement('p');
    camNote.className = 'sv-cam-note';
    camNote.hidden = true;
    root.querySelector('h2').after(camBtn, camNote);
    const EVEN_UP = { F: 'the top side', R: 'the top side', B: 'the top side', L: 'the top side', U: 'the back side', D: 'the front side' };
    camBtn.addEventListener('click', () => {
      const lock = blank();
      if (state.some((v, i) => v !== EMPTY && v !== lock[i]) &&
          !confirm('The camera will replace the colors you have entered. Go ahead?')) return;
      const back = faceI;
      closeCamera = openCamera({
        N, order: ORDER,
        guideHTML: (f) => { go(ORDER.indexOf(f)); return $('.sv-text').innerHTML; },
        upLabel: (f) => (N % 2 ? `the ${COLOR_NAMES[GUIDE[f].up]} center` : EVEN_UP[f]),
        onCancel: () => go(back),
        onDone: ({ state: read, flagged }) => {
          state.set(read);
          editor.setState(state);
          editor.setFlagged(flagged);
          showErrors([]);
          go(0);
          camNote.hidden = false;
          camNote.textContent = flagged.length
            ? `The camera read all 6 faces. Look at each face: the ${flagged.length} sticker${flagged.length === 1 ? '' : 's'} marked ? might be wrong. Tap the right color, then tap a sticker to fix it.`
            : 'The camera read all 6 faces. Check each face against your cube, then tap Finish.';
        },
      });
    });
  }

  go(faceI);
  return () => { closeCamera(); editor.destroy(); };
}

// App shell: hash router, top bar, screen lifecycle, service worker.
import { registerPuzzle, getPuzzle } from './core/puzzle.js';
import { store } from './core/store.js';

const SCREENS = {
  home: { file: './ui/screens/home.js', title: 'Cube Coach' },
  learn: { file: './ui/screens/learn.js', title: 'Learn', parent: 'home' },
  algs: { file: './ui/screens/algorithms.js', title: 'Algorithms', parent: 'home' },
  solve: { file: './ui/screens/solve.js', title: 'Enter your cube', parent: 'home' },
  follow: { file: './ui/screens/follow.js', title: 'Solve along', parent: 'home' },
};

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back');

let puzzle = null;
let puzzleError = null;
let cleanup = null;
let navToken = 0;

function parseHash() {
  const h = (location.hash || '#/home').replace(/^#\/?/, '');
  const [name, ...rest] = h.split('/').filter(Boolean);
  const [route, query] = (name || 'home').split('?');
  const params = {};
  if (rest.length) params.id = decodeURIComponent(rest.join('/'));
  if (query) for (const [k, v] of new URLSearchParams(query)) params[k] = v;
  return { route: SCREENS[route] ? route : 'home', params };
}

export function navigate(route) {
  const target = '#/' + String(route).replace(/^#?\/?/, '');
  if (location.hash === target) render();
  else location.hash = target;
}

function setTitle(text) { titleEl.textContent = text; document.title = text === 'Cube Coach' ? text : `${text} · Cube Coach`; }

function errorBox(message, detail) {
  const box = document.createElement('div');
  box.className = 'error-box';
  box.innerHTML = '<div class="error-emoji" aria-hidden="true">🧩</div><h2>Oops, this part isn\'t ready yet</h2><p></p><button class="btn primary">Go home</button>';
  box.querySelector('p').textContent = message;
  if (detail) {
    const pre = document.createElement('details');
    pre.innerHTML = '<summary>Details</summary><pre></pre>';
    pre.querySelector('pre').textContent = detail;
    box.appendChild(pre);
  }
  box.querySelector('button').onclick = () => navigate('home');
  return box;
}

async function loadPuzzle() {
  try {
    const { makeNxN } = await import('./puzzles/nxn/index.js');
    if (!getPuzzle('7x7')) registerPuzzle(makeNxN(7));
    puzzle = getPuzzle('7x7');
  } catch (e) {
    puzzleError = e;
    console.error(e);
  }
}

async function render() {
  const token = ++navToken;
  const { route, params } = parseHash();
  const def = SCREENS[route];
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  viewEl.replaceChildren();
  viewEl.className = `view view-${route}`;
  setTitle(def.title);
  const parent = route === 'learn' && params.id ? 'learn' : def.parent;
  backBtn.hidden = !parent;
  backBtn.onclick = () => navigate(parent);
  window.scrollTo(0, 0);

  if (!puzzle && route !== 'home') {
    viewEl.appendChild(errorBox('The cube engine could not load.', String(puzzleError && (puzzleError.stack || puzzleError))));
    return;
  }
  let mod;
  try {
    mod = await import(def.file);
  } catch (e) {
    console.error(e);
    if (token !== navToken) return;
    viewEl.appendChild(errorBox(`The "${def.title}" screen could not load. Try again later.`, String(e.stack || e)));
    return;
  }
  if (token !== navToken) return;
  const ctx = { puzzle, navigate, store, params, setTitle };
  try {
    const res = await mod.mount(viewEl, ctx);
    if (token !== navToken) { if (typeof res === 'function') res(); return; }
    cleanup = typeof res === 'function' ? res : null;
  } catch (e) {
    console.error(e);
    viewEl.replaceChildren(errorBox('Something went wrong on this screen.', String(e.stack || e)));
  }
}

window.addEventListener('hashchange', render);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW registration failed', e));
  });
}

await loadPuzzle();
render();

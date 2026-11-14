import { COMING_SOON, listPuzzles } from '../../core/puzzle.js';
import { parseAlg } from '../../core/notation.js';
import { solvedState, applyMoves } from '../../puzzles/nxn/state.js';

const TAGLINE = {
  2: 'The little cube. Just corners!',
  3: 'The classic. Layer by layer.',
  4: 'Your first big cube.',
  5: 'Big cube with a middle.',
  6: 'Big cube, lots of parity.',
  7: 'Learn the big cube one step at a time.',
};
const PREVIEW = {
  2: "R U F' D2 L'",
  3: "R U F' D2 L B'",
  4: "R U 2R' F2 2U D' Rw",
  5: "R U 2Rw' F2 2L D' B 2U'",
  6: "R U 3Rw' F2 2L D' B 3U'",
  7: "R U 3Rw' F2 2L D' B 3U'",
};

export async function mount(el, ctx) {
  const { puzzle, navigate, store, selectPuzzle } = ctx;
  const id = puzzle ? puzzle.id : '7x7';
  const N = puzzle ? puzzle.N : 7;
  const sol = store.get(`solution:${id}`);
  const total = sol && sol.steps ? sol.steps.length : 0;
  const inProgress = sol && sol.steps && !(sol.progress && sol.progress.done);
  const stepNo = inProgress ? Math.min(total, ((sol.progress && sol.progress.step) || 0) + 1) : 0;

  el.innerHTML = `
    <section class="hero card">
      <div class="hero-cube" aria-hidden="true"></div>
      <div class="hero-text">
        <h1>${N}x${N} Cube</h1>
        <p class="muted">${TAGLINE[N] || 'Learn it one step at a time.'}</p>
      </div>
    </section>
    <div class="size-picker" role="radiogroup" aria-label="Pick your cube">
      ${listPuzzles().map(p => {
        const s = store.get(`solution:${p.id}`);
        const busy = s && s.steps && !(s.progress && s.progress.done);
        return `<button class="size-chip${p.id === id ? ' on' : ''}" role="radio" aria-checked="${p.id === id}" data-size="${p.id}">${p.id}${busy ? '<i class="dot" title="Solve in progress"></i>' : ''}</button>`;
      }).join('')}
    </div>
    <nav class="menu">
      ${inProgress ? `<button class="btn primary big" data-go="follow">▶ Keep solving <span class="sub">Step ${stepNo} of ${total}</span></button>` : ''}
      <button class="btn ${inProgress ? '' : 'primary'} big" data-go="solve">🧩 Solve my cube <span class="sub">Enter your colors, get the steps</span></button>
      <button class="btn big" data-go="learn">📖 Learn <span class="sub">How the ${N}x${N} works</span></button>
      <button class="btn big" data-go="algs">⚡ Algorithms <span class="sub">Moves to know</span></button>
      <button class="btn big ghost" data-go="follow/demo">👀 Try a demo solve</button>
    </nav>
    <h2 class="section-title">Coming soon</h2>
    <div class="soon-grid">
      ${COMING_SOON.map(n => `<div class="soon-tile"><span>${n}</span><small>soon</small></div>`).join('')}
    </div>`;

  el.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => navigate(b.dataset.go); });
  el.querySelectorAll('[data-size]').forEach(b => {
    b.onclick = () => { if (b.dataset.size !== id) { selectPuzzle(b.dataset.size); navigate('home'); } };
  });
  if (!puzzle) {
    el.querySelectorAll('[data-go]').forEach(b => { b.disabled = true; });
    const p = document.createElement('p');
    p.className = 'error-box';
    p.textContent = 'The cube engine could not load. Please reload the page.';
    el.prepend(p);
    return;
  }

  // A little spinning cube for fun.
  let view = null, timer = 0, alive = true;
  try {
    const { createCubeView } = await import('../cube3d.js');
    if (!alive) return;
    const s = applyMoves(N, solvedState(N), parseAlg(PREVIEW[N] || "R U F' D2", N));
    view = createCubeView(el.querySelector('.hero-cube'), { N, state: s, interactive: true });
    const spin = parseAlg("y", N);
    timer = setInterval(() => { if (view && !document.hidden) view.animateMove(spin[0], { duration: 1600, highlight: false }); }, 4500);
  } catch (e) {
    console.warn('3D preview unavailable', e);
  }
  return () => { alive = false; clearInterval(timer); if (view) view.dispose(); };
}

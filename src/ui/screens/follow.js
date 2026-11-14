// Follow mode: one move at a time, with an animated 3D cube and an
// "I did it" confirm after every move.
import { invertAlg } from '../../core/notation.js';
import { createCubeView } from '../cube3d.js';

const KEY = 'solution:7x7';
const STAGE_LABEL = { centers: 'Centers', edges: 'Edges', parity: 'Parity', '3x3': '3x3 stage', demo: 'Demo' };

function demoSolution(puzzle) {
  const scramble = puzzle.parseAlg("R U R' U' 3Rw2 2F' x y'");
  const start = puzzle.applyMoves(puzzle.solvedState(), scramble);
  const undo = invertAlg(scramble); // y x' 2F 3Rw2 U R U' R'
  return {
    demo: true,
    startState: Array.from(start),
    steps: [
      { stage: 'demo', title: 'Demo: turn the whole cube', explanation: 'Whole-cube turns (x, y, z) don\'t change the puzzle. They just change how you hold it, so the next moves are easy to do.', moves: undo.slice(0, 2) },
      { stage: 'demo', title: 'Demo: inner layers', explanation: 'On a 7x7 you can turn inner slices. "2F" turns only the 2nd layer from the front. "3Rw" grabs the 3 right layers together.', moves: undo.slice(2, 4) },
      { stage: 'demo', title: 'Demo: a move you know', explanation: 'This is the "sexy move" backwards. It works just like on a 3x3!', moves: undo.slice(4) },
    ],
    progress: { step: 0, move: 0 },
  };
}

export function mount(el, ctx) {
  const { puzzle, store, navigate, params } = ctx;
  const forceDemo = params.id === 'demo';
  let sol = forceDemo ? null : store.get(KEY);
  if (!sol || !Array.isArray(sol.steps) || !sol.startState) sol = demoSolution(puzzle);
  const steps = sol.steps;
  const save = () => { if (!sol.demo) store.set(KEY, sol); };

  let step = Math.max(0, Math.min(steps.length - 1, (sol.progress && sol.progress.step) || 0));
  let move = Math.max(0, (sol.progress && sol.progress.move) || 0);
  if (steps.length === 0) return finished();
  if (sol.progress && sol.progress.done) return finished();
  move = Math.min(move, steps[step].moves.length);

  const totalMoves = steps.reduce((n, s) => n + s.moves.length, 0);
  const movesBefore = [];
  { let n = 0; for (const s of steps) { movesBefore.push(n); n += s.moves.length; } }

  // State at the start of each step, computed lazily.
  const stepStart = [Uint8Array.from(sol.startState)];
  function startOfStep(i) {
    while (stepStart.length <= i) {
      const k = stepStart.length - 1;
      stepStart.push(puzzle.applyMoves(stepStart[k], steps[k].moves));
    }
    return stepStart[i];
  }
  const stateBefore = (s, i) => puzzle.applyMoves(startOfStep(s), steps[s].moves.slice(0, i));

  el.innerHTML = `
    <div class="follow">
      <div class="follow-head">
        <div class="row between">
          <span class="badge"></span>
          <span class="step-count muted"></span>
          <button class="icon-btn menu-btn" aria-label="More options" aria-haspopup="true">⋯</button>
        </div>
        <h2 class="step-title"></h2>
        <div class="progress" role="progressbar" aria-label="Solve progress"><div class="bar"></div></div>
        <details class="why"><summary>Why this step?</summary><p></p></details>
      </div>
      <div class="cube-stage"><div class="cube-box"></div><button class="icon-btn reset-view" aria-label="Reset view">⟲</button></div>
      <div class="move-card">
        <div class="move-big" aria-live="polite"></div>
        <p class="move-desc"></p>
      </div>
      <div class="move-list" aria-label="Moves in this step"></div>
      <div class="controls">
        <button class="btn primary huge did-it">I did it ✓</button>
        <div class="row gap">
          <button class="btn back-btn">← Back</button>
          <button class="btn again">↻ Show again</button>
        </div>
        <button class="link skip">I did this whole step</button>
      </div>
      <div class="sheet" hidden>
        <div class="sheet-panel card">
          <button class="btn restart">Restart from the beginning</button>
          <button class="btn home">Go home</button>
          <button class="btn ghost close">Close</button>
        </div>
      </div>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const view = createCubeView($('.cube-box'), { N: puzzle.N, state: stateBefore(step, move) });
  let animTimer = 0;

  function persist() {
    sol.progress = { step, move };
    save();
  }

  function render(animate = true) {
    const st = steps[step];
    $('.badge').textContent = STAGE_LABEL[st.stage] || st.stage;
    $('.badge').dataset.stage = st.stage;
    $('.step-count').textContent = `Step ${step + 1} of ${steps.length}`;
    $('.step-title').textContent = st.title;
    $('.why p').textContent = st.explanation || '';
    $('.why').hidden = !st.explanation;
    const done = movesBefore[step] + move;
    $('.progress .bar').style.width = `${totalMoves ? (100 * done) / totalMoves : 100}%`;
    $('.progress').setAttribute('aria-valuenow', String(Math.round(totalMoves ? (100 * done) / totalMoves : 100)));

    const list = $('.move-list');
    list.replaceChildren(...st.moves.map((m, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip' + (i < move ? ' done' : i === move ? ' current' : '');
      chip.textContent = puzzle.formatMove(m);
      return chip;
    }));
    const cur = list.querySelector('.current');
    if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });

    $('.back-btn').disabled = step === 0 && move === 0;
    const m = st.moves[move];
    if (!m) {
      $('.move-big').textContent = st.moves.length ? 'Step done!' : 'Nothing to do';
      $('.move-desc').textContent = st.moves.length
        ? 'Nice! Tap the button to go to the next step.'
        : 'This part is already solved on your cube. Lucky!';
      $('.did-it').textContent = step === steps.length - 1 ? 'Finish 🎉' : 'Next step →';
      $('.again').disabled = st.moves.length === 0;
      $('.skip').hidden = true;
      view.setState(stateBefore(step, move));
      return;
    }
    $('.move-big').textContent = puzzle.formatMove(m);
    $('.move-desc').textContent = puzzle.describeMove(m);
    $('.did-it').textContent = 'I did it ✓';
    $('.again').disabled = false;
    $('.skip').hidden = false;
    show(animate);
  }

  // Show the cube before the current move, then animate the move once.
  function show(animate) {
    clearTimeout(animTimer);
    view.setState(stateBefore(step, move));
    const m = steps[step].moves[move];
    if (!m || !animate) return;
    animTimer = setTimeout(() => view.animateMove(m, { duration: 650 }), 350);
  }

  function next() {
    const st = steps[step];
    if (move < st.moves.length) {
      move++; // after the last move this shows the "step done" card
    } else if (step < steps.length - 1) {
      step++; move = 0;
    } else {
      sol.progress = { step, move, done: true };
      save();
      cleanupAll();
      finished();
      return;
    }
    persist();
    render();
  }

  function back() {
    if (move > 0) move--;
    else if (step > 0) { step--; move = Math.max(0, steps[step].moves.length - 1); }
    persist();
    render();
  }

  function skipStep() {
    move = steps[step].moves.length;
    persist();
    render(false);
  }

  $('.did-it').onclick = next;
  $('.back-btn').onclick = back;
  $('.again').onclick = () => {
    const st = steps[step];
    if (move >= st.moves.length) { // replay the whole step
      clearTimeout(animTimer);
      view.setState(startOfStep(step));
      view.playMoves(st.moves, { duration: 450 });
    } else show(true);
  };
  $('.skip').onclick = skipStep;
  $('.reset-view').onclick = () => view.resetView();
  const sheet = $('.sheet');
  $('.menu-btn').onclick = () => { sheet.hidden = false; };
  $('.close').onclick = () => { sheet.hidden = true; };
  sheet.onclick = (e) => { if (e.target === sheet) sheet.hidden = true; };
  $('.home').onclick = () => navigate('home');
  $('.restart').onclick = () => {
    if (!confirm('Start the solve again from step 1? Make sure your cube is back in the starting scramble.')) return;
    step = 0; move = 0; sheet.hidden = true;
    persist();
    render();
  };

  render();

  let cleaned = false;
  function cleanupAll() {
    if (cleaned) return;
    cleaned = true;
    clearTimeout(animTimer);
    view.dispose();
  }
  return cleanupAll;

  function finished() {
    el.innerHTML = `
      <div class="celebrate">
        <div class="confetti" aria-hidden="true">🎉🧊🎉</div>
        <h1>You solved it!</h1>
        <p class="muted">${sol.demo ? 'That was the demo. Now try it with your real cube!' : 'Amazing work. A 7x7 is a big deal!'}</p>
        <div class="menu">
          ${sol.demo ? '<button class="btn primary big" data-go="solve">🧩 Solve my cube</button>' : '<button class="btn primary big" data-go="solve">🧩 Solve another one</button>'}
          <button class="btn big" data-go="home">🏠 Home</button>
          ${sol.demo ? '' : '<button class="btn big ghost again-all">↺ Do this solve again</button>'}
        </div>
      </div>`;
    el.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => navigate(b.dataset.go); });
    const again = el.querySelector('.again-all');
    if (again) again.onclick = () => { sol.progress = { step: 0, move: 0 }; save(); navigate('follow'); };
  }
}

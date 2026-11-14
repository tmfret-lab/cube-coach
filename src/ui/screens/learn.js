// Learn screen: lesson list (#/learn) and a lesson page (#/learn/<id>).
// Also exports the bottom-sheet alg player shared with the Algorithms screen.
import { createCubeView } from '../cube3d.js';

// ---------- small DOM helpers
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : String(k));
  return e;
}

export function ensureTeachStyles() {
  if (document.getElementById('teach-styles')) return;
  const css = `
.teach-list { display: flex; flex-direction: column; gap: 12px; }
.teach-card { display: flex; gap: 14px; align-items: center; width: 100%; text-align: left; border: 1px solid var(--border); color: var(--text); font: inherit; cursor: pointer; min-height: 72px; }
.teach-card:active { transform: scale(0.98); }
.teach-num { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--primary-soft); color: var(--primary); font-weight: 800; font-size: 18px; }
.teach-card h3 { margin: 0 0 2px; font-size: 18px; }
.teach-card p { margin: 0; }
.lesson-sec { margin: 0 0 12px; }
.lesson-sec p { margin: 0; font-size: 18px; line-height: 1.45; }
.lesson-sec .btn { margin-top: 12px; }
.lesson-nav { display: flex; gap: 10px; margin: 20px 0 8px; }
.lesson-nav .btn { flex: 1; }
.alg-text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 20px; font-weight: 700; line-height: 1.35; word-spacing: 4px; overflow-wrap: anywhere; }
.player-moves { display: flex; flex-wrap: wrap; gap: 6px; max-height: 96px; overflow-y: auto; }
.player-moves .chip { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 700; }
.player-now { min-height: 64px; }
.player-now .move-big { font-size: 40px; }
.player-now .move-desc { font-size: 15px; }
.sheet-panel .cube-stage { height: min(40vh, 340px); min-height: 220px; }
.sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sheet-head h2 { margin: 0; font-size: 20px; }
.stage-tabs { display: flex; gap: 8px; overflow-x: auto; padding: 4px 0 8px; margin: 0 -16px; padding-left: 16px; padding-right: 16px; scrollbar-width: none; }
.stage-tabs::-webkit-scrollbar { display: none; }
.stage-tabs .chip { flex: none; min-height: 40px; font: inherit; font-weight: 700; cursor: pointer; }
.alg-card { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.alg-card .row .btn, .lesson-nav .btn { min-width: 0; white-space: normal; }
.alg-card .case { display: flex; justify-content: center; padding: 6px; border-radius: 12px; background: var(--surface-2); }
.alg-card .case svg { max-width: 100%; height: auto; }
.alg-card h3 { margin: 0; font-size: 19px; }
.alg-card p { margin: 0; }
.alg-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
`;
  document.head.appendChild(h('style', { id: 'teach-styles' }, css));
}

// ---------- alg player in a bottom sheet
// opts: { title, start: state, moves: Move[], autoplay?, note? }
// Returns { close() }.
export function openPlayer(puzzle, { title, start, moves, autoplay = false, note }) {
  ensureTeachStyles();
  const stageBox = h('div', { class: 'cube-box' });
  const stage = h('div', { class: 'cube-stage' }, stageBox);
  const chips = h('div', { class: 'player-moves', 'aria-label': 'Moves' });
  const big = h('div', { class: 'move-big' });
  const desc = h('p', { class: 'move-desc muted' });
  const playBtn = h('button', { class: 'btn primary' }, 'Play');
  const stepBtn = h('button', { class: 'btn' }, 'Step');
  const resetBtn = h('button', { class: 'btn ghost' }, 'Restart');
  const closeBtn = h('button', { class: 'btn ghost', 'aria-label': 'Close' }, 'Close');
  const viewBtn = h('button', { class: 'btn ghost reset-view', 'aria-label': 'Reset view' }, 'Reset view');
  stage.append(viewBtn);

  const panel = h('div', { class: 'sheet-panel card', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', {}, title), closeBtn),
    note ? h('p', { class: 'muted', style: 'margin:0' }, note) : null,
    stage,
    h('div', { class: 'player-now' }, big, desc),
    chips,
    h('div', { class: 'row gap' }, playBtn, stepBtn, resetBtn),
  );
  const sheet = h('div', { class: 'sheet' }, panel);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
  document.body.appendChild(sheet);

  const view = createCubeView(stageBox, { N: puzzle.N, state: start });
  let i = 0;          // moves done
  let running = false;
  let pauseAsked = false;
  let token = 0;
  let closed = false;

  const chipEls = moves.map((m, k) => {
    const c = h('button', { class: 'chip', 'aria-label': `Move ${k + 1}` }, puzzle.formatMove(m));
    c.addEventListener('click', () => jumpTo(k));
    return c;
  });
  chips.append(...chipEls);

  function render(current = null) {
    chipEls.forEach((c, k) => {
      c.classList.toggle('done', k < i && k !== current);
      c.classList.toggle('current', k === current);
    });
    const show = current ?? (i < moves.length ? i : null);
    if (show != null) {
      big.textContent = puzzle.formatMove(moves[show]);
      desc.textContent = (current == null ? 'Next: ' : '') + puzzle.describeMove(moves[show]);
    } else {
      big.textContent = moves.length ? 'Done!' : '';
      desc.textContent = moves.length ? 'Tap Restart to see it again.' : '';
    }
    playBtn.textContent = running ? 'Pause' : (i >= moves.length ? 'Play again' : 'Play');
    stepBtn.disabled = running || i >= moves.length;
    const cur = current != null ? chipEls[current] : chipEls[i];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  async function run(count) {
    if (running) return;
    running = true; pauseAsked = false;
    const my = ++token;
    render();
    while (i < moves.length && count-- > 0 && !pauseAsked) {
      render(i);
      await view.animateMove(moves[i], { highlight: true });
      if (my !== token || closed) return;
      i++;
    }
    running = false;
    render();
  }

  function restart() {
    token++; running = false; pauseAsked = false;
    view.stop();
    view.setState(start);
    i = 0;
    render();
  }

  function jumpTo(k) {
    // jump instantly to the state before move k
    token++; running = false; pauseAsked = false;
    view.stop();
    view.setState(puzzle.applyMoves(start, moves.slice(0, k)));
    i = k;
    render();
  }

  playBtn.addEventListener('click', () => {
    if (running) { pauseAsked = true; return; }
    if (i >= moves.length) { restart(); }
    run(Infinity);
  });
  stepBtn.addEventListener('click', () => run(1));
  resetBtn.addEventListener('click', restart);
  viewBtn.addEventListener('click', () => view.resetView());
  closeBtn.addEventListener('click', () => close());
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  function close() {
    if (closed) return;
    closed = true; token++;
    document.removeEventListener('keydown', onKey);
    view.dispose();
    sheet.remove();
  }

  render();
  if (autoplay) setTimeout(() => { if (!closed) run(Infinity); }, 350);
  closeBtn.focus?.();
  return { close };
}

// ---------- screen
export function mount(el, ctx) {
  ensureTeachStyles();
  const { puzzle } = ctx;
  const lessons = puzzle.lessons;
  const id = ctx.params?.id;
  let player = null;

  if (!id) {
    ctx.setTitle?.('Learn');
    el.append(
      h('p', { class: 'muted' }, 'Read these in order. Tap "Show me" to watch each move on the 3D cube.'),
      h('div', { class: 'teach-list' }, lessons.map((l, k) =>
        h('button', { class: 'card teach-card', onclick: () => ctx.navigate('learn/' + l.id) },
          h('span', { class: 'teach-num' }, String(k + 1)),
          h('span', {}, h('h3', {}, l.title), h('p', { class: 'muted' }, l.blurb || ''))))),
      h('div', { class: 'lesson-nav' },
        h('button', { class: 'btn big', onclick: () => ctx.navigate('algs') }, 'See all algorithms')),
    );
    return () => {};
  }

  const k = lessons.findIndex(l => l.id === id);
  if (k < 0) {
    el.append(h('p', {}, 'That lesson was not found.'),
      h('button', { class: 'btn', onclick: () => ctx.navigate('learn') }, 'All lessons'));
    return () => {};
  }
  const lesson = lessons[k];
  ctx.setTitle?.(lesson.title);

  const secs = lesson.sections.map((s, n) => {
    const card = h('div', { class: 'card lesson-sec' }, h('p', {}, s.text));
    if (s.demo) {
      card.append(h('button', {
        class: 'btn primary',
        onclick: () => {
          player?.close();
          const solved = puzzle.solvedState();
          const start = s.demo.setup ? puzzle.applyMoves(solved, puzzle.parseAlg(s.demo.setup)) : solved;
          player = openPlayer(puzzle, {
            title: `${lesson.title}: part ${n + 1}`,
            start, moves: puzzle.parseAlg(s.demo.alg), autoplay: true,
          });
        },
      }, '▶ Show me'));
    }
    return card;
  });

  const prev = lessons[k - 1], next = lessons[k + 1];
  el.append(
    h('div', {}, secs),
    h('div', { class: 'lesson-nav' },
      prev ? h('button', { class: 'btn', onclick: () => ctx.navigate('learn/' + prev.id) }, '← ' + prev.title) : null,
      next ? h('button', { class: 'btn primary', onclick: () => ctx.navigate('learn/' + next.id) }, next.title + ' →')
        : h('button', { class: 'btn primary', onclick: () => ctx.navigate('solve') }, 'Solve my cube →')),
  );
  return () => player?.close();
}

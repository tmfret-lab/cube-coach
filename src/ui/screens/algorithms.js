// Algorithms screen: alg cards grouped by stage, each with a case diagram
// and Play / Step buttons that open the 3D player sheet.
import { STAGES } from '../../puzzles/nxn/algs.js';
import { invertAlg } from '../../core/notation.js';
import { caseSVG, netSVG, changedStickers } from '../net2d.js';
import { h, ensureTeachStyles, openPlayer } from './learn.js';

// The state an alg starts from: solved (held as the alg says), with the alg undone.
export function caseState(puzzle, a) {
  let s = puzzle.solvedState();
  if (a.view === 'yellow-top') s = puzzle.applyMoves(s, puzzle.parseAlg('z2'));
  const holding = s;
  if (a.stage !== 'notation') s = puzzle.applyMoves(s, invertAlg(puzzle.parseAlg(a.alg)));
  return { holding, start: s };
}

const holdNote = (a) => a.view === 'yellow-top'
  ? 'Hold it with yellow on top and green in front.'
  : 'Hold it with white on top and green in front.';

export function mount(el, ctx) {
  ensureTeachStyles();
  const { puzzle } = ctx;
  const algs = puzzle.algs;
  let player = null;
  const want = ctx.params?.stage;
  let stage = STAGES.some(s => s.id === want) ? want : '3x3';

  const tabs = h('div', { class: 'stage-tabs', role: 'tablist' });
  const blurb = h('p', { class: 'muted' });
  const grid = h('div', { class: 'alg-grid' });

  function open(a, autoplay) {
    player?.close();
    const { start } = caseState(puzzle, a);
    player = openPlayer(puzzle, {
      title: a.name, start, moves: puzzle.parseAlg(a.alg), autoplay,
      note: holdNote(a),
    });
  }

  function card(a) {
    const { holding, start } = caseState(puzzle, a);
    let pic;
    if (a.stage === 'notation') {
      const after = puzzle.applyMoves(start, puzzle.parseAlg(a.alg));
      pic = netSVG(after, puzzle.N, { size: 240, highlight: changedStickers(start, after) });
    } else if (a.view === 'yellow-top' && a.effect?.some(e => e.kind === 'only-layers' && e.faces.join() === 'U')) {
      // last-layer alg: the top view says it all
      pic = caseSVG(start, puzzle.N, { size: 170 });
    } else {
      pic = netSVG(start, puzzle.N, { size: 240, highlight: changedStickers(holding, start) });
    }
    return h('article', { class: 'card alg-card' },
      h('h3', {}, a.name),
      h('div', { class: 'case', 'aria-hidden': 'true' }, pic),
      h('div', { class: 'alg-text' }, a.alg),
      h('p', { class: 'muted' }, a.description),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn primary', onclick: () => open(a, true) }, '▶ Play'),
        h('button', { class: 'btn', onclick: () => open(a, false) }, 'Step by step')),
    );
  }

  function render() {
    tabs.replaceChildren(...STAGES.map(s => {
      const b = h('button', { class: 'chip' + (s.id === stage ? ' current' : ''), role: 'tab', 'aria-selected': String(s.id === stage) }, s.name);
      b.addEventListener('click', () => { stage = s.id; render(); });
      return b;
    }));
    blurb.textContent = STAGES.find(s => s.id === stage).blurb;
    grid.replaceChildren(...algs.filter(a => a.stage === stage).map(card));
    tabs.querySelector('.current')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }

  ctx.setTitle?.('Algorithms');
  el.append(tabs, blurb, grid);
  render();
  return () => player?.close();
}

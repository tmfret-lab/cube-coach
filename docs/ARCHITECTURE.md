# Cube Coach architecture

Static phone web app. Vanilla JS ES modules, no build step. Three.js is vendored at
`lib/three.module.min.js` (r160) and imported with a relative path
(`import * as THREE from '../../lib/three.module.min.js'`). Node is only used for tests
(`node tests/run.mjs`, no npm packages). All paths below are relative to the repo root.

## Core data
- **State**: `Uint8Array(6*N*N)` of color indices (0 white, 1 red, 2 green, 3 yellow, 4 orange, 5 blue).
  Sticker index = `face*N*N + row*N + col`, faces `U R F D L B`. See `src/puzzles/nxn/state.js`.
  Solved/home orientation: white on top (U), green in front (F), red on the right (R).
- **Move**: `{ face: 'R', lo: 1, hi: 1, amt: 1|2|3 }` (amt 3 = prime). Parse and format with
  `src/core/notation.js` (`parseAlg(text, N)`, `formatMove(m, N)`, `describeMove(m, N)`).
- **Pieces/orbits**: `getPieces(N)` in `src/puzzles/nxn/pieces.js`: cubies (`corner`, `midge`,
  `wing` with `depth`, `center`, `fixed`), `stickerCubie`, sticker `orbits`. Wings are chiral,
  so each wing depth has two 24-sticker orbits; a wing cubie has one sticker in each.
- **Step** (solver output, follow-mode input), plain JSON:
  `{ stage: 'centers'|'edges'|'parity'|'3x3', title: string, explanation: string, moves: Move[], algId?: string }`

## Puzzle interface (`src/core/puzzle.js`, `src/puzzles/nxn/index.js`)
`src/app.js` registers `makeNxN(N)` for N = 2..7 and passes the selected one as `ctx.puzzle`
(`ctx.selectPuzzle(id)` switches it). `makeNxN(N)` returns
`{ id: '7x7', name, N, active, solvedState(), applyMove(s,m), applyMoves(s,ms), parseAlg(t),
   formatMove(m), formatAlg(ms), describeMove(m), isSolved(s), validate(s), solve(s) -> Promise<Step[]>,
   algs, lessons }`.
Screens use only this interface (plus the UI modules), so other puzzles can plug in later.

## Shared UI APIs
- `src/ui/cube3d.js`
  `createCubeView(container, { N, state? , interactive?: true })` returns a view:
  `setState(state)`, `getState()`, `animateMove(move, { duration?, highlight?: true }) -> Promise`
  (animates one move and updates the state; turning layers are tinted while turning),
  `playMoves(moves, { duration?, onMove?(i) }) -> Promise`, `stop()`, `setHighlight(stickerIdx[]|null)`,
  `resetView()` (camera back to the default front-top-right view), `dispose()`.
  Swipe/drag orbits the camera. Works inside any sized container (resizes with it).
- `src/ui/net2d.js` (SVG diagrams):
  `faceSVG(state, N, face, { size?, highlight?: Set<stickerIdx>, dim?: Set })` returns an SVG element;
  `caseSVG(state, N, { size? })` shows the U face plus the top row of F, R, B and L (last-layer view);
  `netSVG(state, N, { size? })` shows a full cross-shaped net.
- `src/core/store.js`: `store.get(key, fallback)`, `store.set(key, value)`, `store.remove(key)`
  (JSON in localStorage, every access wrapped in try/catch).
  Keys: `puzzle` (selected size id, default `7x7`), `editor:<id>` (face-editor draft), `solution:<id>`
  `{ startState: number[], steps: Step[], progress: { step, move } }`.

## Screens (`src/ui/screens/*.js`)
Each exports `mount(el, ctx)` and may return a cleanup function. Arguments:
`ctx = { puzzle, navigate(route), store, params }`. Hash routes are `#/home`, `#/learn`,
`#/learn/<lessonId>`, `#/algs`, `#/solve` and `#/follow`. `src/app.js` owns routing,
the top bar and the back button.

## Algorithm library (`src/puzzles/nxn/algs.js`)
`getAlgs(N)` returns `[{ id, stage: 'notation'|'centers'|'edges'|'parity'|'3x3'|'levelup', name,
  alg, description, effect? }]`. The case diagram is generated from the solved state with the
alg's inverse applied. The 3x3 solver refers to these ids:
`corner-insert` (R U R' U'), `f2l-right` (U R U' R' U' F' U F), `f2l-left` (U' L' U L U F U' F'),
`ll-cross` (F R U R' U' F'), `sune` (R U R' U R U2 R'), `corner-cycle` (U R U' L' U R' U' L),
`u-perm` (R U' R U R U R U' R' U' R2), `edge-flip` (R U R' F R' F' R, used for edge pairing),
`oll-parity` (big-cube OLL parity, verified on the engine).

## Lessons (`src/puzzles/nxn/lessons.js`)
`getLessons(N)` returns `[{ id, title, sections: [{ text, demo?: { setup?: alg, alg } }] }]`.

## Solver (`src/puzzles/nxn/solver/`)
`index.js` `solve(N, state) -> Step[]` = reduction (`centers.js`, `edges.js`, `parity.js`, using
`search.js`) followed by the 3x3 stage (`three.js`: `solve3x3Stage(N, state) -> Step[]`, outer-layer
moves and whole-cube rotations only). `worker.js` runs it off the main thread.
Per size: N = 2 runs `solve2x2` (corners only); N = 3 runs only the 3x3 stage; bigger cubes reduce first.
Even N has no fixed centers: the target frame is face f = color f, which the even-cube hold guide
(white-green-red corner at top-front-right) matches. Even-N reduction pairs edges around an anchor wing;
OLL/PLL parity is fixed at the start of the 3x3 stage (`fixEvenParity`, algs in `src/puzzles/nxn/parityText.js`).
Notation: `2-3R` is a block of inner slices 2..3.
Steps are human-sized and named, for example "Centers: white (1 of 6)", "Pair edge 4 of 12",
"3x3: white cross" and "Parity fix".

## Camera mode
`src/ui/camera.js` (`openCamera`) captures each face with a grid overlay, or a photo per face as a fallback.
`src/ui/colorClassify.js` (pure, tested in `tests/classify.test.mjs`) samples the grid, converts to Lab and
assigns colors with exactly N² stickers of each color. Unsure stickers get flagged, and the face editor marks them with "?" so he can check them.

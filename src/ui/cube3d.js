// Three.js view of an NxN cube. API (see docs/ARCHITECTURE.md):
//   const view = createCubeView(container, { N, state?, interactive? })
//   view.setState(s) / view.getState()
//   await view.animateMove(move, { duration?, highlight? })
//   await view.playMoves(moves, { duration?, onMove? })
//   view.stop(), view.setHighlight(idx[] | null), view.resetView(), view.dispose()
import * as THREE from '../../lib/three.module.min.js';
import { getCube, solvedState, applyMove, COLOR_HEX, FACE_AXIS } from '../puzzles/nxn/state.js';

const BODY = 0x111114;
const BODY_TURN = 0x3b4f9a;
const DIM = 0x55555c;
const DEFAULT_THETA = Math.PI / 4.6;   // around the y axis, from +z toward +x
const DEFAULT_PHI = 1.0;               // from the +y axis

export function createCubeView(container, { N, state, interactive = true } = {}) {
  let current = state ? Uint8Array.from(state) : solvedState(N);
  const cube = getCube(N);
  const m = N - 1;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    return fallbackView(container, N, current);
  }
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  const canvas = renderer.domElement;
  canvas.className = 'cube3d-canvas';
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  if (interactive) canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 1000);
  const root = new THREE.Group();
  scene.add(root);
  const pivot = new THREE.Group();
  scene.add(pivot);

  // --- shared resources
  const bodyGeo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
  const stickerGeo = new THREE.PlaneGeometry(0.84, 0.84);
  const bodyMat = new THREE.MeshBasicMaterial({ color: BODY });
  const bodyTurnMat = new THREE.MeshBasicMaterial({ color: BODY_TURN });
  const colorMats = COLOR_HEX.map(c => new THREE.MeshBasicMaterial({ color: new THREE.Color(c) }));
  const dimMats = COLOR_HEX.map(c => new THREE.MeshBasicMaterial({
    color: new THREE.Color(c).lerp(new THREE.Color(DIM), 0.72),
  }));
  const allMats = [bodyMat, bodyTurnMat, ...colorMats, ...dimMats];

  // --- cubies (outer shell only) and stickers
  const cubies = new Map(); // "x,y,z" -> { mesh, pos }
  const stickerMeshes = new Array(cube.size);
  const stickerCubie = new Array(cube.size);
  for (const s of cube.stickers) {
    const key = s.pos.join(',');
    let c = cubies.get(key);
    if (!c) {
      const mesh = new THREE.Mesh(bodyGeo, bodyMat);
      const home = new THREE.Vector3(s.pos[0] / 2, s.pos[1] / 2, s.pos[2] / 2);
      mesh.position.copy(home);
      root.add(mesh);
      c = { mesh, pos: s.pos, home };
      cubies.set(key, c);
    }
    const st = new THREE.Mesh(stickerGeo, colorMats[0]);
    const n = new THREE.Vector3(...s.normal);
    st.position.copy(n).multiplyScalar(0.485);
    st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    c.mesh.add(st);
    stickerMeshes[s.index] = st;
    stickerCubie[s.index] = c;
  }
  const cubieList = [...cubies.values()];

  let highlight = null; // Set of sticker indices, or null
  function applyColors() {
    for (let i = 0; i < cube.size; i++) {
      const col = current[i];
      stickerMeshes[i].material = highlight && !highlight.has(i) ? dimMats[col] : colorMats[col];
    }
    requestRender();
  }

  // --- camera orbit
  let theta = DEFAULT_THETA, phi = DEFAULT_PHI, dist = 10;
  function placeCamera() {
    camera.position.set(
      dist * Math.sin(phi) * Math.sin(theta),
      dist * Math.cos(phi),
      dist * Math.sin(phi) * Math.cos(theta),
    );
    camera.lookAt(0, 0, 0);
  }
  function fit(w, h) {
    camera.aspect = w / h;
    const r = N * 0.5 * Math.sqrt(3) * 1.02;
    const vf = THREE.MathUtils.degToRad(camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    dist = r / Math.sin(Math.min(vf, hf) / 2);
    camera.updateProjectionMatrix();
    placeCamera();
  }

  // --- render on demand
  let raf = 0, disposed = false;
  let anim = null; // { t0, duration, angle, axis, resolve, finish }
  function requestRender() {
    if (!raf && !disposed) raf = requestAnimationFrame(frame);
  }
  function frame(now) {
    raf = 0;
    if (disposed) return;
    if (anim) {
      const t = Math.min(1, (now - anim.t0) / anim.duration);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      pivot.rotation.set(0, 0, 0);
      pivot.rotation[anim.axis] = anim.angle * e;
      if (t >= 1) anim.finish(); else requestRender();
    }
    renderer.render(scene, camera);
  }

  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    fit(w, h);
    requestRender();
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(container); else globalThis.addEventListener('resize', resize);

  // --- pointer orbit
  let drag = null;
  function onDown(e) {
    drag = { x: e.clientX, y: e.clientY, theta, phi, id: e.pointerId };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const k = 5 / Math.max(200, canvas.clientWidth);
    theta = drag.theta - (e.clientX - drag.x) * k;
    phi = Math.min(Math.PI - 0.15, Math.max(0.15, drag.phi - (e.clientY - drag.y) * k));
    placeCamera();
    requestRender();
  }
  function onUp(e) { if (drag && e.pointerId === drag.id) drag = null; }
  if (interactive) {
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
  }

  // --- move animation
  let queue = Promise.resolve();
  let generation = 0; // bumps on stop() so queued moves are dropped

  function layerCubies(move) {
    const [axis, sign] = FACE_AXIS[move.face];
    return cubieList.filter(c => {
      const k = (m - sign * c.pos[axis]) / 2 + 1;
      return k >= move.lo && k <= move.hi;
    });
  }

  function runMove(move, { duration = 450, highlight: hl = true } = {}) {
    return new Promise(resolve => {
      const [axisIdx, sign] = FACE_AXIS[move.face];
      const quarters = move.amt === 3 ? -1 : move.amt; // 1, 2 or -1
      const angle = -sign * (Math.PI / 2) * quarters;  // clockwise seen from the face
      const group = layerCubies(move);
      pivot.rotation.set(0, 0, 0);
      for (const c of group) {
        pivot.add(c.mesh);
        if (hl) c.mesh.material = bodyTurnMat;
      }
      const finish = () => {
        anim = null;
        pivot.rotation.set(0, 0, 0);
        for (const c of group) {
          root.add(c.mesh);
          c.mesh.position.copy(c.home);
          c.mesh.rotation.set(0, 0, 0);
          c.mesh.material = bodyMat;
        }
        current = applyMove(N, current, move);
        applyColors();
        resolve();
      };
      if (duration <= 0 || disposed) { finish(); return; }
      anim = { t0: performance.now(), duration, angle, axis: 'xyz'[axisIdx], finish };
      requestRender();
    });
  }

  const view = {
    N,
    canvas,
    setState(s) {
      view.stop();
      current = Uint8Array.from(s);
      applyColors();
    },
    getState() { return Uint8Array.from(current); },
    animateMove(move, opts) {
      const gen = generation;
      queue = queue.then(() => (gen === generation && !disposed ? runMove(move, opts) : undefined));
      return queue;
    },
    async playMoves(moves, { duration, onMove } = {}) {
      const gen = generation;
      for (let i = 0; i < moves.length; i++) {
        if (gen !== generation || disposed) return;
        if (onMove) onMove(i);
        await view.animateMove(moves[i], { duration });
      }
    },
    stop() {
      generation++;
      if (anim) anim.finish();
      queue = Promise.resolve();
    },
    setHighlight(idx) {
      const set = idx ? new Set(idx) : null;
      highlight = set && set.size ? set : null;
      applyColors();
    },
    resetView() {
      theta = DEFAULT_THETA; phi = DEFAULT_PHI;
      placeCamera();
      requestRender();
    },
    dispose() {
      if (disposed) return;
      view.stop();
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect(); else globalThis.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      bodyGeo.dispose(); stickerGeo.dispose();
      for (const mt of allMats) mt.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };

  applyColors();
  resize();
  container.__cubeView = view; // test hook: lets browser QA compare the view with the engine
  return view;
}

// Used when WebGL is unavailable: keeps the API working and says why there is no picture.
function fallbackView(container, N, current) {
  const box = document.createElement('div');
  box.className = 'cube3d-fallback';
  box.textContent = 'The 3D cube cannot be shown on this device, but the moves below still work.';
  container.appendChild(box);
  return {
    N, canvas: null,
    setState(s) { current = Uint8Array.from(s); },
    getState() { return Uint8Array.from(current); },
    async animateMove(move) { current = applyMove(N, current, move); },
    async playMoves(moves, { onMove } = {}) {
      moves.forEach((mv, i) => { if (onMove) onMove(i); current = applyMove(N, current, mv); });
    },
    stop() {}, setHighlight() {}, resetView() {},
    dispose() { box.remove(); },
  };
}

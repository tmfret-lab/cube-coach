// solveAsync(N, state) -> Promise<Step[]>. Uses a module worker when available,
// otherwise (old browsers, Node tests) solves on the current thread.
export function solveAsync(N, state) {
  const data = { N, state: Array.from(state) };
  if (typeof Worker === 'undefined') return direct(data);
  return new Promise((resolve, reject) => {
    let w;
    try {
      w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    } catch {
      direct(data).then(resolve, reject);
      return;
    }
    w.onmessage = (e) => {
      w.terminate();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.steps);
    };
    w.onerror = (e) => {
      w.terminate();
      e.preventDefault?.();
      direct(data).then(resolve, reject); // module workers unsupported: fall back
    };
    w.postMessage(data);
  });
}

async function direct({ N, state }) {
  await new Promise(r => setTimeout(r, 30)); // let the "working" spinner paint
  const { solve } = await import('./index.js');
  return solve(N, Uint8Array.from(state));
}

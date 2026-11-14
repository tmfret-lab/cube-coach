// Runs the solver off the main thread so the page stays responsive.
import { solve } from './index.js';

self.onmessage = (e) => {
  const { N, state } = e.data;
  try {
    self.postMessage({ steps: solve(N, Uint8Array.from(state)) });
  } catch (err) {
    self.postMessage({ error: String(err && err.message || err) });
  }
};

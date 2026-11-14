// Tiny JSON store over localStorage. Every access is guarded: storage can be
// missing or throw (private mode, blocked site data), and the app must still work.
const mem = new Map();

function ls() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export const store = {
  get(key, fallback = null) {
    try {
      const s = ls();
      let raw = null;
      try { raw = s ? s.getItem(key) : null; } catch { /* use memory */ }
      if (raw == null) raw = mem.get(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    const raw = JSON.stringify(value);
    mem.set(key, raw);
    try { const s = ls(); if (s) s.setItem(key, raw); } catch { /* memory only */ }
  },
  remove(key) {
    mem.delete(key);
    try { const s = ls(); if (s) s.removeItem(key); } catch { /* ignore */ }
  },
};

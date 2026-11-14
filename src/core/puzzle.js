// Puzzle registry. Every puzzle implements the interface in docs/ARCHITECTURE.md.
const registry = [];

export function registerPuzzle(p) { registry.push(p); }
export function listPuzzles() { return registry.slice(); }
export function getPuzzle(id) { return registry.find(p => p.id === id); }

// Placeholders shown on the home screen as "coming soon".
export const COMING_SOON = ['2x2', '3x3', '4x4', '5x5', '6x6', 'Pyraminx', 'Skewb', 'Megaminx'];

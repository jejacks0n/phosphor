// Guides and the rulers' zero point are kept in this browser, per drawing (by its file id), for the
// drawings used last. Storage that fails or holds junk just keeps nothing: guides are a convenience.
// 'v' is a vertical guide (placed along the columns), 'h' a horizontal one (along the rows).

export const GUIDES_KEY = 'phosphor.guides';
export const KEEP_GUIDED = 50;

const isPos = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n * 2 === Math.floor(n * 2);

// The kept entries by file id: a Map, so an id like "__proto__" is only ever its own entry, and anything
// that isn't an entry is dropped.
function readAll(storage) {
  try {
    const all = JSON.parse(storage.getItem(GUIDES_KEY));
    if (!all || typeof all !== 'object' || Array.isArray(all)) return new Map();
    return new Map(Object.entries(all).filter(([, e]) => e && typeof e === 'object' && !Array.isArray(e)));
  } catch {
    return new Map();
  }
}

export function loadGuides(fileId, storage = globalThis.localStorage) {
  const entry = readAll(storage).get(fileId);
  if (!entry) return null;
  const guides = (Array.isArray(entry.guides) ? entry.guides : [])
    .filter((g) => g && (g.axis === 'v' || g.axis === 'h') && isPos(g.pos))
    .map((g) => ({ axis: g.axis, pos: g.pos }));
  const zero = entry.zero || {};
  return { guides, zero: { x: isPos(zero.x) ? zero.x : 0, y: isPos(zero.y) ? zero.y : 0 } };
}

export function saveGuides(fileId, { guides, zero }, { storage = globalThis.localStorage, now = Date.now() } = {}) {
  try {
    const all = readAll(storage);
    if (guides.length || zero.x || zero.y) all.set(fileId, { guides, zero, usedAt: now });
    else all.delete(fileId);
    const kept = [...all].sort(([, a], [, b]) => (+b.usedAt || 0) - (+a.usedAt || 0)).slice(0, KEEP_GUIDED);
    storage.setItem(GUIDES_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Nothing kept; the guides stay for this session only.
  }
}

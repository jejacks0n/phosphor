// Guides and the rulers' zero point are kept in this browser, per drawing (by its file id), for the
// drawings used last. Storage that fails or holds junk just keeps nothing: guides are a convenience.
// 'v' is a vertical guide (placed along the columns), 'h' a horizontal one (along the rows).

export const GUIDES_KEY = 'phosphor.guides';
export const KEEP_GUIDED = 50;

const isPos = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n * 2 === Math.floor(n * 2);

function readAll(storage) {
  try {
    const all = JSON.parse(storage.getItem(GUIDES_KEY));
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch {
    return {};
  }
}

export function loadGuides(fileId, storage = globalThis.localStorage) {
  const entry = readAll(storage)[fileId];
  if (!entry || typeof entry !== 'object') return null;
  const guides = (Array.isArray(entry.guides) ? entry.guides : [])
    .filter((g) => g && (g.axis === 'v' || g.axis === 'h') && isPos(g.pos))
    .map((g) => ({ axis: g.axis, pos: g.pos }));
  const zero = entry.zero || {};
  return { guides, zero: { x: isPos(zero.x) ? zero.x : 0, y: isPos(zero.y) ? zero.y : 0 } };
}

export function saveGuides(fileId, { guides, zero }, { storage = globalThis.localStorage, now = Date.now() } = {}) {
  try {
    const all = readAll(storage);
    if (guides.length || zero.x || zero.y) all[fileId] = { guides, zero, usedAt: now };
    else delete all[fileId];
    const keep = Object.keys(all)
      .sort((a, b) => (all[b].usedAt ?? 0) - (all[a].usedAt ?? 0))
      .slice(0, KEEP_GUIDED);
    const kept = Object.fromEntries(keep.map((id) => [id, all[id]]));
    storage.setItem(GUIDES_KEY, JSON.stringify(kept));
  } catch {
    // Nothing kept; the guides stay for this session only.
  }
}

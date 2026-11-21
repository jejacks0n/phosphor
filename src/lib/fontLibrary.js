// The bitmap font library: the mirrored index, searched and counted in the page, one font fetched when used.
import { t } from '@/i18n';

const base = () => `${import.meta.env.BASE_URL}fonts/library/`;
const pad = (h) => String(h).padStart(2, '0');
// A mirrored file's address: each part of its path encoded, so a # or a space in a name (DKY#001.F16) stays in the path.
export const libraryUrl = (path) => `${base()}${path.split('/').map(encodeURIComponent).join('/')}`;

let loading = null;
let sauceNames = null;

// The index, fetched once per page; a failure forgets itself so Try again refetches.
export function loadLibrary() {
  loading ??= fetch(`${base()}index.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`library index ${r.status}`);
      return r.json();
    })
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

export const libraryEntryOf = (index, fontId) =>
  [...index.fonts, ...index.linked].find((e) => e.fontId === fontId) ?? null;

export function tagsOf(entry) {
  const tags = [
    { key: `machine:${entry.machine}`, group: 'machine' },
    { key: `shape:${entry.height}`, group: 'shape' },
    { key: `chars:${entry.chars}`, group: 'chars' },
  ];
  if (entry.collection) tags.push({ key: `collection:${entry.collection}`, group: 'collection' });
  if (entry.ready) tags.push({ key: 'ready', group: 'other' });
  return tags;
}

const matches = (entry, query, tags) => {
  const have = new Set(tagsOf(entry).map((x) => x.key));
  if (!tags.every((k) => have.has(k))) return false;
  const q = query.trim().toLowerCase();
  return !q || [entry.name, entry.machine, entry.about].some((s) => s?.toLowerCase().includes(q));
};

export function searchLibrary(index, { query = '', tags = [] } = {}) {
  return [...index.fonts, ...index.linked]
    .filter((e) => matches(e, query, tags))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function tagCounts(index, filter) {
  const counts = new Map();
  for (const e of searchLibrary(index, filter)) {
    for (const { key } of tagsOf(e)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

const fail = (userMessage) => { throw Object.assign(new Error(userMessage), { userMessage }); };

// One library font as a File; a fetch that fails (no network, a 404) or a file of the wrong size throws with its userMessage.
export async function libraryFile(entry) {
  const r = await fetch(libraryUrl(entry.file)).catch(() => null);
  if (!r?.ok) fail(t('font.errors.libraryUnreachable', { name: entry.name }));
  const bytes = await r.arrayBuffer().catch(() => fail(t('font.errors.libraryUnreachable', { name: entry.name })));
  if (bytes.byteLength !== 256 * entry.height) fail(t('font.errors.notBitmap', { name: entry.name }));
  return new File([bytes], `${entry.name}.F${pad(entry.height)}`);
}

// The library font a SAUCE font name stands for, as a File, or null: the built-in IBM VGA, an empty name, or a name the
// library doesn't map. The map is fetched once per page; a failed fetch (the map's or the font's) throws.
export async function sauceFont(name) {
  if (!name || name === 'IBM VGA') return null;
  sauceNames ??= fetch(`${base()}sauce.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`library SAUCE names ${r.status}`);
      return r.json();
    })
    .catch((e) => {
      sauceNames = null;
      throw e;
    });
  const entry = (await sauceNames)[name];
  return entry ? libraryFile(entry) : null;
}

export function tellUsUrl(entry, index) {
  const collection = index.collections[entry.collection]?.name;
  const title = `License for ${entry.name}${collection ? ` (${collection})` : ''}`;
  return `https://github.com/jejacks0n/phosphor/issues/new?title=${encodeURIComponent(title)}`;
}

// For tests: forget the fetched index and SAUCE names.
export const forgetLibrary = () => {
  loading = null;
  sauceNames = null;
};

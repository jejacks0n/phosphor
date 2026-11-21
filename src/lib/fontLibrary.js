// The bitmap font library: the mirrored index, searched and counted in the page, one font fetched when used.
import { t } from '@/i18n';

const base = () => `${import.meta.env.BASE_URL}fonts/library/`;
const pad = (h) => String(h).padStart(2, '0');

let loading = null;

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

export async function libraryFile(entry) {
  const r = await fetch(`${base()}${entry.file}`);
  if (!r.ok) throw new Error(`library font ${r.status}`);
  const bytes = await r.arrayBuffer();
  if (bytes.byteLength !== 256 * entry.height) {
    const userMessage = t('font.errors.notBitmap', { name: entry.name });
    throw Object.assign(new Error(userMessage), { userMessage });
  }
  return new File([bytes], `${entry.name}.F${pad(entry.height)}`);
}

export function tellUsUrl(entry, index) {
  const collection = index.collections[entry.collection]?.name;
  const title = `License for ${entry.name}${collection ? ` (${collection})` : ''}`;
  return `https://github.com/jejacks0n/phosphor/issues/new?title=${encodeURIComponent(title)}`;
}

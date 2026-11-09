// What a drawing's layers are called and whether they show, and whether the vector layer has been added. A name of null is
// the default (the interface words it in the language it's in). The vector layer is null until it's added, or the drawing
// has shapes. A file or a room may say anything here, so goodLayerInfo makes sure it's only this.
export const MAX_LAYER_NAME = 40;
const LAYER_IDS = ['base', 'edit'];

export const DEFAULT_LAYER_INFO = Object.freeze({
  base: Object.freeze({ name: null, hidden: false }),
  edit: Object.freeze({ name: null, hidden: false }),
  vector: null,
});

// A name as typed: trimmed and capped; null (the default) when nothing's left.
export const goodLayerName = (name) => (typeof name === 'string' ? name.trim().slice(0, MAX_LAYER_NAME).trim() || null : null);

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const goodEntry = (raw) => ({ name: goodLayerName(raw?.name), hidden: raw?.hidden === true });

// raw (untrusted, or undefined) as layer info, always new objects. hasShapes: there's a vector layer, whatever raw says.
export function goodLayerInfo(raw, { hasShapes }) {
  const from = isObject(raw) ? raw : {};
  return {
    base: goodEntry(from.base),
    edit: goodEntry(from.edit),
    vector: isObject(from.vector) || hasShapes ? goodEntry(from.vector) : null,
  };
}

// What a file keeps: only what isn't the default, or null when that's everything, so a file without changes is as it was.
export function savedLayers(info) {
  const saved = {};
  const kept = ({ name, hidden }) => ({ ...(name !== null && { name }), ...(hidden && { hidden }) });
  for (const id of LAYER_IDS) {
    const entry = kept(info[id]);
    if (Object.keys(entry).length) saved[id] = entry;
  }
  if (info.vector) saved.vector = kept(info.vector);
  return Object.keys(saved).length ? saved : null;
}

// The drawing's layers, bottom first: { id, kind: 'cells' | 'vector', n, name, hidden }, frozen, in an array that's
// replaced, never changed in place. The bottom is always 'base', the cells layer holding the picture. A name of null is
// the default (the interface words it by kind and n, in the language it's in). Files keep the old form's layers key
// ({ base?, edit?, vector?, noEdit? }); a file or a room may say anything there, so layersFromOld makes sure it's only this.
import { isShapeKey } from './shapes.js';

export const MAX_LAYER_NAME = 40;

// A name as typed: trimmed and capped; null (the default) when nothing's left.
export const goodLayerName = (name) => (typeof name === 'string' ? name.trim().slice(0, MAX_LAYER_NAME).trim() || null : null);

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const goodLayer = (id, kind, raw) => Object.freeze({
  id, kind, n: Number.isInteger(raw?.n) && raw.n > 0 ? raw.n : 1, name: goodLayerName(raw?.name), hidden: raw?.hidden === true,
});

// raw (the old form's layers key: untrusted, or undefined) as layers, always new ones. hasShapes: there's a vector layer,
// whatever raw says.
export function layersFromOld(raw, { hasShapes }) {
  const from = isObject(raw) ? raw : {};
  return [
    goodLayer('base', 'cells', from.base),
    ...(isObject(from.vector) || hasShapes ? [goodLayer('vector', 'vector', from.vector)] : []),
    ...(from.noEdit === true ? [] : [goodLayer('edit', 'cells', from.edit)]),
  ];
}

// Where the old form's layers are in layers: the bottom, then a vector layer if there is one, then a cells layer if there
// is one (their ids), or null when the stack has anything else.
export function legacySlots(layers) {
  let i = 1;
  const vector = layers[i]?.kind === 'vector' ? layers[i++].id : null;
  const cells = layers[i]?.kind === 'cells' ? layers[i++].id : null;
  return i === layers.length ? { vector, cells } : null;
}

// What the old form's file keeps, for layers that fit it (legacySlots): only what isn't the default, or null when that's
// everything, so a file without changes is as it was. Its cells layer is written as the edit layer and its vector layer
// as the vector layer, whatever their ids. A vector layer is kept even with nothing else, as it's there before its first
// shape, but not when hasShapes (the file has shapes): they bring it back (layersFromOld), as they did before layers.
// Null too for a stack that doesn't fit, which only the stack form can say.
export function savedLayers(layers, { hasShapes = false } = {}) {
  const slots = legacySlots(layers);
  if (!slots) return null;
  const byId = (id) => layers.find((layer) => layer.id === id);
  const kept = ({ name, hidden, n }) => ({ ...(name !== null && { name }), ...(hidden && { hidden }), ...(n !== 1 && { n }) });
  const saved = {};
  for (const [key, layer] of [['base', layers[0]], ['edit', byId(slots.cells)], ['vector', byId(slots.vector)]]) {
    const entry = layer && kept(layer);
    if (entry && (Object.keys(entry).length || (key === 'vector' && !hasShapes))) saved[key] = entry;
  }
  if (!slots.cells) saved.noEdit = true;
  return Object.keys(saved).length ? saved : null;
}

// The stack form's stack (untrusted) as layers, or null unless every rule holds: each id one a layer can have, and only
// once; the bottom first, a cells layer, and only it 'base'; every kind one there is. Names and numbers are cleaned as
// layersFromOld cleans them.
const LAYER_ID = /^(base|vector|edit|L\d+)$/;
export function goodLayers(raw) {
  if (!Array.isArray(raw) || raw[0]?.id !== 'base' || raw[0].kind !== 'cells') return null;
  const seen = new Set();
  for (const entry of raw) {
    if (!isObject(entry) || typeof entry.id !== 'string' || !LAYER_ID.test(entry.id) || seen.has(entry.id) || !['cells', 'vector'].includes(entry.kind)) return null;
    seen.add(entry.id);
  }
  return raw.map((entry) => goodLayer(entry.id, entry.kind, entry));
}

// A new layer's id: 'edit' for cells and 'vector' for a vector layer while no layer has it, else L<k>, one past the
// highest k in the stack.
export function newLayerId(layers, kind) {
  const own = kind === 'vector' ? 'vector' : 'edit';
  if (!layers.some((layer) => layer.id === own)) return own;
  return `L${Math.max(0, ...layers.map((layer) => Number(/^L(\d+)$/.exec(layer.id)?.[1] ?? 0))) + 1}`;
}

// A new layer's number, for its default name: one past the highest of its kind (the bottom, which is "Base", left out).
export const nextNumber = (layers, kind) => Math.max(0, ...layers.slice(1).filter((layer) => layer.kind === kind).map((layer) => layer.n)) + 1;

// Keys and runs name their layer, so the ledger, history and frames stay flat maps: a key on the edit layer is as it
// always was ('col,row', a tile's 'x,y'), and on another it's prefixed with the layer's id ('L2:col,row'). A shape's key
// ('v:<hex>') is its own: keyLayer gives it no layer (id null).
export const layerKey = (id, key) => (id === 'edit' ? key : `${id}:${key}`);
export function keyLayer(key) {
  if (isShapeKey(key)) return { id: null, key };
  const at = key.indexOf(':');
  return at < 0 ? { id: 'edit', key } : { id: key.slice(0, at), key: key.slice(at + 1) };
}

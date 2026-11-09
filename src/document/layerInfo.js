// The drawing's layers, bottom first: { id, kind: 'cells' | 'vector', n, name, hidden, chars? }, frozen, in an array that's
// replaced, never changed in place. The bottom is always 'base', the cells layer holding the picture. A name of null is
// the default (the interface words it by kind and n, in the language it's in). Files keep the old form's layers key
// ({ base?, edit?, vector?, noEdit? }); a file or a room may say anything there, so layersFromOld makes sure it's only this.
// chars: a layer's own character settings (settings.js CHAR_KEYS), frozen; every layer but the bottom has them once it's
// in a document (the bottom's are the document's own fields).
import { isShapeKey } from './shapes.js';
import { CHAR_KEYS, settingsFromStranger } from '../store/settings.js';

export const MAX_LAYER_NAME = 40;

// A name as typed: trimmed and capped; null (the default) when nothing's left.
export const goodLayerName = (name) => (typeof name === 'string' ? name.trim().slice(0, MAX_LAYER_NAME).trim() || null : null);

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const goodLayer = (id, kind, raw, chars = null) => Object.freeze({
  id, kind, n: Number.isInteger(raw?.n) && raw.n > 0 ? raw.n : 1, name: goodLayerName(raw?.name), hidden: raw?.hidden === true,
  ...(chars && { chars: Object.freeze(chars) }),
});

// baseChars, the bottom's character settings, which every caller has to give: one left out would count every layer as
// the bottom's, and a stack saved in the old form loses its layers' own.
const needChars = (baseChars) => {
  if (!baseChars) throw new TypeError('the bottom\'s character settings are needed');
  return baseChars;
};

// Whether a layer converts as the bottom does: its chars are baseChars (a slider's numeric string is its number). A layer
// with none yet counts as the same.
export function sameChars(chars, baseChars) {
  needChars(baseChars);
  return !chars || CHAR_KEYS.every((key) => String(chars[key]) === String(baseChars[key]));
}

// layers with every layer but the bottom given chars, a frozen copy of these, under whatever of its own it has.
export const withChars = (layers, chars) => layers.map((layer, at) => (at ? Object.freeze({ ...layer, chars: Object.freeze({ ...chars, ...layer.chars }) }) : layer));

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
// is one (their ids), or null when the stack has anything else, or a layer's chars aren't baseChars (the bottom's: the
// old form has one set).
export function legacySlots(layers, baseChars) {
  needChars(baseChars);
  let i = 1;
  const vector = layers[i]?.kind === 'vector' ? layers[i++].id : null;
  const cells = layers[i]?.kind === 'cells' ? layers[i++].id : null;
  return i === layers.length && layers.every((layer) => sameChars(layer.chars, baseChars)) ? { vector, cells } : null;
}

// What the old form's file keeps, for layers that fit it (legacySlots): only what isn't the default, or null when that's
// everything, so a file without changes is as it was. Its cells layer is written as the edit layer and its vector layer
// as the vector layer, whatever their ids. A vector layer is kept even with nothing else, as it's there before its first
// shape, but not when hasShapes (the file has shapes): they bring it back (layersFromOld), as they did before layers.
// Null too for a stack that doesn't fit, which only the stack form can say.
export function savedLayers(layers, { hasShapes = false, baseChars } = {}) {
  const slots = legacySlots(layers, baseChars);
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

// The most layers a drawing holds, the bottom counted: a guard against crafted files, and can be raised.
export const MOST_LAYERS = 64; // ponytail: 64 is plenty to draw with; each cells layer can hold a full paint canvas

// The stack form's stack (untrusted) as layers, or null unless every rule holds: no more than MOST_LAYERS; each id one a
// layer can have, and only once; the bottom first, a cells layer, and only it 'base'; every kind one there is, and 'edit'
// a cells layer's id and 'vector' a vector layer's; chars, when a layer above the bottom has them, settings it could
// hold (settingsFromStranger), of which only the character settings are kept. Names and numbers are cleaned as
// layersFromOld cleans them.
const LAYER_ID = /^(base|vector|edit|L\d+)$/;
const OWN_KIND = { edit: 'cells', vector: 'vector' }; // the ids that keep their old meaning
export function goodLayers(raw) {
  if (!Array.isArray(raw) || raw.length > MOST_LAYERS || raw[0]?.id !== 'base' || raw[0].kind !== 'cells') return null;
  const seen = new Set();
  for (const entry of raw) {
    if (!isObject(entry) || typeof entry.id !== 'string' || !LAYER_ID.test(entry.id) || seen.has(entry.id) || !['cells', 'vector'].includes(entry.kind) || (OWN_KIND[entry.id] ?? entry.kind) !== entry.kind) return null;
    seen.add(entry.id);
  }
  const charsOf = (entry) => {
    if (entry.chars === undefined || entry.id === 'base') return null;
    const taken = isObject(entry.chars) && settingsFromStranger(Object.fromEntries(CHAR_KEYS.filter((key) => key in entry.chars).map((key) => [key, entry.chars[key]])));
    return taken || undefined;
  };
  const chars = raw.map(charsOf);
  if (chars.includes(undefined)) return null;
  return raw.map((entry, i) => goodLayer(entry.id, entry.kind, entry, chars[i]));
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

// The lower group, the layers today's pipeline converts as one block, and everything above it: over the layers that show
// (the bottom always counts; its eye is the renderer's hideBase), the bottom, then each vector layer directly above it
// (vectors), then the next layer if it's a cells layer (cells, its id, or null), and the rest (upper, bottom to top), which
// the renderer lays over the group cell by cell. baseChars: the bottom's character settings, which a layer must share to
// be in the group (sameChars): one whose own differ starts the upper walk.
export function lowerGroup(layers, baseChars) {
  needChars(baseChars);
  let i = 1;
  const vectors = [];
  const joins = (kind) => layers[i]?.kind === kind && sameChars(layers[i].chars, baseChars);
  while (joins('vector')) vectors.push(layers[i++].id);
  const cells = joins('cells') ? layers[i++].id : null;
  return { vectors, cells, upper: layers.slice(i).map((layer) => layer.id) };
}

// Keys and runs name their layer, so the ledger, history and frames stay flat maps: a key on the edit layer is as it
// always was ('col,row', a tile's 'x,y'), and on another it's prefixed with the layer's id ('L2:col,row'). A shape's key
// ('v:<hex>') is its own: keyLayer gives it no layer (id null).
export const layerKey = (id, key) => (id === 'edit' ? key : `${id}:${key}`);
export function keyLayer(key) {
  if (isShapeKey(key)) return { id: null, key };
  const at = key.indexOf(':');
  return at < 0 ? { id: 'edit', key } : { id: key.slice(0, at), key: key.slice(at + 1) };
}

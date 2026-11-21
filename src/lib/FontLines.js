// A bitmap font's own line styles and character sets, kept as slots (0-255) and never as characters:
// a cell holds slotChars(font)[slot]. A style is the eleven pieces of PIECES, in that order.
import { slotChars, blocksOf, BLOCKS, SLOT_CHARS } from './BitmapFont.js';

export const PIECES = '─│┌┐└┘├┤┬┴┼';
export const STOCK_STYLES = Object.freeze([
  { id: 'single', slots: [196, 179, 218, 191, 192, 217, 195, 180, 194, 193, 197] },
  { id: 'double', slots: [205, 186, 201, 187, 200, 188, 204, 185, 203, 202, 206] },
]);

const NAME_MAX = 40;
const slotOk = (s) => Number.isInteger(s) && s >= 0 && s <= 255;
const parse = (text) => {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
};
const entryOf = (e, slotsOk) => (
  e && typeof e.id === 'string' && typeof e.name === 'string' && Array.isArray(e.slots) && slotsOk(e.slots)
    ? { id: e.id, name: e.name.slice(0, NAME_MAX), slots: [...e.slots] }
    : null
);
// Entries that read, each id once; `taken` ids (Single's and Double's) are dropped too.
const list = (v, slotsOk, taken = []) => {
  const seen = new Set(taken);
  return (Array.isArray(v) ? v.map((e) => entryOf(e, slotsOk)) : []).filter((e) => e && !seen.has(e.id) && seen.add(e.id));
};

export const encodeLines = ({ hide = [], styles = [] } = {}) => (hide.length || styles.length ? JSON.stringify({ hide, styles }) : '');

export function decodeLines(text) {
  const v = text && parse(text);
  if (!v) return null;
  const hide = Array.isArray(v.hide) ? v.hide.filter((h) => STOCK_STYLES.some((s) => s.id === h)) : [];
  return { hide, styles: list(v.styles, (s) => s.length === 11 && s.every((x) => x === null || slotOk(x)), STOCK_STYLES.map((s) => s.id)) };
}

export const encodeSets = ({ hideStock = false, sets = [] } = {}) => (hideStock || sets.length ? JSON.stringify({ hideStock, sets }) : '');

export function decodeSets(text) {
  const v = text && parse(text);
  if (!v) return null;
  return { hideStock: v.hideStock === true, sets: list(v.sets, (s) => s.length <= 1024 && s.every(slotOk)) };
}

// Every style a font has, Single and Double first, with whether each is offered and what stops it.
export const lineStylesOf = (() => {
  const cache = new WeakMap();
  const make = (font) => {
    const chars = slotChars(font);
    const blocks = font ? blocksOf(font) : [];
    const hide = font?.lines?.hide ?? [];
    const stock = STOCK_STYLES.map((s) => ({ ...s, name: null, stock: true }));
    const own = (font?.lines?.styles ?? []).map((s) => ({ ...s, stock: false }));
    return [...stock, ...own].map((s) => {
      const problems = [];
      s.slots.forEach((slot, piece) => {
        const b = slot === null ? -1 : blocks.indexOf(slot);
        if (b >= 0) problems.push({ piece, reason: 'block', block: BLOCKS[b].key });
        else if (slot === null || (s.stock && chars[slot] !== SLOT_CHARS[slot])) problems.push({ piece, reason: 'missing' });
      });
      const hidden = s.stock && hide.includes(s.id);
      return { ...s, chars: s.slots.map((slot) => (slot === null ? null : chars[slot])), problems, hidden, offered: !problems.length && !hidden };
    });
  };
  const noFont = {};
  return (font) => {
    const key = font ?? noFont;
    if (!cache.has(key)) cache.set(key, make(font));
    return cache.get(key);
  };
})();

export const offeredStyles = (() => {
  const cache = new WeakMap();
  return (font) => {
    const all = lineStylesOf(font);
    if (!cache.has(all)) cache.set(all, all.filter((s) => s.offered));
    return cache.get(all);
  };
})();
export const styleById = (font, id) => lineStylesOf(font).find((s) => s.id === id) ?? null;

// A set with no slots yet (just made on the Fonts page) is kept but not offered.
export const fontSetsOf = (font) => {
  const chars = slotChars(font);
  return (font?.sets?.sets ?? []).filter((s) => s.slots.length).map(({ id, name, slots }) => ({ id, name, chars: slots.map((s) => chars[s]).join('') }));
};
export const showsStockSets = (font) => !font?.sets?.hideStock || !font.sets.sets.some((s) => s.slots.length);

// The next id for a list: the prefix and one past the highest number used.
export const nextId = (list, prefix) => `${prefix}${1 + Math.max(0, ...list.map((e) => Number(e.id.slice(prefix.length)) || 0))}`;

// A plugin brush's or shape's icon: an SVG string a stranger wrote. The toolbar puts icons on the page as markup, so
// a stranger's string never gets there as it came. cleanIcon reads it with a small tokenizer of its own (the unit
// tests run in node, with no DOMParser, and a browser's parser would be the thing under attack), keeps only the
// elements and attributes listed below, checks each value against its rule, and writes new markup from what it kept:
// numbers printed from parsed numbers, keywords from this file's own strings, path data from its allowed characters
// with the spaces tidied. Anything else throws Error('icon'); the caller words it with its field.

// The size limit counts characters of the input (8 * 1024 of them), not bytes.
const MAX_LENGTH = 8 * 1024;
const MIN_VIEW = 16;
const NS = 'http://www.w3.org/2000/svg';

const ELEMENTS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const NUMBER_ATTRS = ['cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'stroke-width', 'opacity'];
const KEYWORDS = {
  fill: ['currentColor', 'none'],
  stroke: ['currentColor', 'none'],
  'fill-rule': ['nonzero', 'evenodd'],
  'clip-rule': ['nonzero', 'evenodd'],
  'stroke-linecap': ['butt', 'round', 'square'],
  'stroke-linejoin': ['miter', 'round', 'bevel'],
};

const fail = () => {
  throw new Error('icon');
};

// One number as text, printed from the parsed number (so what's written is never what was read).
function num(text) {
  if (!NUMBER.test(text)) fail();
  const n = Number(text);
  if (!Number.isFinite(n)) fail();
  return String(n);
}

// An array of numbers (as text), read from a list split by commas and whitespace and each printed from its parsed number.
function numbers(text) {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  return parts.map(num);
}

const escapeValue = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// An attribute's value, checked by its rule and printed again; null for xmlns, which is dropped.
function value(name, text, isRoot) {
  // xmlns is dropped (Phosphor writes its own), and so are a root's width and height, so a plugin can't size its icon.
  if (name === 'xmlns') return null;
  if (isRoot && (name === 'width' || name === 'height')) {
    num(text.trim());
    return null;
  }
  if (name === 'viewBox') {
    if (!isRoot) fail();
    const v = numbers(text);
    if (v.length !== 4 || Number(v[2]) < MIN_VIEW || Number(v[3]) < MIN_VIEW) fail();
    return v.join(' ');
  }
  if (name === 'd') {
    if (!/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]*$/.test(text)) fail();
    return text.replace(/\s+/g, ' ').trim();
  }
  if (name === 'points') {
    if (!/^[0-9eE.,+\-\s]*$/.test(text)) fail();
    return numbers(text).join(' ');
  }
  if (NUMBER_ATTRS.includes(name)) return num(text.trim());
  const words = KEYWORDS[name];
  if (words) {
    const word = words.find((w) => w === text);
    if (word === undefined) fail();
    return word;
  }
  return fail();
}

const SPACE = /\s+/y;
const OPEN = /<([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z][A-Za-z0-9:-]*\s*=\s*(?:"[^"<>&]*"|'[^'<>&]*'))*)\s*(\/?)>/y;
const CLOSE = /<\/([A-Za-z][A-Za-z0-9]*)\s*>/y;
const ATTR = /([A-Za-z][A-Za-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function cleanIcon(text) {
  if (typeof text !== 'string' || text.length > MAX_LENGTH) fail();
  let at = 0;
  const skip = () => {
    for (;;) {
      SPACE.lastIndex = at;
      const space = SPACE.test(text);
      if (space) at = SPACE.lastIndex;
      if (text.startsWith('<!--', at)) {
        const end = text.indexOf('-->', at + 4);
        if (end < 0) fail();
        at = end + 3;
      } else if (!space) return;
    }
  };
  const lead = /^\s*<\?xml[^<>?&]*\?>/.exec(text);
  if (lead) at = lead[0].length;

  let out = '';
  const stack = [];
  let rootDone = false;
  for (;;) {
    skip();
    if (at >= text.length) break;
    if (rootDone) fail();
    CLOSE.lastIndex = at;
    const close = CLOSE.exec(text);
    if (close) {
      if (stack.pop() !== close[1]) fail();
      out += `</${close[1]}>`;
      at = CLOSE.lastIndex;
      if (!stack.length) rootDone = true;
      continue;
    }
    OPEN.lastIndex = at;
    const open = OPEN.exec(text);
    if (!open) fail();
    at = OPEN.lastIndex;
    const [, name, attrText, selfClose] = open;
    const isRoot = !stack.length;
    if (!ELEMENTS.has(name) || (isRoot !== (name === 'svg'))) fail();
    const seen = new Set();
    let attrs = isRoot ? ` xmlns="${NS}"` : '';
    let hasView = false;
    for (const m of attrText.matchAll(ATTR)) {
      const key = m[1];
      if (seen.has(key)) fail();
      seen.add(key);
      const v = value(key, m[2] ?? m[3], isRoot);
      if (key === 'viewBox') hasView = true;
      if (v !== null) attrs += ` ${key}="${escapeValue(v)}"`;
    }
    if (isRoot && !hasView) fail();
    out += `<${name}${attrs}>`;
    if (selfClose) {
      out += `</${name}>`;
      if (isRoot) rootDone = true;
    } else stack.push(name);
  }
  if (!rootDone || stack.length) fail();
  return out;
}

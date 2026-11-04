// An SVG file read as shapes' makings: { width, height, items, left }. The art's size is in user units after the
// viewBox; each item is one drawn element: its outlines in the element's own units, m the whole transform to the
// art's viewport (every ancestor's transform, nested viewports, the viewBox), and its paint resolved here (fill and
// stroke '#rrggbb' or null, a fill maybe a gradient as shapes have them (in the element's units), the stroke's
// width in the element's units, the fill rule, cap, join and miter limit).
// left is what couldn't come in, by kind. The file is parsed as data and never put in the page, so nothing in it
// runs or loads; something that isn't SVG throws with a userMessage.
import { t } from '@/i18n/index.js';
import { IDENTITY, MOST_OUTLINES, MOST_POINTS, localBounds, multiply, rotation, scaling, translation } from '@/document/shapes.js';
import { parsePathData } from '@/lib/svgPath.js';

const SVG = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';
const MOST_USE_DEPTH = 8;
const MOST_STOPS = 16;
// Read no further than this: a few uses inside uses fan out to millions of shapes, and the file's too big anyway.
const MOST_ITEMS = 20000;
const MOST_VISITS = 200000; // elements, for ones that fan out and draw nothing

export const isSvgFile = (name) => /\.svg$/i.test(name);

const fail = () => {
  const userMessage = t('vector.svgUnreadable');
  throw Object.assign(new Error(userMessage), { userMessage });
};

// The properties read, their initial values, and which inherit.
const INITIAL = {
  fill: 'black', stroke: 'none', 'stroke-width': '1', 'fill-rule': 'nonzero', 'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter', 'stroke-miterlimit': '4', color: 'black', visibility: 'visible', 'stroke-dasharray': 'none',
  'marker-start': 'none', 'marker-mid': 'none', 'marker-end': 'none',
  display: 'inline', filter: 'none', mask: 'none', 'clip-path': 'none', 'stop-color': 'black',
};
const NOT_INHERITED = new Set(['display', 'filter', 'mask', 'clip-path', 'stop-color']);
// Not drawn where they are (some are drawn where they're used).
const UNDRAWN = new Set(['defs', 'symbol', 'clipPath', 'mask', 'title', 'desc', 'metadata', 'style', 'script', 'linearGradient',
  'radialGradient', 'pattern', 'marker', 'filter', 'view', 'animate', 'animateMotion', 'animateTransform', 'set', 'mpath']);
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const LEFT = { text: 'text', image: 'image' };

// Declarations, 'name: value; ...', lowercased names, !important dropped.
function declarations(text) {
  const out = {};
  for (const part of (text ?? '').split(';')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    const name = part.slice(0, at).trim().toLowerCase(), value = part.slice(at + 1).replace(/!\s*important\s*$/i, '').trim();
    if (name in INITIAL || name === 'marker') out[name] = value;
  }
  if ('marker' in out) {
    for (const k of ['marker-start', 'marker-mid', 'marker-end']) out[k] ??= out.marker;
    delete out.marker;
  }
  return out;
}

// A style sheet's rules whose selectors are a type, classes and ids (compound or not); others, and at-rules, are
// passed over. [{ tag, ids, classes, rank, decls }], in the order they apply.
function parseSheet(text) {
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let i = 0;
  const block = (from) => { // the index after the block opened at from
    let depth = 0;
    for (let k = from; k < text.length; k++) {
      if (text[k] === '{') depth++;
      else if (text[k] === '}' && --depth === 0) return k + 1;
    }
    return text.length;
  };
  while (i < text.length) {
    const brace = text.indexOf('{', i), semi = text.indexOf(';', i);
    if (brace < 0) break;
    const prelude = text.slice(i, brace).trim();
    if (prelude.startsWith('@') || (semi >= 0 && semi < brace && text.slice(i, semi).trim().startsWith('@'))) {
      i = semi >= 0 && semi < brace ? semi + 1 : block(brace);
      continue;
    }
    const end = block(brace), decls = declarations(text.slice(brace + 1, end - 1));
    for (const selector of prelude.split(',')) {
      const m = /^(\*|[a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/.exec(selector.trim());
      if (!m || (!m[1] && !m[2])) continue;
      const parts = m[2].match(/[.#][\w-]+/g) ?? [];
      const ids = parts.filter((p) => p[0] === '#').map((p) => p.slice(1)), classes = parts.filter((p) => p[0] === '.').map((p) => p.slice(1));
      const tag = m[1] && m[1] !== '*' ? m[1] : null;
      rules.push({ tag, ids, classes, rank: ids.length * 10000 + classes.length * 100 + (tag ? 1 : 0), order: rules.length, decls });
    }
    i = end;
  }
  return rules.sort((a, b) => a.rank - b.rank || a.order - b.order);
}

// A CSS color as '#rrggbb', null for a transparent one, undefined for not a color: the canvas reads every CSS form.
let colorContext = null;
function cssColor(value) {
  colorContext ??= document.createElement('canvas').getContext('2d');
  const ctx = colorContext;
  ctx.fillStyle = '#000';
  ctx.fillStyle = value;
  const read = ctx.fillStyle;
  ctx.fillStyle = '#fff';
  ctx.fillStyle = value;
  if (ctx.fillStyle !== read) return undefined;
  if (read.startsWith('#')) return read;
  const [r, g, b, a = 1] = read.match(/[\d.]+/g).map(Number);
  if (!a) return null;
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

// A length in user units, or null: unitless, px and the absolute units; % of ref.
const UNITS = { px: 1, pt: 4 / 3, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };
function length(value, ref) {
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(px|pt|pc|mm|cm|in|%)?\s*$/i.exec(value ?? '');
  if (!m) return null;
  const n = Number(m[1]), unit = m[2]?.toLowerCase();
  if (unit === '%') return ref === undefined ? null : (n * ref) / 100;
  return n * (unit ? UNITS[unit] : 1);
}

function numbers(text) {
  const out = [];
  for (const s of (text ?? '').trim().split(/[\s,]+/)) {
    if (!s) continue;
    const n = Number(s);
    if (!Number.isFinite(n)) break;
    out.push(n);
  }
  return out;
}

// A transform attribute's matrix; one that doesn't read is none, as browsers have it.
function transformOf(text) {
  if (!text) return IDENTITY;
  const re = /\s*,?\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/y;
  let m = IDENTITY, at = 0, found;
  while ((found = re.exec(text))) {
    const [, name, args] = found, a = numbers(args), rad = (d) => (d * Math.PI) / 180;
    at = re.lastIndex;
    let step = null;
    if (name === 'matrix' && a.length === 6) step = a;
    else if (name === 'translate' && (a.length === 1 || a.length === 2)) step = translation(a[0], a[1] ?? 0);
    else if (name === 'scale' && (a.length === 1 || a.length === 2)) step = scaling(a[0], a[1] ?? a[0]);
    else if (name === 'rotate' && (a.length === 1 || a.length === 3)) step = rotation(rad(a[0]), a[1] ?? 0, a[2] ?? 0);
    else if (name === 'skewX' && a.length === 1) step = [1, 0, Math.tan(rad(a[0])), 1, 0, 0];
    else if (name === 'skewY' && a.length === 1) step = [1, Math.tan(rad(a[0])), 0, 1, 0, 0];
    if (!step) return IDENTITY;
    m = multiply(m, step);
  }
  return text.slice(at).trim() ? IDENTITY : m;
}

function viewBoxOf(el) {
  const v = numbers(el.getAttribute('viewBox'));
  return v.length === 4 && v[2] > 0 && v[3] > 0 ? { x: v[0], y: v[1], w: v[2], h: v[3] } : null;
}

// The viewBox into a w × h viewport, by preserveAspectRatio.
function viewBoxMatrix(vb, w, h, par) {
  const [align = 'xMidYMid', fit = 'meet'] = (par ?? '').trim().replace(/^defer\s+/, '').split(/\s+/).filter(Boolean);
  let sx = w / vb.w, sy = h / vb.h, tx = 0, ty = 0;
  if (align !== 'none') {
    sx = sy = fit === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
    const place = (where, room) => (where === 'Mid' ? room / 2 : where === 'Max' ? room : 0);
    tx = place(align.slice(1, 4), w - vb.w * sx);
    ty = place(align.slice(5, 8), h - vb.h * sy);
  }
  return [sx, 0, 0, sy, tx - vb.x * sx, ty - vb.y * sy];
}

const href = (el) => el.getAttribute('href') ?? el.getAttributeNS(XLINK, 'href');

export function readSvgFile(text) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(String(text ?? ''), 'image/svg+xml');
  } catch {
    fail();
  }
  const root = doc.documentElement;
  if (!root || root.localName !== 'svg' || root.namespaceURI !== SVG || doc.getElementsByTagName('parsererror').length) fail();

  const rules = parseSheet([...doc.getElementsByTagNameNS(SVG, 'style')].map((s) => s.textContent).join('\n'));
  const left = new Set(), items = [];
  let visits = 0, truncated = false;
  const byId = (id) => doc.getElementById(id);

  // An element's own declared values: presentation attributes, then the sheet, then its style attribute.
  const own = (el) => {
    const out = {};
    for (const name of Object.keys(INITIAL)) {
      const v = el.getAttribute(name);
      if (v !== null) out[name] = v.trim();
    }
    for (const rule of rules) {
      if (rule.tag && rule.tag !== el.localName) continue;
      if (!rule.ids.every((id) => el.id === id) || !rule.classes.every((c) => el.classList.contains(c))) continue;
      Object.assign(out, rule.decls);
    }
    return Object.assign(out, declarations(el.getAttribute('style')));
  };
  const computed = (el, parent) => {
    const declared = own(el), out = {};
    for (const [name, initial] of Object.entries(INITIAL)) {
      const v = declared[name];
      if (v === undefined || v === '') out[name] = NOT_INHERITED.has(name) || !parent ? initial : parent[name];
      else if (v === 'inherit') out[name] = parent ? parent[name] : initial;
      else out[name] = v;
    }
    return out;
  };
  const colorOf = (value, style) => {
    if (/^currentcolor$/i.test(value)) return colorOf(style.color, { color: 'black' });
    return cssColor(value);
  };
  // A gradient and those it takes from through href, nearest first (no loops, no deeper than uses go).
  const chainOf = (el) => {
    const chain = [el];
    for (let ref = el; chain.length <= MOST_USE_DEPTH;) {
      ref = href(ref)?.startsWith('#') && byId(href(ref).slice(1));
      if (!ref || !/Gradient$/.test(ref.localName) || chain.includes(ref)) break;
      chain.push(ref);
    }
    return chain;
  };
  // Its stops, [[offset, '#rrggbb'], ...]: the first in the chain that has any; offsets 0 to 1 and in order;
  // past MOST_STOPS, that many taken evenly.
  const stopsOf = (chain) => {
    const els = [...(chain.find((g) => [...g.children].some((c) => c.localName === 'stop'))?.children ?? [])].filter((c) => c.localName === 'stop');
    const gradientStyle = computed(chain[0], null);
    let last = 0;
    const stops = els.map((stop) => {
      const raw = stop.getAttribute('offset') ?? '0', pct = raw.trim().endsWith('%');
      const n = Number.parseFloat(raw);
      const offset = Math.max(last, Math.min(1, Math.max(0, Number.isFinite(n) ? (pct ? n / 100 : n) : 0)));
      last = offset;
      const style = computed(stop, gradientStyle);
      return [offset, colorOf(style['stop-color'], style) ?? '#000000'];
    });
    if (stops.length <= MOST_STOPS) return stops;
    return Array.from({ length: MOST_STOPS }, (_, i) => stops[Math.round((i * (stops.length - 1)) / (MOST_STOPS - 1))]);
  };
  // A gradient as a fill: its unit space carried into the element's (a linear one from (0, 0) to (1, 0) along
  // x1,y1 to x2,y2; a radial one's circle of radius 1 onto cx, cy, r), through gradientTransform and, for
  // objectBoundingBox, the element's box. One stop is its color; none, no paint; no length, the last stop's.
  // spreadMethod reflect and repeat come in as pad.
  const gradientFill = (el, box, ctx) => {
    const chain = chainOf(el), stops = stopsOf(chain);
    if (!stops.length) return null;
    if (stops.length === 1) return stops[0][1];
    const attr = (name) => chain.map((g) => g.getAttribute(name)).find((v) => v !== null) ?? null;
    const boxed = attr('gradientUnits') !== 'userSpaceOnUse';
    const b = boxed && box();
    if (boxed && (!b || b.x1 - b.x0 <= 0 || b.y1 - b.y0 <= 0)) return stops.at(-1)[1];
    const at = (name, fallback, ref) => {
      const v = attr(name) ?? fallback;
      return boxed ? (v.trim().endsWith('%') ? Number.parseFloat(v) / 100 : Number(v)) : length(v, ref) ?? 0;
    };
    let unit, f;
    if (el.localName === 'linearGradient') {
      const x1 = at('x1', '0%', ctx.vw), y1 = at('y1', '0%', ctx.vh), x2 = at('x2', '100%', ctx.vw), y2 = at('y2', '0%', ctx.vh);
      const dx = x2 - x1, dy = y2 - y1;
      if (!Number.isFinite(dx + dy) || Math.hypot(dx, dy) < 1e-9) return stops.at(-1)[1];
      unit = [dx, dy, -dy, dx, x1, y1];
    } else {
      const diagonal = Math.hypot(ctx.vw, ctx.vh) / Math.SQRT2;
      const cx = at('cx', '50%', ctx.vw), cy = at('cy', '50%', ctx.vh), r = at('r', '50%', diagonal);
      if (!Number.isFinite(cx + cy + r) || r <= 1e-9) return stops.at(-1)[1];
      const fx = attr('fx') === null ? cx : at('fx', '50%', ctx.vw), fy = attr('fy') === null ? cy : at('fy', '50%', ctx.vh);
      f = [(fx - cx) / r, (fy - cy) / r];
      const reach = Math.hypot(...f);
      if (reach > 0.99) f = f.map((v) => (v * 0.99) / reach); // SVG moves a focal point outside the circle onto it
      unit = [r, 0, 0, r, cx, cy];
    }
    let m = multiply(transformOf(attr('gradientTransform')), unit);
    if (boxed) m = multiply([b.x1 - b.x0, 0, 0, b.y1 - b.y0, b.x0, b.y0], m);
    return { type: el.localName === 'linearGradient' ? 'linear' : 'radial', stops, m, ...(f && { f }) };
  };
  // A fill or stroke: '#rrggbb' or null; a fill may be a gradient (box: the element's, for objectBoundingBox),
  // a stroke takes a gradient's first stop's color.
  const paint = (value, style, initial, gradient = null) => {
    if (/^none$/i.test(value)) return null;
    const url = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)\s*(.*)$/i.exec(value);
    if (url) {
      const ref = byId(url[1]);
      if (ref && /Gradient$/.test(ref.localName)) {
        if (gradient) return gradientFill(ref, gradient.box, gradient.ctx);
        const [first] = stopsOf(chainOf(ref));
        return first ? first[1] : null;
      }
      if (ref?.localName === 'pattern') left.add('pattern');
      return url[2] ? paint(url[2], style, null) : null;
    }
    const c = colorOf(value, style);
    return c === undefined ? (initial && paint(initial, style, null)) : c;
  };

  // An element's outlines in its own units, or null.
  const outlinesOf = (el, vw, vh) => {
    const n = (name, ref) => length(el.getAttribute(name), ref) ?? 0;
    const diagonal = Math.hypot(vw, vh) / Math.SQRT2;
    const name = el.localName;
    let d;
    if (name === 'path') d = el.getAttribute('d');
    else if (name === 'rect') {
      const x = n('x', vw), y = n('y', vh), w = n('width', vw), h = n('height', vh);
      if (w <= 0 || h <= 0) return null;
      let rx = length(el.getAttribute('rx'), vw), ry = length(el.getAttribute('ry'), vh);
      rx = Math.min(Math.max(rx ?? ry ?? 0, 0), w / 2);
      ry = Math.min(Math.max(ry ?? rx ?? 0, 0), h / 2);
      d = rx && ry
        ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}`
          + `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
        : `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    } else if (name === 'circle' || name === 'ellipse') {
      const cx = n('cx', vw), cy = n('cy', vh);
      let rx, ry;
      if (name === 'circle') rx = ry = n('r', diagonal);
      else {
        rx = length(el.getAttribute('rx'), vw);
        ry = length(el.getAttribute('ry'), vh);
        rx ??= ry ?? 0;
        ry ??= rx;
      }
      if (rx <= 0 || ry <= 0) return null;
      const arc = (x, y) => `A${rx} ${ry} 0 0 1 ${x} ${y}`;
      d = `M${cx + rx} ${cy}${arc(cx, cy + ry)}${arc(cx - rx, cy)}${arc(cx, cy - ry)}${arc(cx + rx, cy)}Z`;
    } else if (name === 'line') d = `M${n('x1', vw)} ${n('y1', vh)}L${n('x2', vw)} ${n('y2', vh)}`;
    else {
      const v = numbers(el.getAttribute('points'));
      if (v.length < 4) return null;
      d = `M${v.slice(0, v.length & ~1).join(' ')}${name === 'polygon' ? 'Z' : ''}`;
    }
    const outlines = parsePathData(d);
    return outlines.length ? outlines : null;
  };

  const addItem = (el, ctx, style) => {
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return;
    if (items.length >= MOST_ITEMS) return void (truncated = true);
    const outlines = outlinesOf(el, ctx.vw, ctx.vh);
    if (!outlines) return;
    const diagonal = Math.hypot(ctx.vw, ctx.vh) / Math.SQRT2;
    const width = length(style['stroke-width'], diagonal) ?? 1;
    const box = () => {
      const [first, ...rest] = outlines;
      return localBounds({ points: first.points, closed: first.closed, more: rest.map((o) => [o.closed, o.points]) });
    };
    const fill = paint(style.fill, style, INITIAL.fill, { box, ctx }), stroke = width > 0 ? paint(style.stroke, style, null) : null;
    if (!fill && !stroke) return;
    if (stroke && style['stroke-dasharray'] !== 'none' && numbers(style['stroke-dasharray']).some((v) => v > 0)) left.add('dash');
    if (['marker-start', 'marker-mid', 'marker-end'].some((k) => style[k] !== 'none')) left.add('marker');
    const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
    const miter = Number(style['stroke-miterlimit']);
    items.push({
      outlines, m: ctx.m, fill, stroke, width: width > 0 ? width : 1,
      rule: pick(style['fill-rule'], ['nonzero', 'evenodd'], 'nonzero'),
      cap: pick(style['stroke-linecap'], ['butt', 'round', 'square'], 'butt'),
      join: pick(style['stroke-linejoin'], ['miter', 'round', 'bevel'], 'miter'),
      miter: Number.isFinite(miter) && miter >= 1 ? Math.min(100, miter) : 4,
    });
  };

  // A viewport of w × h at (x, y), with el's viewBox, as nested svg and symbol make one.
  const viewport = (el, m, x, y, w, h) => {
    const vb = viewBoxOf(el);
    const inner = vb ? viewBoxMatrix(vb, w, h, el.getAttribute('preserveAspectRatio')) : IDENTITY;
    return { m: multiply(m, multiply(translation(x, y), inner)), vw: vb ? vb.w : w, vh: vb ? vb.h : h };
  };

  const children = (el, ctx) => {
    const kids = [...el.children].filter((c) => c.namespaceURI === SVG);
    // A switch draws its first child with no extension asked for (Illustrator puts its own data first).
    const drawn = el.localName === 'switch' ? kids.filter((c) => !c.hasAttribute('requiredExtensions')).slice(0, 1) : kids;
    for (const child of drawn) draw(child, ctx);
  };
  // One element, under ctx: { m, style, vw, vh, chain (the elements drawing it), depth (uses deep) }.
  function draw(el, ctx) {
    if (truncated || ++visits > MOST_VISITS) return void (truncated = true);
    const name = el.localName;
    if (UNDRAWN.has(name)) return;
    if (LEFT[name]) return void left.add(LEFT[name]);
    const style = computed(el, ctx.style);
    if (style.display === 'none') return;
    if (style.filter !== 'none') left.add('filter');
    if (style.mask !== 'none') left.add('mask');
    if (style['clip-path'] !== 'none') left.add('clip');
    const m = multiply(ctx.m, transformOf(el.getAttribute('transform')));
    const chain = new Set(ctx.chain).add(el), next = { ...ctx, m, style, chain };
    if (SHAPES.has(name)) return addItem(el, next, style);
    if (name === 'g' || name === 'a' || name === 'switch') return children(el, next);
    if (name === 'svg') {
      const at = viewport(el, m, length(el.getAttribute('x'), ctx.vw) ?? 0, length(el.getAttribute('y'), ctx.vh) ?? 0,
        length(el.getAttribute('width') ?? '100%', ctx.vw) ?? ctx.vw, length(el.getAttribute('height') ?? '100%', ctx.vh) ?? ctx.vh);
      return children(el, { ...next, ...at });
    }
    if (name === 'use') {
      const target = href(el)?.startsWith('#') && byId(href(el).slice(1));
      if (!target || chain.has(target) || ctx.depth >= MOST_USE_DEPTH) return;
      const x = length(el.getAttribute('x'), ctx.vw) ?? 0, y = length(el.getAttribute('y'), ctx.vh) ?? 0;
      const used = { ...next, depth: ctx.depth + 1 };
      if (target.localName === 'symbol') {
        const symbolStyle = computed(target, style);
        if (symbolStyle.display === 'none') return;
        const w = length(el.getAttribute('width') ?? '100%', ctx.vw) ?? ctx.vw, h = length(el.getAttribute('height') ?? '100%', ctx.vh) ?? ctx.vh;
        return children(target, { ...used, style: symbolStyle, chain: new Set(chain).add(target), ...viewport(target, m, x, y, w, h) });
      }
      return draw(target, { ...used, m: multiply(m, translation(x, y)) });
    }
    left.add('other');
  }

  // The art's size: the viewBox's (in width and height when they're given, a percentage meaning the viewBox's),
  // or the width and height; with neither, the art's own bounds.
  const vb = viewBoxOf(root), absolute = (name) => length(root.getAttribute(name));
  let width = absolute('width'), height = absolute('height'), m = IDENTITY, vw = width ?? 300, vh = height ?? 150;
  if (vb) {
    const w = width ?? (height ? (height * vb.w) / vb.h : vb.w), h = height ?? (width ? (width * vb.h) / vb.w : vb.h);
    [width, height, m, vw, vh] = [w, h, viewBoxMatrix(vb, w, h, root.getAttribute('preserveAspectRatio')), vb.w, vb.h];
  }
  const rootStyle = computed(root, null);
  if (rootStyle.filter !== 'none') left.add('filter');
  if (rootStyle.mask !== 'none') left.add('mask');
  if (rootStyle['clip-path'] !== 'none') left.add('clip');
  if (rootStyle.display !== 'none') children(root, { m, style: rootStyle, vw, vh, chain: new Set([root]), depth: 0 });

  if (!vb && (width === null || height === null)) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const item of items) {
      const [a, b, c, d, e, f] = item.m;
      for (const { points } of item.outlines) {
        for (const [x, y, ix, iy, ox, oy] of points) {
          for (const [px, py] of [[x, y], [x + ix, y + iy], [x + ox, y + oy]]) {
            const wx = a * px + c * py + e, wy = b * px + d * py + f;
            [x0, y0, x1, y1] = [Math.min(x0, wx), Math.min(y0, wy), Math.max(x1, wx), Math.max(y1, wy)];
          }
        }
      }
    }
    if (!items.length) [x0, y0, x1, y1] = [0, 0, 0, 0];
    for (const item of items) item.m = multiply(translation(-x0, -y0), item.m);
    [width, height] = [x1 - x0, y1 - y0];
  }
  return { width, height, items, left, truncated };
}

// What was left out of art, said, with how to bring text in; '' when nothing was.
export const svgLeftOut = (left) => (left.size
  ? t('vector.svgLeftOut', { kinds: [...left].map((kind) => t(`vector.svgKinds.${kind}`)).join(', ') }) + (left.has('text') ? ` ${t('vector.svgTextHint')}` : '')
  : '');

// Why read art can't come in where there's room for `room` more shapes, said; null when it can.
export function svgRefusal(art, room) {
  if (!art.truncated && !art.items.length) return `${t('vector.svgEmpty')} ${svgLeftOut(art.left)}`.trim();
  let points = 0, outlines = 0;
  for (const item of art.items) {
    points = Math.max(points, item.outlines.reduce((n, o) => n + o.points.length, 0));
    outlines = Math.max(outlines, item.outlines.length);
  }
  if (!art.truncated && art.items.length <= room && points <= MOST_POINTS && outlines <= MOST_OUTLINES) return null;
  return t('vector.svgTooBig', { shapes: art.truncated ? `${art.items.length}+` : art.items.length, points, mostShapes: room, mostPoints: MOST_POINTS });
}

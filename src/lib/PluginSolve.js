// A plugin solver's passes in JavaScript (docs/plugins.md): a kind of By shape, given each cell's 32 samples
// (SAMPLES) and its neighbors' within reach for pass 1 (solve), and pass 1's picks around it for pass 2 (refine).
// Every result is held to the layer's set, the palette and the style. No DOM here: the unit tests run it in Node.
import { walkCells, shapeMatcher, mixChannel, cellRange, nearestOf, SAMPLES } from './CharResolver.js';
import { ASCII_BG, colorOf } from './Cells.js';
import { bayerNudge, nudgeSpread } from './Dither.js';

const N = SAMPLES.w * SAMPLES.h;
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const byte = (v) => Math.round(clamp(Number.isFinite(v) ? v : 0));
const inByte = (v) => typeof v === 'number' && v >= 0 && v <= 255; // NaN isn't
const channels = (color, out) => {
  if (Array.isArray(color)) { out[0] = color[0]; out[1] = color[1]; out[2] = color[2]; } else { out[0] = color.r; out[1] = color.g; out[2] = color.b; }
  return out;
};

// A throw inside a solver's pass, named by the solver's ref.
export class SolverError extends Error {
  constructor(ref, message) {
    super(message);
    this.name = 'SolverError';
    this.ref = ref;
  }
}
const messageOf = (error) => {
  try {
    return String(error?.message ?? error);
  } catch {
    return 'error'; // a thrown thing that can't even be made text
  }
};

// area (grid pixels, 2 a line) grown by reach cells each way, clipped to the grid; null (the whole grid) stays null.
export function grownArea(area, reach, cols, lines) {
  if (!area) return null;
  const x0 = Math.max(0, area.x - reach), y0 = Math.max(0, area.y - 2 * reach);
  const x1 = Math.min(cols, area.x + area.w + reach), y1 = Math.min(2 * lines, area.y + area.h + 2 * reach);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

// A matcher for a plugin solver (def, named ref) over the glyphs ({ char, mask, own }: the layer's set, then the
// solver's own chars), the palette (null: any color), Solids, Pattern light, the render style and the solver's
// option values (by id). shape is By shape over the set alone (look.byShape). Kept while its inputs stay the same.
let lastPlugin = null;
const sameOptions = (a, b) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
};
export function pluginMatcher({ def, ref, palette, glyphs, solids = 0, light = 0, renderStyle = 'ansi', options = {} }) {
  const l = lastPlugin;
  const fits = l?.def === def && l.ref === ref && l.paletteIn === palette && l.solids === solids && l.light === light
    && l.style === renderStyle && sameOptions(l.look.options, options) && l.glyphs.length === glyphs.length
    && glyphs.every((g, i) => g.char === l.glyphs[i].char && g.mask === l.glyphs[i].mask && !g.own === !l.glyphs[i].own);
  if (!fits) lastPlugin = makePluginMatcher(def, ref, palette, glyphs, solids, light, renderStyle, options);
  return lastPlugin;
}

function makePluginMatcher(def, ref, palette, glyphs, solids, light, style, options) {
  const pal = palette?.length ? palette : null;
  const shape = shapeMatcher({ palette, glyphs: glyphs.filter((g) => !g.own), solids, light, renderStyle: style });
  const nearest = pal && nearestOf(pal);
  const black = pal ? nearest(0, 0, 0) : colorOf({ r: 0, g: 0, b: 0 });
  const white = shape.core.white; // Monochrome's, as By shape's
  const byChar = new Map();
  for (const g of glyphs) if (!byChar.has(g.char)) byChar.set(g.char, g);

  // The look a solver gets: copies, so a solver can't change the app's palette or masks.
  const lookPalette = pal && Object.freeze(pal.map(({ r, g, b }) => Object.freeze({ r, g, b })));
  const lookOf = pal && new Map(pal.map((p, i) => [p, lookPalette[i]]));
  const rgb = [0, 0, 0];
  const look = Object.freeze({
    glyphs: Object.freeze(glyphs.map(({ char, mask, own }) => Object.freeze({ char, mask: Float32Array.from(mask), own: !!own }))),
    palette: lookPalette,
    style,
    options: Object.freeze({ ...options }),
    light,
    solids,
    // One channel: bg mixed with fg by ink (0..1), as By shape scores it (Pattern light included).
    mix: (bg, fg, ink) => mixChannel(bg, fg, ink, light),
    // A color ([r, g, b] or { r, g, b }): the palette's nearest (look.palette's entry), or { r, g, b } rounded.
    nearest(color) {
      channels(color, rgb);
      const r = byte(rgb[0]), g = byte(rgb[1]), b = byte(rgb[2]);
      return nearest ? lookOf.get(nearest(r, g, b)) : { r, g, b };
    },
    // A color's ([r, g, b] or { r, g, b }) brightness, 0..255, with rgb2gray's weights (unrounded).
    gray: (c) => (Array.isArray(c) ? 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] : 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b),
    // The cell as By shape picks it from the layer's set alone: { char, fg, bg }, overwritten by the next call.
    byShape() {
      const r = shape.match(state.own);
      shaped.char = r.char; shaped.fg = lookColor(r.fg); shaped.bg = lookColor(r.bg);
      return shaped;
    },
  });
  // By shape's shared colors (the palette's, black, Monochrome's white) given as look's copies; a full color is its own.
  const shaped = { char: '', fg: null, bg: null };
  const lookBlack = Object.freeze({ r: 0, g: 0, b: 0 }), lookWhite = Object.freeze({ r: white.r, g: white.g, b: white.b });
  const lookColor = (c) => (c === ASCII_BG ? lookBlack : c === white ? lookWhite : lookOf?.get(c) ?? c);

  // A result's color: a palette index (an integer in range) or { r, g, b } (each a number within 0..255), the
  // palette's nearest (rounded without one). Anything else is black: holdCell has no samples to take a mean from,
  // and a broken solver should look broken.
  const colorFrom = (v) => {
    if (typeof v === 'number') return pal && Number.isInteger(v) && v >= 0 && v < pal.length ? pal[v] : black;
    if (v === null || typeof v !== 'object') return black;
    const r = v.r, g = v.g, b = v.b;
    if (!(inByte(r) && inByte(g) && inByte(b))) return black;
    return nearest ? nearest(Math.round(r), Math.round(g), Math.round(b)) : colorOf({ r: Math.round(r), g: Math.round(g), b: Math.round(b) });
  };
  // One object, overwritten by the next call. A fault is a character held (a result that isn't an object
  // counts); a color held isn't one.
  const shown = new Float32Array(N * 3);
  const held = { cell: null, shown, fault: false };
  function hold(result, shows = true) {
    const isObject = result !== null && typeof result === 'object';
    const found = byChar.get(isObject ? result.char : undefined);
    const glyph = found ?? glyphs[0];
    let fg, bg;
    if (style === 'ascii') {
      fg = white; bg = ASCII_BG;
    } else {
      fg = isObject ? colorFrom(result.fg) : black;
      bg = style === 'colorAscii' ? ASCII_BG : isObject ? colorFrom(result.bg) : black;
    }
    held.cell = { char: glyph.char, fg, bg };
    held.fault = !found;
    if (shows) { // what the cell shows, as By shape's: bg mixed with fg by the glyph's mask (Monochrome: its gray)
      const { mask } = glyph;
      for (let i = 0, j = 0; i < N; i++, j += 3) {
        if (style === 'ascii') shown[j] = shown[j + 1] = shown[j + 2] = mixChannel(0, 255, mask[i], light);
        else {
          shown[j] = mixChannel(bg.r, fg.r, mask[i], light);
          shown[j + 1] = mixChannel(bg.g, fg.g, mask[i], light);
          shown[j + 2] = mixChannel(bg.b, fg.b, mask[i], light);
        }
      }
    }
    return held;
  }

  // The resolve under way. sample() answers in one array, overwritten by the next call (a reach-1 solver reads about
  // 288 samples a cell): copy what you keep.
  const state = { raw: null, cols: 0, lines: 0, width: 0, reach: 0, spread: 0, strength: 0, bayer: false, own: null, col: 0, line: 0, first: null };
  const most = def.reach, got = [0, 0, 0], ownSamples = new Float64Array(N * 3);
  const within = (dx, dy) => Number.isInteger(dx) && Number.isInteger(dy) && dx >= -most && dx <= most && dy >= -most && dy <= most;
  // Sample i of the cell dx, dy away: the cell's own from the walk (Floyd–Steinberg's error in pass 1), any other's
  // from the samples with Bayer's nudge and no error. Past the border, the edge cell's; with reach 0 (alone), its own.
  function sample(dx, dy, i) {
    if (!(dx >= -most && dx <= most && dy >= -most && dy <= most && i >= 0 && i < N) || (dx | 0) !== dx || (dy | 0) !== dy || (i | 0) !== i) {
      throw new RangeError(`sample(${dx}, ${dy}, ${i}) is past reach ${most}`);
    }
    const reach = state.reach, col = state.col, line = state.line;
    let c = col + (dx < -reach ? -reach : dx > reach ? reach : dx), l = line + (dy < -reach ? -reach : dy > reach ? reach : dy);
    c = c < 0 ? 0 : c >= state.cols ? state.cols - 1 : c;
    l = l < 0 ? 0 : l >= state.lines ? state.lines - 1 : l;
    if (c === col && l === line) {
      const s = state.own, j = i * 3;
      got[0] = s[j]; got[1] = s[j + 1]; got[2] = s[j + 2];
      return got;
    }
    const raw = state.raw, nudge = state.bayer ? bayerNudge(c, l, state.spread, state.strength) : 0, y = (i / SAMPLES.w) | 0;
    const p = ((l * SAMPLES.h + y) * state.width + c * SAMPLES.w + i - y * SAMPLES.w) * 4;
    got[0] = clamp(raw[p] + nudge); got[1] = clamp(raw[p + 1] + nudge); got[2] = clamp(raw[p + 2] + nudge);
    return got;
  }
  // Pass 2: the pass-1 character of the cell dx, dy away, or null past the border.
  function char(dx, dy) {
    if (!within(dx, dy)) throw new RangeError(`char(${dx}, ${dy}) is past reach ${most}`);
    const c = state.col + dx, l = state.line + dy;
    return c < 0 || c >= state.cols || l < 0 || l >= state.lines ? null : state.first[l * state.cols + c].char;
  }
  const solveCell = { col: 0, line: 0, sample }, refineCell = { col: 0, line: 0, sample, char };

  // A pass called as a plain function (this is undefined), its result held. Anything it throws is a SolverError.
  const call = (pass, cell, shows) => {
    try {
      return hold(pass(cell, look), shows);
    } catch (error) {
      throw new SolverError(ref, messageOf(error));
    }
  };

  function run(raw, cols, lines, { strength, style: ditherStyle, area, cells, first, alone, origin }) {
    const ox = origin?.col ?? 0, oy = origin?.line ?? 0;
    const reach = alone ? 0 : most, spread = nudgeSpread(pal), bayer = strength > 0 && ditherStyle === 'bayer';
    Object.assign(state, { raw, cols, lines, width: cols * SAMPLES.w, reach, spread, strength, bayer, first });
    // Only Floyd–Steinberg's walk over the whole grid reads what a cell shows (walkCells passes nothing on with an area).
    const shows = strength > 0 && !bayer && !area;
    const picks = first ?? cells, { solve, refine } = def;
    let faults = 0;
    try {
      walkCells(raw, cols, lines, { sw: SAMPLES.w, sh: SAMPLES.h, strength, style: ditherStyle, area: grownArea(area, reach, cols, lines), spread, keep: false }, (i, col, line, s) => {
        state.own = s; state.col = col; state.line = line; solveCell.col = col + ox; solveCell.line = line + oy;
        const { cell, fault } = call(solve, solveCell, shows);
        picks[i] = cell;
        if (fault) faults++;
        return shown;
      });
      if (first) {
        const { c0, c1, l0, l1 } = cellRange(grownArea(area, 2 * reach, cols, lines), cols, lines);
        const width = cols * SAMPLES.w;
        state.own = ownSamples;
        for (let line = l0; line < l1; line++) {
          for (let col = c0; col < c1; col++) {
            const nudge = bayer ? bayerNudge(col, line, spread, strength) : 0;
            for (let i = 0, j = 0; i < N; i++, j += 3) {
              const p = ((line * SAMPLES.h + Math.floor(i / SAMPLES.w)) * width + col * SAMPLES.w + i % SAMPLES.w) * 4;
              ownSamples[j] = clamp(raw[p] + nudge); ownSamples[j + 1] = clamp(raw[p + 1] + nudge); ownSamples[j + 2] = clamp(raw[p + 2] + nudge);
            }
            state.col = col; state.line = line; refineCell.col = col + ox; refineCell.line = line + oy;
            const { cell, fault } = call(refine, refineCell, false);
            cells[line * cols + col] = cell;
            if (fault) faults++;
          }
        }
      }
    } finally {
      state.raw = state.own = state.first = null; // the samples and picks aren't kept past the resolve
    }
    return { cells, first, faults };
  }

  return { kind: 'plugin', def, ref, palette: pal, glyphs, look, shape, solids, light, style, paletteIn: palette, hold, run };
}

// A pass's result ({ char, fg, bg }) held to the matcher's set, palette and style: { cell, shown, fault }, one object
// overwritten by the next call. char not among the glyphs is the first glyph (a fault); fg and bg as colorFrom says;
// Color ASCII's bg is black and ASCII is white on black (their colors aren't read). shown: the 32 samples the cell
// shows (RGB each), as By shape's, which Floyd–Steinberg's error is worked out from.
export const holdCell = (result, matcher) => matcher.hold(result);

// A plugin solver over the grid: a cell ({ char, fg, bg }) for each of lines x cols, from samples (By shape's: RGBA,
// cols x SAMPLES.w wide, at least lines x SAMPLES.h tall). Pass 1 rides By shape's walk (walkCells: Floyd–Steinberg's
// error carried, Bayer's nudge), over area grown by reach, into first; pass 2 (refine, when the solver has one and
// not alone) over area grown by 2 x reach, from first, with Bayer's nudge and none of the error, into cells. With
// area, cells and first are the last resolve's, kept by the caller (refine with no first resolves the whole grid).
// alone (over paint, upper layers): reach 0, no pass 2. origin ({ col, line }): where the samples' first cell is in the
// drawing, added to the col and line the solver is told (an upper layer's one cell), not to what it reads. first is
// null without a pass 2. faults: results whose character was held.
export function resolvePlugin(samples, cols, lines, matcher, { strength = 0, style = 'floyd', area = null, cells = new Array(cols * lines), first = null, alone = false, origin = null } = {}) {
  const refines = !alone && !!matcher.def.refine;
  if (refines && area && !first) area = null;
  return matcher.run(samples, cols, lines, { strength, style, area, cells, first: refines ? first ?? new Array(cols * lines) : null, alone, origin });
}

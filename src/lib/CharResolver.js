// Choosing a cell's character: the mode the settings come to, and what it asks of the pipeline.
// No DOM and no translations here: the unit tests run it in Node.
import { bayerNudge, nudgeSpread } from './Dither.js';
import { charRowsOf, colorOf, buildCell, ASCII_BG } from './Cells.js';

// How a cell's character is picked (Cells.js): ANSI picks at random, or Best match / By shape;
// Color ASCII by intensity or By shape; ASCII by brightness or By shape. Anything unknown (an old
// file, another browser) falls back to today's way.
export function charModeOf(renderStyle, charChoice, charChoiceAscii) {
  if (renderStyle === 'ansi') return charChoice === 'best' || charChoice === 'shape' ? charChoice : 'random';
  const byShape = charChoiceAscii === 'shape';
  return renderStyle === 'colorAscii' ? (byShape ? 'shape' : 'intensity') : (byShape ? 'shape' : 'brightness');
}

// Whether the character comes from comparing the picture with glyphs, not from its weight or the seed.
export const resolves = (params) => params.charMode === 'best' || params.charMode === 'shape';

// Whether the resolver needs the error Floyd–Steinberg passes on. Full color has no palette to
// dither to: a Dither value left from one (its slider hidden) dithers nothing, as with pixels.
export const carriesError = (params) => resolves(params) && params.dither > 0 && params.ditherStyle !== 'bayer' && params.quantize !== 'none';

// CGA and VGA aren't snapped in the shader when the grid is snapped later: dithered or resolved.
export const snapsLate = (params) => params.dither > 0 || resolves(params);

// Best match: each cell's glyph, fg and bg (from the palette when there is one) that come closest to
// its two halves. A glyph shows, per half, bg mixed with fg by that half's ink.

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const toLinear = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (l) => 255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);
const LINEAR = Float64Array.from({ length: 256 }, (_, v) => toLinear(v));
const linear = (v) => ((v | 0) === v && v >= 0 && v <= 255 ? LINEAR[v] : toLinear(v));

// One channel of a half: bg mixed with fg by ink (0..1). Pattern light (0..1) goes from a plain
// average of the two (0) to the average in linear light (1), how a screen's eye blends them.
export function mixChannel(bg, fg, ink, light) {
  if (ink <= 0) return bg;
  if (ink >= 1) return fg;
  const plain = bg + (fg - bg) * ink;
  if (!light) return plain;
  return plain + (toSrgb(linear(bg) * (1 - ink) + linear(fg) * ink) - plain) * light;
}

// Every flat glyph's (░ ▒ ▓: one ink in both halves) mix of two palette colors, a bigger palette:
// every ordered pair up to 32 colors, past that each color with its 8 nearest (VGA would have about
// 98,000 mixes). In order of glyph, then bg, then fg: the tie order (▓ gray on black before
// black on white, the same color).
function flatMixes(palette, flat, light) {
  const n = palette.length;
  const d2 = (p, q) => (p.r - q.r) ** 2 + (p.g - q.g) ** 2 + (p.b - q.b) ** 2;
  const paired = new Uint8Array(n * n);
  palette.forEach((p, i) => {
    let near = [...palette.keys()].filter((j) => j !== i);
    if (n > 32) near = near.sort((j, k) => d2(p, palette[j]) - d2(p, palette[k]) || j - k).slice(0, 8);
    for (const j of near) paired[i * n + j] = paired[j * n + i] = 1;
  });
  const glyph = [], fg = [], bg = [], rgb = [];
  flat.forEach(({ ink }, f) => {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (!paired[i * n + j]) continue;
        const F = palette[i], B = palette[j];
        glyph.push(f); fg.push(i); bg.push(j);
        rgb.push(mixChannel(B.r, F.r, ink, light), mixChannel(B.g, F.g, ink, light), mixChannel(B.b, F.b, ink, light));
      }
    }
  });
  if (!glyph.length) return null;
  return { glyph, fg, bg, rgb: Float64Array.from(rgb), lut: new Int32Array(1 << 15).fill(-1) };
}

// The mix nearest a color, remembered by 15-bit color. Each is worked out for the middle of its
// 15-bit box, not the first color that lands in it, so a cell matched again gets the same answer.
function nearestMix(mixes, r, g, b) {
  const key = (Math.round(r) >> 3) << 10 | (Math.round(g) >> 3) << 5 | (Math.round(b) >> 3);
  let m = mixes.lut[key];
  if (m >= 0) return m;
  const cr = ((key >> 10) << 3) + 4, cg = (((key >> 5) & 31) << 3) + 4, cb = ((key & 31) << 3) + 4;
  const rgb = mixes.rgb;
  let best = Infinity;
  for (let i = 0; i < rgb.length; i += 3) {
    const e = (rgb[i] - cr) ** 2 + (rgb[i + 1] - cg) ** 2 + (rgb[i + 2] - cb) ** 2;
    if (e < best) best = e, m = i / 3;
  }
  return mixes.lut[key] = m;
}

// The palette's nearest color to r, g, b (bytes), as nearestIndex finds it (squared distance, the
// first of a tie), only faster: each 15-bit box keeps the few colors that can be nearest somewhere
// inside it, and only those are measured.
function nearestOf(palette) {
  const boxes = new Array(1 << 15);
  const far = (v, lo) => Math.max(Math.abs(v - lo), Math.abs(v - lo - 7)); // to the box's far side
  const gap = (v, lo) => (v < lo ? lo - v : v > lo + 7 ? v - lo - 7 : 0);   // to its near side
  const shortlist = (key) => {
    const r = (key >> 10) << 3, g = ((key >> 5) & 31) << 3, b = (key & 31) << 3;
    let reach = Infinity;
    for (const p of palette) reach = Math.min(reach, far(p.r, r) ** 2 + far(p.g, g) ** 2 + far(p.b, b) ** 2);
    return palette.filter((p) => gap(p.r, r) ** 2 + gap(p.g, g) ** 2 + gap(p.b, b) ** 2 <= reach);
  };
  return (r, g, b) => {
    const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
    const list = boxes[key] ??= shortlist(key);
    let best = list[0], min = Infinity;
    for (let i = 0; i < list.length; i++) {
      const p = list[i], d = (r - p.r) ** 2 + (g - p.g) ** 2 + (b - p.b) ** 2;
      if (d < min) min = d, best = p;
    }
    return best;
  };
}

// How far one color shown in both halves is from t and b.
const halvesErr = (v, t, b) => (v[0] - t[0]) ** 2 + (v[1] - t[1]) ** 2 + (v[2] - t[2]) ** 2 +
  (v[0] - b[0]) ** 2 + (v[1] - b[1]) ** 2 + (v[2] - b[2]) ** 2;

// The fg and bg (into fg, bg) that show t over a glyph's top ink a and b over its bottom ink c,
// solved per channel, clamped to 0..255: exact in plain light and in linear light, Pattern light
// between the two answers.
function fit(t, b, a, c, light, fg, bg) {
  for (let k = 0; k < 3; k++) {
    const d = (t[k] - b[k]) / (a - c);
    let x = t[k] - d * a, y = x + d;
    if (light) {
      const lt = linear(t[k]), dl = (lt - linear(b[k])) / (a - c), xl = lt - dl * a;
      x += (toSrgb(Math.min(1, Math.max(0, xl))) - x) * light;
      y += (toSrgb(Math.min(1, Math.max(0, xl + dl))) - y) * light;
    }
    bg[k] = clamp(x); fg[k] = clamp(y);
  }
}

// A matcher for the palette (null: any color), the glyphs ({ char, ink: [top, bottom] }), Solids
// (0..1: how much closer another choice must be than one plain color to be taken over it, up to 64
// levels a channel) and Pattern light (0..1). Its mix table and lookups (table) are kept while the
// palette, glyphs and Pattern light stay the same, so a Solids step doesn't make them again.
// match(t, b) returns one object, overwritten by the next call: copy what you keep. core and
// tolerance are what the GPU matches with (ShapeMatcher).
let last = null;
export function bestMatcher({ palette, glyphs, solids = 0, light = 0 }) {
  const key = glyphs.map(({ char, ink }) => char + ink.join()).join('|');
  if (!(last?.palette === palette && last.key === key && last.light === light)) {
    last = { palette, key, light, core: makeMatcher(palette?.length ? palette : null, glyphs, light), solids: null, matcher: null };
  }
  if (last.solids !== solids) {
    const { core } = last, tolerance = 6 * (64 * solids) ** 2;
    last.solids = solids;
    last.matcher = { palette: core.palette, table: core.table, core, tolerance, match: (t, b) => core.match(t, b, tolerance) };
  }
  return last.matcher;
}

function makeMatcher(palette, glyphs, light) {
  const chars = new Set(glyphs.map(({ char }) => char));
  const has = (char) => chars.has(char);
  // A solid (fg = bg) needs no █ in the set: it's written as █ if the set has it, else ▄, else the first.
  const solidChar = has('█') ? '█' : has('▄') ? '▄' : glyphs[0]?.char ?? '▄';
  // A glyph with the same ink as one before it (a repeat, ▗ after ▖) shows the same and loses the
  // tie: it's left out.
  const inks = new Set(), flat = [], twoInk = [];
  glyphs.forEach(({ char, ink: [a, c] }, gi) => {
    if (inks.has(`${a},${c}`)) return;
    inks.add(`${a},${c}`);
    if (a !== c) twoInk.push({ gi, char, a, c, halves: a % 1 === 0 && c % 1 === 0 }); // ▄ ▀: a half each
    else if (a > 0 && a < 1) flat.push({ gi, char, ink: a }); // all bg or all fg is a solid
  });
  // Without a palette a flat mix is just a color: the solid is as close.
  const mixes = palette && flat.length ? flatMixes(palette, flat, light) : null;

  // Reused for every cell: the result (copy what you keep; shown is its top then its bottom), the
  // candidate and the best so far.
  const shownHalves = new Float64Array(6);
  const res = { char: '', fg: null, bg: null, shown: shownHalves, top: shownHalves.subarray(0, 3), bottom: shownHalves.subarray(3, 6) };
  const top = new Float64Array(3), bottom = new Float64Array(3), fgv = new Float64Array(3), bgv = new Float64Array(3);
  const bestFg = new Float64Array(3), bestBg = new Float64Array(3);
  const color = (v) => colorOf({ r: v[0], g: v[1], b: v[2] });
  const nearest = palette && nearestOf(palette);
  const near = (v) => nearest(Math.round(v[0]), Math.round(v[1]), Math.round(v[2]));

  // What fg and bg show through inks a and c, into top and bottom; its error against t and b.
  const shown = (F, B, a, c, t, b) => {
    let e = 0;
    for (let k = 0; k < 3; k++) {
      top[k] = mixChannel(B[k], F[k], a, light);
      bottom[k] = mixChannel(B[k], F[k], c, light);
      e += (top[k] - t[k]) ** 2 + (bottom[k] - b[k]) ** 2;
    }
    return e;
  };
  const rgbOf = (p, v) => { v[0] = p.r; v[1] = p.g; v[2] = p.b; return v; };

  let bestErr = Infinity, bestGi = Infinity;
  const keep = (e, gi, char, F, B) => {
    if (!(e < bestErr || (e === bestErr && gi < bestGi))) return false;
    bestErr = e; bestGi = gi; res.char = char; res.fg = F; res.bg = B;
    for (let k = 0; k < 3; k++) { res.top[k] = top[k]; res.bottom[k] = bottom[k]; }
    return true;
  };
  const mean = new Float64Array(3), s = new Float64Array(3);

  function match(t, b, tolerance) {
    bestErr = Infinity; bestGi = Infinity;
    for (let k = 0; k < 3; k++) mean[k] = (t[k] + b[k]) / 2;
    if (mixes) {
      const m = nearestMix(mixes, mean[0], mean[1], mean[2]);
      for (let k = 0; k < 3; k++) top[k] = bottom[k] = mixes.rgb[m * 3 + k];
      const f = flat[mixes.glyph[m]];
      keep(halvesErr(top, t, b), f.gi, f.char, palette[mixes.fg[m]], palette[mixes.bg[m]]);
    }
    let nt = null, nb = null; // ▄ and ▀: each half snapped on its own, once
    for (const { gi, char, a, c, halves } of twoInk) {
      if (palette && halves) {
        nt ??= near(t); nb ??= near(b);
        const F = a ? nt : nb, B = a ? nb : nt;
        keep(shown(rgbOf(F, fgv), rgbOf(B, bgv), a, c, t, b), gi, char, F, B);
        continue;
      }
      fit(t, b, a, c, light, fgv, bgv);
      if (palette) {
        const F = near(fgv), B = near(bgv);
        keep(shown(rgbOf(F, fgv), rgbOf(B, bgv), a, c, t, b), gi, char, F, B);
      } else {
        for (let k = 0; k < 3; k++) { fgv[k] = Math.round(fgv[k]); bgv[k] = Math.round(bgv[k]); }
        if (keep(shown(fgv, bgv, a, c, t, b), gi, char, null, null)) { bestFg.set(fgv); bestBg.set(bgv); }
      }
    }
    // The solid: the color nearest the halves' mean. It wins ties, and within Solids' tolerance.
    const p = palette ? near(mean) : null;
    if (p) rgbOf(p, s);
    else for (let k = 0; k < 3; k++) s[k] = Math.round(mean[k]);
    if (halvesErr(s, t, b) <= bestErr + tolerance) {
      res.char = solidChar;
      res.fg = res.bg = p ?? color(s);
      res.top.set(s); res.bottom.set(s);
    } else if (!palette) {
      res.fg = color(bestFg); res.bg = color(bestBg);
    }
    return res;
  }
  return { kind: 'best', palette, table: mixes, glyphs, flat, twoInk, solidChar, light, match };
}

// The columns (c0 to c1) and lines (l0 to l1, ends excluded) of the cells over area (grid pixels), or all of them.
export function cellRange(area, cols, lines) {
  if (!area) return { c0: 0, c1: cols, l0: 0, l1: lines };
  return { c0: Math.max(0, area.x), c1: Math.min(cols, area.x + area.w), l0: Math.max(0, Math.floor(area.y / 2)), l1: Math.min(lines, Math.floor((area.y + area.h - 1) / 2) + 1) };
}

// Each cell's samples in order, with Dither's error carried in or its nudge added, given to
// visit(i, col, line, s): s is the cell's sw x sh samples (RGB each, row-major from its top left),
// from raw (RGBA, cols x sw samples wide, at least lines x sh tall, kept within 0..255); visit
// returns what the cell shows (the same layout) for the error Floyd–Steinberg passes on. Best
// match's samples are a cell's two halves (1 x 2), By shape's SAMPLES. Returns the error that
// arrived at each sample (3 a sample) when Floyd–Steinberg runs and keep is on, else null; with keep
// off only two lines of it are held as the walk goes (By shape's would be 12 bytes a sample).
// - 'floyd': each sample's error x strength goes to the same sample of the cells right (7/16),
//   below-left (3/16), below (5/16) and below-right (1/16).
// - 'bayer': every sample nudged by the cell's place in the 4x4 pattern x spread x strength.
// With area (grid pixels), only the cells over it, with the error that arrived (carried, or none),
// and nothing passed on: an open edit.
export function walkCells(raw, cols, lines, { sw = 1, sh = 2, strength = 0, style = 'floyd', area = null, carried = null, spread = 0, keep = true }, visit) {
  const floyd = strength > 0 && style !== 'bayer';
  const bayer = strength > 0 && style === 'bayer';
  const width = cols * sw, n = sw * sh;
  const carry = floyd ? (area ? carried : new Float32Array(width * (keep ? lines : 2) * sh * 3)) : null;
  const pass = floyd && !area;
  const { c0, c1, l0, l1 } = cellRange(area, cols, lines);
  const s = new Float64Array(n * 3);
  const across = sw * 3; // to the same sample of the next cell right
  // Where a line's samples are in carry: their own place, or (keep off) one of two lines in turn.
  const at = (line) => (keep || area ? line : line & 1) * sh * width;
  for (let line = l0; line < l1; line++) {
    const down = (at(line + 1) - at(line)) * 3; // to the same sample of the cell below
    if (pass && !keep) carry.fill(0, at(line + 1) * 3, (at(line + 1) + sh * width) * 3); // the line before's, used
    for (let col = c0; col < c1; col++) {
      const nudge = bayer ? bayerNudge(col, line, spread, strength) : 0;
      for (let y = 0, j = 0; y < sh; y++) {
        for (let x = 0, p = (line * sh + y) * width + col * sw, q = at(line) + y * width + col * sw; x < sw; x++, p++, q++, j += 3) {
          for (let k = 0; k < 3; k++) s[j + k] = clamp(raw[p * 4 + k] + nudge + (carry ? carry[q * 3 + k] : 0));
        }
      }
      const shown = visit(line * cols + col, col, line, s);
      if (!pass) continue;
      const right = col + 1 < cols, left = col > 0, below = line + 1 < lines;
      for (let y = 0, j = 0; y < sh; y++) {
        for (let x = 0, q = at(line) + y * width + col * sw; x < sw; x++, q++, j += 3) {
          for (let k = 0; k < 3; k++) {
            const e = (s[j + k] - shown[j + k]) * strength, o = q * 3 + k;
            if (right) carry[o + across] += e * (7 / 16);
            if (!below) continue;
            if (left) carry[o + down - across] += e * (3 / 16);
            carry[o + down] += e * (5 / 16);
            if (right) carry[o + down + across] += e * (1 / 16);
          }
        }
      }
    }
  }
  return floyd && keep ? carry : null;
}

// Best match over the grid: a cell ({ char, fg, bg }) for each of charRowsOf(rows) lines of cols,
// Dither's error carried or nudged as walkCells does. With area, the cells outside it are left out
// (or, given cells, left as they are there). fg and bg are the palette's entries, or Colors without one.
export function resolveGrid(raw, cols, rows, matcher, { strength = 0, style = 'floyd', area = null, carried = null, cells = new Array(cols * charRowsOf(rows)) } = {}) {
  const spread = nudgeSpread(matcher.palette);
  let t, b; // the cell's two halves, views of its samples
  const out = walkCells(raw, cols, charRowsOf(rows), { strength, style, area, carried, spread }, (i, col, line, s) => {
    t ??= s.subarray(0, 3); b ??= s.subarray(3, 6);
    const r = matcher.match(t, b);
    cells[i] = { char: r.char, fg: r.fg, bg: r.bg };
    return r.shown;
  });
  return { cells, carried: out };
}

// By shape: each cell sampled at SAMPLES (4 x 8, 4 a grid pixel each way) and matched against each
// glyph's mask at that grid (GlyphCoverage.referenceMask), not just its two halves.
export const SAMPLES = { w: 4, h: 8 };
const N = SAMPLES.w * SAMPLES.h;

// A matcher for the palette (null: any color), the glyphs ({ char, mask: Float32Array(32) }), Solids
// (0..1, ANSI only: up to 64 levels a channel, as bestMatcher's), Pattern light (0..1) and the
// render style. match(s), s a cell's 32 samples (RGB each, row-major), returns { char, fg, bg, shown }
// (shown: what the cell shows at each sample, for Floyd–Steinberg), one object overwritten by the
// next call. Per glyph, in order:
// - ANSI: fg the mask-weighted mean of the samples, bg the mean weighted by the rest (all of one:
//   the plain mean), each snapped; shown mixChannel(bg, fg, mask); scored by squared error. A solid
//   at the samples' mean (snapped) wins ties and within Solids' tolerance, written as bestMatcher's.
// - Color ASCII: bg black, fg the least-squares ink over black (sum of mask x sample over sum of mask
//   squared), snapped, shown mixChannel(0, fg, mask).
// - Monochrome ASCII: white on black, scored against the samples' brightness (0..255, rgb2gray's).
// Ties go to the first glyph. Its precomputation is kept while the palette, glyphs, Pattern light and
// style stay the same, so a Solids step doesn't make it again. core and tolerance are what the GPU
// matches with (ShapeMatcher).
let lastShape = null;
export function shapeMatcher({ palette, glyphs, solids = 0, light = 0, renderStyle = 'ansi' }) {
  const fits = lastShape?.palette === palette && lastShape.light === light && lastShape.renderStyle === renderStyle
    && lastShape.glyphs.length === glyphs.length && glyphs.every((g, i) => g.char === lastShape.glyphs[i].char && g.mask === lastShape.glyphs[i].mask);
  if (!fits) {
    lastShape = { palette, glyphs, light, renderStyle, core: makeShapeMatcher(palette?.length ? palette : null, glyphs, light, renderStyle), solids: null, matcher: null };
  }
  if (lastShape.solids !== solids) {
    const { core } = lastShape, tolerance = renderStyle === 'ansi' ? N * 3 * (64 * solids) ** 2 : null;
    lastShape.solids = solids;
    lastShape.matcher = { palette: core.palette, core, tolerance, match: (s) => core.match(s, tolerance) };
  }
  return lastShape.matcher;
}

function makeShapeMatcher(palette, glyphs, light, style) {
  const nearest = palette && nearestOf(palette);
  const solidChar = glyphs.some((g) => g.char === '█') ? '█' : glyphs.some((g) => g.char === '▄') ? '▄' : glyphs[0]?.char ?? '▄';
  // Per glyph: its mask's sums, and each sample's place among its distinct ink levels (each level's
  // color is mixed once a glyph, not once a sample).
  const prepared = glyphs.map(({ char, mask }) => {
    const levels = [...new Set(mask)];
    let m1 = 0, m0 = 0, m2 = 0;
    for (const m of mask) { m1 += m; m0 += 1 - m; m2 += m * m; }
    return { char, mask, m1, m0, m2, levels: Float64Array.from(levels), at: Uint8Array.from(mask, (m) => levels.indexOf(m)), gray: Float64Array.from(mask, (m) => mixChannel(0, 255, m, light)) };
  });
  const most = Math.max(1, ...prepared.map((g) => g.levels.length));
  const shownAt = new Float64Array(most * 3), lum = new Float64Array(N);
  const res = { char: '', fg: null, bg: null, shown: new Float32Array(N * 3) };
  const sum = new Float64Array(3), fit = new Float64Array(3), fitBg = new Float64Array(3);
  const fg = new Float64Array(3), bg = new Float64Array(3), solid = new Float64Array(3), bestFg = new Float64Array(3), bestBg = new Float64Array(3);
  // Monochrome's white, as buildCell makes it (its c the palette's nearest to white).
  const white = buildCell({ r: 0, g: 0, b: 0 }, nearest ? nearest(255, 255, 255) : { r: 255, g: 255, b: 255 }, '', 'ascii').fg;
  const byte = (v) => Math.round(clamp(v));
  // v (rounded) snapped to the palette into out, or just rounded; the palette entry or null.
  const snap = (v, out) => {
    const p = nearest ? nearest(byte(v[0]), byte(v[1]), byte(v[2])) : null;
    if (p) { out[0] = p.r; out[1] = p.g; out[2] = p.b; } else for (let k = 0; k < 3; k++) out[k] = byte(v[k]);
    return p;
  };
  // The squared error of a glyph showing bg mixed with fg by its mask, stopped once it reaches bound.
  const errOf = (g, s, bound) => {
    const { levels, at } = g;
    for (let l = 0; l < levels.length; l++) {
      for (let k = 0; k < 3; k++) shownAt[l * 3 + k] = mixChannel(bg[k], fg[k], levels[l], light);
    }
    let e = 0;
    for (let i = 0; i < N && e < bound; i++) {
      const o = at[i] * 3, j = i * 3;
      e += (shownAt[o] - s[j]) ** 2 + (shownAt[o + 1] - s[j + 1]) ** 2 + (shownAt[o + 2] - s[j + 2]) ** 2;
    }
    return e;
  };

  function matchMono(s) {
    for (let i = 0; i < N; i++) lum[i] = Math.round(0.2126 * s[i * 3] + 0.7152 * s[i * 3 + 1] + 0.0722 * s[i * 3 + 2]);
    let best = Infinity, won = prepared[0];
    for (const g of prepared) {
      let e = 0;
      for (let i = 0; i < N && e < best; i++) e += (lum[i] - g.gray[i]) ** 2;
      if (e < best) best = e, won = g;
    }
    res.char = won.char; res.fg = white; res.bg = ASCII_BG;
    for (let i = 0; i < N; i++) res.shown[i * 3] = res.shown[i * 3 + 1] = res.shown[i * 3 + 2] = won.gray[i];
    return res;
  }

  function match(s, tolerance) {
    if (style === 'ascii') return matchMono(s);
    const ansi = style === 'ansi';
    sum.fill(0);
    for (let i = 0; i < N * 3; i += 3) { sum[0] += s[i]; sum[1] += s[i + 1]; sum[2] += s[i + 2]; }
    // The solid (ANSI): a glyph has to come closer than its error less the tolerance to be taken over
    // it. Glyphs never empty (glyphsOf gives ▄), so the ASCII styles always have one.
    let solidP = null, bound = Infinity;
    if (ansi) {
      for (let k = 0; k < 3; k++) fit[k] = sum[k] / N;
      solidP = snap(fit, solid);
      let e = 0;
      for (let i = 0; i < N * 3; i += 3) e += (solid[0] - s[i]) ** 2 + (solid[1] - s[i + 1]) ** 2 + (solid[2] - s[i + 2]) ** 2;
      bound = e - tolerance;
    }
    let best = bound, won = null, wonFg = null, wonBg = null;
    for (const g of prepared) {
      const { mask, m1, m0, m2 } = g;
      fit.fill(0); fitBg.fill(0);
      for (let i = 0, j = 0; i < N; i++, j += 3) {
        const m = mask[i];
        fit[0] += m * s[j]; fit[1] += m * s[j + 1]; fit[2] += m * s[j + 2];
        if (ansi) { const u = 1 - m; fitBg[0] += u * s[j]; fitBg[1] += u * s[j + 1]; fitBg[2] += u * s[j + 2]; }
      }
      let F, B = null;
      if (ansi) {
        for (let k = 0; k < 3; k++) { fit[k] = m1 ? fit[k] / m1 : sum[k] / N; fitBg[k] = m0 ? fitBg[k] / m0 : sum[k] / N; }
        F = snap(fit, fg); B = snap(fitBg, bg);
      } else {
        for (let k = 0; k < 3; k++) fit[k] = m2 ? fit[k] / m2 : 0;
        F = snap(fit, fg); bg.fill(0);
      }
      const e = errOf(g, s, best);
      if (e < best) { best = e; won = g; wonFg = F; wonBg = B; bestFg.set(fg); bestBg.set(bg); }
    }
    if (!won) { // the solid
      res.char = solidChar;
      res.fg = res.bg = solidP ?? colorOf({ r: solid[0], g: solid[1], b: solid[2] });
      for (let i = 0; i < N * 3; i += 3) res.shown.set(solid, i);
      return res;
    }
    res.char = won.char;
    res.fg = wonFg ?? colorOf({ r: bestFg[0], g: bestFg[1], b: bestFg[2] });
    res.bg = ansi ? wonBg ?? colorOf({ r: bestBg[0], g: bestBg[1], b: bestBg[2] }) : ASCII_BG;
    for (let i = 0; i < N; i++) {
      const m = won.mask[i];
      for (let k = 0; k < 3; k++) res.shown[i * 3 + k] = mixChannel(bestBg[k], bestFg[k], m, light);
    }
    return res;
  }
  return { kind: 'shape', palette, glyphs, solidChar, light, style, white, match };
}

// By shape over the grid: a cell ({ char, fg, bg }) for each of lines x cols, from samples (RGBA,
// cols x SAMPLES.w wide, at least lines x SAMPLES.h tall), Dither's error carried from each sample to
// the same sample of the cells after it or nudged by the cell's place (walkCells), the nudge sized to
// palette. area and cells as resolveGrid's. The error isn't kept (carried is null): an area is
// resolved with none coming in (an open edit), and the whole grid catches up when it ends.
export function resolveShapes(samples, cols, lines, matcher, { strength = 0, style = 'floyd', area = null, palette = matcher.palette, cells = new Array(cols * lines) } = {}) {
  const spread = nudgeSpread(palette);
  walkCells(samples, cols, lines, { sw: SAMPLES.w, sh: SAMPLES.h, strength, style, area, spread, keep: false }, (i, col, line, s) => {
    const r = matcher.match(s);
    cells[i] = { char: r.char, fg: r.fg, bg: r.bg };
    return r.shown;
  });
  return { cells, carried: null };
}

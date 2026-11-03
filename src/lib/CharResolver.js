// Choosing a cell's character: the mode the settings come to, and what it asks of the pipeline.
// No DOM and no translations here: the unit tests run it in Node.
import { BAYER, nudgeSpread } from './Dither.js';
import { charRowsOf } from './Cells.js';

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

// Whether the resolver needs the error Floyd–Steinberg passes on.
export const carriesError = (params) => resolves(params) && params.dither > 0 && params.ditherStyle !== 'bayer';

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
// levels a channel) and Pattern light (0..1). The last one made is kept while those stay the same.
let last = null;
export function bestMatcher({ palette, glyphs, solids = 0, light = 0 }) {
  const key = glyphs.map(({ char, ink }) => char + ink.join()).join('|');
  if (last?.palette === palette && last.key === key && last.solids === solids && last.light === light) return last.matcher;
  last = { palette, key, solids, light, matcher: makeMatcher(palette?.length ? palette : null, glyphs, solids, light) };
  return last.matcher;
}

function makeMatcher(palette, glyphs, solids, light) {
  const chars = new Set(glyphs.map(({ char }) => char));
  const has = (char) => chars.has(char);
  // A solid (fg = bg) needs no █ in the set: it's written as █ if the set has it, else ▄, else the first.
  const solidChar = has('█') ? '█' : has('▄') ? '▄' : glyphs[0]?.char ?? '▄';
  const tolerance = 6 * (64 * solids) ** 2;
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

  // Reused for every cell: the result (copy what you keep), the candidate and the best so far.
  const res = { char: '', fg: null, bg: null, top: new Float64Array(3), bottom: new Float64Array(3) };
  const top = new Float64Array(3), bottom = new Float64Array(3), fgv = new Float64Array(3), bgv = new Float64Array(3);
  const bestFg = new Float64Array(3), bestBg = new Float64Array(3);
  const color = (v) => ({ r: v[0], g: v[1], b: v[2] });
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

  function match(t, b) {
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
  return { palette, match };
}

// Each cell's two halves (raw: cols x rows RGBA, kept within 0..255) in order, with Dither's error
// carried in or its nudge added, given to visit(i, col, line, t, b); visit returns what the cell
// shows ({ top, bottom }, number[3] each) for the error Floyd–Steinberg passes on. Returns the
// error that arrived at each half (cols x rows x 3) when Floyd–Steinberg runs, else null.
// - 'floyd': each half's error x strength goes to the same half of the cells right (7/16),
//   below-left (3/16), below (5/16) and below-right (1/16).
// - 'bayer': both halves nudged by the cell's place in the 4x4 pattern x spread x strength.
// With area (grid pixels), only the cells over it, with the error that arrived (carried), and
// nothing passed on: an open edit.
export function walkCells(raw, cols, rows, { strength = 0, style = 'floyd', area = null, carried = null, spread = 0 }, visit) {
  const lines = charRowsOf(rows);
  const floyd = strength > 0 && style !== 'bayer';
  const bayer = strength > 0 && style === 'bayer';
  const carry = floyd ? (area ? carried : new Float32Array(cols * rows * 3)) : null;
  const pass = floyd && !area;
  const c0 = area ? Math.max(0, area.x) : 0, c1 = area ? Math.min(cols, area.x + area.w) : cols;
  const l0 = area ? Math.max(0, Math.floor(area.y / 2)) : 0;
  const l1 = area ? Math.min(lines, Math.floor((area.y + area.h - 1) / 2) + 1) : lines;
  const t = new Float64Array(3), b = new Float64Array(3);
  const push = (p, e, f) => { carry[p] += e[0] * f; carry[p + 1] += e[1] * f; carry[p + 2] += e[2] * f; };
  const et = new Float64Array(3), eb = new Float64Array(3);
  // A half's error to the same half of the cells right, below-left, below and below-right.
  const spill = (p, e, col, line) => {
    const q = p + 2 * cols;
    if (col + 1 < cols) push((p + 1) * 3, e, 7 / 16);
    if (line + 1 >= lines) return;
    if (col > 0) push((q - 1) * 3, e, 3 / 16);
    push(q * 3, e, 5 / 16);
    if (col + 1 < cols) push((q + 1) * 3, e, 1 / 16);
  };
  for (let line = l0; line < l1; line++) {
    for (let col = c0; col < c1; col++) {
      const pt = 2 * line * cols + col, pb = pt + cols;
      const nudge = bayer ? (BAYER[(line & 3) * 4 + (col & 3)] / 16 - 15 / 32) * spread * strength : 0;
      for (let k = 0; k < 3; k++) {
        t[k] = clamp(raw[pt * 4 + k] + nudge + (carry ? carry[pt * 3 + k] : 0));
        b[k] = clamp(raw[pb * 4 + k] + nudge + (carry ? carry[pb * 3 + k] : 0));
      }
      const shown = visit(line * cols + col, col, line, t, b);
      if (!pass) continue;
      for (let k = 0; k < 3; k++) {
        et[k] = (t[k] - shown.top[k]) * strength;
        eb[k] = (b[k] - shown.bottom[k]) * strength;
      }
      spill(pt, et, col, line); spill(pb, eb, col, line);
    }
  }
  return floyd ? carry : null;
}

// Best match over the grid: a cell ({ char, fg, bg }) for each of charRowsOf(rows) lines of cols,
// Dither's error carried or nudged as walkCells does. With area, the cells outside it are left out.
export function resolveGrid(raw, cols, rows, matcher, { strength = 0, style = 'floyd', area = null, carried = null } = {}) {
  const cells = new Array(cols * charRowsOf(rows));
  const spread = nudgeSpread(matcher.palette);
  const out = walkCells(raw, cols, rows, { strength, style, area, carried, spread }, (i, col, line, t, b) => {
    const r = matcher.match(t, b);
    cells[i] = { char: r.char, fg: r.fg, bg: r.bg };
    return r;
  });
  return { cells, carried: out };
}

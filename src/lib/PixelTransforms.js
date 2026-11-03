// JS port of the GLSL applyCSSFilters shader in WebGLProcessor.js.
// Applies the same brightness/contrast/saturation/hue/invert transforms to a
// raw Uint8ClampedArray (from ImageData) so the edit layer can be transformed
// to match the pipeline output without relying on ctx.filter (no Safari < 18 support).

import { hex2rgb, rgb2hex, nearestColor } from './ColorUtils.js';
import { ctx2d } from './Canvas.js';

const clamp01 = (c) => Math.max(0, Math.min(1, c));
const round8 = (c) => Math.round(c * 255) / 255; // as an 8-bit pixel holds it, like the shader's round8

function rgb2hsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h;
  if (d === 0) h = 0;
  else if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, max === 0 ? 0 : d / max, max];
}

function hsv2rgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    case 5: return [v, p, q];
  }
}

// Whether any color adjustment is off neutral (a setting not given is neutral).
export function transformsOn(params) {
  const n = (key, neutral) => parseFloat(params[key] ?? neutral) !== neutral;
  return n('brightness', 100) || n('contrast', 100) || n('saturation', 100) || n('hue', 0) || n('invert', 0) || n('colorizeStrength', 0)
    || n('levelsBlack', 0) || n('levelsWhite', 255) || n('levelsMid', 1) || parseFloat(params.posterize ?? 1) > 1 || n('threshold', 0);
}

// Applies the color adjustments in `params` (levels, brightness, contrast, colorize, saturation, hue, invert,
// posterize, threshold; one not given is neutral) to `data` (Uint8ClampedArray) in place. Transparent pixels
// (alpha === 0) are skipped. Matches the GLSL applyCSSFilters order.
export function applyTransforms(data, params) {
  const {
    brightness = 100, contrast = 100, saturation = 100, hue = 0, invert = 0, colorize = '#ff00ff', colorizeStrength = 0,
    levelsBlack = 0, levelsWhite = 255, levelsMid = 1, posterize = 1, threshold = 0, thresholdDark = '#000000', thresholdLight = '#ffffff',
  } = params;
  const lo = parseFloat(levelsBlack) / 255, hi = parseFloat(levelsWhite) / 255, gamma = parseFloat(levelsMid);
  const levels = lo !== 0 || hi !== 1 || gamma !== 1;
  const span = Math.max(hi - lo, 1 / 255);
  const steps = parseFloat(posterize) - 1;
  const cut = parseFloat(threshold) * 10000; // against 2126 R + 7152 G + 722 B, as the shader does
  const [dark, light] = [thresholdDark, thresholdLight].map((hex) => { const { r, g, b } = hex2rgb(hex); return [r / 255, g / 255, b / 255]; });
  const br = parseFloat(brightness) / 100;
  const ct = parseFloat(contrast) / 100;
  const sa = parseFloat(saturation) / 100;
  const hu = (parseFloat(hue) / 360) % 1;
  const inv = parseFloat(invert) / 100;
  const cStr = parseFloat(colorizeStrength) / 100;

  let targetH = 0, targetS = 0;
  if (cStr > 0) {
    const { r, g, b } = hex2rgb(colorize);
    [targetH, targetS] = rgb2hsv(r / 255, g / 255, b / 255);
  }

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    // Levels
    if (levels) {
      r = clamp01((r - lo) / span) ** (1 / gamma);
      g = clamp01((g - lo) / span) ** (1 / gamma);
      b = clamp01((b - lo) / span) ** (1 / gamma);
    }

    // Brightness
    r *= br; g *= br; b *= br;

    // Contrast
    r = (r - 0.5) * ct + 0.5;
    g = (g - 0.5) * ct + 0.5;
    b = (b - 0.5) * ct + 0.5;

    // Colorize (Applied before saturation/hue/invert to match GLSL order if we put it there)
    // Actually, in the fragment shader, I should decide where it goes.
    // Usually it replaces saturation/hue or is applied instead.
    if (cStr > 0) {
      const [, , v] = rgb2hsv(Math.max(0, r), Math.max(0, g), Math.max(0, b));
      const [cr, cg, cb] = hsv2rgb(targetH, targetS, v);
      r = r * (1 - cStr) + cr * cStr;
      g = g * (1 - cStr) + cg * cStr;
      b = b * (1 - cStr) + cb * cStr;
    }

    // Saturation & Hue
    if (sa !== 1 || hu !== 0) {
      const [h, s, v] = rgb2hsv(Math.max(0, r), Math.max(0, g), Math.max(0, b));
      const nh = (h + hu + 1) % 1;
      const ns = Math.max(0, s * sa);
      [r, g, b] = hsv2rgb(nh, ns, v);
    }

    // Invert
    r = r * (1 - inv) + (1 - r) * inv;
    g = g * (1 - inv) + (1 - g) * inv;
    b = b * (1 - inv) + (1 - b) * inv;
    r = clamp01(r); g = clamp01(g); b = clamp01(b);

    // Posterize and Threshold decide on 8-bit colors, as the shader does (see there).
    if (steps > 0.5 || cut > 0) {
      r = round8(r); g = round8(g); b = round8(b);
      // Posterize
      if (steps > 0.5) {
        r = round8(Math.floor(r * steps + 0.5) / steps);
        g = round8(Math.floor(g * steps + 0.5) / steps);
        b = round8(Math.floor(b * steps + 0.5) / steps);
      }
      // Threshold
      if (cut > 0) [r, g, b] = 2126 * Math.round(r * 255) + 7152 * Math.round(g * 255) + 722 * Math.round(b * 255) >= cut ? light : dark;
    }

    data[i]     = Math.round(clamp01(r) * 255);
    data[i + 1] = Math.round(clamp01(g) * 255);
    data[i + 2] = Math.round(clamp01(b) * 255);
  }
}

// A copy of a canvas with the color transforms burnt into its pixels (a bake's paint and base
// pixels): alpha kept, transparent pixels left alone, as the display transforms them.
export function bakedCanvas(canvas, params) {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  if (!out.width || !out.height) return out;
  const ctx = ctx2d(out);
  ctx.drawImage(canvas, 0, 0);
  const pixels = ctx.getImageData(0, 0, out.width, out.height);
  applyTransforms(pixels.data, params);
  ctx.putImageData(pixels, 0, 0);
  return out;
}

// What a base color looks like after project-wide transforms and quantization are applied, as a
// cell Color: { r, g, b, hex, c } where c is the palette index, or [r, g, b] without a palette.
export function effectiveColor(hex, params, palette = null) {
  const rgb = hex2rgb(hex);
  const data = new Uint8ClampedArray([rgb.r, rgb.g, rgb.b, 255]);
  applyTransforms(data, params);
  const transformed = { r: data[0], g: data[1], b: data[2] };
  if (!palette || !palette.length) return { ...transformed, hex: rgb2hex(transformed), c: [transformed.r, transformed.g, transformed.b] };
  const { r, g, b, c } = nearestColor(transformed, palette);
  return { r, g, b, hex: rgb2hex({ r, g, b }), c };
}

export function getEffectiveColor(hex, params, palette = null) {
  return effectiveColor(hex, params, palette).hex;
}

// The color picker's swatches: for each palette color, a stored color that displays as it under the
// color adjustments, so every palette color can be painted with. The palette color itself when it
// displays as itself (always, with the adjustments neutral); else the color nearest it, from a
// grid of colors, that does; else (the adjustments can't make it) the palette color itself.
// ponytail: an 8-step grid (33³ colors); a finer one if a narrow adjustment ever misses a color.
export function paletteChoices(params, palette) {
  const key = (hex) => hex.toLowerCase();
  const choices = palette.map(p => (effectiveColor(p.hex, params, palette).hex === key(p.hex) ? p.hex : null));
  if (choices.every(Boolean)) return choices;

  const levels = Array.from({ length: 33 }, (_, i) => Math.min(255, i * 8));
  const data = new Uint8ClampedArray(levels.length ** 3 * 4);
  let o = 0;
  for (const r of levels) for (const g of levels) for (const b of levels) data.set([r, g, b, 255], (o++) * 4);
  const grid = data.slice();
  applyTransforms(data, params);

  const best = new Map(); // palette hex -> { hex, d }: the grid color nearest it that displays as it
  for (let i = 0; i < data.length; i += 4) {
    const shown = key(nearestColor({ r: data[i], g: data[i + 1], b: data[i + 2] }, palette).hex);
    const target = hex2rgb(shown);
    const d = (grid[i] - target.r) ** 2 + (grid[i + 1] - target.g) ** 2 + (grid[i + 2] - target.b) ** 2;
    if (!(best.get(shown)?.d <= d)) best.set(shown, { hex: rgb2hex({ r: grid[i], g: grid[i + 1], b: grid[i + 2] }), d });
  }
  return choices.map((hex, i) => hex ?? best.get(key(palette[i].hex))?.hex ?? palette[i].hex);
}

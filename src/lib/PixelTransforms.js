// JS port of the GLSL applyCSSFilters shader in WebGLProcessor.js.
// Applies the same brightness/contrast/saturation/hue/invert transforms to a
// raw Uint8ClampedArray (from ImageData) so the edit layer can be transformed
// to match the pipeline output without relying on ctx.filter (no Safari < 18 support).

import { hex2rgb, rgb2hex, nearestColor } from './ColorUtils.js';
import { ctx2d } from './Canvas.js';

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

// Applies brightness/contrast/saturation/hue/invert/colorize to `data` (Uint8ClampedArray) in place.
// Transparent pixels (alpha === 0) are skipped. Matches the GLSL applyCSSFilters order.
export function applyTransforms(data, brightness, contrast, saturation, hue, invert, colorize = '#ff00ff', colorizeStrength = 0) {
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

    data[i]     = Math.round(Math.max(0, Math.min(1, r)) * 255);
    data[i + 1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
    data[i + 2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
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
  applyTransforms(pixels.data, params.brightness, params.contrast, params.saturation, params.hue, params.invert, params.colorize, params.colorizeStrength);
  ctx.putImageData(pixels, 0, 0);
  return out;
}

// What a base color looks like after project-wide transforms and quantization are applied, as a
// cell Color: { r, g, b, hex, c } where c is the palette index, or [r, g, b] without a palette.
export function effectiveColor(hex, params, palette = null) {
  const rgb = hex2rgb(hex);
  const data = new Uint8ClampedArray([rgb.r, rgb.g, rgb.b, 255]);
  applyTransforms(data, params.brightness, params.contrast, params.saturation, params.hue, params.invert, params.colorize, params.colorizeStrength);
  const transformed = { r: data[0], g: data[1], b: data[2] };
  if (!palette || !palette.length) return { ...transformed, hex: rgb2hex(transformed), c: [transformed.r, transformed.g, transformed.b] };
  const { r, g, b, c } = nearestColor(transformed, palette);
  return { r, g, b, hex: rgb2hex({ r, g, b }), c };
}

export function getEffectiveColor(hex, params, palette = null) {
  return effectiveColor(hex, params, palette).hex;
}

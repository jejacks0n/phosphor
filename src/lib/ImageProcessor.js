/**
 * Orchestrates the image processing pipeline:
 */

import { rgb2hex, hex2rgb, PALETTES } from './ColorUtils.js';
import Canvas, { fitRect, ctx2d } from './Canvas.js';
import WebGLProcessor from './WebGLProcessor.js';
import quantizeColors from './Quantizer.js';

let glProcessor;
const customPalettes = {};

export function getPaletteColors(params, canvasForCount = null) {
  const { quantize, palette, colorCount } = params;

  switch (quantize) {
    case 'count':
      if (!canvasForCount) return null;
      return quantizeColors(canvasForCount.getImageData(), colorCount).map(function (c, i) {
        const hex = rgb2hex(c);
        return { r: c.r, g: c.g, b: c.b, c: i, hex };
      });
    case 'palette':
      if (!customPalettes.cache || customPalettes.str !== palette) {
        customPalettes.str = palette;
        customPalettes.cache = palette.split(' ').filter(Boolean).map((hex, i) => {
          const c = hex2rgb(hex);
          return { r: c.r, g: c.g, b: c.b, c: i, hex };
        });
      }
      return customPalettes.cache;
    case 'cga': return PALETTES.cga;
    case 'vga': return PALETTES.vga;
    default: return null;
  }
}

export function applyQuantization(canvas, qColors) {
  if (qColors && qColors.length > 0) {
    canvas.quantize(qColors);
    canvas.writePixels();
  }
}

// Where the image goes in the grid, the size it's processed at (m processed pixels per grid pixel,
// or the native-size branch: m < 1) and the shader's parameters. scale: a fixed m instead.
function prepare(image, params, scale = null) {
  const {
    cols, rows,
    invert, brightness, contrast, saturation,
    sharpen, flatten, edges, edgeColor, edgeThickness,
    quantize
  } = params;

  const sw = image.naturalWidth || image.width;
  const sh = image.naturalHeight || image.height;

  // Processing stage (High-ish res WebGL)
  // Process at a whole multiple m of the grid fit so every cell is exactly m x m processed pixels;
  // a fractional ratio lets cells straddle pixels and blurs merged paint into its neighbors.
  // m comes from the grid (not the fit), so an image that fills the grid gets the same m as its fit.
  const maxDim = 400;
  // Where the image sits in the grid: params.fit when it's fixed (a canvas resize), else fitted.
  const { dx, dy, dw, dh } = params.fit ?? fitRect(sw, sh, cols, rows);
  const m = scale ?? Math.min(Math.max(2, Math.floor(maxDim / Math.max(cols, rows))), Math.floor(Math.min(sw / dw, sh / dh)));
  let pw = dw * m;
  let ph = dh * m;
  if (m < 1) {
    // Source smaller than the grid: keep it at native size rather than upscaling (blurring) it
    const s = Math.min(1, maxDim / Math.max(sw, sh));
    pw = Math.floor(sw * s);
    ph = Math.floor(sh * s);
  }

  const ec = hex2rgb(edgeColor);
  const cz = hex2rgb(params.colorize || '#ff00ff');
  const glParams = {
    hue: parseFloat(params.hue),
    brightness: parseFloat(brightness),
    contrast: parseFloat(contrast),
    saturation: parseFloat(saturation),
    invert: parseFloat(invert),
    colorize: [cz.r / 255, cz.g / 255, cz.b / 255],
    colorizeStrength: parseFloat(params.colorizeStrength || 0),
    sharpen: parseFloat(sharpen),
    flatten: parseFloat(flatten),
    edges: parseFloat(edges),
    edgeColor: [ec.r / 255, ec.g / 255, ec.b / 255],
    edgeThickness: parseFloat(edgeThickness),
    palette: (quantize === 'cga' || quantize === 'vga') ? PALETTES[quantize] : null,
    passes: Math.max(1, Math.floor(parseFloat(flatten) / 2))
  };
  return { dx, dy, dw, dh, m, pw, ph, glParams };
}

// Processed pixels per grid pixel, or null when a source smaller than the grid is processed at its
// native size (cells don't cover whole pixels there).
export function workingScale(image, params) {
  const { m } = prepare(image, params);
  return m >= 1 ? m : null;
}

export async function processImage(image, params) {
  const { cols, rows, smoothing } = params;
  const { dx, dy, dw, dh, pw, ph, glParams } = prepare(image, params);
  if (!glProcessor) glProcessor = new WebGLProcessor();
  glProcessor.process(image, glParams, pw, ph);

  // Final output stage (downsizing)
  const canvas = new Canvas();
  canvas.resize(cols, rows);
  canvas.ctx.imageSmoothingEnabled = true;
  canvas.ctx.imageSmoothingQuality = smoothing;
  // Fit by the image's natural aspect (the store's fit), not pw x ph
  canvas.drawManual(glProcessor.canvas, dx, dy, dw, dh, smoothing);
  canvas.loadPixels();

  // Quantization happens after paint is composited (Renderer), not here. The Number palette is picked
  // there too, from the composited picture (Renderer.composite), so it isn't worked out here.
  return { canvas, paletteColors: params.quantize === 'count' ? null : getPaletteColors(params, canvas) };
}

// The image as the preview is made from it (the processed image before it's downsized to the
// grid, at the size processImage processes it), without the palette snap in its last pass unless
// snap (a bake locked to CGA/VGA): what a bake makes the new image. A copy, so the next render can't
// draw over it. m: a fixed processing scale (an Into-the-picture merge needs whole pixels per grid pixel).
export async function processedImage(image, params, { m = null, snap = false } = {}) {
  const { pw, ph, glParams } = prepare(image, params, m);
  if (!glProcessor) glProcessor = new WebGLProcessor();
  glProcessor.process(image, glParams, pw, ph, { snapLastPass: snap });
  const out = document.createElement('canvas');
  out.width = pw;
  out.height = ph;
  ctx2d(out).drawImage(glProcessor.canvas, 0, 0);
  return out;
}

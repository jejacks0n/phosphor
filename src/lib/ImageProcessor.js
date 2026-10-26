/**
 * Orchestrates the image processing pipeline:
 */

import { rgb2hex, hex2rgb, PALETTES } from './ColorUtils.js';
import Canvas, { fitRect, ctx2d } from './Canvas.js';
import WebGLProcessor from './WebGLProcessor.js';
import quantizeColors from './Quantizer.js';

let glProcessor;
let glBase; // the base layer's own, so the pipeline's processor keeps the picture uploaded
const customPalettes = {};

// The longest side, in pixels, this GPU processes a picture at (16384 on most, 8192 on software WebGL).
export const gpuMaxSide = () => (glProcessor ??= new WebGLProcessor()).maxSide;

// A processing scale m (pixels a grid pixel) lowered so a dw x dh picture at it fits the GPU; 0 when
// even one pixel a grid pixel doesn't.
export const fittingScale = (m, dw, dh) => Math.min(m, Math.floor(gpuMaxSide() / Math.max(dw, dh)));

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

// Where the image goes in the grid, the size it's processed at (m processed pixels per grid pixel,
// or the native-size branch: m < 1) and the shader's parameters. scale: a fixed m instead.
function prepare(image, params, scale = null) {
  const { cols, rows } = params;

  const sw = image.naturalWidth || image.width;
  const sh = image.naturalHeight || image.height;

  // Processing stage (High-ish res WebGL)
  // Process at a whole multiple m of the grid fit so every cell is exactly m x m processed pixels;
  // a fractional ratio lets cells straddle pixels and blurs merged paint into its neighbors.
  // m comes from the grid (not the fit), so an image that fills the grid gets the same m as its fit.
  // While the base layer exists, m is its scale (params.workScale): its pixels are processed pixels,
  // and a canvas resize keeps both. Not a scale of 1: that base was made for an image smaller than
  // the grid (processed at its own size, no whole pixels to keep), and holding a working-size copy
  // of it (Into the image) to 1 would shrink the picture to the grid.
  const maxDim = 400;
  // Where the image sits in the grid: params.fit when it's fixed (a canvas resize), else fitted.
  const { dx, dy, dw, dh } = params.fit ?? fitRect(sw, sh, cols, rows);
  const natural = Math.min(Math.max(2, Math.floor(maxDim / Math.max(cols, rows))), Math.floor(Math.min(sw / dw, sh / dh)));
  let m = scale ?? (params.workScale > 1 && natural >= 1 ? params.workScale : natural);
  // A long grid at m pixels a grid pixel can be more than the GPU draws (the picture would come out
  // black): m drops to fit, to below 1 if it must, and the picture is processed as large as it can be.
  const limit = gpuMaxSide(), capped = scale === null && m >= 1 && Math.max(dw, dh) * m > limit;
  if (capped) m = Math.floor(limit / Math.max(dw, dh));
  let pw = dw * m;
  let ph = dh * m;
  if (m < 1) {
    // Source smaller than the grid: keep it at native size rather than upscaling (blurring) it
    const s = Math.min(1, (capped ? limit : maxDim) / Math.max(sw, sh));
    pw = Math.floor(sw * s);
    ph = Math.floor(sh * s);
  }

  return { dx, dy, dw, dh, m, pw, ph, glParams: shaderParams(params) };
}

// The shader's parameters for the pipeline params.
function shaderParams(params) {
  const { invert, brightness, contrast, saturation, sharpen, flatten, edges, edgeColor, edgeThickness, quantize } = params;
  const ec = hex2rgb(edgeColor);
  const cz = hex2rgb(params.colorize || '#ff00ff');
  return {
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
}

// A canvas's pixels through the shader's color adjustments and CGA/VGA snap, and nothing else (no
// effects, nothing resampled): the base layer, drawn the way the pipeline draws the picture. The
// snap has to be the shader's own, which can pick another color than an exact nearest-color search
// would. Alpha is the canvas's.
// A canvas taller than the GPU draws goes through in bands (each pixel is its own: nothing reads its
// neighbors, so a band comes out as the whole would).
export function adjustedPixels(canvas, params) {
  const { width: w, height: h } = canvas;
  glBase ??= new WebGLProcessor();
  const band = Math.max(1, Math.min(h, glBase.maxSide));
  const pixels = new Uint8ClampedArray(w * h * 4);
  const out = Object.assign(document.createElement('canvas'), { width: w, height: band });
  const ctx = ctx2d(out);
  for (let y = 0; y < h; y += band) {
    const bh = Math.min(band, h - y);
    let part = canvas;
    if (bh !== h) {
      part = Object.assign(document.createElement('canvas'), { width: w, height: bh });
      ctx2d(part).drawImage(canvas, 0, y, w, bh, 0, 0, w, bh);
    }
    glBase.process(part, { ...shaderParams(params), sharpen: 0, flatten: 0, edges: 0, passes: 1 }, w, bh);
    ctx.clearRect(0, 0, w, band);
    ctx.drawImage(glBase.canvas, 0, 0);
    pixels.set(ctx.getImageData(0, 0, w, bh).data, y * w * 4);
  }
  const own = ctx2d(canvas).getImageData(0, 0, w, h).data;
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = own[i];
  return pixels;
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
  glProcessor ??= new WebGLProcessor();
  glProcessor.process(image, glParams, pw, ph);

  // Final output stage (downsizing)
  const canvas = new Canvas();
  canvas.resize(cols, rows);
  canvas.ctx.imageSmoothingEnabled = true;
  canvas.ctx.imageSmoothingQuality = smoothing;
  // Fit by the image's natural aspect (the store's fit), not pw x ph
  canvas.drawManual(glProcessor.canvas, dx, dy, dw, dh, smoothing);

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

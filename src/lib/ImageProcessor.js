/**
 * Orchestrates the image processing pipeline:
 */

import Random from 'random-seed';
import { rgb2hex, hex2rgb, PALETTES } from './ColorUtils.js';
import Canvas from './Canvas.js';
import WebGLProcessor from './WebGLProcessor.js';
import quantizeColors from './Quantizer.js';

let glProcessor;
const customPalettes = {};

export function getPaletteColors(params, canvasForCount = null) {
  const { quantize, palette, colorCount } = params;
  
  switch (quantize) {
    case 'count':
      if (!canvasForCount) return null;
      return quantizeColors(canvasForCount.getImageData(), colorCount).map(function (c) {
        const hex = rgb2hex(c);
        return { r: c.r, g: c.g, b: c.b, c: [c.r, c.g, c.b], hex };
      });
    case 'palette':
      if (!customPalettes.cache || customPalettes.str !== palette) {
        customPalettes.str = palette;
        customPalettes.cache = palette.split(' ').filter(Boolean).map((hex) => {
          const c = hex2rgb(hex);
          return { r: c.r, g: c.g, b: c.b, c: [c.r, c.g, c.b], hex };
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

export async function processImage(image, params) {
  const {
    seed, cols, rows, chars, smoothing,
    invert, brightness, contrast, saturation,
    sharpen, flatten, edges, edgeColor, edgeThickness,
    quantize, alphaMode
  } = params;

  const rand = new Random(seed);
  const sw = image.naturalWidth || image.width;
  const sh = image.naturalHeight || image.height;

  // 1. Processing stage (High-ish res WebGL)
  const maxDim = 400;
  let pw = sw;
  let ph = sh;
  if (sw > maxDim || sh > maxDim) {
    const ratio = sw / sh;
    pw = ratio > 1 ? maxDim : maxDim * ratio;
    ph = ratio > 1 ? maxDim / ratio : maxDim;
  }
  pw = Math.floor(pw);
  ph = Math.floor(ph);

  if (!glProcessor) glProcessor = new WebGLProcessor();
  
  const ec = hex2rgb(edgeColor);
  const glParams = {
    hue: parseFloat(params.hue),
    brightness: parseFloat(brightness),
    contrast: parseFloat(contrast),
    saturation: parseFloat(saturation),
    invert: parseFloat(invert),
    sharpen: parseFloat(sharpen),
    flatten: parseFloat(flatten),
    edges: parseFloat(edges),
    edgeColor: [ec.r / 255, ec.g / 255, ec.b / 255],
    edgeThickness: parseFloat(edgeThickness),
    palette: (quantize === 'cga' || quantize === 'vga') ? PALETTES[quantize] : null,
    passes: Math.max(1, Math.floor(parseFloat(flatten) / 2))
  };

  glProcessor.process(image, glParams, pw, ph);

  // 2. Final output stage (downsizing)
  const canvas = new Canvas();
  canvas.resize(cols, rows);
  canvas.ctx.imageSmoothingEnabled = true;
  canvas.ctx.imageSmoothingQuality = smoothing;
  canvas.fit(glProcessor.canvas, smoothing);
  canvas.loadPixels();

  // 3. Quantization (Only if not in editing mode, which will re-run it)
  // If alphaMode is on, we skip quantization here and let the Workspace handle it after compositing.
  let blockData = null;
  if (!alphaMode) {
    const qColors = getPaletteColors(params, canvas);
    if (qColors) {
      applyQuantization(canvas, qColors);
    }

    const targetDataLength = cols * rows;
    blockData = new Array(targetDataLength);
    const charset = chars || "▄";

    for (let i = 0; i < targetDataLength; i++) {
      const pixel = canvas.pixels[i];
      if (!pixel) continue;
      pixel.char = charset[rand(charset.length)];
      pixel.hex = rgb2hex(pixel);
      pixel.c ??= [pixel.r, pixel.g, pixel.b];
      blockData[i] = pixel;
    }
    return { canvas, blockData, paletteColors: qColors };
  }

  return { canvas, blockData, paletteColors: getPaletteColors(params, canvas) };
}

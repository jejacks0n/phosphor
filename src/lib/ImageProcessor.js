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

export async function processImage(image, params) {
  const {
    seed, cols, rows, chars, smoothing,
    invert, brightness, contrast, saturation,
    sharpen, flatten, edges, edgeColor, edgeThickness,
    quantize, palette, colorCount
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

  // 3. Quantization and pixel processing
  let qColors;
  switch (quantize) {
    case 'count':
      qColors = quantizeColors(canvas.getImageData(), colorCount).map(function (c) {
        const hex = rgb2hex(c);
        return { r: c.r, g: c.g, b: c.b, c: [c.r, c.g, c.b], hex };
      });
      break;
    case 'palette':
      if (!customPalettes.cache || customPalettes.str !== palette) {
        customPalettes.str = palette;
        customPalettes.cache = palette.split(' ').filter(Boolean).map((hex) => {
          const c = hex2rgb(hex);
          return { r: c.r, g: c.g, b: c.b, c: [c.r, c.g, c.b], hex };
        });
      }
      qColors = customPalettes.cache;
      break;
    case 'cga': qColors = PALETTES.cga; break;
    case 'vga': qColors = PALETTES.vga; break;
    default: qColors = null; break;
  }

  if (qColors) {
    canvas.quantize(qColors);
  }

  const targetDataLength = cols * rows;
  const blockData = new Array(targetDataLength);
  const charset = chars || "▄";

  for (let i = 0; i < targetDataLength; i++) {
    const pixel = canvas.pixels[i];
    if (!pixel) continue;
    pixel.char = charset[rand(charset.length)];
    pixel.hex = rgb2hex(pixel);
    pixel.c ??= [pixel.r, pixel.g, pixel.b];
    blockData[i] = pixel;
  }

  return { canvas, blockData };
}

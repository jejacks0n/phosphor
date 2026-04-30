import { shallowRef } from 'vue';
import Random from 'random-seed';
import { processImage, applyQuantization } from '@/lib/ImageProcessor';
import { rgb2hex, rgb2gray } from '@/lib/ColorUtils';
import Canvas from '@/lib/Canvas';

export function useImagePipeline(projectStore) {
  const pipelineCanvas = shallowRef(null);
  const outputCanvas = shallowRef(null);
  let _setupFrame = null;

  const _prepareOutputCanvas = (params) => {
    const canvas = document.createElement('canvas');
    canvas.width = params.cols;
    canvas.height = params.rows;
    canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
    return canvas;
  };

  const _buildBlockData = (params, canvasWrapper) => {
    const rand = new Random(params.seed);
    const charset = params.chars || '▄';
    const charMode = params.charMode || 'random';
    const renderStyle = params.renderStyle || 'ansi';
    const targetDataLength = params.cols * params.rows;
    const finalBlockData = new Array(targetDataLength);

    for (let y = 0; y < params.rows; y += 2) {
      for (let x = 0; x < params.cols; x++) {
        const i1 = y * params.cols + x;
        const i2 = (y + 1) * params.cols + x;
        
        const p1 = canvasWrapper.pixels[i1];
        const p2 = canvasWrapper.pixels[i2] || p1;

        // Determine Character
        let char;
        if (charMode === 'brightness') {
          const avgGray = (rgb2gray(p1) + rgb2gray(p2)) / 2;
          const charIdx = Math.max(0, Math.min(charset.length - 1, Math.round(avgGray * (charset.length - 1))));
          char = charset[charIdx];
        } else {
          char = charset[rand(charset.length)];
        }

        // Determine Colors based on Render Style
        if (renderStyle === 'colorAscii' || renderStyle === 'ascii') {
          const avgR = (p1.r + p2.r) / 2;
          const avgG = (p1.g + p2.g) / 2;
          const avgB = (p1.b + p2.b) / 2;

          const isMonochrome = renderStyle === 'ascii';
          const fgR = isMonochrome ? 255 : avgR;
          const fgG = isMonochrome ? 255 : avgG;
          const fgB = isMonochrome ? 255 : avgB;
          
          const fgHex = isMonochrome ? '#FFFFFF' : rgb2hex({ r: fgR, g: fgG, b: fgB });
          const fgC = [fgR, fgG, fgB];

          // Top pixel (Background) - Set to Black
          finalBlockData[i1] = {
            r: 0, g: 0, b: 0,
            hex: '#000000',
            c: [0, 0, 0],
            char: char,
          };

          // Bottom pixel (Foreground) - Set to Average Color or White
          if (i2 < targetDataLength) {
            finalBlockData[i2] = {
              r: fgR, g: fgG, b: fgB,
              hex: fgHex,
              c: (p1.c !== undefined) ? fgC : [fgR, fgG, fgB],
            };
          }
        } else {
          // ANSI (Full Color Style)
          finalBlockData[i1] = {
            r: p1.r, g: p1.g, b: p1.b,
            hex: rgb2hex(p1),
            c: (p1.c !== undefined) ? p1.c : [p1.r, p1.g, p1.b],
            char: char,
          };

          if (i2 < targetDataLength) {
            finalBlockData[i2] = {
              r: p2.r, g: p2.g, b: p2.b,
              hex: rgb2hex(p2),
              c: (p2.c !== undefined) ? p2.c : [p2.r, p2.g, p2.b],
            };
          }
        }
      }
    }
    return finalBlockData;
  };

  const _runSetup = async (params) => {
    if (!params.image) return;

    const {
      canvas: pipelineCanvasResult,
      blockData: pipelineBlockData,
      paletteColors,
    } = await processImage(params.image, params);
    
    pipelineCanvas.value = pipelineCanvasResult.canvas;
    projectStore.activePalette = paletteColors;

    const tempOutputCanvas = _prepareOutputCanvas(params);

    // Composite paint over filtered image
    projectStore.compositeEditCanvas(pipelineCanvas.value, tempOutputCanvas);

    // Late-stage Quantization (forced into the LOCKED palette from the base image)
    const canvasWrapper = new Canvas(tempOutputCanvas);
    if (projectStore.activePalette) {
      applyQuantization(canvasWrapper, projectStore.activePalette);
    } else {
      canvasWrapper.loadPixels();
    }

    const finalBlockData = _buildBlockData(params, canvasWrapper);

    projectStore.blockData = finalBlockData;
    projectStore.pipelineBlockData = pipelineBlockData || [...finalBlockData];

    // Still apply char overrides on top
    projectStore.applyCharEdits();

    outputCanvas.value = tempOutputCanvas;
  };

  const queueSetup = (params) => {
    if (_setupFrame) cancelAnimationFrame(_setupFrame);
    _setupFrame = requestAnimationFrame(() => _runSetup(params));
  };

  return {
    pipelineCanvas,
    outputCanvas,
    queueSetup,
  };
}

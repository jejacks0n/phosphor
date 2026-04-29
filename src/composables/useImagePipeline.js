import { shallowRef } from 'vue';
import Random from 'random-seed';
import { processImage, applyQuantization } from '@/lib/ImageProcessor';
import { rgb2hex } from '@/lib/ColorUtils';
import Canvas from '@/lib/Canvas';

export function useImagePipeline(projectStore) {
  const pipelineCanvas = shallowRef(null);
  const outputCanvas = shallowRef(null);
  let _setupFrame = null;

  const _initializeEditCanvas = (image) => {
    if (!projectStore.editCanvas) {
      projectStore.initEditCanvas(image.naturalWidth, image.naturalHeight);
    }
  };

  const _prepareOutputCanvas = (params) => {
    const canvas = document.createElement('canvas');
    canvas.width = params.cols;
    canvas.height = params.rows;
    canvas.getContext('2d', { willReadFrequently: true });
    return canvas;
  };

  const _buildBlockData = (params, canvasWrapper) => {
    const rand = new Random(params.seed);
    const charset = params.chars || '▄';
    const targetDataLength = params.cols * params.rows;
    const finalBlockData = new Array(targetDataLength);

    for (let i = 0; i < targetDataLength; i++) {
      const p = canvasWrapper.pixels[i];
      const hex = rgb2hex(p);

      finalBlockData[i] = {
        r: p.r, g: p.g, b: p.b,
        hex,
        c: (p.c !== undefined) ? p.c : [p.r, p.g, p.b],
        char: charset[rand(charset.length)],
      };
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

    _initializeEditCanvas(params.image);

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

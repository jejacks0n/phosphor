import { shallowRef } from 'vue';
import Random from 'random-seed';
import { processImage, applyQuantization } from '@/lib/ImageProcessor';
import { rgb2hex } from '@/lib/ColorUtils';
import Canvas from '@/lib/Canvas';

export function useImagePipeline(projectStore) {
  const pipelineCanvas = shallowRef(null);
  const outputCanvas = shallowRef(null);
  let _setupFrame = null;

  const runSetup = async (params) => {
    if (!params.image) return;

    const {
      canvas: pipelineCanvasResult,
      blockData: pipelineBlockData,
      paletteColors,
    } = await processImage(params.image, params);
    
    pipelineCanvas.value = pipelineCanvasResult.canvas;
    projectStore.activePalette = paletteColors;

    if (!projectStore.editCanvas) {
      projectStore.initEditCanvas(params.image.naturalWidth, params.image.naturalHeight);
    }

    // 1. Prepare final output canvas at grid resolution
    const oc = document.createElement('canvas');
    oc.width = params.cols;
    oc.height = params.rows;
    oc.getContext('2d', { willReadFrequently: true });

    // 2. Composite paint over filtered image
    projectStore.compositeEditCanvas(pipelineCanvas.value, oc);

    // 3. Late-stage Quantization (forced into the LOCKED palette from the base image)
    if (projectStore.activePalette) {
      const canvasWrapper = new Canvas(oc);
      applyQuantization(canvasWrapper, projectStore.activePalette);
    }

    // 4. Generate blockData from final quantized pixels
    const rand = new Random(params.seed);
    const charset = params.chars || '▄';
    const targetDataLength = params.cols * params.rows;
    const finalBlockData = new Array(targetDataLength);

    const ctx = oc.getContext('2d', { willReadFrequently: true });
    const finalPixels = ctx.getImageData(0, 0, params.cols, params.rows).data;

    for (let i = 0; i < targetDataLength; i++) {
      const i4 = i * 4;
      const r = finalPixels[i4], g = finalPixels[i4 + 1], b = finalPixels[i4 + 2];
      const hex = rgb2hex({ r, g, b });

      finalBlockData[i] = {
        r, g, b,
        hex,
        c: [r, g, b],
        char: charset[rand(charset.length)],
      };
    }

    projectStore.blockData = finalBlockData;
    projectStore.pipelineBlockData = pipelineBlockData || [...finalBlockData];

    // Still apply char overrides on top
    projectStore.applyCharEdits();

    outputCanvas.value = oc;
  };

  const queueSetup = (params) => {
    if (_setupFrame) cancelAnimationFrame(_setupFrame);
    _setupFrame = requestAnimationFrame(() => runSetup(params));
  };

  return {
    pipelineCanvas,
    outputCanvas,
    queueSetup,
  };
}

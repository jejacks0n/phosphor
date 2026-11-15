// GIF export: gifFile draws cells as the ANSI view does, offscreen (drawnCells, which the PNG export uses too), and
// hands each frame's pixels to a worker (gifWorker.js), which picks one palette for them all, so colors don't shimmer
// from frame to frame, and writes the file. The page only draws, so it takes clicks and paints all the while.
import CellCanvas from './CellCanvas.js';
import { ctx2d } from './Canvas.js';

export const MAX_GIF_PIXELS = 500_000_000; // across frames: written at about 20M pixels a second, some 25 seconds
export const gifDelay = (ms) => Math.max(2, Math.round(ms / 10)); // hundredths of a second; browsers slow anything shorter

const SAMPLED_FRAMES = 12; // what the palette's picked from, evenly through the animation

// Cells drawn as the ANSI view draws them, offscreen at one pixel per font pixel: use gets { width, height, rgba, draw },
// rgba(cells) a frame's pixels and draw(cells) the view's canvas with the frame on it, to copy before the page next
// paints, while the view's there. Throws if there's no WebGL2 to draw with.
export async function drawnCells(cols, lines, { smooth } = {}, use) {
  const view = new CellCanvas(document.createElement('canvas'));
  try {
    if (smooth !== undefined) view.smooth = smooth;
    view.resize(cols, lines, 1);
    const { width, height } = view.canvas;
    const copy = document.createElement('canvas');
    copy.width = width;
    copy.height = height;
    const ctx = ctx2d(copy);
    // The drawing buffer's only there straight after the draw.
    const draw = (cells) => {
      view.draw(cells, { cols, rows: lines });
      return view.canvas;
    };
    const rgba = (cells) => {
      ctx.drawImage(draw(cells), 0, 0);
      return ctx.getImageData(0, 0, width, height).data;
    };
    return await use({ width, height, rgba, draw });
  } finally {
    view.destroy();
  }
}

// One message to the worker, and its answer; the worker failing rejects.
const asker = (worker) => (message, transfer = []) => new Promise((resolve, reject) => {
  worker.onmessage = ({ data }) => resolve(data);
  worker.onerror = (event) => {
    event.preventDefault();
    reject(new Error(event.message || 'The GIF worker failed'));
  };
  worker.postMessage(message, transfer);
});

// frames: each frame's cells, delays its delayCs. The GIF's bytes, with progress told the share of frames written
// after each. Throws if there's no WebGL2 to draw with, or what tooLarge throws, given the pixels across frames.
export function gifFile(frames, cols, lines, delays, { smooth, tooLarge, progress } = {}) {
  return drawnCells(cols, lines, { smooth }, async ({ width, height, rgba }) => {
    tooLarge?.(width * height * frames.length);
    const worker = new Worker(new URL('./gifWorker.js', import.meta.url), { type: 'module' });
    try {
      const ask = asker(worker);
      const step = Math.max(1, Math.floor(frames.length / SAMPLED_FRAMES)), samples = [];
      for (let i = 0; i < frames.length; i += step) samples.push(rgba(frames[i]));
      await ask({ width, height, samples }, samples.map((data) => data.buffer));
      for (let i = 0; i < frames.length; i++) {
        const data = rgba(frames[i]);
        await ask({ rgba: data, delayCs: delays[i] }, [data.buffer]);
        progress?.((i + 1) / frames.length);
      }
      return (await ask({ finish: true })).bytes;
    } finally {
      worker.terminate();
    }
  });
}

import CellCanvas from '@/lib/CellCanvas';
import { loadFontFaces } from '@/lib/displayFonts';

const MAX_CHARS = 49_152;   // the Room's limit on a thumbnail, as base64 characters
const clamp = (n, low, high) => Math.min(Math.max(n, low), high);

// The lobby's picture of a room: the cells around the center of the host's view (about 2:1, like the
// card, and held to the grid), drawn off screen in the host's font and encoded as WebP, as raw base64.
// null when this browser can't do it (no WebGL2, no WebP encoder) or the picture won't fit the limit.
export async function thumbnailOf({ cells, cols, lines, font }, view, { width = 320 } = {}) {
  await loadFontFaces(font);
  let canvas;
  try {
    canvas = new CellCanvas(document.createElement('canvas'), { font });
  } catch {
    return null;
  }
  try {
    const wide = clamp(Math.round(view.cols) || 80, 1, cols);
    const { cellWidth, lineHeight } = canvas.cellSize(8);
    const high = clamp(Math.round(wide * cellWidth / 2 / lineHeight), 1, lines);
    const col = clamp(Math.round(view.col + view.cols / 2 - wide / 2) || 0, 0, cols - wide);
    const row = clamp(Math.round(view.row + view.rows / 2 - high / 2) || 0, 0, lines - high);
    canvas.resize(wide, high, width / (wide * cellWidth));
    // toBlob takes the drawing buffer as it is when it's called: it must come straight after the draw.
    const encode = (quality) => {
      canvas.draw(cells, { cols, rows: lines, col, row });
      return new Promise((resolve) => canvas.canvas.toBlob(resolve, 'image/webp', quality));
    };
    for (const quality of [0.8, 0.5]) {
      const blob = await encode(quality);
      if (blob?.type !== 'image/webp') return null;
      const webp = await base64Of(blob);
      if (webp.length <= MAX_CHARS) return webp;
    }
    return null;
  } finally {
    canvas.destroy();
  }
}

const base64Of = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

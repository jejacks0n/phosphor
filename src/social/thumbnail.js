import CellCanvas from '@/lib/CellCanvas';
import { loadFontFaces } from '@/lib/displayFonts';

const MAX_CHARS = 49_152;   // the Room's limit on a thumbnail, as base64 characters
const clamp = (n, low, high) => Math.min(Math.max(n, low), high);

const MOST_COLS = 80;   // the lobby's picture is never wider than this many columns

// The cells of the lobby's picture: the art's width up to MOST_COLS, at 2:1 (like the card), from a
// pinned top-left cell ({ col, row }) or centered on a cell ({ middleCol, middleRow }), held to the
// grid. A non-number is the top or the left.
export function lobbyWindow({ cols, lines }, { cellWidth, lineHeight }, place) {
  const wide = Math.min(cols, MOST_COLS);
  const rows = clamp(Math.round(wide * cellWidth / 2 / lineHeight), 1, lines);
  const at = (pinned, middle, size, most) => clamp(Math.round(pinned ?? middle - size / 2) || 0, 0, most - size);
  return { col: at(place.col, place.middleCol, wide, cols), cols: wide, row: at(place.row, place.middleRow, rows, lines), rows };
}

// The lobby's picture of a room: the cells of lobbyWindow, drawn off screen
// in the host's font and encoded as WebP, as raw base64. A browser that can't make WebP (Safari makes
// a PNG instead) gives a JPEG. null when this browser can't do it (no WebGL2, no encoder for either) or
// the picture won't fit in `most` characters (the lobby's limit unless given: a room report's is larger).
export async function thumbnailOf({ cells, cols, lines, font }, place, { width = 320, most = MAX_CHARS } = {}) {
  await loadFontFaces(font);
  let canvas;
  try {
    canvas = new CellCanvas(document.createElement('canvas'), { font });
  } catch {
    return null;
  }
  try {
    const { cellWidth, lineHeight } = canvas.cellSize(8);
    const win = lobbyWindow({ cols, lines }, { cellWidth, lineHeight }, place);
    canvas.resize(win.cols, win.rows, width / (win.cols * cellWidth));
    // toBlob takes the drawing buffer as it is when it's called: it must come straight after the draw.
    const encode = (type, quality) => {
      canvas.draw(cells, { cols, rows: lines, col: win.col, row: win.row });
      return new Promise((resolve) => canvas.canvas.toBlob(resolve, type, quality));
    };
    let type = 'image/webp';
    for (const quality of [0.8, 0.5]) {
      let blob = await encode(type, quality);
      if (blob?.type !== type && type === 'image/webp') blob = await encode(type = 'image/jpeg', quality);
      if (blob?.type !== type) return null;
      const webp = await base64Of(blob);
      if (webp.length <= most) return webp;
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

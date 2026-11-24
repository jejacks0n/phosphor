import { referenceMask } from './GlyphCoverage.js';
import { slotOf, drawnMaskOf } from './BitmapFont.js';
import { isWideChar } from './Cells.js';
import { hex2rgb } from './ColorUtils.js';

// A character's ink, 0 to 1 a pixel, row by row, sw by sh pixels: the drawing font's glyph when it has the character,
// else the reference font's. A wide character is asked for at twice a cell's width (sw) and drawn across it.
export function glyphMask(char, sw, sh, font = null, wide = false) {
  const slot = font ? slotOf(char, font) : null;
  return slot === null ? referenceMask(char, sw, sh, wide) : drawnMaskOf(font, slot, sw, sh);
}

// One cell as pixels at (x, y), m wide (2m for a wide character) and 2m tall: each pixel the background mixed toward the
// foreground by the glyph's ink there. A missing color is black.
export function drawGlyphCell(ctx, cell, x, y, m, { font = null, wide = false } = {}) {
  const w = wide ? 2 * m : m, h = 2 * m;
  const mask = glyphMask(cell.char, w, h, font, wide);
  const fg = hex2rgb(cell.fg), bg = hex2rgb(cell.bg);
  const image = ctx.createImageData(w, h);
  for (let i = 0; i < mask.length; i++) {
    const ink = mask[i];
    image.data[i * 4] = bg.r + (fg.r - bg.r) * ink;
    image.data[i * 4 + 1] = bg.g + (fg.g - bg.g) * ink;
    image.data[i * 4 + 2] = bg.b + (fg.b - bg.b) * ink;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, x, y);
}

// Every cell as glyph pixels at (col * m, row * 2m). A wide character is drawn over its own cell and the next, which is
// then left alone. Each row's cells are expected in column order.
export function drawArtCells(ctx, cells, m, { font = null } = {}) {
  let skip = null;
  for (const cell of cells) {
    if (skip && skip.row === cell.row && skip.col === cell.col) continue;
    const wide = isWideChar(cell.char);
    if (wide) skip = { row: cell.row, col: cell.col + 1 };
    drawGlyphCell(ctx, cell, cell.col * m, cell.row * 2 * m, m, { font, wide });
  }
}

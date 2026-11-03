import { selectionText } from '@/lib/Cells';
import { ctx2d } from '@/lib/Canvas';
import { VERSION, clipboardHtml, moebiusData } from '@/lib/clipboardBlocks';

// Copy a selection: the block (cells, paint, base pixels, on the chosen layers) on Phosphor's own
// clipboard, and on the system clipboard its characters as plain text (for a terminal, a chat, a
// text editor) and, in the HTML slot, what it shows as Moebius's block, with the block itself
// alongside for another Phosphor tab (clipboardBlocks.js). Without the HTML, the text alone. The
// text is remembered once it's written, so a paste can tell whether the system clipboard still holds
// it or something newer was copied elsewhere, and the copy's id, so this tab pastes its own block
// (which a Bake rewrites) when the clipboard still holds it. Without clipboard access the text stays
// null, and Phosphor's own block keeps winning, as before.
export function copySelection(project, workspace, rect, layers) {
  const block = project.copySelection(rect, layers), id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  workspace.clipboard = block;
  workspace.clipboardId = id;
  workspace.clipboardText = null;
  const text = selectionText(project.cells, project.cols, rect);
  const html = clipboardHtml({ ...moebiusData(project.cells, project.cols, rect, project.quantize), phosphor: encodeBlock(block, id) });
  const written = () => { if (workspace.clipboardId === id) workspace.clipboardText = text; };
  if (copyEvent(text, html)) written();
  else navigator.clipboard?.writeText(text).then(written, () => {});
}

// Both entries written through a copy event, in the key press or click that asked (it's refused
// outside one). Not navigator.clipboard.write: Chrome rewrites its HTML as a whole page, which
// Moebius can't read. Returns whether it was written.
function copyEvent(text, html) {
  let wrote = false;
  const onCopy = (e) => {
    e.clipboardData.setData('text/plain', text);
    e.clipboardData.setData('text/html', html);
    e.preventDefault();
    wrote = true;
  };
  document.addEventListener('copy', onCopy, true);
  try {
    document.execCommand('copy');
  } catch {
    // not written: the fallback writes the text
  } finally {
    document.removeEventListener('copy', onCopy, true);
  }
  return wrote;
}

// A Select block as the clipboard's `phosphor` field: its canvases as PNGs.
export function encodeBlock({ w, h, cells, paint, base }, id) {
  return {
    version: VERSION, id, w, h,
    ...(cells && { cells }),
    ...(paint && { paint: paint.toDataURL() }),
    ...(base && { base: { pixels: base.pixels.toDataURL(), scale: base.scale, colors: base.colors.toDataURL(), pins: base.pins } }),
  };
}

// A `phosphor` field (readClipboardHtml's, checked) back as a Select block, its PNGs decoded.
export async function decodeBlock({ w, h, cells, paint, base }) {
  const block = { w, h };
  if (cells) block.cells = cells;
  if (paint) block.paint = await canvasOf(paint);
  if (base) block.base = { ...base, pixels: await canvasOf(base.pixels), colors: await canvasOf(base.colors) };
  return block;
}

async function canvasOf(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  ctx2d(canvas).drawImage(image, 0, 0);
  return canvas;
}

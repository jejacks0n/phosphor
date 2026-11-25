import { MAX_CELLS, MAX_COLS, MAX_LINES, selectionText } from '@/lib/Cells';
import { ctx2d } from '@/lib/Canvas';
import { VERSION, clipboardHtml, moebiusData, readClipboardHtml } from '@/lib/clipboardBlocks';
import { flatBlock } from '@/store/project/selection.js';
import { shapeBounds, transformed, translation } from '@/document/shapes.js';
import { useDrawingStore } from '@/store/DrawingStore';
import { busyWhile } from '@/composables/useBusy';
import { toast } from '@/composables/useToast';
import { t } from '@/i18n';
import { formatNumber } from '@/i18n/format';

// Copy a selection: the block (the picked layer's cells and paint; with All layers on, each shown layer's, the base's pixels and what shapes show) on Phosphor's own
// clipboard, and on the system clipboard its characters as plain text (for a terminal, a chat, a
// text editor) and, in the HTML slot, what it shows as Moebius's block, with the block itself
// alongside for another Phosphor tab as one layer's (flatBlock; clipboardBlocks.js). Without the HTML, the text alone. The
// text is remembered once it's written, so a paste can tell whether the system clipboard still holds
// it or something newer was copied elsewhere, and the copy's id, so this tab pastes its own block
// (which a Bake rewrites) when the clipboard still holds it. Without clipboard access the text stays
// null, and Phosphor's own block keeps winning, as before.
export function copySelection(project, workspace, rect, ids) {
  const lit = project.layersFor(ids);
  if (!lit.length) return; // every layer hidden: nothing to copy, as with no selection
  const block = project.copySelection(rect, lit, { shapes: workspace.selectAllLayers }), id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  workspace.clipboard = block;
  workspace.clipboardId = id;
  workspace.clipboardText = null;
  const text = selectionText(project.cells, project.cols, rect);
  const html = clipboardHtml({ ...moebiusData(project.cells, project.cols, rect, project.quantize), phosphor: encodeBlock(flatBlock(block), id) });
  const written = () => { if (workspace.clipboardId === id) workspace.clipboardText = text; };
  if (copyEvent(text, html)) written();
  else navigator.clipboard?.writeText(text).then(written, () => {});
}

// Both entries (text null: the HTML alone) written through a copy event, in the key press or click that
// asked (it's refused outside one). Not navigator.clipboard.write: Chrome rewrites its HTML as a whole
// page, which Moebius can't read. Returns whether it was written.
export function copyEvent(text, html) {
  let wrote = false;
  const onCopy = (e) => {
    if (text !== null) e.clipboardData.setData('text/plain', text);
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
export function encodeBlock({ w, h, cells, paint, base, looks }, id) {
  return {
    version: VERSION, id, w, h,
    ...(cells && { cells }),
    ...(looks && { looks }),
    ...(paint && { paint: paint.toDataURL() }),
    ...(base && { base: { pixels: base.pixels.toDataURL(), scale: base.scale, colors: base.colors.toDataURL(), pins: base.pins } }),
  };
}

// A `phosphor` field (readClipboardHtml's, checked) back as a Select block, its PNGs decoded.
export async function decodeBlock({ w, h, cells, paint, base, looks }) {
  const block = { w, h };
  if (cells) block.cells = cells;
  if (looks) block.looks = looks;
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

// What the system clipboard holds that a drawing can be made of, read outside a paste event (navigator.clipboard.read:
// browsers allow it in the press that asked, some after a Paste prompt of their own). The first of: shapes or a Select
// block copied in Phosphor (this tab's own copy as it is now, another tab's as it came), a Moebius block, a picture, text.
// { shapes, keys }, { block }, { picture: File } or { text }; null with none of those. When the browser won't say, what
// this tab copied itself stands in (on VECTOR its shapes first, elsewhere its block), and with neither, { refused: true }.
// items: the clipboard as read already, in read's form (the desktop app's menu hands it: handedItems).
export async function clipboardHeld(workspace, items = null) {
  const ownShapes = workspace.vectorClipboard && { shapes: workspace.vectorClipboard, keys: workspace.vectorClipboardKeys };
  const ownBlock = workspace.clipboard && { block: workspace.clipboard };
  try {
    items ??= await navigator.clipboard.read();
  } catch {
    return (workspace.editorTab === 'vector' ? ownShapes || ownBlock : ownBlock || ownShapes) || { refused: true };
  }
  const part = async (wanted) => {
    for (const item of items) {
      const type = item.types.find(wanted);
      if (type) return item.getType(type);
    }
    return null;
  };
  const html = await part((type) => type === 'text/html'), found = html && readClipboardHtml(await html.text());
  if (found?.shapes) return found.shapes.id === workspace.vectorClipboardId && ownShapes ? ownShapes : { shapes: found.shapes.shapes, keys: found.shapes.keys ?? null };
  if (found?.phosphor) return found.phosphor.id === workspace.clipboardId && ownBlock ? ownBlock : { block: await decodeBlock(found.phosphor) };
  if (found?.moebius) return { block: found.moebius };
  const picture = await part((type) => type.startsWith('image/'));
  if (picture) return { picture: new File([picture], `clipboard.${picture.type.slice(6).replace(/[^a-z0-9].*$/, '')}`, { type: picture.type }) };
  const text = (await (await part((type) => type === 'text/plain'))?.text() ?? '').replace(/\r\n/g, '\n');
  return text.trim() ? { text } : null;
}

// What the desktop app's menu hands over ({ html, text, png }, each null when there's none: desktop/clipboard.js), as
// navigator.clipboard.read gives a clipboard: one item with a type for each part there is.
export function handedItems({ html = null, text = null, png = null } = {}) {
  const parts = { ...(html && { 'text/html': html }), ...(png && { 'image/png': new Blob([png], { type: 'image/png' }) }), ...(text && { 'text/plain': text }) };
  return [{ types: Object.keys(parts), getType: async (type) => (parts[type] instanceof Blob ? parts[type] : new Blob([parts[type]], { type })) }];
}

// The canvas a drawing made of shapes takes: their bounds (shapeBounds, strokes and all), out to whole cells so an art
// layer keeps its place on them and nothing is cut mid-cell, no bigger than a drawing can be. { cols, lines, shapes }: the
// shapes moved so the bounds' corner is the canvas's.
function shapesCanvas(shapes, aspect) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const shape of shapes) {
    const { x, y, w, h } = shapeBounds(shape, aspect);
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x + w), Math.max(y1, y + h)];
  }
  const dx = Math.floor(x0), dy = 2 * Math.floor(y0 / 2);
  const cols = Math.min(MAX_COLS, Math.max(1, Math.ceil(x1 - dx)));
  const lines = Math.min(MAX_LINES, Math.floor(MAX_CELLS / cols), Math.max(1, Math.ceil((y1 - dy) / 2)));
  return { cols, lines, shapes: shapes.map((shape) => transformed(shape, translation(-dx, -dy))) };
}

// New from clipboard (the command list's): a new drawing the size of what the clipboard holds, with it in. A Select block
// or a Moebius block: a canvas its size with the block on Layer 1, as a paste lands (its one undo step). Text: as a text
// file opens to edit, its widest line wide, its escape codes read. A picture: as an image opens. Shapes: a canvas their
// bounds (shapesCanvas) with them on a vector layer, on VECTOR. The clipboard is read first, in the press that asked;
// then unsaved work is asked about, as New project asks. Not while drawing with others. The drawing it makes is unsaved
// whatever it's made of: it's nowhere else. Whether a drawing opened; false, with a toast saying why, with nothing to
// open, a clipboard that can't be read or whose copy can't be read back, or a block bigger than a drawing. items: the
// clipboard as the desktop app's File menu read it (clipboardHeld's); from the command list there, where the page can't
// read it, the refusal says to use that menu.
export async function newFromClipboard(project, workspace, items = null) {
  const withOthers = useDrawingStore().offWithOthers;
  if (withOthers) return toast(withOthers), false;
  let held;
  try {
    held = await clipboardHeld(workspace, items);
  } catch (error) { // read, but not something that can be read back (another tab's block with a picture that won't decode)
    console.warn('Could not read what the clipboard holds', error);
    return toast(t('clipboard.failed')), false;
  }
  if (!held || held.refused) return toast(t(!held ? 'clipboard.nothing' : import.meta.env.VITE_DESKTOP === '1' ? 'clipboard.useMenu' : 'clipboard.refused')), false;
  const { block, shapes, picture, text } = held;
  if (block && (block.w > MAX_COLS || block.h > MAX_LINES || block.w * block.h > MAX_CELLS)) {
    return toast(t('clipboard.tooBig', { cols: block.w, rows: block.h, maxCols: MAX_COLS, maxLines: formatNumber(MAX_LINES), maxCells: formatNumber(MAX_CELLS) })), false;
  }
  const open = async () => {
    try {
      if (!project.image) workspace.editorTab = shapes ? 'vector' : 'output'; // from the start screen, chosen first: the address moves once
      if (picture || text) {
        if (picture) await project.setImageFromFile(picture);
        else await project.openArtFile(new File([text], 'clipboard.utf8ans'), { layer: 'edit' });
        if (picture) workspace.pickLayer('base');
        project.editVersion++; // opened as a file is, but it's no file: unsaved, so leaving it asks and autosave keeps it
      } else if (block) {
        if (!(await project.setBlankCanvas({ cols: block.w, rows: 2 * block.h, withLayer: true }))) return false;
        await busyWhile(t('busy.pasting'), () => project.pasteSelection(block, 0, 0));
      } else {
        const canvas = shapesCanvas(shapes, project.pixelAspect);
        if (!(await project.setBlankCanvas({ cols: canvas.cols, rows: 2 * canvas.lines }))) return false;
        workspace.editorTab = 'vector';
        project.addShapes(canvas.shapes, held.keys);
        return true;
      }
      workspace.editorTab = 'output';
      return true;
    } catch (error) {
      console.warn('Could not make a drawing of the clipboard', error);
      toast(error.userMessage ?? t('clipboard.failed'));
      return false;
    }
  };
  return new Promise((resolve) => workspace.confirmLeave(null, () => resolve(open()), () => resolve(false)));
}

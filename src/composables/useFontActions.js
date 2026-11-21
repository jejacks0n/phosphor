import { computed } from 'vue';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useProjectStore } from '@/store/ProjectStore';
import { DEFAULT_FONT_ID } from '@/lib/displayFonts';
import { addFont, addBitmapFont, storedBitmapFont, storeFontPart, removeFont } from '@/lib/userFonts';
import { sayMissingBlocks } from '@/composables/useFontSetup';
import { fontId, fontName, fontSheet } from '@/lib/BitmapFont';
import { downloadBlob, fileStem } from '@/document/projectIO';

// The files Load takes: outline fonts, and bitmap fonts as PNG sheets or raw .F01-.F32.
export const FONT_FILES = ['.ttf', '.otf', '.woff', '.woff2', '.png', ...Array.from({ length: 32 }, (_, i) => `.f${String(i + 1).padStart(2, '0')}`)].join(',');

// What can be done with a font, for the Font field and the palette layer's Fonts page: loading one, choosing it,
// saving a bitmap font ({ name, height, bytes }) as a file, and forgetting the browser's copy. Errors are thrown
// for the caller to show.
export function useFontActions() {
  const workspace = useWorkspaceStore();
  const project = useProjectStore();
  const loaded = computed(() => workspace.userFonts ?? []);
  const hostsFont = computed(() => !!workspace.roomFont); // the host's, so not yours to change here
  const drawsIn = (id) => !!project.drawingFont && fontId(project.drawingFont) === id;

  // A bitmap font becomes the drawing's own; any other font takes it away again.
  async function choose(id) {
    if (loaded.value.find((font) => font.id === id)?.kind === 'bitmap') {
      await project.setDrawingFont(await storedBitmapFont(id));
      return;
    }
    workspace.displayFont = id; // first, so a toast about the cells' shape names it
    if (project.drawingFont) await project.setDrawingFont(null);
  }

  // A font file kept in this browser and put to use (not in someone else's room: the font is theirs); its entry. A
  // bitmap font missing blocks says which (not when a room refused it: that says so).
  async function loadFile(file) {
    const bitmap = /\.(f\d\d|png)$/i.test(file.name) || file.type === 'image/png';
    let font = await (bitmap ? addBitmapFont(file) : addFont(file));
    const own = bitmap && drawsIn(font.id) ? project.drawingFont : null;
    if (own) { // the drawing's own font again: the blocks, lines and sets set on it stay, and the browser's copy takes them
      font = { ...font };
      for (const key of ['blocks', 'lines', 'sets']) {
        if (!own[key]) continue;
        await storeFontPart(font.id, key, own[key]);
        font[key] = own[key];
      }
    }
    workspace.userFonts = [...loaded.value.filter((f) => f.id !== font.id), font];
    if (!hostsFont.value) await choose(font.id);
    if (bitmap && (hostsFont.value || drawsIn(font.id))) sayMissingBlocks(await storedBitmapFont(font.id)); // blocks it lacks besides its lower half (useFontSetup)
    return font;
  }

  const stem = (font, ext) => fileStem(fontName(font.name), ext) || 'font'; // a nameless font still gets a name
  const pad = (font) => String(font.height).padStart(2, '0');

  const saveRaw = (font) => downloadBlob(new Blob([font.bytes]), `${stem(font, `F${pad(font)}`)}.F${pad(font)}`);

  async function savePng(font) {
    const { width, height, data } = fontSheet(font), canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
    downloadBlob(await new Promise((resolve) => canvas.toBlob(resolve, 'image/png')), `${stem(font, 'png')}.png`);
  }

  // The drawing's own font stays, at its size: it's the document's.
  async function remove(id) {
    const own = drawsIn(id);
    await removeFont(id, { keepFace: own });
    workspace.userFonts = loaded.value.filter((font) => font.id !== id);
    if (!own) workspace.displayFontSizes = Object.fromEntries(Object.entries(workspace.displayFontSizes).filter(([key]) => key !== id));
    if (workspace.displayFont === id) workspace.displayFont = DEFAULT_FONT_ID;
  }

  return { loadFile, choose, saveRaw, savePng, remove, hostsFont };
}

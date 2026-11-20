// A drawing whose font has no lower half can't be painted in (project.paintOff): a toast says so until it's fixed,
// with a button that opens the font's blocks (useFontSetup). A font missing other blocks says which, for a while.
import { test, expect, afterEach } from 'vitest';
import { useFontActions } from '@/composables/useFontActions.js';
import { loadFonts, removeFont } from '@/lib/userFonts.js';
import { writeXBin } from '@/lib/XBinFile.js';
import { effectScope, nextTick } from 'vue';
import { createTestApp } from '../support/app.js';
import { toast, toastMessage, toastAction, closeToast } from '@/composables/useToast.js';
import { useFontSetup, showFontSetup } from '@/composables/useFontSetup.js';
import { encodeFont } from '@/lib/BitmapFont.js';
import { noLowerHalf, cp437Font, fontWith } from '../support/blockFonts.js';

const NO_LOWER = 'This drawing’s font, Slab, has no lower half block, so it can’t be painted in yet.';
const IN_ROOM = 'Its blocks can\u2019t change in a room; set them once the room ends.';
const LOWER = [219, 254, 223, 221, 222, 176, 177, 178];

let scope = null;
afterEach(async () => {
  scope?.stop();
  scope = null;
  closeToast();
  for (const font of await loadFonts()) await removeFont(font.id);
});

async function drawing(font = noLowerHalf) {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ withLayer: true, cols: 10, rows: 10 });
  scope = effectScope();
  scope.run(() => useFontSetup());
  app.project.setDrawingFont({ ...font, name: 'Slab' });
  await nextTick();
  return app;
}

test('a drawing whose font has no lower half says so until it’s closed, with a button', async () => {
  await drawing();
  expect(toastMessage.value).toBe(NO_LOWER);
  expect(toastAction.value.label).toBe('Set up its blocks');
});

test('a font with a lower half says nothing', async () => {
  await drawing(cp437Font);
  expect(toastMessage.value).toBe(null);
});

test('once Lower gets a slot, the toast goes and a short one says paint is on', async () => {
  const { project } = await drawing();
  project.setDrawingFont({ ...noLowerHalf, name: 'Slab', blocks: LOWER });
  await nextTick();
  expect(toastMessage.value).toBe('Lower half set to slot 254. The paint tools are on.');
  expect(toastAction.value).toBe(null);
  project.undo(); // no lower half again
  await nextTick();
  expect(toastMessage.value).toBe(NO_LOWER);
});

test('a font with a lower half in its place closes it, with nothing more said', async () => {
  const { project } = await drawing();
  project.setDrawingFont({ ...cp437Font, name: 'Ok' });
  await nextTick();
  expect(toastMessage.value).toBe(null);
});

test('it closes only its own toast, never a message that replaced it', async () => {
  const { project } = await drawing();
  toast('Saved.');
  project.setDrawingFont(null);
  await nextTick();
  expect(toastMessage.value).toBe('Saved.');
});

test('closed, it comes back when asked for', async () => {
  await drawing();
  closeToast();
  showFontSetup();
  expect(toastMessage.value).toBe(NO_LOWER);
});

test('a drawing brought back in such a font (a reload, a restore) says so too', async () => {
  const { project } = await drawing(cp437Font);
  project.$patch({ fontBitmap: encodeFont(noLowerHalf), fontName: 'Slab', fontBlocks: '' }); // as autosave puts it back
  await nextTick();
  expect(toastMessage.value).toBe(NO_LOWER);
});

test('closed, it comes back when another drawing opens in the same font', async () => {
  const { project } = await drawing();
  closeToast();
  await project.openArtFile(new File(['hi'], 'note.txt')); // an art file keeps the font in use
  await nextTick();
  expect(project.drawingFont.name).toBe('Slab');
  expect(toastMessage.value).toBe(NO_LOWER);
});

test('a drawing opened in the same font once it has a lower half says nothing about slots', async () => {
  const { project } = await drawing();
  project.setDrawingFont({ ...noLowerHalf, name: 'Slab', blocks: LOWER });
  await nextTick();
  closeToast();
  await project.openArtFile(new File(['hi'], 'note.txt'));
  await nextTick();
  expect(toastMessage.value).toBe(null);
});

test('in a room it has no button, and says the blocks can be set once the room ends', async () => {
  const { project } = await drawing(cp437Font);
  project._hosting = true;
  project.setDrawingFont({ ...noLowerHalf, name: 'Slab' });
  await nextTick();
  expect(toastMessage.value).toBe(`${NO_LOWER} ${IN_ROOM}`);
  expect(toastAction.value).toBe(null);
});

// A font with every block but the shades: its slots 176-178 drawn blank.
const blank = (h) => Array(h).fill(0);
const noShades = fontWith({ ...Object.fromEntries([219, 220, 223, 221, 222].map((n) => [n, (h) => cp437Glyph(n, h)])), 176: blank, 177: blank, 178: blank });
function cp437Glyph(n, h) { return [...cp437Font.bytes.subarray(n * h, (n + 1) * h)]; }
const NO_SHADES = 'This font has no Light, Medium, or Dark block, so those characters draw blank.';
const PALETTE = ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'];
const xbinWith = (font) => new File([writeXBin({ cols: 1, rows: 1, cells: [{ char: ' ', fg: { hex: '#aaaaaa' }, bg: { hex: '#000000' } }], palette: PALETTE, font })], `${font.name}.xb`);

test('a font loaded with + Load that has its lower half but not its shades names them, with the button', async () => {
  await drawing(cp437Font);
  await useFontActions().loadFile(new File([noShades.bytes], 'S.F16'));
  expect(toastMessage.value).toBe(NO_SHADES);
  expect(toastAction.value.label).toBe('Set up its blocks');
});

test('a font loaded with no lower half shows only the toast that stays', async () => {
  await drawing(cp437Font);
  await useFontActions().loadFile(new File([noLowerHalf.bytes], 'Slab.F16'));
  await nextTick();
  expect(toastMessage.value).toBe(NO_LOWER);
});

test('a font missing one block names it alone', async () => {
  await drawing(cp437Font);
  const noDark = fontWith({ ...Object.fromEntries([219, 220, 223, 221, 222, 176, 177].map((n) => [n, (h) => cp437Glyph(n, h)])), 178: blank });
  await useFontActions().loadFile(new File([noDark.bytes], 'D.F16'));
  expect(toastMessage.value).toBe('This font has no Dark block, so that character draws blank.');
});

test('an XBin opened with a font missing its shades names them', async () => {
  const { project } = await drawing(cp437Font);
  await project.openArtFile(xbinWith({ ...noShades, name: 'S' }));
  await nextTick();
  expect(toastMessage.value).toBe(NO_SHADES);
  expect(toastAction.value.label).toBe('Set up its blocks');
});

test('an XBin opened with a font with no lower half shows only the toast that stays', async () => {
  const { project } = await drawing(cp437Font);
  await project.openArtFile(xbinWith({ ...noLowerHalf, name: 'Slab' }));
  await nextTick();
  expect(toastMessage.value).toBe(NO_LOWER);
});

test('hosting a room, the font loaded says its blocks can be set once the room ends, with no button', async () => {
  const { project } = await drawing(cp437Font);
  project._hosting = true;
  await useFontActions().loadFile(new File([noShades.bytes], 'S.F16'));
  expect(toastMessage.value).toBe(`${NO_SHADES} ${IN_ROOM}`);
  expect(toastAction.value).toBe(null);
});

test('the start screen has no toast: New takes it away, and the next drawing in the font brings it back', async () => {
  const { project } = await drawing();
  expect(toastMessage.value).toBe(NO_LOWER);
  project.clearImage(); // New: the font stays, as the next drawing's
  await nextTick();
  expect(project.paintOff).not.toBeNull();
  expect(toastMessage.value).toBe(null);
  showFontSetup(); // a stroke can't start without a drawing, but nothing says it with none either
  expect(toastMessage.value).toBe(null);
  await project.setBlankCanvas({ cols: 10, rows: 10, fontBitmap: project.fontBitmap, fontName: project.fontName });
  await nextTick();
  expect(toastMessage.value).toBe(NO_LOWER);
});

test('New leaves someone else\u2019s message up', async () => {
  const { project } = await drawing();
  toast('Saved.');
  project.clearImage();
  await nextTick();
  expect(toastMessage.value).toBe('Saved.');
});

test('closed, it stays closed while other blocks are set, found again, or undone', async () => {
  const { project } = await drawing();
  closeToast();
  project.setDrawingFont({ ...noLowerHalf, name: 'Slab', blocks: [200, null, 223, 221, 222, 176, 177, 178] }); // Full moved
  await nextTick();
  expect(toastMessage.value).toBe(null);
  project.setDrawingFont({ ...noLowerHalf, name: 'Slab' }); // found again
  await nextTick();
  project.undo();
  await nextTick();
  expect(toastMessage.value).toBe(null);
});

test('a room starting takes the button away; the room ending gives it back', async () => {
  const { project } = await drawing();
  expect(toastAction.value?.label).toBe('Set up its blocks');
  project._hosting = true;
  await nextTick();
  expect(toastMessage.value).toBe(`${NO_LOWER} ${IN_ROOM}`);
  expect(toastAction.value).toBe(null);
  project._hosting = false;
  await nextTick();
  expect(toastMessage.value).toBe(NO_LOWER);
  expect(toastAction.value?.label).toBe('Set up its blocks');
});

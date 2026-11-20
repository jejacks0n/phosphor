// A drawing whose font has no lower half can't be painted in (project.paintOff): a toast says so until it's fixed,
// with a button that opens the font's blocks (useFontSetup). A font missing other blocks says which, for a while.
import { test, expect, afterEach } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { createTestApp } from '../support/app.js';
import { toast, toastMessage, toastAction, closeToast } from '@/composables/useToast.js';
import { useFontSetup, showFontSetup } from '@/composables/useFontSetup.js';
import { encodeFont } from '@/lib/BitmapFont.js';
import { noLowerHalf, cp437Font } from '../support/blockFonts.js';

const NO_LOWER = 'This drawing’s font, Slab, has no lower half block, so it can’t be painted in yet.';
const HOST_ONLY = 'Only the host can set its blocks, outside the room.';
const LOWER = [219, 254, 223, 221, 222, 176, 177, 178];

let scope = null;
afterEach(() => { scope?.stop(); scope = null; closeToast(); });

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

test('in a room it has no button, and says only the host can set the blocks, outside the room', async () => {
  const { project } = await drawing(cp437Font);
  project._hosting = true;
  project.setDrawingFont({ ...noLowerHalf, name: 'Slab' });
  await nextTick();
  expect(toastMessage.value).toBe(`${NO_LOWER} ${HOST_ONLY}`);
  expect(toastAction.value).toBe(null);
});

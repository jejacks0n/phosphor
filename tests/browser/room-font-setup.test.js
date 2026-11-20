// A room needs a drawing font that's set up (all eight blocks have a slot: project.fontNotSetUp), because a room
// can't edit them: it can't be started otherwise, and in one the font can't be changed to a font that isn't.
import { test, expect, vi, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, loadImage } from '../support/app.js';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { toastMessage, closeToast } from '@/composables/useToast.js';
import { addBitmapFont, storeBlocks, loadFonts, removeFont } from '@/lib/userFonts';
import { fontId } from '@/lib/BitmapFont.js';
import { cp437Font, noLowerHalf } from '../support/blockFonts.js';
import StartRoomPage from '@/components/social/StartRoomPage.vue';
import CharPaletteLayer from '@/components/CharPaletteLayer.vue';
import FontField from '@/components/FontField.vue';

const SLOTS = [219, 254, 223, 221, 222, 176, 177, 178];
const MISSING = 'Slab has no Lower block. Set up its blocks on the Fonts page first.';
// A font with a lower half and every block but Dark (nothing at 178 reads as one).
const noDark = { ...cp437Font, name: 'Slab', bytes: cp437Font.bytes.map((b, i) => (i >= 178 * 16 && i < 179 * 16 ? 0 : b)) };
let app = null, host = null;
afterEach(async () => {
  app?.unmount();
  host?.remove();
  app = host = null;
  closeToast();
  vi.restoreAllMocks();
  for (const font of await loadFonts()) await removeFont(font.id);
});

async function drawing(font) {
  const stores = await createTestApp();
  const pinia = getActivePinia();
  await loadImage(stores.project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });
  if (font) stores.project.setDrawingFont({ ...font, name: 'Slab' });
  return { ...stores, pinia };
}
const mountOn = async (pinia, component) => {
  host = document.body.appendChild(document.createElement('div'));
  app = createApp({ render: () => h(component) }).use(pinia).use(i18n);
  app.mount(host);
  await nextTick();
};
const button = (text) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

test('fontNotSetUp: null for no bitmap font and for all eight blocks, a reason for a missing one', async () => {
  const { project } = await drawing();
  expect(project.fontNotSetUp).toBe(null);
  project.setDrawingFont({ ...cp437Font, name: 'Slab' });
  expect(project.fontNotSetUp).toBe(null);
  project.setDrawingFont({ ...noLowerHalf, name: 'Slab' });
  expect(project.fontNotSetUp).toBe(MISSING);
  project.setDrawingFont({ ...noLowerHalf, name: 'Slab', blocks: SLOTS });
  expect(project.fontNotSetUp).toBe(null);
});

test('Go live is off with the reason while the drawing\'s font isn\'t set up, and on once it is', async () => {
  const { project, pinia } = await drawing(noLowerHalf);
  await mountOn(pinia, StartRoomPage);
  expect(button('Go live').disabled).toBe(true);
  expect(button('Go live').title).toBe(MISSING);
  expect(host.querySelector('p.why').textContent).toContain(MISSING);
  project.setDrawingFont({ ...noLowerHalf, name: 'Slab', blocks: SLOTS });
  await nextTick();
  expect(button('Go live').disabled).toBe(false);
});

test('the reason has a button that opens the font\'s blocks', async () => {
  const { pinia, workspace } = await drawing(noLowerHalf);
  await mountOn(pinia, StartRoomPage);
  button('Set up its blocks').click();
  expect(workspace.paletteLayerPage).toBe('fonts');
  expect(workspace.paletteLayerOpen).toBe(true);
  expect(workspace.fontSetup.block).toBe('lower');
});

test('startRoom refuses with the reason as a toast and no request while the font isn\'t set up', async () => {
  await drawing(noLowerHalf);
  const request = vi.spyOn(useSocialStore(), 'request');
  expect(await useRoomStore().startRoom({ name: 'Night', welcome: '', isPublic: true, allowGuests: true, max: 12 })).toBe(false);
  expect(request).not.toHaveBeenCalled();
  expect(toastMessage.value).toBe(MISSING);
});

test('in a room the drawing\'s font can\'t change to one that isn\'t set up: a toast, no change, no undo step', async () => {
  const { project } = await drawing(cp437Font);
  project._hosting = true;
  const before = project.fontBitmap, undos = project.history.undoStack?.length;
  project.setDrawingFont({ ...noDark });
  expect(project.fontBitmap).toBe(before);
  expect(toastMessage.value).toBe('Slab has no Dark block. Set up its blocks on the Fonts page first.');
  expect(project.history.undoStack?.length).toBe(undos);
  project.setDrawingFont({ ...noDark, blocks: [219, 220, 223, 221, 222, 176, 177, 178] }); // set up
  expect(project.fontBitmap).not.toBe(before);
  project.setDrawingFont(null); // none is always fine
  expect(project.drawingFont).toBe(null);
});

test('outside a room a font that isn\'t set up can still be chosen', async () => {
  const { project } = await drawing(cp437Font);
  project.setDrawingFont({ ...noDark });
  expect(project.fontNotSetUp).not.toBe(null);
});

test('undo of a font change in a room puts back the font it had, set up or not', async () => {
  const { project } = await drawing(noDark); // outside: allowed
  project.setDrawingFont({ ...cp437Font, name: 'Slab', blocks: undefined });
  project._hosting = true;
  expect(project.fontNotSetUp).toBe(null);
  project.undo();
  expect(project.fontNotSetUp).not.toBe(null); // undo isn't refused, whatever it lands on
});

test('Use this font is off in a room for a font that isn\'t set up, with the reason', async () => {
  const { project, workspace, pinia } = await drawing(cp437Font);
  await addBitmapFont(new File([new Uint8Array(256 * 16).fill(3)], 'Bad.F16'));
  const good = await addBitmapFont(new File([new Uint8Array(256 * 16).fill(5)], 'Good.F16'));
  await storeBlocks(good.id, SLOTS);
  workspace.userFonts = await loadFonts();
  workspace.paletteLayerPage = 'fonts';
  project._hosting = true;
  await mountOn(pinia, CharPaletteLayer);
  const pick = async (name) => {
    [...host.querySelectorAll('.row')].find((r) => r.querySelector('.name span').textContent === name).click();
    await vi.waitFor(() => expect(host.querySelector('.edit-side .title').textContent.trim()).toBe(name));
    await vi.waitFor(() => expect(button('Use this font')).toBeTruthy());
  };
  await pick('Bad');
  await vi.waitFor(() => expect(button('Use this font').disabled).toBe(true));
  expect(button('Use this font').title).toContain('Bad has no');
  expect(button('Use this font').hasAttribute('data-off-reason')).toBe(true);
  await pick('Good');
  await vi.waitFor(() => expect(button('Use this font').disabled).toBe(false));
  expect(fontId(project.drawingFont)).not.toBe(good.id);
});

test('the Font dropdown disables a bitmap font that isn\'t set up, in a room only', async () => {
  const { project, workspace, pinia } = await drawing(cp437Font);
  const bad = await addBitmapFont(new File([new Uint8Array(256 * 16).fill(3)], 'Bad.F16'));
  workspace.userFonts = await loadFonts();
  await mountOn(pinia, FontField);
  const option = () => [...host.querySelectorAll('option')].find((o) => o.value === bad.id);
  expect(option().disabled).toBe(false);
  project._hosting = true;
  await vi.waitFor(() => expect(option().disabled).toBe(true));
});

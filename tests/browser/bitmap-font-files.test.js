// Bitmap fonts as files: the Fonts page's + Load takes raw .F01-.F32 fonts and PNG sheets, kept in this browser (userFonts.js),
// and picking one in the Font field gives the drawing that font. Saving and removing one are on the Fonts page.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import FontField from '@/components/FontField.vue';
import CharPaletteLayer from '@/components/CharPaletteLayer.vue';
import { parseFontSheet } from '@/lib/BitmapFont';
import { addBitmapFont, loadFonts, storedBitmapFont, removeFont } from '@/lib/userFonts';
import { setDisplayFont } from '@/lib/displayFonts';

let app = null, host = null;
afterEach(async () => {
  app?.unmount();
  host?.remove();
  app = host = null;
  vi.restoreAllMocks();
  for (const font of await loadFonts()) await removeFont(font.id);
});

// The palette layer, on its Fonts page.
const mountFontsPage = async (workspace) => {
  workspace.paletteLayerPage = 'fonts';
  host = document.body.appendChild(document.createElement('div'));
  app = createApp({ render: () => h(CharPaletteLayer) }).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
};

const rawFile = (height, name = `T${height}.F${String(height).padStart(2, '0')}`, fill = 0) => new File([new Uint8Array(256 * height).fill(fill)], name);

const pngFile = async (width, height, mark) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  mark?.(ctx);
  return new File([await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))], 'SHEET.png', { type: 'image/png' });
};

test('loads a raw font of any height', async () => {
  for (const height of [19, 1, 32]) {
    const font = await addBitmapFont(rawFile(height));
    expect(font).toMatchObject({ kind: 'bitmap', height });
    expect((await loadFonts()).find((f) => f.id === font.id)).toMatchObject({ kind: 'bitmap', height });
  }
});

test('loads a PNG sheet', async () => {
  const sheet = await pngFile(128, 128, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(8, 0, 8, 1); // slot 1's first row
  });
  const font = await addBitmapFont(sheet);
  expect(font.height).toBe(8);
  expect((await storedBitmapFont(font.id)).bytes[1 * 8 + 0]).toBe(0xff);
});

test('refuses a PNG that is no sheet', async () => {
  await createTestApp(); // loads the words
  await expect(addBitmapFont(await pngFile(100, 100))).rejects.toThrow(/bitmap font/);
});

test('loading the same font twice keeps one', async () => {
  const first = await addBitmapFont(rawFile(16, 'A.F16', 3)), second = await addBitmapFont(rawFile(16, 'B.F16', 3));
  expect(second.id).toBe(first.id);
  expect((await loadFonts()).filter((f) => f.kind === 'bitmap')).toHaveLength(1);
});

test('choosing a bitmap font gives the drawing that font, and a built-in takes it away', async () => {
  const { project, workspace } = await createTestApp();
  const font = await addBitmapFont(rawFile(8, 'EIGHT.F08', 5));
  workspace.userFonts = await loadFonts();
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(FontField) }).use(i18n);
  app.mount(host);
  await nextTick();
  const select = host.querySelector('select');
  select.value = font.id;
  select.dispatchEvent(new Event('change'));
  await expect.poll(() => project.drawingFont?.height).toBe(8);
  await nextTick();
  expect(host.querySelector('optgroup[label="This drawing"] option').value).toBe(font.id);
  select.value = 'jetbrains';
  select.dispatchEvent(new Event('change'));
  await nextTick();
  expect(project.drawingFont).toBeNull();
});

test('Save .F## and Save PNG download the drawing\'s font, named for it', async () => {
  const { project, workspace } = await createTestApp();
  const bytes = Uint8Array.from({ length: 256 * 16 }, (_, i) => (i * 7) % 256);
  project.setDrawingFont({ name: 'My Font.F16', height: 16, bytes });
  const saved = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { saved.push({ blob }); return 'blob:x'; });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { saved.at(-1).name = this.download; });
  await mountFontsPage(workspace);
  const press = (label) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === label).click();
  press('Save .F16');
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0].name).toBe('My Font.F16');
  expect(new Uint8Array(await saved[0].blob.arrayBuffer())).toEqual(bytes);
  press('Save PNG');
  // Chrome makes a PNG in idle time, waiting up to a second for some: longer while other files' tests keep it busy.
  await expect.poll(() => saved.length, { timeout: 5000 }).toBe(2);
  expect(saved[1].name).toBe('My Font.png'); // its name without the .F16 it was loaded from
  const image = await createImageBitmap(saved[1].blob), canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  expect(parseFontSheet(ctx.getImageData(0, 0, image.width, image.height), 'x').bytes).toEqual(bytes);
  // No name at all: still a file name.
  project.setDrawingFont({ name: '', height: 16, bytes });
  await nextTick();
  press('Save .F16');
  expect(saved[2].name).toBe('font.F16');
  // Named for an XBin it came in: the file's name, less its .xb.
  project.setDrawingFont({ name: 'ACID-55.XB', height: 16, bytes });
  await nextTick();
  press('Save .F16');
  press('Save PNG');
  await expect.poll(() => saved.length, { timeout: 5000 }).toBe(5);
  expect(saved.slice(3).map((s) => s.name)).toEqual(['ACID-55.F16', 'ACID-55.png']);
});

test('Remove clears the browser\'s copy of the drawing\'s font and leaves the drawing drawing in it, at its size', async () => {
  const { project, workspace } = await createTestApp();
  const font = await addBitmapFont(rawFile(16, 'SIXTEEN.F16', 0x3c));
  workspace.userFonts = await loadFonts();
  await mountFontsPage(workspace);
  const press = (label) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === label).click();
  press('Use in this drawing');
  await expect.poll(() => project.drawingFont?.height).toBe(16);
  workspace.displayFontSizes = { [font.id]: 24 };
  await setDisplayFont(workspace.displayFontSpec); // as App.vue does: the drawing's font registered and in use
  await nextTick();
  press('Remove'); // shown for the drawing's font: it's kept in this browser too
  await expect.poll(async () => (await loadFonts()).length).toBe(0);
  await nextTick();
  expect(project.drawingFont).not.toBeNull();
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `16px ${workspace.displayFontSpec.family}`;
  expect(ctx.measureText('M').width).toBe(8); // still the font's 8-pixel cells, not a fallback's
  expect(workspace.displayFontSizes).toEqual({ [font.id]: 24 });
});

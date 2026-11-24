// Bitmap fonts as files: the Fonts page's + Load takes raw .F01-.F32 fonts and PNG sheets, kept in this browser (userFonts.js),
// and picking one in the Font field gives the drawing that font. Saving and removing one are on the Fonts page.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import FontField from '@/components/FontField.vue';
import CharPaletteLayer from '@/components/CharPaletteLayer.vue';
import { writeXBin } from '@/lib/XBinFile';
import { addBitmapFont, loadFonts, storedBitmapFont, removeFont, storeBlocks, storeFontPart } from '@/lib/userFonts';
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
  localStorage.removeItem('phosphor.fontFilters'); // no group folded by a test before (fonts-page.test.js's folds are remembered)
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

test('blocks set for a stored font are listed, returned, kept when the font is loaded again, and cleared by null', async () => {
  const font = await addBitmapFont(rawFile(16, 'A.F16', 3));
  const blocks = [219, 254, 223, 221, 222, 176, null, 178];
  await storeBlocks(font.id, blocks);
  expect((await loadFonts()).find((f) => f.id === font.id).blocks).toEqual(blocks);
  expect((await storedBitmapFont(font.id)).blocks).toEqual(blocks);
  await addBitmapFont(rawFile(16, 'B.F16', 3));
  expect((await storedBitmapFont(font.id)).blocks).toEqual(blocks);
  await storeBlocks(font.id, null);
  expect((await loadFonts()).find((f) => f.id === font.id).blocks).toBeUndefined();
  expect((await storedBitmapFont(font.id)).blocks).toBeUndefined();
});

test('an XBin opens with the blocks kept for its font, before the font list is read', async () => {
  const { project, workspace } = await createTestApp();
  const bytes = new Uint8Array(256 * 16);
  const font = await addBitmapFont(new File([bytes], 'K.F16'));
  const blocks = [219, 254, 223, 221, 222, 176, 177, 178];
  await storeBlocks(font.id, blocks);
  workspace.userFonts = null;
  const cells = [{ char: '▄', fg: { hex: '#aaaaaa' }, bg: { hex: '#000000' } }];
  const palette = ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'];
  await project.openArtFile(new File([writeXBin({ cols: 1, rows: 1, cells, palette, font: { name: 'K', height: 16, bytes, blocks } })], 'k.xb'));
  expect(project.fontBlocks).toBe(blocks.join('.'));
  await settle(project); // so no late work reaches the next test
});

test('an XBin opens with the line styles and sets kept for its font', async () => {
  const { project, workspace } = await createTestApp();
  const bytes = new Uint8Array(256 * 16);
  const font = await addBitmapFont(new File([bytes], 'K.F16'));
  const lines = { hide: ['double'], styles: [{ id: 'l1', name: 'Heavy', slots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }] };
  const sets = { hideStock: true, sets: [{ id: 's1', name: 'Grit', slots: [250, 176] }] };
  await storeFontPart(font.id, 'lines', lines);
  await storeFontPart(font.id, 'sets', sets);
  workspace.userFonts = null;
  const cells = [{ char: 'A', fg: { hex: '#aaaaaa' }, bg: { hex: '#000000' } }];
  const palette = ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'];
  await project.openArtFile(new File([writeXBin({ cols: 1, rows: 1, cells, palette, font: { name: 'K', height: 16, bytes } })], 'k.xb'));
  expect(project.drawingFont.lines).toEqual(lines);
  expect(project.drawingFont.sets).toEqual(sets);
  await settle(project); // so no late work reaches the next test
});

test('choosing a bitmap font gives the drawing that font, and a built-in takes it away', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10 });
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

test('Remove clears the browser\'s copy of the drawing\'s font and leaves the drawing drawing in it, at its size', async () => {
  const { project, workspace } = await createTestApp();
  const font = await addBitmapFont(rawFile(16, 'SIXTEEN.F16', 0x3c));
  workspace.userFonts = await loadFonts();
  await mountFontsPage(workspace);
  const press = (label) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === label).click();
  [...host.querySelectorAll('.row')].find((r) => r.querySelector('.name span').textContent === 'SIXTEEN').click(); // the page opens on the font in use
  await nextTick();
  press('Use this font');
  await expect.poll(() => project.drawingFont?.height).toBe(16);
  workspace.displayFontSizes = { [font.id]: 24 };
  await setDisplayFont(workspace.displayFontSpec); // as App.vue does: the drawing's font registered and in use
  await nextTick();
  press('…');
  await nextTick();
  press('Remove'); // shown for the drawing's font: it's kept in this browser too
  await expect.poll(async () => (await loadFonts()).length).toBe(0);
  await nextTick();
  expect(project.drawingFont).not.toBeNull();
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `16px ${workspace.displayFontSpec.family}`;
  expect(ctx.measureText('M').width).toBe(6); // still the font's own cells, not a fallback's: rows of 0x3c are 6 wide, drawn so while unanswered
  expect(workspace.displayFontSizes).toEqual({ [font.id]: 24 });
});

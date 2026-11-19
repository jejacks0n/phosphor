// Bitmap fonts as files: Load font takes raw .F01-.F32 fonts and PNG sheets, kept in this browser (userFonts.js),
// and picking one in the Font field gives the drawing that font.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import FontField from '@/components/FontField.vue';
import { addBitmapFont, loadFonts, storedBitmapFont, removeFont } from '@/lib/userFonts';

let app = null, host = null;
afterEach(async () => {
  app?.unmount();
  host?.remove();
  app = host = null;
  for (const font of await loadFonts()) await removeFont(font.id);
});

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
  expect([...host.querySelectorAll('button')].map((b) => b.textContent.trim())).toEqual(expect.arrayContaining(['Save .F08', 'Save PNG']));
  select.value = 'jetbrains';
  select.dispatchEvent(new Event('change'));
  await nextTick();
  expect(project.drawingFont).toBeNull();
});

// The palette layer's Fonts page: the drawing's font and yours, each sampled in its own glyphs; the chosen one's
// 256 slots and its actions (Load, Save, Use in this drawing, View in it, Export palettes, Remove).
import { test, expect, vi, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import CharPaletteLayer from '@/components/CharPaletteLayer.vue';
import { createTestApp } from '../support/app.js';
import { usePaletteStore } from '@/store/PaletteStore.js';
import { fontId } from '@/lib/BitmapFont.js';
import { addFont, addBitmapFont, loadFonts, removeFont } from '@/lib/userFonts';

const fontA = () => ({ name: 'A', height: 8, bytes: new Uint8Array(2048).fill(1) });
const rawFile = (height, name, fill = 0) => new File([new Uint8Array(256 * height).fill(fill)], name);
const ttfFile = async () => new File([await (await fetch('/tests/fixtures/fonts/tall.ttf')).arrayBuffer()], 'Tall Mono.ttf');
let app = null, host = null, closes = 0;

afterEach(async () => {
  app?.unmount();
  host?.remove();
  app = host = null;
  vi.restoreAllMocks();
  for (const font of await loadFonts()) await removeFont(font.id);
});

// The layer on its Fonts page over a blank canvas: the drawing in font A unless drawing is false, with B (an 8×16
// bitmap font) and a TrueType font kept in this browser.
async function mount({ drawing = true, canvas = true } = {}) {
  const { project, workspace } = await createTestApp();
  const pinia = getActivePinia(); // before the awaits: a late await of an earlier test can make its own Pinia active again
  if (canvas) await project.setBlankCanvas({ cols: 10, rows: 10 });
  if (drawing) project.setDrawingFont(fontA());
  const b = await addBitmapFont(rawFile(16, 'B.F16', 3)), tt = await addFont(await ttfFile());
  workspace.userFonts = await loadFonts();
  workspace.paletteLayerPage = 'fonts';
  host = document.body.appendChild(document.createElement('div'));
  closes = 0;
  app = createApp({ render: () => h(CharPaletteLayer, { onClose: () => { closes += 1; } }) }).use(pinia).use(i18n);
  app.mount(host);
  await nextTick();
  return { project, workspace, palettes: usePaletteStore(pinia), b, tt };
}
const button = (text) => [...host.querySelectorAll('button')].find((el) => el.textContent.trim() === text);
const row = (name) => [...host.querySelectorAll('.row')].find((r) => r.querySelector('.name span').textContent === name);
const names = () => [...host.querySelectorAll('.row')].map((r) => r.querySelector('.name span').textContent);
const actions = () => [...host.querySelectorAll('.edit-side .actions button')].map((el) => el.textContent.trim());
const title = () => host.querySelector('.edit-side .title')?.textContent.trim();
const press = async (el) => {
  el.click();
  await nextTick();
};

test('the switch moves between the pages', async () => {
  const { workspace } = await mount();
  expect(button('Palettes')).toBeTruthy();
  expect(button('Fonts')).toBeTruthy();
  expect(host.querySelector('.palette-layer').classList.contains('editing')).toBe(true); // always the wide layout
  await press(button('Palettes'));
  expect(workspace.paletteLayerPage).toBe('palettes');
  expect(row('Shades & blocks')).toBeTruthy();
  expect(host.querySelector('.palette-layer').classList.contains('editing')).toBe(true); // from Fonts, the palette editor: it doesn't shrink
  await press(button('Fonts'));
  expect(workspace.paletteLayerPage).toBe('fonts');
});

test('lists the drawing\'s font first, then yours', async () => {
  const { b, tt } = await mount();
  expect([...host.querySelectorAll('.group .label')].map((el) => el.textContent.trim())).toEqual(['This drawing', 'Yours']);
  expect([...host.querySelectorAll('.row')].map((r) => [r.querySelector('.name span').textContent, r.querySelector('.name em').textContent]))
    .toEqual([['A', '8×8'], ['B', '8×16'], ['Tall Mono', 'TrueType']]);
  const sample = (name) => row(name).querySelector('.sample');
  expect(sample('A').textContent).toBe('Aa░▒▓█▄▀╔═╗☺');
  expect(sample('A').style.fontFamily).toContain(fontId(fontA()));
  expect(sample('A').style.fontSize).toBe('16px'); // 8 rows tall: twice its size
  expect(sample('B').style.fontFamily).toContain(b.id);
  expect(sample('B').style.fontSize).toBe('16px');
  expect(sample('Tall Mono').style.fontFamily).toContain(tt.id);
});

test('the drawing\'s font\'s actions', async () => {
  const { workspace } = await mount();
  expect(title()).toBe('A');
  expect(host.querySelector('.edit-side .meta').textContent).toBe('8×8 · the drawing\'s font · no palettes');
  expect(actions()).toEqual(['Save .F08', 'Save PNG', 'Export palettes', 'Palettes ▸']); // no Remove: A isn't kept in this browser
  expect(button('Export palettes').disabled).toBe(true); // it has none
  const cells = host.querySelectorAll('.sheet .cell');
  expect(cells).toHaveLength(256);
  expect(cells[0].textContent).toBe(' ');
  expect(host.querySelector('.sheet').style.fontFamily).toContain(fontId(fontA()));
  cells[65].dispatchEvent(new Event('mouseenter'));
  await nextTick();
  expect(host.querySelector('.edit-side .info').textContent).toBe('Slot 65 A');
  await press(button('Palettes ▸'));
  expect(workspace.paletteLayerPage).toBe('palettes');
});

test('Export palettes saves the font\'s palettes', async () => {
  const { palettes } = await mount();
  palettes.rename(palettes.create(), 'Frogs'); // tied to A, the drawing's font
  await nextTick();
  expect(host.querySelector('.edit-side .meta').textContent).toBe('8×8 · the drawing\'s font · 1 palette');
  const saved = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { saved.push({ blob }); return 'blob:x'; });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { saved.at(-1).name = this.download; });
  await press(button('Export palettes'));
  expect(saved[0].name).toBe('A.palettes.json');
  expect(JSON.parse(await saved[0].blob.text()).palettes.map((p) => p.name)).toEqual(['Frogs']);
});

test('choosing another font only shows it; Use in this drawing applies it', async () => {
  const { project, b } = await mount();
  await press(row('B'));
  expect(title()).toBe('B');
  expect(host.querySelector('.edit-side .meta').textContent).toBe('8×16 · in your browser · no palettes');
  expect(fontId(project.drawingFont)).toBe(fontId(fontA()));
  expect(actions()).toEqual(['Use in this drawing', 'Save .F16', 'Save PNG', 'Export palettes', 'Remove']);
  await press(button('Use in this drawing'));
  await expect.poll(() => project.drawingFont && fontId(project.drawingFont)).toBe(b.id);
  project.undo();
  expect(fontId(project.drawingFont)).toBe(fontId(fontA()));
});

test('the arrow keys choose the next and previous fonts', async () => {
  await mount();
  const layer = host.querySelector('.palette-layer'), key = async (k) => {
    layer.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    await nextTick();
  };
  expect(title()).toBe('A');
  await key('ArrowDown');
  expect(title()).toBe('B');
  expect(host.querySelector('.row.current .name span').textContent).toBe('B');
  await key('ArrowUp');
  expect(title()).toBe('A');
  await key('ArrowUp'); // already the first
  expect(title()).toBe('A');
  const filter = host.querySelector('.top input');
  filter.value = 'Tall';
  filter.dispatchEvent(new Event('input'));
  await nextTick();
  await key('ArrowDown'); // through the rows the filter leaves
  expect(title()).toBe('Tall Mono');
  filter.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); // the filter keeps its keys
  await nextTick();
  expect(title()).toBe('Tall Mono');
});

test('the keys stay with the layer when the button pressed goes away', async () => {
  const { project, b } = await mount();
  const escape = () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const pressFocused = (el) => {
    el.focus();
    el.click();
  };
  await press(row('B'));
  pressFocused(button('Use in this drawing')); // gone once B is the drawing's
  await expect.poll(() => project.drawingFont && fontId(project.drawingFont)).toBe(b.id);
  await expect.poll(() => host.contains(document.activeElement)).toBe(true);
  escape();
  expect(closes).toBe(1);
  pressFocused(button('Palettes ▸')); // the page it's on goes away
  await expect.poll(() => host.contains(document.activeElement)).toBe(true);
  escape();
  expect(closes).toBe(2);
});

test('a TrueType font shows a sample and View in it', async () => {
  const { project, workspace, tt } = await mount();
  await press(row('Tall Mono'));
  expect(host.querySelector('.sheet')).toBeNull();
  expect(host.querySelectorAll('.edit-side .sample-text div')).toHaveLength(5);
  expect(host.querySelector('.edit-side .sample-text').style.fontFamily).toContain(tt.id);
  expect(host.querySelector('.edit-side .note').textContent).toContain('A TrueType font draws any character');
  expect(actions()).toEqual(['View in it', 'Remove']);
  await press(button('View in it'));
  await expect.poll(() => workspace.displayFont).toBe(tt.id);
  expect(project.drawingFont).toBeNull();
});

test('+ Load loads and applies, and says why not', async () => {
  const { project } = await mount();
  const input = host.querySelector('input[type="file"]');
  expect(input.accept).toContain('.f16');
  expect(input.accept).toContain('.ttf');
  const choose = (file) => {
    const files = new DataTransfer();
    files.items.add(file);
    input.files = files.files;
    input.dispatchEvent(new Event('change'));
  };
  choose(rawFile(16, 'NEW.F16', 7));
  await expect.poll(() => project.drawingFont?.name).toBe('NEW');
  await nextTick();
  expect(title()).toBe('NEW');
  expect(host.querySelector('.row.current .name span').textContent).toBe('NEW');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 100;
  choose(new File([await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))], 'SHEET.png', { type: 'image/png' }));
  await expect.poll(() => host.querySelector('[role="alert"]')?.textContent).toContain('SHEET isn\'t a bitmap font Phosphor can read');
});

test('Remove forgets the browser\'s copy', async () => {
  const { palettes, b } = await mount();
  const id = palettes.create();
  palettes.tie(id, { id: b.id, name: 'B', height: 16 });
  await press(row('B'));
  expect(host.querySelector('.edit-side .meta').textContent).toBe('8×16 · in your browser · 1 palette');
  await press(button('Remove'));
  await expect.poll(names).toEqual(['A', 'Tall Mono']);
  expect(title()).toBe('A'); // the drawing's font, chosen in its place
  expect((await loadFonts()).map((f) => f.id)).not.toContain(b.id);
  expect(palettes.userPalettes.map((p) => p.id)).toContain(id);
  expect(palettes.unloaded.map((p) => p.id)).toEqual([id]);
});

test('in someone else\'s room, applying is off', async () => {
  const { workspace } = await mount();
  workspace.roomFont = { id: 'jetbrains', name: 'JetBrains Mono', family: 'JetBrains Mono', size: 16, lineHeight: 1.2 };
  await press(row('B'));
  expect(button('Use in this drawing').disabled).toBe(true);
  expect(button('Save .F16').disabled).toBe(false);
  expect(button('Remove').disabled).toBe(false);
  await press(row('Tall Mono'));
  expect(button('View in it').disabled).toBe(true);
});

test('before any drawing is open, the font chosen is the next drawing\'s', async () => {
  await mount({ canvas: false });
  expect([...host.querySelectorAll('.group .label')].map((el) => el.textContent.trim())).toEqual(['Next drawing', 'Yours']);
  expect(host.querySelector('.edit-side .meta').textContent).toContain('the next drawing\'s font');
  await press(row('B'));
  expect(button('Use in the next drawing')).toBeTruthy();
  expect(button('Use in this drawing')).toBeUndefined();
});

// The palette layer's Fonts page: the drawing's font and yours, each sampled in its own glyphs; the chosen one's
// 256 slots and its actions (Load, Save, Use this font, Export palettes, Remove).
import { test, expect, vi, afterEach, onTestFinished } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import CharPaletteLayer from '@/components/CharPaletteLayer.vue';
import { createTestApp } from '../support/app.js';
import { usePaletteStore } from '@/store/PaletteStore.js';
import { fontId, blocksOf, fontKey } from '@/lib/BitmapFont.js';
import { storedBitmapFont } from '@/lib/userFonts';
import { cp437Font, lowerAt240, noLowerHalf } from '../support/blockFonts.js';
import { addFont, addBitmapFont, loadFonts, removeFont } from '@/lib/userFonts';

const fontA = () => ({ name: 'A', height: 8, bytes: new Uint8Array(2048).fill(1) });
const rawFile = (height, name, fill = 0) => new File([new Uint8Array(256 * height).fill(fill)], name);
const BUILT_IN = ['JetBrains Mono', 'IBM VGA', 'Unscii', 'Unifont'];
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
async function mount({ drawing = true, canvas = true, font = null } = {}) {
  const { project, workspace } = await createTestApp();
  const pinia = getActivePinia(); // before the awaits: a late await of an earlier test can make its own Pinia active again
  if (canvas) await project.setBlankCanvas({ cols: 10, rows: 10 });
  if (drawing) project.setDrawingFont(font ?? fontA());
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

test('the pages are tabs, and the layer taking the whole window has a close button', async () => {
  const { workspace } = await mount();
  const tabs = [...host.querySelectorAll('[role="tablist"] [role="tab"]')];
  expect(tabs.map((el) => [el.textContent.trim(), el.getAttribute('aria-selected')])).toEqual([['Palettes', 'false'], ['Fonts', 'true']]);
  await press(host.querySelector('button.dismiss[aria-label="Close"]')); // a phone's width: the whole window
  expect(closes).toBe(1);
  await press(tabs[0]);
  expect(workspace.paletteLayerPage).toBe('palettes');
  expect(host.querySelector('button.dismiss')).toBeTruthy(); // the palette editor takes it too
});

test('floating, however wide, the layer has no close button: a press outside closes it', async () => {
  await page.viewport(1400, 900);
  onTestFinished(() => page.viewport(414, 896));
  await mount();
  await vi.waitFor(() => expect(getComputedStyle(host.querySelector('.palette-layer')).position).toBe('absolute'));
  expect(host.querySelector('button.dismiss')).toBeNull();
});

test('on a window under 1000px wide, the layer is a dialog over the page; under 700px, the whole window', async () => {
  await page.viewport(850, 700);
  onTestFinished(() => page.viewport(414, 896));
  await mount();
  const layer = host.querySelector('.palette-layer'), box = () => layer.getBoundingClientRect();
  await vi.waitFor(() => expect(getComputedStyle(layer).position).toBe('fixed'));
  expect([box().left, Math.round(box().width)]).toEqual([20, 810]); // 20px clear of the edges, as the About dialog
  expect(box().top).toBeGreaterThanOrEqual(20);
  expect(box().top).toBe(700 - box().bottom); // centered
  expect(host.querySelector('button.dismiss')).toBeTruthy();
  host.querySelector('.scrim').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  expect(closes).toBe(1); // a press on the dimmed page closes it
  await page.viewport(690, 700);
  await vi.waitFor(() => expect([box().left, box().top, box().width]).toEqual([0, 0, 690])); // the whole window
  expect(host.querySelector('.scrim')).toBeNull();
  expect(host.querySelector('button.dismiss')).toBeTruthy();
});

test('resizing the side panel leaves the layer open', async () => {
  await mount();
  const grip = document.body.appendChild(document.createElement('div')); // the panel's edge
  grip.setAttribute('role', 'separator');
  onTestFinished(() => grip.remove());
  grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await nextTick();
  expect(closes).toBe(0);
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  expect(closes).toBe(1); // a press anywhere else outside still closes it
});

test('lists the drawing\'s font first, then yours, then the built-in ones', async () => {
  const { b, tt } = await mount();
  expect([...host.querySelectorAll('.group .label')].map((el) => el.textContent.trim())).toEqual(['In use', 'Yours', 'Built-in']);
  expect([...host.querySelectorAll('.row')].map((r) => [r.querySelector('.name span').textContent, r.querySelector('.name em').textContent]))
    .toEqual([['A', '8×8'], ['B', '8×16'], ['Tall Mono', 'TrueType'], ...BUILT_IN.map((name) => [name, 'TrueType'])]);
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

test('choosing another font only shows it; Use this font applies it', async () => {
  const { project, b } = await mount();
  await press(row('B'));
  expect(title()).toBe('B');
  expect(host.querySelector('.edit-side .meta').textContent).toBe('8×16 · in your browser · no palettes');
  expect(fontId(project.drawingFont)).toBe(fontId(fontA()));
  expect(actions()).toEqual(['Use this font', 'Save .F16', 'Save PNG', 'Export palettes', 'Remove']);
  await press(button('Use this font'));
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
  pressFocused(button('Use this font')); // gone once B is the drawing's
  await expect.poll(() => project.drawingFont && fontId(project.drawingFont)).toBe(b.id);
  await expect.poll(() => host.contains(document.activeElement)).toBe(true);
  escape();
  expect(closes).toBe(1);
  pressFocused(button('Palettes ▸')); // the page it's on goes away
  await expect.poll(() => host.contains(document.activeElement)).toBe(true);
  escape();
  expect(closes).toBe(2);
});

test('a TrueType font shows a sample and Use this font', async () => {
  const { project, workspace, tt } = await mount();
  await press(row('Tall Mono'));
  expect(host.querySelector('.sheet')).toBeNull();
  expect(host.querySelectorAll('.edit-side .sample-text div')).toHaveLength(5);
  expect(host.querySelector('.edit-side .sample-text').style.fontFamily).toContain(tt.id);
  expect(host.querySelector('.edit-side .note').textContent).toContain('A TrueType font draws any character');
  expect(actions()).toEqual(['Use this font', 'Export palettes', 'Remove']);
  await press(button('Use this font'));
  await expect.poll(() => workspace.displayFont).toBe(tt.id);
  expect(project.drawingFont).toBeNull();
  // In use, as a bitmap font is once used: first, under In use, with nothing left to apply
  expect([...host.querySelectorAll('.group .label')].map((el) => el.textContent.trim())).toEqual(['In use', 'Yours', 'Built-in']);
  expect(names()).toEqual(['Tall Mono', 'B', ...BUILT_IN]);
  expect(host.querySelector('.edit-side .meta').textContent).toBe('TrueType · in use · in your browser · no palettes');
  expect(actions()).toEqual(['Export palettes', 'Palettes ▸', 'Remove']);
});

test('a built-in font shows a sample and Use this font, and is listed under In use once used', async () => {
  const { project, workspace } = await mount();
  await press(row('IBM VGA'));
  expect(host.querySelector('.sheet')).toBeNull();
  expect(host.querySelector('.edit-side .sample-text').style.fontFamily).toContain('IBM VGA 8x16');
  expect(host.querySelector('.edit-side .meta').textContent).toBe('TrueType · built in · no palettes');
  expect(actions()).toEqual(['Use this font', 'Export palettes']); // nothing to save or remove
  await press(button('Use this font'));
  await expect.poll(() => workspace.displayFont).toBe('vga');
  expect(project.drawingFont).toBeNull();
  expect(names()).toEqual(['IBM VGA', 'B', 'Tall Mono', 'JetBrains Mono', 'Unscii', 'Unifont']);
  expect(host.querySelector('.edit-side .meta').textContent).toBe('TrueType · in use · built in · no palettes');
  expect(actions()).toEqual(['Export palettes', 'Palettes ▸']);
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
  await expect.poll(names).toEqual(['A', 'Tall Mono', ...BUILT_IN]);
  expect(title()).toBe('A'); // the drawing's font, chosen in its place
  expect((await loadFonts()).map((f) => f.id)).not.toContain(b.id);
  expect(palettes.userPalettes.map((p) => p.id)).toContain(id);
  expect(palettes.unloaded.map((p) => p.id)).toEqual([id]);
});

test('in someone else\'s room, applying is off', async () => {
  const { workspace } = await mount();
  workspace.roomFont = { id: 'jetbrains', name: 'JetBrains Mono', family: 'JetBrains Mono', size: 16, lineHeight: 1.2 };
  await press(row('B'));
  expect(button('Use this font').disabled).toBe(true);
  expect(button('Save .F16').disabled).toBe(false);
  expect(button('Remove').disabled).toBe(false);
  await press(row('Tall Mono'));
  expect(button('Use this font').disabled).toBe(true);
});

test('before any drawing is open, the font chosen is the next drawing\'s', async () => {
  await mount({ canvas: false });
  expect([...host.querySelectorAll('.group .label')].map((el) => el.textContent.trim())).toEqual(['In use', 'Yours', 'Built-in']);
  expect(host.querySelector('.edit-side .meta').textContent).toContain('the next drawing\'s font');
  await press(row('B'));
  expect(button('Use this font')).toBeTruthy();
});

const tiles = () => [...host.querySelectorAll('.blocks button.tile')].map((el) => ({ el, name: el.querySelector('.name').textContent, slot: el.querySelector('.slot').textContent }));
const tile = (name) => tiles().find((t) => t.name === name).el;
const slotCell = (n) => host.querySelectorAll('.sheet .cell')[n];
const text = () => host.querySelector('.edit-side').textContent.replace(/\s+/g, ' ');

test('shows the eight blocks, and where CP437 would put a moved one', async () => {
  await mount({ font: lowerAt240 });
  expect(tiles().map((t) => t.slot)).toEqual(['219', '240', '223', '221', '222', '176', '177', '178']);
  expect(tiles().map((t) => t.name)).toEqual(['Full', 'Lower', 'Upper', 'Left', 'Right', 'Light', 'Medium', 'Dark']);
  expect(text()).toContain('Lower half found at slot 240. CP437 puts it at 220, which holds');
  expect(text()).toContain('To change a block, pick it');
  expect(slotCell(240).textContent).toBe('▄'); // the sheet shows each slot's own character
  expect(slotCell(240).classList.contains('role')).toBe(true);
  expect(host.querySelector('.edit-side .actions').textContent).not.toContain('Find blocks again');
});

test('a font with every block where CP437 puts it says so', async () => {
  await mount({ font: cp437Font });
  expect(text()).toContain('All eight blocks found');
});

test('picking Lower and clicking a slot sets it, as one undo step, and Find blocks again clears it', async () => {
  const { project } = await mount({ font: lowerAt240 });
  await press(tile('Lower'));
  expect(tile('Lower').getAttribute('aria-pressed')).toBe('true');
  await press(slotCell(254));
  expect(blocksOf(project.drawingFont)[1]).toBe(254);
  expect(tiles()[1].slot).toBe('254');
  expect(tile('Lower').getAttribute('aria-pressed')).toBe('true'); // it stays picked
  expect(host.querySelector('.edit-side .meta').textContent).toContain('blocks set by you');
  slotCell(254).dispatchEvent(new Event('mouseenter'));
  await nextTick();
  expect(host.querySelector('.edit-side .info').textContent).toBe('Slot 254 ▄ · Lower half (set by you)');
  slotCell(219).dispatchEvent(new Event('mouseenter'));
  await nextTick();
  expect(host.querySelector('.edit-side .info').textContent).toBe('Slot 219 █ · Full block'); // found, so not "set by you"
  project.undo();
  await nextTick();
  expect(blocksOf(project.drawingFont)[1]).toBe(240);
  expect(host.querySelector('.edit-side .meta').textContent).not.toContain('blocks set by you');
  await press(slotCell(254)); // still picked
  await press(button('Find blocks again'));
  expect(project.fontBlocks).toBe('');
  expect(tiles()[1].slot).toBe('240');
});

test('picking the slot a block already has is no change, and a tile unpicks on a second click', async () => {
  const { project } = await mount({ font: lowerAt240 });
  await press(tile('Lower'));
  await press(slotCell(240));
  expect(project.fontBlocks).toBe('');
  await press(tile('Lower'));
  expect(tile('Lower').getAttribute('aria-pressed')).toBe('false');
});

test('a font with no lower half says paint is off', async () => {
  await mount({ font: noLowerHalf });
  expect(tiles()[1].slot).toBe('none');
  expect(tile('Lower').classList.contains('missing')).toBe(true);
  expect(text()).toContain('No lower half found in this font, so drawings in it can\u2019t hold paint');
  expect(host.querySelector('.blocks .note').classList.contains('warn')).toBe(true);
});

test('an edit to a font only in the browser is kept with it and leaves the drawing alone', async () => {
  const { project, workspace } = await mount();
  const stored = await addBitmapFont(new File([lowerAt240.bytes], 'L.F16'));
  workspace.userFonts = await loadFonts();
  await vi.waitFor(() => expect(row('L')).toBeTruthy());
  await press(row('L'));
  await vi.waitFor(() => expect(tiles()[1]?.slot).toBe('240'));
  await press(tile('Lower'));
  await press(slotCell(254));
  await vi.waitFor(async () => expect((await storedBitmapFont(stored.id)).blocks?.[1]).toBe(254));
  expect(project.fontBlocks).toBe(''); // the drawing's font is untouched
  expect(workspace.userFonts.find((f) => f.id === stored.id).blocks[1]).toBe(254);
  await vi.waitFor(() => expect(button('Find blocks again')).toBeTruthy());
  await press(button('Find blocks again'));
  await vi.waitFor(async () => expect((await storedBitmapFont(stored.id)).blocks).toBeUndefined());
});

test('a palette tied to the font stays tied after its blocks change', async () => {
  const { project, palettes } = await mount({ font: lowerAt240 });
  const id = fontId(lowerAt240);
  palettes.create(); // made in the drawing, so tied to its font
  expect(palettes.countFor(id)).toBe(1);
  await press(tile('Lower'));
  await press(slotCell(254));
  expect(fontId(project.drawingFont)).toBe(id);
  expect(palettes.countFor(id)).toBe(1);
});

test('block edits on the drawing\u2019s font are off in a room', async () => {
  const { project } = await mount({ font: lowerAt240 });
  project._hosting = true;
  await nextTick();
  expect(tile('Lower').disabled).toBe(true);
  expect(tile('Lower').title).toBe('Blocks can\u2019t change in a room.');
  await press(slotCell(254));
  expect(project.fontBlocks).toBe('');
});

test('the rows and sheet draw in the font\u2019s face again once its blocks move', async () => {
  const { project } = await mount({ font: lowerAt240 });
  await press(tile('Lower'));
  await press(slotCell(254));
  await vi.waitFor(() => expect(host.querySelector('.sheet').style.fontFamily).toContain(fontKey(project.drawingFont)));
});

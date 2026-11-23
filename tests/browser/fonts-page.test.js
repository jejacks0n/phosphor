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
import { fontId, blocksOf, fontKey, slotOf, CP437_BLOCKS as cp437Blocks } from '@/lib/BitmapFont.js';
import { SAMPLE_CHARS } from '@/lib/BitmapGlyphs.js';
import { storedBitmapFont } from '@/lib/userFonts';
import { cp437Font, lowerAt240, noLowerHalf } from '../support/blockFonts.js';
import { addFont, addBitmapFont, loadFonts, removeFont, storeFontPart } from '@/lib/userFonts';
import { openFontSetup } from '@/composables/useFontSetup.js';
import { forgetLibrary } from '@/lib/fontLibrary';
import { useFontActions } from '@/composables/useFontActions.js';
import { toastMessage, toastAction, closeToast } from '@/composables/useToast.js';
import { askFontWidth } from '@/composables/useFontWidth.js';

// A stand-in linked font: the font whose id a test sets is FROGBLOCK, as FROGBLOCK's bytes can't be shipped.
vi.mock('@/lib/linkedFonts', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, linkedFontOf: (id) => (id === globalThis.__linkedId ? real.LINKED_FONTS[0] : real.linkedFontOf(id)) };
});

const fontA = () => ({ name: 'A', height: 8, bytes: new Uint8Array(2048).fill(1) });
const rawFile = (height, name, fill = 0) => new File([new Uint8Array(256 * height).fill(fill)], name);
const BUILT_IN = ['IBM VGA', 'JetBrains Mono', 'Unscii', 'Unifont'];
const ttfFile = async () => new File([await (await fetch('/tests/fixtures/fonts/tall.ttf')).arrayBuffer()], 'Tall Mono.ttf');
let app = null, host = null, closes = 0;

afterEach(async () => {
  app?.unmount();
  host?.remove();
  app = host = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  forgetLibrary();
  globalThis.__linkedId = undefined;
  for (const font of await loadFonts()) await removeFont(font.id);
});

// The layer on its Fonts page over a blank canvas: the drawing in font A unless drawing is false, with B (an 8×16
// bitmap font) and a TrueType font kept in this browser.
async function mount({ drawing = true, canvas = true, font = null, before = null, library = false } = {}) {
  stubLibrary(library);
  const { project, workspace } = await createTestApp();
  const pinia = getActivePinia(); // before the awaits: a late await of an earlier test can make its own Pinia active again
  if (canvas) await project.setBlankCanvas({ cols: 10, rows: 10 });
  if (drawing) project.setDrawingFont(font ?? fontA());
  const b = await addBitmapFont(rawFile(16, 'B.F16', 3)), tt = await addFont(await ttfFile());
  workspace.userFonts = await loadFonts();
  workspace.paletteLayerPage = 'fonts';
  before?.({ project, workspace });
  host = document.body.appendChild(document.createElement('div'));
  closes = 0;
  app = createApp({ render: () => h(CharPaletteLayer, { onClose: () => { closes += 1; } }) }).use(pinia).use(i18n);
  app.mount(host);
  await nextTick();
  return { project, workspace, palettes: usePaletteStore(pinia), b, tt };
}
// The library index the page fetches: this fixture (or none: it fails to load), other URLs going through.
const SAMPLE_B64 = btoa(String.fromCharCode(...new Uint8Array(12 * 8).fill(0x18)));
const libFont = (name, extra = {}) => ({ id: `viler/${name}.F08`, fontId: `bitmap-${name}`, name, file: `viler/${name}.F08`, height: 8, collection: 'viler', machine: 'IBM PC', chars: 'cp437', ready: true, sample: SAMPLE_B64, ...extra });
const FIXTURE = () => ({
  version: 1,
  collections: { viler: { name: 'VileR', url: 'https://example.test/viler', license: { kind: 'none', file: 'viler/FONTS.TXT' } }, moebius: { name: 'Mœbius', url: 'https://example.test/moebius', license: { kind: 'unknown' } } },
  fonts: [
    libFont('Zeta'),
    libFont('Topaz', { machine: 'Amiga', collection: 'moebius', chars: 'latin1', height: 16, about: 'a rounded face' }),
    libFont('Alpha', { ready: false }),
  ],
  linked: [{ id: 'linked/frogblock', fontId: 'bitmap-frog', name: 'FROGBLOCK', height: 8, machine: 'Custom', chars: 'cp437', linked: { credit: 'FROGBLOCK font by Polyducks', url: 'https://polyducks.itch.io/frogblock', license: 'https://example.test/frog-license' } }],
});
let indexFetches = 0;
function stubLibrary(index) {
  const real = fetch.bind(globalThis);
  indexFetches = 0;
  vi.stubGlobal('fetch', async (url, ...rest) => {
    if (!String(url).endsWith('fonts/library/index.json')) return real(url, ...rest);
    indexFetches += 1;
    if (!index) return new Response('', { status: 404 });
    return new Response(JSON.stringify(index));
  });
}
const libraryNames = () => [...host.querySelectorAll('.row.library .name span')].map((el) => el.textContent);
const waitFor = (check) => vi.waitFor(() => expect(check()).toBeTruthy());
const type = async (text) => {
  const input = host.querySelector('.top input');
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await nextTick();
};
const chip = (label) => [...host.querySelectorAll('.font-filters .chip')].find((el) => el.firstChild.textContent.trim() === label);
const toggle = () => host.querySelector('.top button.filters-toggle'); // « / » beside the search
const openFilters = () => press(toggle()); // the Filters column starts folded: » opens it
// A window wide enough for the floating layer, with room for the Filters column beside the list.
const wide = async () => {
  await page.viewport(1400, 900);
  onTestFinished(() => page.viewport(414, 896));
};
const label = () => host.querySelector('.library-group .label').textContent.trim();

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
  const tabs = [...host.querySelectorAll('.pages [role="tablist"] [role="tab"]')];
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

test('the full screen button takes the whole window and gives it back; on a phone the layer already has it', async () => {
  await page.viewport(1400, 900);
  onTestFinished(() => page.viewport(414, 896));
  await mount();
  const layer = host.querySelector('.palette-layer'), box = () => layer.getBoundingClientRect();
  await vi.waitFor(() => expect(getComputedStyle(layer).position).toBe('absolute'));
  const full = () => host.querySelector('.pages button.maximize');
  expect(full().getAttribute('aria-label')).toBe('Full screen');
  await press(full());
  await vi.waitFor(() => expect([box().left, box().top, box().width, box().height]).toEqual([0, 0, 1400, 900]));
  expect(getComputedStyle(host.querySelector('.page')).flexDirection).toBe('row'); // the list stays beside the editor
  expect(full().getAttribute('aria-label')).toBe('Exit full screen');
  expect(host.querySelector('button.dismiss')).toBeTruthy(); // nothing left outside it to press
  await press(full());
  await vi.waitFor(() => expect(getComputedStyle(layer).position).toBe('absolute'));
  expect(host.querySelector('button.dismiss')).toBeNull();
  await page.viewport(850, 700); // a dialog over the page: full screen drops the scrim
  await vi.waitFor(() => expect(host.querySelector('.scrim')).toBeTruthy());
  await press(full());
  await vi.waitFor(() => expect([box().left, box().top, box().width]).toEqual([0, 0, 850]));
  expect(host.querySelector('.scrim')).toBeNull();
  await page.viewport(690, 700);
  await vi.waitFor(() => expect(full()).toBeNull());
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
  await vi.waitFor(() => expect(host.querySelector('.scrim')).toBeNull()); // the CSS can move before the media query's change event
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
  expect([...host.querySelectorAll('.group:not(.library-group) .label')].map((el) => el.textContent.trim())).toEqual(['In use', 'Yours', 'Built-in']);
  expect([...host.querySelectorAll('.row')].map((r) => [r.querySelector('.name span').textContent, r.querySelector('.name em').textContent]))
    .toEqual([['A', '8×8'], ['B', '8×16'], ['Tall Mono', 'TrueType'], ...BUILT_IN.map((name) => [name, 'TrueType'])]);
  const sample = (name) => row(name).querySelector('.sample');
  expect(sample('A').textContent).toBe('Aa░▒▓█▄▀╔═╗☺');
  expect(sample('A').style.fontFamily).toContain(fontId(fontA()));
  expect(sample('A').style.fontSize).toBe('8px'); // 8 rows tall: its own size
  expect(sample('B').style.fontFamily).toContain(b.id);
  expect(sample('B').style.fontSize).toBe('16px');
  expect(sample('Tall Mono').style.fontFamily).toContain(tt.id);
});

test('a font\'s sample draws the slots the library\'s samples draw, so a block the font lacks isn\'t drawn in another font', async () => {
  await mount({ font: noLowerHalf });
  const sample = host.querySelector('.row .sample'); // In use: the drawing's
  await waitFor(() => !sample.textContent.includes('▄'));
  expect([...sample.textContent].map((c) => slotOf(c, noLowerHalf))).toEqual([...SAMPLE_CHARS].map((c) => slotOf(c)));
});

test('the drawing\'s font\'s actions', async () => {
  const { workspace } = await mount();
  expect(title()).toBe('A');
  expect(host.querySelector('.edit-side .meta').textContent).toBe('8×8 · the drawing\'s font · no palettes');
  expect(actions()).toEqual(['Save .F08', 'Save PNG', 'Export palettes', 'Palettes']); // no Remove: A isn't kept in this browser
  expect(button('Export palettes').disabled).toBe(true); // it has none
  const cells = host.querySelectorAll('.sheet .cell');
  expect(cells).toHaveLength(256);
  expect(cells[0].textContent).toBe(' ');
  expect(host.querySelector('.sheet').style.fontFamily).toContain(fontId(fontA()));
  cells[65].dispatchEvent(new Event('mouseenter'));
  await nextTick();
  expect(host.querySelector('.edit-side .info').textContent).toBe('Slot 65 A');
  await press(button('Palettes'));
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
  pressFocused(button('Palettes')); // the page it's on goes away
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
  expect([...host.querySelectorAll('.group:not(.library-group) .label')].map((el) => el.textContent.trim())).toEqual(['In use', 'Yours', 'Built-in']);
  expect(names()).toEqual(['Tall Mono', 'B', ...BUILT_IN]);
  expect(host.querySelector('.edit-side .meta').textContent).toBe('TrueType · in use · in your browser · no palettes');
  expect(actions()).toEqual(['Export palettes', 'Palettes', 'Remove']);
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
  expect(actions()).toEqual(['Export palettes', 'Palettes']);
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

test('+ Load of the drawing\u2019s own font keeps the blocks set on it, and keeps them with the browser\u2019s copy', async () => {
  const { project } = await mount({ font: lowerAt240 });
  const blocks = [219, 254, 223, 221, 222, 176, 177, 178];
  project.setDrawingFont({ ...lowerAt240, blocks }); // set by hand; the browser has no copy yet
  const before = project.fontBlocks;
  const input = host.querySelector('input[type="file"]');
  const files = new DataTransfer();
  files.items.add(new File([lowerAt240.bytes], 'L.F16'));
  input.files = files.files;
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(async () => expect((await storedBitmapFont(fontId(lowerAt240))).blocks).toEqual(blocks));
  expect(project.fontBlocks).toBe(before);
});

test('+ Load of the drawing\u2019s own font keeps the lines and sets made on it, and keeps them with the browser\u2019s copy', async () => {
  const { project } = await mount({ font: lowerAt240 });
  const lines = { hide: ['single'], styles: [{ id: 'l1', name: 'Heavy', slots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }] };
  const sets = { hideStock: false, sets: [{ id: 's1', name: 'Grit', slots: [250, 176] }] };
  project.setDrawingFont({ ...lowerAt240, lines, sets }); // made by hand; the browser has no copy yet
  const before = [project.fontLines, project.fontSets];
  const input = host.querySelector('input[type="file"]');
  const files = new DataTransfer();
  files.items.add(new File([lowerAt240.bytes], 'L.F16'));
  input.files = files.files;
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(async () => expect((await storedBitmapFont(fontId(lowerAt240))).sets).toEqual(sets));
  expect((await storedBitmapFont(fontId(lowerAt240))).lines).toEqual(lines);
  expect([project.fontLines, project.fontSets]).toEqual(before);
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
  expect([...host.querySelectorAll('.group:not(.library-group) .label')].map((el) => el.textContent.trim())).toEqual(['In use', 'Yours', 'Built-in']);
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

test('under the Blocks tab the blocks have no second Blocks heading, and are a group named Blocks', async () => {
  await mount({ font: cp437Font });
  const group = host.querySelector('.blocks');
  expect(group.textContent).not.toMatch(/^\s*Blocks/);
  expect(group.getAttribute('role')).toBe('group');
  expect(group.getAttribute('aria-label')).toBe('Blocks');
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

test('picking Dark and clicking the slot Light has shares it: both tiles show it, and its readout names both', async () => {
  const { project } = await mount({ font: cp437Font });
  await press(tile('Dark'));
  await press(slotCell(176));
  expect(tiles().map((t) => t.slot).slice(5)).toEqual(['176', '177', '176']);
  slotCell(176).dispatchEvent(new Event('mouseenter'));
  await nextTick();
  expect(host.querySelector('.edit-side .info').textContent).toBe('Slot 176 ░ · Light shade, Dark shade (set by you)');
  await press(slotCell(178)); // Dark back to its own slot: Light stays
  expect(tiles().map((t) => t.slot).slice(5)).toEqual(['176', '177', '178']);
  expect(project.fontBlocks).toBe('');
});

test('setting a block back to the slot the pixels put it in stores it as found', async () => {
  const { project } = await mount({ font: lowerAt240 });
  await press(tile('Lower'));
  await press(slotCell(254));
  expect(host.querySelector('.edit-side .meta').textContent).toContain('blocks set by you');
  await press(slotCell(240));
  expect(project.fontBlocks).toBe('');
  expect(host.querySelector('.edit-side .meta').textContent).not.toContain('blocks set by you');
  expect(button('Find blocks again')).toBeUndefined();
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
  expect(tile('Lower').title).toBe('A font\u2019s blocks, lines and sets can\u2019t change in a room.');
  await press(slotCell(254));
  expect(project.fontBlocks).toBe('');
});

test('the rows and sheet draw in the font\u2019s face again once its blocks move', async () => {
  const { project } = await mount({ font: lowerAt240 });
  await press(tile('Lower'));
  await press(slotCell(254));
  await vi.waitFor(() => expect(host.querySelector('.sheet').style.fontFamily).toContain(fontKey(project.drawingFont)));
});

test('Set up its blocks opens the page on the font with Lower picked, and a click on a slot gives it one', async () => {
  const { project, workspace } = await mount({ font: noLowerHalf, before: ({ project, workspace }) => { workspace.settingsOpen = true; openFontSetup(project.drawingFont); } });
  expect(workspace.settingsOpen).toBe(false); // a phone's settings drawer shut, so the page shows whole
  await nextTick();
  expect(workspace.paletteLayerOpen).toBe(true);
  expect(title()).toBe('T');
  expect(tile('Lower').getAttribute('aria-pressed')).toBe('true');
  expect(workspace.fontSetup).toBe(null); // taken
  expect(host.querySelector('.sheet').classList.contains('picking')).toBe(true); // the place to click
  expect(text()).toContain('Lower is picked: click the slot in the sheet that should draw the lower half.');
  expect(text()).not.toContain('Pick Lower, then click a slot');
  await press(slotCell(254));
  expect(blocksOf(project.drawingFont)[1]).toBe(254);
});

test('Set up its blocks with another font chosen on the page chooses the drawing\u2019s, Lower still picked', async () => {
  const { project } = await mount({ font: noLowerHalf });
  await press(row('B'));
  expect(title()).toBe('B');
  openFontSetup(project.drawingFont);
  await expect.poll(() => tile('Lower').getAttribute('aria-pressed')).toBe('true');
  expect(title()).toBe('T');
  for (let i = 0; i < 3; i++) await nextTick(); // and the font chosen doesn't drop it after
  expect(tile('Lower').getAttribute('aria-pressed')).toBe('true');
});

test('nothing picked, the sheet isn\u2019t marked; a block that has its slot picked, the notes are as they were', async () => {
  await mount({ font: noLowerHalf });
  expect(host.querySelector('.sheet').classList.contains('picking')).toBe(false);
  await press(tile('Full'));
  expect(host.querySelector('.sheet').classList.contains('picking')).toBe(true);
  expect(text()).not.toContain('is picked: click the slot'); // Full has its slot: the notes as they were
});

test('in a room, Set up its blocks picks nothing and says nothing of clicking a slot', async () => {
  const { workspace } = await mount({ font: noLowerHalf, before: ({ project }) => { project._hosting = true; openFontSetup(project.drawingFont); } });
  await nextTick();
  await nextTick();
  expect(workspace.fontSetup).toBe(null);
  expect(tile('Lower').getAttribute('aria-pressed')).toBe('false');
  expect(text()).not.toContain('is picked: click the slot');
  expect(host.querySelector('.sheet').classList.contains('picking')).toBe(false);
});

// The Lines and Sets sections over the same sheet.
const sectionTab = (name) => [...host.querySelectorAll('.sections [role="tab"]')].find((el) => el.textContent.trim().startsWith(name));
const lineTiles = () => [...host.querySelectorAll('.lines .card button.tile')];
const heavy = { id: 'l1', name: 'Heavy', slots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };

test('the Lines section adds a style slot by slot', async () => {
  const { project } = await mount({ font: cp437Font });
  await press(sectionTab('Lines'));
  expect(sectionTab('Lines').getAttribute('aria-selected')).toBe('true');
  await press(button('+ New line style'));
  expect(host.querySelector('.lines .card input').value).toBe('Line 1');
  for (let n = 1; n <= 11; n++) await press(slotCell(n));
  expect(project.drawingFont.lines.styles[0].slots).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  expect(host.querySelector('.lines .card').textContent).toContain('Offered under Draw with');
  expect(sectionTab('Lines').textContent.replace(/\s+/g, ' ').trim()).toBe('Lines 1');
});

test('a style missing pieces says how many are left', async () => {
  await mount({ font: { ...cp437Font, lines: { hide: [], styles: [{ ...heavy, slots: [1, 2, ...Array(9).fill(null)] }] } } });
  await press(sectionTab('Lines'));
  expect(host.querySelector('.lines .card').textContent).toContain('9 pieces to go before Draw with offers it');
  expect(lineTiles()[2].classList.contains('missing')).toBe(true);
});

test('a block\u2019s slot can\u2019t be a piece', async () => {
  const { project } = await mount({ font: cp437Font });
  await press(sectionTab('Lines'));
  await press(button('+ New line style'));
  await press(slotCell(220));
  expect(project.drawingFont.lines.styles[0].slots).toEqual(Array(11).fill(null));
  expect(text()).toContain('Slot 220 draws the Lower block, so it can\u2019t be a line piece.');
});

test('a slot one piece of a style has can\u2019t be another of its pieces; another style may have it', async () => {
  const font = { ...cp437Font, lines: { hide: [], styles: [{ ...heavy, slots: [1, 2, ...Array(9).fill(null)] }, { ...heavy, id: 'l2', name: 'Thin', slots: Array(11).fill(null) }] } };
  const { project } = await mount({ font });
  await press(sectionTab('Lines'));
  await press(lineTiles()[2]); // Heavy's ┌
  await press(slotCell(2));
  expect(project.drawingFont.lines.styles[0].slots[2]).toBe(null);
  expect(text()).toContain('Slot 2 is already this style\u2019s │.');
  expect(lineTiles()[2].getAttribute('aria-pressed')).toBe('true'); // still on ┌
  await press(lineTiles()[11]); // Thin's ─
  await press(slotCell(1));
  expect(project.drawingFont.lines.styles[1].slots[0]).toBe(1);
});

test('a block on a piece\u2019s slot keeps the piece and says so', async () => {
  await mount({ font: { ...cp437Font, lines: { hide: [], styles: [{ ...heavy, slots: [1, 2, 3, 4, 5, 6, 220, 8, 9, 10, 11] }] } } });
  await press(sectionTab('Lines'));
  expect(host.querySelector('.lines .card').textContent).toContain('├ shares slot 220 with Lower');
  expect(lineTiles()[6].title).toBe('├ shares slot 220 with Lower');
});

test('undo of a style edit shows on the Lines section', async () => {
  const { project } = await mount({ font: cp437Font });
  await press(sectionTab('Lines'));
  await press(button('+ New line style'));
  await press(slotCell(1));
  expect(lineTiles()[0].querySelector('.slot').textContent).toBe('1');
  project.undo();
  await nextTick();
  expect(lineTiles()[0].querySelector('.slot').textContent).toBe('—');
});

test('hiding Single takes it off Draw with', async () => {
  const { project } = await mount({ font: cp437Font });
  await press(sectionTab('Lines'));
  await press(button('Hide'));
  expect(project.drawingFont.lines.hide).toEqual(['single']);
  await press(button('Show'));
  expect(project.fontLines).toBe(''); // nothing hidden and no styles: nothing kept
});

test('the Sets section builds a set from clicked slots, repeats kept', async () => {
  const { project } = await mount({ font: cp437Font });
  await press(sectionTab('Sets'));
  await press(button('+ New set'));
  for (const n of [250, 250, 176]) await press(slotCell(n));
  expect(project.drawingFont.sets.sets[0]).toEqual({ id: 's1', name: 'Set 1', slots: [250, 250, 176] });
  const chars = host.querySelector('.sets input.chars');
  expect(chars.value).toBe('··░');
  chars.focus();
  chars.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
  chars.blur();
  await nextTick();
  expect(project.drawingFont.sets.sets[0].slots).toEqual([250, 250]);
});

test('Backspaces and typing in one visit to a set\u2019s characters are one undo step', async () => {
  const { project } = await mount({ font: { ...cp437Font, sets: { hideStock: false, sets: [{ id: 's1', name: 'Grit', slots: [250, 176, 177] }] } } });
  await press(sectionTab('Sets'));
  const chars = host.querySelector('.sets input.chars');
  chars.focus();
  const version = project.historyVersion;
  for (let i = 0; i < 2; i++) chars.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
  expect(chars.value).toBe('·');
  expect(project.historyVersion).toBe(version); // nothing taken yet: the field isn't done
  chars.value = '·A';
  chars.dispatchEvent(new Event('input'));
  chars.blur();
  await nextTick();
  expect(project.drawingFont.sets.sets[0].slots).toEqual([250, 65]);
  project.undo();
  await nextTick();
  expect(project.drawingFont.sets.sets[0].slots).toEqual([250, 176, 177]);
});

test('typing into a set maps each character to its slot, dropping ones the font lacks', async () => {
  const { project } = await mount({ font: { ...cp437Font, sets: { hideStock: false, sets: [{ id: 's1', name: 'Grit', slots: [250] }] } } });
  await press(sectionTab('Sets'));
  const chars = host.querySelector('.sets input.chars');
  chars.value = '·░\u{1F600}A';
  chars.dispatchEvent(new Event('input'));
  chars.dispatchEvent(new Event('change'));
  await nextTick();
  expect(project.drawingFont.sets.sets[0].slots).toEqual([250, 176, 65]);
  expect(chars.value).toBe('·░A');
});

test('characters typed into a set are one undo step, taken when the field is done', async () => {
  const { project } = await mount({ font: { ...cp437Font, sets: { hideStock: false, sets: [{ id: 's1', name: 'Grit', slots: [250] }] } } });
  await press(sectionTab('Sets'));
  const chars = host.querySelector('.sets input.chars');
  for (const value of ['·░', '·░A', '·░AB']) {
    chars.value = value;
    chars.dispatchEvent(new Event('input'));
  }
  chars.dispatchEvent(new Event('change'));
  await nextTick();
  expect(project.drawingFont.sets.sets[0].slots).toEqual([250, 176, 65, 66]);
  project.undo();
  await nextTick();
  expect(project.drawingFont.sets.sets[0].slots).toEqual([250]);
});

test('a style or set named nothing, or only spaces, takes its default name', async () => {
  const font = { ...cp437Font, lines: { hide: [], styles: [{ ...heavy, id: 'l3' }] }, sets: { hideStock: false, sets: [{ id: 's2', name: 'Grit', slots: [250] }] } };
  const { project } = await mount({ font });
  const rename = async (input, value) => {
    input.value = value;
    input.dispatchEvent(new Event('change'));
    await nextTick();
  };
  await press(sectionTab('Lines'));
  await rename(host.querySelector('.lines .card input'), '   ');
  expect(project.drawingFont.lines.styles[0].name).toBe('Line 3');
  expect(host.querySelector('.lines .card input').value).toBe('Line 3');
  await press(sectionTab('Sets'));
  await rename(host.querySelector('.sets input.name'), '');
  expect(project.drawingFont.sets.sets[0].name).toBe('Set 2');
  expect(host.querySelector('.sets input.name').value).toBe('Set 2');
});

test('Show stock sets is one switch', async () => {
  const { project } = await mount({ font: cp437Font });
  await press(sectionTab('Sets'));
  const box = host.querySelector('.sets input[type="checkbox"]');
  expect(box.checked).toBe(true);
  await press(box);
  expect(project.drawingFont.sets.hideStock).toBe(true);
});

test('a stored font\u2019s lines are kept in this browser', async () => {
  const { project, workspace } = await mount();
  const stored = await addBitmapFont(new File([cp437Font.bytes], 'L.F16'));
  workspace.userFonts = await loadFonts();
  await vi.waitFor(() => expect(row('L')).toBeTruthy());
  await press(row('L'));
  await vi.waitFor(() => expect(sectionTab('Lines')).toBeTruthy());
  const version = project.historyVersion;
  await press(sectionTab('Lines'));
  await press(button('+ New line style'));
  await vi.waitFor(() => expect(lineTiles()).toHaveLength(11));
  await press(slotCell(1));
  await vi.waitFor(async () => expect((await storedBitmapFont(stored.id)).lines?.styles[0].slots[0]).toBe(1));
  expect(project.historyVersion).toBe(version);
  expect(project.fontLines).toBe('');
});

test('two clicks on a stored font\u2019s sheet, the second before the first is written, both land', async () => {
  const { workspace } = await mount();
  const stored = await addBitmapFont(new File([cp437Font.bytes], 'L.F16'));
  workspace.userFonts = await loadFonts();
  await vi.waitFor(() => expect(row('L')).toBeTruthy());
  await press(row('L'));
  await vi.waitFor(() => expect(sectionTab('Lines')).toBeTruthy());
  await press(sectionTab('Lines'));
  await press(button('+ New line style'));
  await vi.waitFor(() => expect(lineTiles()).toHaveLength(11));
  await press(slotCell(1)); // only the page drawn again between them (as between two real clicks), not this browser's store written
  await press(slotCell(2));
  await vi.waitFor(async () => expect((await storedBitmapFont(stored.id)).lines?.styles[0].slots.slice(0, 3)).toEqual([1, 2, null]));
  expect(workspace.userFonts.find((f) => f.id === stored.id).lines.styles[0].slots.slice(0, 3)).toEqual([1, 2, null]);
});

test('Delete on a font kept only in this browser says so, with an Undo that puts it back where it was', async () => {
  const { workspace } = await mount();
  onTestFinished(() => closeToast());
  const thin = { ...heavy, id: 'l2', name: 'Thin' };
  const stored = await addBitmapFont(new File([cp437Font.bytes], 'L.F16'));
  await storeFontPart(stored.id, 'lines', { hide: [], styles: [heavy, thin] });
  await storeFontPart(stored.id, 'sets', { hideStock: false, sets: [{ id: 's1', name: 'Grit', slots: [250] }] });
  workspace.userFonts = await loadFonts();
  await vi.waitFor(() => expect(row('L')).toBeTruthy());
  await press(row('L'));
  await vi.waitFor(() => expect(sectionTab('Lines')).toBeTruthy());
  await press(sectionTab('Lines'));
  await press(host.querySelector('.lines .card button.ghost')); // Heavy's Delete
  expect(toastMessage.value).toBe('Deleted Heavy.');
  expect(toastAction.value.label).toBe('Undo');
  await vi.waitFor(async () => expect((await storedBitmapFont(stored.id)).lines.styles.map((s) => s.id)).toEqual(['l2']));
  toastAction.value.run();
  await vi.waitFor(async () => expect((await storedBitmapFont(stored.id)).lines.styles).toEqual([heavy, thin]));
  await vi.waitFor(() => expect([...host.querySelectorAll('.lines .card input')].map((el) => el.value)).toEqual(['Heavy', 'Thin']));
  await press(sectionTab('Sets'));
  await press(host.querySelector('.sets .set button.ghost'));
  expect(toastMessage.value).toBe('Deleted Grit.');
  toastAction.value.run();
  await vi.waitFor(async () => expect((await storedBitmapFont(stored.id)).sets.sets.map((s) => s.name)).toEqual(['Grit']));
});

test('the toast\u2019s Undo puts a deleted style back under a new id when a newer style has taken its own', async () => {
  const { workspace } = await mount();
  onTestFinished(() => closeToast());
  const thin = { ...heavy, id: 'l2', name: 'Thin' };
  const stored = await addBitmapFont(new File([cp437Font.bytes], 'L.F16'));
  await storeFontPart(stored.id, 'lines', { hide: [], styles: [heavy, thin] });
  workspace.userFonts = await loadFonts();
  await vi.waitFor(() => expect(row('L')).toBeTruthy());
  await press(row('L'));
  await vi.waitFor(() => expect(sectionTab('Lines')).toBeTruthy());
  await press(sectionTab('Lines'));
  await press(host.querySelectorAll('.lines .card button.ghost')[1]); // Thin's Delete
  const undo = toastAction.value.run;
  await press(button('+ New line style')); // l2 again
  await vi.waitFor(async () => expect((await storedBitmapFont(stored.id)).lines.styles.map((s) => s.id)).toEqual(['l1', 'l2']));
  undo();
  await vi.waitFor(async () => expect((await storedBitmapFont(stored.id)).lines.styles.map((s) => [s.id, s.name])).toEqual([['l1', 'Heavy'], ['l3', 'Thin'], ['l2', 'Line 2']]));
});

test('Delete on the drawing\u2019s font is an undo step, with no toast', async () => {
  const { project } = await mount({ font: { ...cp437Font, lines: { hide: [], styles: [heavy] } } });
  onTestFinished(() => closeToast());
  closeToast();
  await press(sectionTab('Lines'));
  await press(host.querySelector('.lines .card button.ghost'));
  expect(project.drawingFont.lines).toBeUndefined();
  expect(toastMessage.value).toBe(null);
  project.undo();
  expect(project.drawingFont.lines.styles).toEqual([heavy]);
});

test('lines and sets are read-only in a room', async () => {
  const font = { ...cp437Font, lines: { hide: [], styles: [heavy] }, sets: { hideStock: false, sets: [{ id: 's1', name: 'Grit', slots: [250] }] } };
  const { project } = await mount({ font });
  project._hosting = true;
  await nextTick();
  expect([...host.querySelectorAll('.sections [role="tab"]')].map((el) => el.textContent.replace(/\s+/g, ' ').trim())).toEqual(['Blocks', 'Lines 1', 'Sets 1']);
  await press(sectionTab('Lines'));
  const lines = host.querySelector('.lines');
  expect([...lines.querySelectorAll('button, input')].every((el) => el.disabled)).toBe(true);
  expect(lineTiles()[0].title).toBe('A font\u2019s blocks, lines and sets can\u2019t change in a room.');
  await press(lineTiles()[0]);
  await press(slotCell(20));
  expect(project.drawingFont.lines.styles[0].slots[0]).toBe(1);
  await press(sectionTab('Sets'));
  expect([...host.querySelectorAll('.sets button, .sets input')].every((el) => el.disabled)).toBe(true);
});

test('the library lists CM-7X7 as 7×7, and its Shape tag reads 7×7', async () => {
  await wide();
  const index = FIXTURE();
  index.fonts.push(libFont('CM-7X7', { height: 7, width: 7 }));
  await mount({ library: index });
  await waitFor(() => libraryNames().length);
  await openFilters();
  const row = [...host.querySelectorAll('.row.library')].find((r) => r.textContent.includes('CM-7X7'));
  expect(row.querySelector('.name em').textContent).toBe('7×7 · IBM PC');
  expect(row.querySelector('canvas.glyph-sample').width).toBe(84); // 7 pixels a glyph, its own size
  expect(chip('7×7')).toBeTruthy();
  await press(row);
  expect(host.querySelector('.edit-side .meta').textContent).toBe('7×7 · Library');
});

test("a library row's sample is drawn at the font's own size, not stretched to the row", async () => {
  await wide();
  const index = FIXTURE();
  index.fonts.push(libFont('Tall', { height: 14 }));
  await mount({ library: index });
  await waitFor(() => libraryNames().length);
  const canvas = [...host.querySelectorAll('.row.library')].find((r) => r.textContent.includes('Tall')).querySelector('canvas.glyph-sample');
  expect(canvas.width).toBe(96);
  expect(canvas.getBoundingClientRect().width).toBe(96);
  expect(canvas.getBoundingClientRect().height).toBe(14);
});

test('an 8×8 library row is drawn at its own size, not doubled', async () => {
  await wide();
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  const canvas = [...host.querySelectorAll('.row.library')].find((r) => r.textContent.includes('Zeta')).querySelector('canvas.glyph-sample');
  expect([canvas.width, canvas.height]).toEqual([96, 8]);
  expect(canvas.getBoundingClientRect().height).toBe(8);
});

test('Yours, Built-in and Library fold under their titles, which count what the search and tags leave; In use never folds', async () => {
  await wide();
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  const head = (name) => [...host.querySelectorAll('.list .group-head')].find((el) => el.textContent.includes(name));
  expect(head('In use')).toBeUndefined();
  expect(head('Built-in').textContent.trim()).toContain('Built-in · 4');
  expect(head('Yours').textContent.trim()).toContain('Yours · 2');
  await type('un'); // Unscii and Unifont
  expect(head('Built-in').textContent.trim()).toContain('Built-in · 2');
  await type('');
  expect(head('Built-in').getAttribute('aria-expanded')).toBe('true');
  await press(head('Built-in'));
  expect(head('Built-in').getAttribute('aria-expanded')).toBe('false');
  expect(names()).not.toContain('Unifont');
  expect(names()).toContain('A'); // the drawing's font, In use
  await press(head('Library'));
  expect(libraryNames()).toEqual([]);
  expect(label()).toBe('Library · 4 fonts'); // still counted while folded
  await press(head('Library'));
  expect(libraryNames().length).toBe(4);
  expect(JSON.parse(localStorage.getItem('phosphor.fontFilters')).list).toEqual(['builtIn']); // remembered with the filters
});

test('the arrow keys skip a folded group', async () => {
  await wide();
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  const head = (name) => [...host.querySelectorAll('.list .group-head')].find((el) => el.textContent.includes(name));
  await press(head('Built-in'));
  await chooseLibrary('Alpha');
  await arrow('ArrowUp');
  expect(title()).not.toBe('Unifont'); // the last built-in font, folded away
});

test('the Library group lists the library under Built-in, each row sampled', async () => {
  const index = FIXTURE();
  delete index.fonts[2].machine; // Alpha's folder names no machine
  await mount({ library: index });
  await waitFor(() => libraryNames().length);
  expect(libraryNames()).toEqual(['Alpha', 'FROGBLOCK', 'Topaz', 'Zeta']);
  expect(names().slice(-4)).toEqual(['Alpha', 'FROGBLOCK', 'Topaz', 'Zeta']);
  expect(label()).toBe('Library · 4 fonts');
  const topaz = [...host.querySelectorAll('.row.library')].find((r) => r.textContent.includes('Topaz'));
  expect(topaz.querySelector('.name em').textContent).toBe('8×16 · Amiga');
  const alpha = [...host.querySelectorAll('.row.library')].find((r) => r.textContent.includes('Alpha'));
  expect(alpha.querySelector('.name em').textContent).toBe('8×8'); // no machine
  expect(topaz.querySelector('canvas.glyph-sample')).toBeTruthy();
  await press(topaz);
  expect(topaz.classList.contains('current')).toBe(true);
});

test('the index is fetched when the page opens, not before', async () => {
  await mount({ library: FIXTURE(), before: ({ workspace }) => { workspace.paletteLayerPage = 'palettes'; } });
  expect(row('Shades & blocks')).toBeTruthy(); // the layer is open, on Palettes
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(indexFetches).toBe(0);
  await press(button('Fonts'));
  await waitFor(() => libraryNames().length);
  expect(indexFetches).toBe(1);
});

test('search matches names, machines and descriptions', async () => {
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  await type('zet');
  expect(libraryNames()).toEqual(['Zeta']);
  expect(label()).toBe('Library · 1 found');
  await type('amiga');
  expect(libraryNames()).toEqual(['Topaz']);
  await type('rounded');
  expect(libraryNames()).toEqual(['Topaz']);
  expect(host.querySelector('.top input').placeholder).toBe('Search fonts…');
  await type('IBM VGA'); // the built-in groups filter by name too
  expect(names()).toContain('IBM VGA');
});

test('the Filters column sits beside the list, each tag counted across the library; picking narrows, with no second row of picked tags', async () => {
  await wide();
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  await openFilters();
  expect(host.querySelector('aside.filters-side')).toBeTruthy();
  expect([...host.querySelectorAll('.filter-group .group-head .name')].map((el) => el.textContent)).toEqual(['Machine', 'Shape', 'Characters', 'Collection', 'Other']);
  expect(chip('8×16')).toBeTruthy();
  expect(chip('Latin-1')).toBeTruthy();
  expect(chip('Mœbius')).toBeTruthy();
  expect(chip('Ready to paint').querySelector('.count').textContent).toBe('2');
  await press(chip('IBM PC'));
  expect(libraryNames()).toEqual(['Alpha', 'Zeta']);
  expect(label()).toBe('Library · 2 found');
  expect(chip('Amiga').querySelector('.count').textContent).toBe('1'); // the whole library's count, not the results'
  expect(chip('Amiga').disabled).toBe(false);
  expect(host.querySelector('.tag-row')).toBeNull(); // the column shows what's picked
  await press(chip('IBM PC'));
  expect(libraryNames().length).toBe(4);
  expect(host.querySelector('.picker')).toBeNull();
  expect(host.querySelector('button.tags')).toBeNull();
});

test('tags in one group widen, tags in two narrow; Clear all keeps the search', async () => {
  await wide();
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  await openFilters();
  await press(chip('IBM PC'));
  await press(chip('Amiga'));
  expect(libraryNames()).toEqual(['Alpha', 'Topaz', 'Zeta']);
  await press(chip('8×16'));
  expect(libraryNames()).toEqual(['Topaz']);
  expect(label()).toBe('Library · 1 found');
  await type('t');
  await press(host.querySelector('button.clear-all'));
  expect(host.querySelectorAll('.font-filters .chip[aria-pressed="true"]').length).toBe(0);
  expect(host.querySelector('.top input').value).toBe('t');
  expect(host.querySelector('button.clear-all')).toBeNull();
});

test('» beside the search opens the column, « folds it again, remembered next time', async () => {
  await wide();
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  const search = host.querySelector('.top input');
  expect(toggle().compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // just before the search
  expect(host.querySelector('aside.filters-side')).toBeNull(); // folded until » is pressed
  expect([getComputedStyle(toggle().querySelector('svg.arrow-icon')).rotate, toggle().getAttribute('aria-expanded')]).toEqual(['0deg', 'false']);
  const button0 = toggle();
  toggle().focus();
  await press(toggle());
  expect(host.querySelector('aside.filters-side')).toBeTruthy();
  expect([getComputedStyle(toggle().querySelector('svg.arrow-icon')).rotate, toggle().getAttribute('aria-expanded')]).toEqual(['180deg', 'true']);
  expect(host.querySelector('button.filters-open')).toBeNull();
  expect(host.querySelector('.filters-head button.fold')).toBeNull();
  expect(toggle()).toBe(button0); // the same button, so the focus stays on it
  expect(document.activeElement).toBe(button0);
  const kept = localStorage.getItem('phosphor.fontFilters');
  app.unmount();
  host.remove();
  await mount({ library: FIXTURE(), before: () => localStorage.setItem('phosphor.fontFilters', kept) }); // a new mount clears localStorage first
  await waitFor(() => libraryNames().length);
  expect(host.querySelector('aside.filters-side')).toBeTruthy();
  await press(toggle());
  expect(host.querySelector('aside.filters-side')).toBeNull();
});

test("in a short window, a long Filters column scrolls and its head and the search's row keep their height", async () => {
  await page.viewport(1400, 600);
  onTestFinished(() => page.viewport(414, 896));
  const index = FIXTURE();
  for (let i = 0; i < 80; i += 1) index.fonts.push(libFont(`Many${i}`, { machine: `Machine ${i}`, height: 6 + (i % 30) }));
  await mount({ library: index });
  await waitFor(() => libraryNames().length);
  await openFilters();
  const aside = host.querySelector('aside.filters-side');
  expect(aside.scrollHeight).toBeGreaterThan(aside.clientHeight);
  expect([host.querySelector('.filters-head'), host.querySelector('.list-side .top')].map((el) => el.getBoundingClientRect().height)).toEqual([55, 55]);
});

test('the column starts folded at every size; opened, the floating layer narrows it and the list before the details, full screen 260 and 320', async () => {
  await page.viewport(900, 700);
  onTestFinished(() => page.viewport(414, 896));
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  const starts = () => [!!host.querySelector('aside.filters-side'), getComputedStyle(toggle().querySelector('svg.arrow-icon')).rotate, toggle().getAttribute('aria-expanded')];
  expect(starts()).toEqual([false, '0deg', 'false']); // the dialog
  await page.viewport(1400, 900);
  await vi.waitFor(() => expect(Math.round(host.querySelector('.list-side').getBoundingClientRect().width)).toBe(220));
  expect(starts()).toEqual([false, '0deg', 'false']); // the floating layer
  await press(host.querySelector('.pages button.maximize'));
  await vi.waitFor(() => expect(Math.round(host.querySelector('.list-side').getBoundingClientRect().width)).toBe(320));
  expect(starts()).toEqual([false, '0deg', 'false']); // full screen
  await press(host.querySelector('.pages button.maximize'));
  await openFilters();
  const widths = () => [host.querySelector('aside.filters-side'), host.querySelector('.list-side')].map((el) => Math.round(el.getBoundingClientRect().width));
  const narrowed = () => {
    const [filters, list] = widths();
    expect(filters).toBeGreaterThanOrEqual(140);
    expect(filters).toBeLessThan(200);
    expect(list).toBeGreaterThanOrEqual(180);
    expect(list).toBeLessThan(220);
  };
  await vi.waitFor(narrowed);
  await press(host.querySelector('.pages button.maximize'));
  await vi.waitFor(() => expect(widths()).toEqual([260, 320]));
  await press(host.querySelector('.pages button.maximize'));
  await vi.waitFor(narrowed);
});

test('in a narrow dialog with the Filters column open, the details narrow too and stay inside the layer, their scrollbars with them', async () => {
  await page.viewport(850, 700);
  onTestFinished(() => page.viewport(414, 896));
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  await openFilters();
  await vi.waitFor(() => expect(host.querySelector('.page.fonts > .edit-side .grid.sheet')).toBeTruthy());
  const right = (s) => host.querySelector(s).getBoundingClientRect().right;
  expect(right('.page.fonts > .edit-side')).toBeLessThanOrEqual(right('.page.fonts'));
});

test('the sheet\'s first line is a dialog\'s: its title 18px in, and the app\'s close button 6px inside the top right corner, clear of Clear all', async () => {
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  await press(toggle());
  const head = host.querySelector('.filters-sheet .filters-head');
  const title = head.querySelector('h3.title'), close = head.querySelector('button.close.close-sheet');
  expect(title.textContent).toBe('Filters');
  expect(title.getBoundingClientRect().left).toBe(18);
  expect(close.getAttribute('aria-label')).toBe('Close filters');
  expect(close.querySelector('svg')).toBeTruthy(); // CloseButton's ×, drawn: a dialog's and the layer's own
  const at = close.getBoundingClientRect();
  expect([innerWidth - at.right, at.top, at.width, at.height]).toEqual([6, 6, 26, 26]);
  await press(chip('IBM PC'));
  expect(head.querySelector('button.clear-all').getBoundingClientRect().right).toBeLessThanOrEqual(at.left);
  await press(close);
  expect(host.querySelector('.filters-sheet')).toBeNull();
});

test('on a phone, » opens a sheet; Show N fonts or Escape closes it, and Escape leaves the layer open', async () => {
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  expect(host.querySelector('aside.filters-side')).toBeNull();
  const open = toggle;
  expect(getComputedStyle(open().querySelector('svg.arrow-icon')).rotate).toBe('0deg');
  await press(open());
  const sheet = host.querySelector('.filters-sheet');
  expect(sheet.getAttribute('role')).toBe('dialog');
  const r = sheet.getBoundingClientRect();
  expect([r.left, r.top, r.width, r.height]).toEqual([0, 0, innerWidth, innerHeight]);
  await vi.waitFor(() => expect(document.activeElement).toBe(host.querySelector('button.close-sheet')));
  await press(chip('IBM PC'));
  expect(host.querySelector('button.show').textContent.trim()).toBe('Show 2 fonts');
  await press(host.querySelector('button.show'));
  expect(host.querySelector('.filters-sheet')).toBeNull();
  expect(libraryNames()).toEqual(['Alpha', 'Zeta']);
  await vi.waitFor(() => expect(document.activeElement).toBe(open()));
  await press(open());
  host.querySelector('.filters-sheet').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextTick();
  expect(host.querySelector('.filters-sheet')).toBeNull();
  expect(closes).toBe(0);
});

test('the Filters column sits left of the list but comes after the search in tab order', async () => {
  await wide();
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  await openFilters();
  const aside = host.querySelector('aside.filters-side'), search = host.querySelector('.top input');
  expect(search.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(aside.getBoundingClientRect().right).toBeLessThanOrEqual(host.querySelector('.list-side').getBoundingClientRect().left + 1);
});

test('Clear all, gone once pressed, leaves the keys with the layer', async () => {
  await wide();
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  await openFilters();
  await press(chip('IBM PC'));
  host.querySelector('button.clear-all').focus();
  await press(host.querySelector('button.clear-all'));
  await vi.waitFor(() => expect(host.querySelector('.palette-layer').contains(document.activeElement)).toBe(true));
});

test('the phone sheet closing because the window widened leaves the keys with the layer', async () => {
  onTestFinished(() => page.viewport(414, 896));
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  await press(toggle());
  await vi.waitFor(() => expect(document.activeElement).toBe(host.querySelector('button.close-sheet')));
  await page.viewport(1400, 900);
  await vi.waitFor(() => expect(host.querySelector('.filters-sheet')).toBeNull());
  await vi.waitFor(() => expect(host.querySelector('.palette-layer').contains(document.activeElement)).toBe(true));
});

test('Escape on a filter chip closes the layer', async () => {
  await wide();
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  await openFilters();
  chip('IBM PC').focus();
  chip('IBM PC').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextTick();
  expect(closes).toBe(1);
});

test('nothing matching says so, with Clear', async () => {
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  await type('zzzz');
  expect(host.querySelector('.library-note').textContent).toContain('No fonts match.');
  expect(libraryNames()).toEqual([]);
  await press(host.querySelector('.library-note button'));
  expect(host.querySelector('.top input').value).toBe('');
  expect(libraryNames().length).toBe(4);
});

test('tags plus a query that match nothing say so, and Clear empties both', async () => {
  await wide();
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  await openFilters();
  await press(chip('IBM PC'));
  await type('rounded'); // Topaz is Amiga: nothing under IBM PC
  expect(host.querySelector('.library-note').textContent).toContain('No fonts match.');
  await press(host.querySelector('.library-note button'));
  expect(host.querySelectorAll('.font-filters .chip[aria-pressed="true"]').length).toBe(0);
  expect(host.querySelector('.top input').value).toBe('');
  expect(libraryNames().length).toBe(4);
});

test('past 100 matches, Show 100 more shows the next 100', async () => {
  const index = FIXTURE();
  index.fonts = Array.from({ length: 150 }, (_, i) => libFont(`F${String(i).padStart(3, '0')}`));
  index.linked = [];
  await mount({ library: index });
  await waitFor(() => libraryNames().length);
  expect(libraryNames().length).toBe(100);
  await press(button('Show 100 more'));
  expect(libraryNames().length).toBe(150);
  expect(button('Show 100 more')).toBeUndefined();
});

test('the library failing to load says so, Try again fetches again, and the other groups still work', async () => {
  await mount();
  await waitFor(() => host.querySelector('.library-note'));
  expect(host.querySelector('.library-note').textContent).toContain("The font library couldn't load.");
  expect(host.querySelector('[title="Show filters"], [title="Hide filters"]')).toBe(null); // no Filters column to fold without a library
  expect(names()).toEqual(['A', 'B', 'Tall Mono', ...BUILT_IN]); // In use, Yours and Built-in as before
  await press(row('B'));
  expect(title()).toBe('B');
  const before = indexFetches;
  stubLibrary(FIXTURE());
  await press(button('Try again'));
  await waitFor(() => libraryNames().length);
  expect(indexFetches).toBe(1);
  expect(before).toBe(1);
  expect(names().slice(0, 7)).toEqual(['A', 'B', 'Tall Mono', ...BUILT_IN].slice(0, 7));
});

test("a linked font's row says not included and shows its credit", async () => {
  await mount({ library: FIXTURE() });
  await waitFor(() => libraryNames().length);
  const frog = [...host.querySelectorAll('.row.library')].find((r) => r.textContent.includes('FROGBLOCK'));
  expect(frog.querySelector('.name em').textContent).toBe('not included');
  expect(frog.querySelector('.credit').textContent).toBe('FROGBLOCK font by Polyducks');
  expect(frog.querySelector('canvas')).toBeNull();
});

// A library font's file: the index entry named gets the id of these bytes, and fetching its file gives them (or the
// response the function given makes, or throws). Counts the file fetches.
let fileFetches = 0;
function serveFile(index, name, { bytes = new Uint8Array(2048).fill(7), response = null } = {}) {
  const entry = [...index.fonts, ...index.linked].find((e) => e.name === name);
  entry.fontId = fontId({ height: entry.height, bytes });
  fileFetches = 0;
  const before = fetch;
  vi.stubGlobal('fetch', async (url, ...rest) => {
    if (!String(url).endsWith(`fonts/library/${entry.file}`)) return before(url, ...rest);
    fileFetches += 1;
    return response ? response() : new Response(bytes);
  });
  return entry;
}
const origin = () => [...host.querySelectorAll('.edit-side .origin dt')].map((dt) => `${dt.textContent} ${dt.nextElementSibling.textContent}`);
const chooseLibrary = async (name) => {
  await waitFor(() => libraryNames().length);
  await press([...host.querySelectorAll('.row.library')].find((r) => r.querySelector('.name span').textContent === name));
};

test("a library font chosen shows its 256 slots, fetched once (Use this font doesn't fetch it again), with From and License after them", async () => {
  await wide();
  const index = FIXTURE(), entry = serveFile(index, 'Zeta');
  await mount({ library: index });
  await chooseLibrary('Zeta');
  await vi.waitFor(() => expect(host.querySelectorAll('.edit-side .grid.sheet .cell').length).toBe(256));
  expect(host.querySelector('.edit-side canvas.glyph-sample.big')).toBeNull(); // the sample was only while it loaded
  const sheet = host.querySelector('.edit-side .grid.sheet'), originList = host.querySelector('.edit-side dl.origin');
  expect(sheet.compareDocumentPosition(originList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const cell = host.querySelectorAll('.edit-side .grid.sheet .cell')[65];
  cell.dispatchEvent(new MouseEvent('mouseenter'));
  await nextTick();
  expect(host.querySelector('.edit-side .info').textContent).toBe('Slot 65 A');
  expect(fileFetches).toBe(1);
  await press(button('Use this font'));
  await vi.waitFor(async () => expect((await loadFonts()).some((f) => f.id === entry.fontId)).toBe(true)); // kept, before the next test clears the store
  expect(fileFetches).toBe(1);
});

test('a click on a slot shows its glyph large over the sheet; a second click, Escape or a click elsewhere puts it away', async () => {
  await wide();
  const index = FIXTURE();
  serveFile(index, 'Zeta');
  await mount({ library: index });
  await chooseLibrary('Zeta');
  await vi.waitFor(() => expect(host.querySelectorAll('.edit-side .grid.sheet .cell').length).toBe(256));
  const zoom = () => document.querySelector('.glyph-zoom');
  const cells = () => host.querySelectorAll('.edit-side .grid.sheet .cell');
  await press(cells()[65]);
  await vi.waitFor(() => expect(zoom()?.matches(':popover-open')).toBe(true));
  expect(zoom().getAttribute('aria-label')).toBe('Slot 65 A');
  expect(zoom().querySelector('.glyph').textContent).toBe('A');
  expect(getComputedStyle(zoom().querySelector('.glyph')).fontSize).toBe('96px'); // an 8-line font, 12 times its size
  expect(document.activeElement).toBe(zoom());
  await press(cells()[66]); // another slot moves it
  await vi.waitFor(() => expect(zoom().getAttribute('aria-label')).toBe('Slot 66 B'));
  await press(cells()[66]); // the same slot again puts it away
  expect(zoom()).toBeNull();
  await press(cells()[65]);
  await vi.waitFor(() => expect(zoom()).toBeTruthy());
  zoom().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextTick();
  expect(zoom()).toBeNull();
  expect(closes).toBe(0); // the layer stays open
  await press(cells()[65]);
  await vi.waitFor(() => expect(zoom()).toBeTruthy());
  host.querySelector('.edit-side .title').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await nextTick();
  expect(zoom()).toBeNull();
});

test('with a block picked, a click on a slot sets it rather than showing it large', async () => {
  const { project } = await mount({ font: lowerAt240 });
  await press(slotCell(254));
  await vi.waitFor(() => expect(document.querySelector('.glyph-zoom')).toBeTruthy()); // nothing picked: a closer look
  await press(tile('Lower'));
  await press(slotCell(254));
  expect(blocksOf(project.drawingFont)[1]).toBe(254);
  expect(document.querySelector('.glyph-zoom')).toBeNull();
});

test('with a block or a line piece picked, a long press on a slot shows it large, and its click sets nothing', async () => {
  const { project } = await mount({ font: lowerAt240 });
  await press(tile('Lower'));
  const hold = async (cell) => {
    cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('.glyph-zoom')?.getAttribute('aria-label')).toMatch(/^Slot 254 /), { timeout: 2000 });
    cell.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await press(cell); // the click that ends the press
  };
  await hold(slotCell(254));
  expect(blocksOf(project.drawingFont)[1]).toBe(240); // not set
  expect(document.querySelector('.glyph-zoom')).toBeTruthy(); // and still open
  slotCell(254).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); // a short press is a click again
  slotCell(254).dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  await press(slotCell(254));
  expect(blocksOf(project.drawingFont)[1]).toBe(254);
});

test("a library font that can't be fetched shows its sample instead of its slots", async () => {
  await wide();
  const index = FIXTURE();
  serveFile(index, 'Zeta', { response: () => new Response('', { status: 404 }) });
  await mount({ library: index });
  await chooseLibrary('Zeta');
  await vi.waitFor(() => expect(fileFetches).toBe(1));
  await nextTick();
  expect(host.querySelector('.edit-side canvas.glyph-sample.big')).toBeTruthy();
  expect(host.querySelector('.edit-side .grid.sheet')).toBeNull();
  expect(host.querySelector('.problem')).toBeNull(); // only a preview: nothing to say until Use this font
});

test('a font in Yours shows From and License after its slots', async () => {
  await wide();
  const index = FIXTURE(), entry = serveFile(index, 'Zeta');
  await mount({ library: index });
  await chooseLibrary('Zeta');
  await press(button('Add to Yours'));
  await vi.waitFor(() => expect(host.querySelector('.edit-side .info')).toBeTruthy());
  await vi.waitFor(async () => expect((await loadFonts()).some((f) => f.id === entry.fontId)).toBe(true));
  const info = host.querySelector('.edit-side .info'), originList = host.querySelector('.edit-side dl.origin');
  expect(originList).toBeTruthy();
  expect(info.compareDocumentPosition(originList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('Use this font fetches the font, keeps it in Yours and makes it the drawing\'s font', async () => {
  const index = FIXTURE(), entry = serveFile(index, 'Zeta');
  const { project, workspace } = await mount({ library: index });
  await chooseLibrary('Zeta');
  expect(title()).toBe('Zeta');
  expect(host.querySelector('.edit-side .meta').textContent).toBe('8×8 · Library');
  expect(actions()).toEqual(['Use this font', 'Add to Yours']);
  await press(button('Use this font'));
  await waitFor(() => project.drawingFont && fontId(project.drawingFont) === entry.fontId);
  expect(fileFetches).toBe(1);
  expect(workspace.userFonts.filter((f) => f.id === entry.fontId).length).toBe(1);
  expect((await loadFonts()).map((f) => f.id)).toContain(entry.fontId);
  await waitFor(() => host.querySelector('.edit-side .sheet')); // the stored font's own details, with From and License
  expect(origin()).toContain('From VileR');
});

test('Add to Yours keeps it without using it', async () => {
  const index = FIXTURE(), entry = serveFile(index, 'Zeta');
  const { project, workspace } = await mount({ library: index });
  await chooseLibrary('Zeta');
  await press(button('Add to Yours'));
  await waitFor(() => workspace.userFonts.some((f) => f.id === entry.fontId));
  expect(fontId(project.drawingFont)).toBe(fontId(fontA()));
  await waitFor(() => host.querySelector('.edit-side .sheet'));
  expect(button('Use this font')).toBeTruthy();
  expect(button('Remove')).toBeTruthy();
});

test('a library font already in Yours fetches nothing and makes no second entry', async () => {
  const index = FIXTURE(), bytes = new Uint8Array(2048).fill(9), entry = serveFile(index, 'Zeta', { bytes });
  const { workspace } = await mount({ library: index });
  workspace.userFonts = [...workspace.userFonts, await addBitmapFont(new File([bytes], 'Mine.F08'))];
  const before = workspace.userFonts.length;
  await chooseLibrary('Zeta');
  await waitFor(() => host.querySelector('.edit-side .sheet'));
  expect(title()).toBe('Mine'); // the copy in Yours
  expect(origin()).toContain('From VileR');
  await press(button('Use this font'));
  expect(fileFetches).toBe(0);
  expect(workspace.userFonts.length).toBe(before);
  expect(workspace.userFonts.filter((f) => f.id === entry.fontId).length).toBe(1);
});

test('Add to Yours, then Use this font sets the SAUCE font name the library gives it', async () => {
  const index = FIXTURE(), entry = serveFile(index, 'Zeta');
  entry.sauce = 'IBM EGA';
  const { project, workspace } = await mount({ library: index });
  await chooseLibrary('Zeta');
  await press(button('Add to Yours'));
  await waitFor(() => workspace.userFonts.some((f) => f.id === entry.fontId));
  await waitFor(() => host.querySelector('.edit-side .sheet')); // the stored font's details now
  expect(project.sauceFontName).toBe('IBM VGA');
  await press(button('Use this font'));
  await waitFor(() => project.drawingFont && fontId(project.drawingFont) === entry.fontId);
  expect(project.sauceFontName).toBe('IBM EGA');
  expect(fileFetches).toBe(1);
  project.undo(); // one step: the font and the name
  expect(fontId(project.drawingFont)).toBe(fontId(fontA()));
  expect(project.sauceFontName).toBe('IBM VGA');
});

const arrow = async (k, on = host.querySelector('.palette-layer')) => {
  on.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  await nextTick();
};

test('the arrow keys walk into and through the library rows', async () => {
  await mount({ library: FIXTURE() });
  await chooseLibrary('Alpha');
  const before = names()[names().indexOf('Alpha') - 1]; // the last built-in font
  await arrow('ArrowDown');
  expect(title()).toBe('FROGBLOCK');
  expect(host.querySelector('.row.library.current .name span').textContent).toBe('FROGBLOCK');
  await arrow('ArrowUp');
  expect(title()).toBe('Alpha');
  await arrow('ArrowUp');
  expect(title()).toBe(before);
  await arrow('ArrowDown');
  expect(title()).toBe('Alpha');
});

test('from a library row whose font is in Yours, the arrow keys step from that row', async () => {
  const index = FIXTURE(), bytes = new Uint8Array(2048).fill(9);
  serveFile(index, 'Zeta', { bytes });
  const { workspace } = await mount({ library: index });
  workspace.userFonts = [...workspace.userFonts, await addBitmapFont(new File([bytes], 'Mine.F08'))];
  await chooseLibrary('Zeta');
  expect(title()).toBe('Mine'); // the copy in Yours
  await arrow('ArrowUp');
  expect(title()).toBe('Topaz');
});

test('the arrow keys walk the font rows from a filter chip', async () => {
  await wide();
  await mount({ library: FIXTURE() });
  await chooseLibrary('Alpha');
  await openFilters();
  await arrow('ArrowDown', chip('IBM PC'));
  expect(title()).not.toBe('Alpha');
});

test('useLibraryFont and keepLibraryFont, for a font in Yours or the drawing\'s, fetch nothing and make no second entry', async () => {
  const index = FIXTURE(), bytes = new Uint8Array(2048).fill(9), entry = serveFile(index, 'Zeta', { bytes });
  entry.sauce = 'IBM EGA43';
  const { project, workspace } = await mount({ library: index });
  workspace.userFonts = [...workspace.userFonts, await addBitmapFont(new File([bytes], 'Mine.F08'))];
  const { useLibraryFont, keepLibraryFont } = useFontActions();
  const count = () => workspace.userFonts.filter((f) => f.id === entry.fontId).length;
  await keepLibraryFont(entry); // in Yours
  expect([fileFetches, count()]).toEqual([0, 1]);
  await useLibraryFont(entry); // in Yours: used from there, with its SAUCE name
  expect([fileFetches, count(), fontId(project.drawingFont), project.drawingFont.name, project.sauceFontName]).toEqual([0, 1, entry.fontId, 'Mine', 'IBM EGA43']);
  const steps = project.history.version;
  await useLibraryFont(entry); // the drawing's font: nothing to do
  await keepLibraryFont(entry);
  expect([fileFetches, count(), project.history.version]).toEqual([0, 1, steps]);
  workspace.userFonts = workspace.userFonts.filter((f) => f.id !== entry.fontId); // only the drawing's now
  await keepLibraryFont(entry);
  expect([fileFetches, count()]).toEqual([0, 0]);
});

test('a failed fetch or a wrong-size file says so and changes nothing', async () => {
  const unreachable = "Phosphor couldn't fetch Zeta from the font library. Check your connection and try again.";
  const cases = [
    [() => new Response('', { status: 404 }), unreachable],
    [() => { throw new TypeError('Failed to fetch'); }, unreachable], // offline
    [() => new Response(new Uint8Array(100)), "Zeta isn't a bitmap font Phosphor can read: it needs 256 glyphs, 8 pixels wide and 1 to 32 tall."],
  ];
  for (const [response, said] of cases) {
    const index = FIXTURE();
    serveFile(index, 'Zeta', { response });
    const { project, workspace } = await mount({ library: index });
    const fonts = workspace.userFonts.length;
    await chooseLibrary('Zeta');
    await press(button('Use this font'));
    await waitFor(() => host.querySelector('.problem'));
    expect(host.querySelector('.problem').textContent).toBe(said);
    expect(fileFetches).toBe(1);
    expect(workspace.userFonts.length).toBe(fonts);
    expect(fontId(project.drawingFont)).toBe(fontId(fontA()));
    expect(title()).toBe('Zeta');
    app.unmount();
    host.remove();
    forgetLibrary();
  }
});

test('in someone else\'s room, Use this font keeps it in Yours but doesn\'t apply it', async () => {
  const index = FIXTURE(), entry = serveFile(index, 'Zeta');
  const { project, workspace } = await mount({ library: index });
  workspace.roomFont = { id: 'jetbrains', name: 'JetBrains Mono', family: 'JetBrains Mono', size: 16, lineHeight: 1.2 };
  await chooseLibrary('Zeta');
  expect(button('Use this font').disabled).toBe(false);
  await press(button('Use this font'));
  await waitFor(() => workspace.userFonts.some((f) => f.id === entry.fontId));
  expect(fontId(project.drawingFont)).toBe(fontId(fontA()));
});

test('details show tags, From and License: None given for VileR, Unknown with Tell us for Mœbius', async () => {
  await mount({ library: FIXTURE() });
  await chooseLibrary('Zeta');
  const chips = () => [...host.querySelectorAll('.edit-side .tag-chips .chip')].map((el) => el.textContent);
  expect(chips()).toEqual(['IBM PC', '8×8', 'CP437', 'VileR', 'Ready to paint']);
  const link = (name) => [...host.querySelectorAll('.edit-side .origin a')].find((a) => a.textContent === name);
  expect(origin()).toEqual(['From VileR', 'License None given · credits in FONTS.TXT']);
  expect(link('VileR').href).toBe('https://example.test/viler');
  expect(link('None given · credits in FONTS.TXT').href).toMatch(/fonts\/library\/viler\/FONTS\.TXT$/);
  expect(host.querySelector('.edit-side canvas.glyph-sample')).toBeTruthy();
  await chooseLibrary('Topaz');
  expect(origin()).toEqual(['From Mœbius', 'License Unknown · Know it? Tell us']);
  expect(decodeURIComponent(link('Know it? Tell us').href)).toContain('title=License for Topaz (Mœbius)');
  await press([...host.querySelectorAll('.edit-side .tag-chips .chip')].find((el) => el.textContent === 'Amiga'));
  expect(libraryNames()).toEqual(['Topaz']); // the chip became the picked tag
  expect(label()).toBe('Library · 1 found');
});

test('a linked font offers Get it and + Load, and FROGBLOCK\'s loaded bytes show as FROGBLOCK with its credit', async () => {
  const index = FIXTURE(), bytes = new Uint8Array(2048).fill(5), frogId = fontId({ height: 8, bytes });
  index.linked[0].fontId = frogId;
  globalThis.__linkedId = frogId;
  const { project } = await mount({ library: index });
  await chooseLibrary('FROGBLOCK');
  expect(host.querySelector('.edit-side .meta').textContent).toBe('8×8 · Library · not included');
  expect(actions()).toEqual(['+ Load']);
  expect(host.querySelector('.edit-side a.button').textContent).toBe('Get it (opens in a new tab)');
  expect(host.querySelector('.edit-side a.button').href).toBe('https://polyducks.itch.io/frogblock');
  expect(origin()).toContain('Credit FROGBLOCK font by Polyducks');
  expect([...host.querySelectorAll('.edit-side .origin a')].map((a) => a.href)).toEqual(['https://example.test/frog-license']);
  const input = host.querySelector('input[type=file]');
  const data = new DataTransfer();
  data.items.add(new File([bytes], 'whatever.F08'));
  input.files = data.files;
  input.dispatchEvent(new Event('change'));
  await waitFor(() => project.drawingFont && fontId(project.drawingFont) === frogId);
  await waitFor(() => title() === 'FROGBLOCK');
  expect(project.drawingFont.name).toBe('FROGBLOCK'); // the name it's kept and drawn under (the Font field's), not the file's
  expect((await loadFonts()).find((f) => f.id === frogId).name).toBe('FROGBLOCK');
  expect(origin()).toContain('Credit FROGBLOCK font by Polyducks');
  expect(row('FROGBLOCK').querySelector('.credit').textContent).toBe('FROGBLOCK font by Polyducks');
});

// The Width switch: a bitmap font's own width (when narrower than 8), 8 and 9.
const slim = () => ({ name: 'Slim', height: 7, bytes: Uint8Array.from({ length: 256 * 7 }, (_, i) => (i % 251) & 0xfe), blocks: [...cp437Blocks] });
const widthButtons = () => [...host.querySelectorAll('.width-switch button')];
const pressed = () => widthButtons().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent.trim());
const shown = () => widthButtons().map((b) => b.textContent.trim());

test('the Width switch is a toggle group, its width lit', async () => {
  await mount({ font: { ...slim(), width: 7 } });
  expect(host.querySelector('.width-switch').classList.contains('toggle-group')).toBe(true);
  expect(widthButtons().map((b) => b.classList.contains('on'))).toEqual([true, false, false]);
});

test('the drawing\'s narrow font shows Width 7 · 8 · 9, pressed at its width; pressing 9 widens it', async () => {
  const { project } = await mount({ font: { ...slim(), width: 7 } });
  expect(shown()).toEqual(['7', '8', '9']);
  expect(pressed()).toEqual(['7']);
  expect(host.querySelector('.width-note').textContent).toBe('Only Phosphor supports a width of 7. ANSI and XBin exports use 8.'); // exports can't hold 7
  await press(widthButtons()[2]);
  await waitFor(() => project.drawingFont.cellWidth === 9);
  expect(pressed()).toEqual(['9']);
  await vi.waitFor(() => expect(host.querySelector('.width-note')).toBe(null));
  expect(project.sauceLetterSpacing).toBe('9');
});

// Ruling 15: the drawing's font from an XBin isn't in Yours, so a press had nowhere to keep its answer and the next XBin
// in it asked again. It joins Yours first, as the width question's answer does, and that question, still showing, closes.
test('pressing the switch on the drawing\'s narrow font that isn\'t in Yours adds it there with the answer and closes its question', async () => {
  const { project, workspace } = await mount({ font: slim() });
  const id = fontId(project.drawingFont);
  askFontWidth(project.drawingFont);
  expect(toastMessage.value).toBe('Slim is 7 pixels wide.');
  expect(workspace.userFonts.some((f) => f.id === id)).toBe(false);
  await press(widthButtons()[1]);
  await vi.waitFor(async () => expect((await storedBitmapFont(id))?.width).toBe(8));
  expect(project.drawingFont.cellWidth).toBe(8);
  expect(toastMessage.value).toBe(null);
});

test('an 8-wide font shows 8 · 9 only', async () => {
  await mount();
  expect(shown()).toEqual(['8', '9']);
  expect(pressed()).toEqual(['8']);
  expect(host.querySelector('.width-note')).toBe(null);
});

test('a stored font not in use shows 7 · 8 and pressing stores its answer without touching the drawing', async () => {
  const { project, workspace } = await mount();
  const f = slim(), id = (await addBitmapFont(new File([f.bytes], 'Slim.F07'))).id;
  workspace.userFonts = await loadFonts();
  await vi.waitFor(() => expect(row('Slim')).toBeTruthy());
  await press(row('Slim'));
  await waitFor(() => widthButtons().length);
  expect(shown()).toEqual(['7', '8']);
  expect(pressed()).toEqual(['7']); // unanswered: drawn at its own width
  const drawn = project.drawingFont.cellWidth;
  await press(widthButtons()[1]);
  await vi.waitFor(async () => expect((await storedBitmapFont(id)).width).toBe(8));
  expect(pressed()).toEqual(['8']);
  expect(project.drawingFont.cellWidth).toBe(drawn);
  expect(fontId(project.drawingFont)).toBe(fontId(fontA()));
});

test('the rows read each font\'s width: the drawing\'s as drawn, a stored one\'s remembered width, else its own', async () => {
  const { project, workspace } = await mount({ font: { ...slim(), width: 7 } });
  const size = (name) => row(name).querySelector('.name em').textContent;
  expect(size('Slim')).toBe('7×7'); // In use, drawn at its own width
  const other = { ...slim(), name: 'Other', bytes: slim().bytes.map((b) => b & 0xfc) }; // 6 wide
  await addBitmapFont(new File([other.bytes], 'Other.F07'));
  workspace.userFonts = await loadFonts();
  await vi.waitFor(() => expect(row('Other')).toBeTruthy());
  expect(size('Other')).toBe('6×7'); // unanswered: its own width
  const id = workspace.userFonts.find((f) => f.name === 'Other').id;
  await storeFontPart(id, 'width', 8);
  workspace.userFonts = await loadFonts();
  await vi.waitFor(() => expect(size('Other')).toBe('8×7')); // its remembered answer
  project.setDrawingFontWidth(9);
  await vi.waitFor(() => expect(size('Slim')).toBe('9×7'));
  expect(size('B')).toBe('8×16');
});

test('the meta reads the width: 7×7', async () => {
  await mount({ font: { ...slim(), width: 7 } });
  expect(host.querySelector('.edit-side .meta').textContent).toMatch(/^7×7 · /);
});

test('in a room a host can press the switch and an artist can\'t, with a reason', async () => {
  const { project } = await mount({ font: { ...slim(), width: 7 } });
  project._hosting = true;
  project._sharing = { role: 'host' };
  await nextTick();
  expect(widthButtons().every((b) => !b.disabled)).toBe(true);
  project._sharing = { role: 'artist' };
  await nextTick();
  for (const b of widthButtons()) {
    expect(b.disabled).toBe(true);
    expect(b.title).toBe('Only the room\u2019s host can change the width.');
    expect(b.hasAttribute('data-off-reason')).toBe(true);
  }
  project._sharing = null;
});

test('a stored 8-wide font has no switch', async () => {
  const { workspace } = await mount();
  await addBitmapFont(rawFile(8, 'Wide.F08', 0xff));
  workspace.userFonts = await loadFonts();
  await vi.waitFor(() => expect(row('Wide')).toBeTruthy());
  await press(row('Wide'));
  await waitFor(() => host.querySelector('.sections'));
  expect(widthButtons()).toEqual([]);
});

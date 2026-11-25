// Blink in the ANSI view: without iCE colors, a CGA drawing's bright background is drawn dark with its letter coming and
// going; with them, or in the PIXEL view and the cells everything else reads, it stays bright. (Read from the DOM view's
// spans: a WebGL canvas's pixels are gone by the time a test could read them.)
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import AnsiEditor from '@/components/AnsiEditor.vue';
import { PALETTES } from '@/lib/ColorUtils';

// The system's reduced-motion setting, as matchMedia answers it; every other query the browser's own.
const realMatchMedia = window.matchMedia.bind(window);
const reducedMotion = (on) => vi.spyOn(window, 'matchMedia').mockImplementation((query) => (query === '(prefers-reduced-motion: reduce)' ? { matches: on, media: query } : realMatchMedia(query)));

let app = null, host = null, renderer = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  if (renderer) renderer.ansiRenderer = 'canvas'; // kept in this browser's storage, for the tests after
  app = host = renderer = null;
});

const cga = PALETTES.cga;
const css = (hex) => `rgb(${[hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((v) => parseInt(v, 16)).join(', ')})`;

// The ANSI view (its DOM view) of a CGA drawing with white A on bright blue in its first cell; the first cell's run.
async function mountBlue() {
  const { project, workspace, pinia } = await createTestApp();
  renderer = workspace;
  workspace.ansiRenderer = 'dom';
  await project.setBlankCanvas({ withLayer: true, cols: 4, rows: 2 });
  project.quantize = 'cga';
  project.writeEditCells([{ col: 0, row: 0, attrs: { char: 'A', fg: cga[15].hex, bg: cga[12].hex } }]);
  project.commitEdit();
  await settle(project);
  workspace.editorTab = 'output';
  host = Object.assign(document.createElement('div'), { style: 'position: fixed; left: 0; top: 0; width: 400px; height: 300px; display: flex' });
  document.body.append(host);
  app = createApp({ render: () => h(AnsiEditor, { view: 'output' }) }).use(pinia).use(i18n);
  app.mount(host);
  await nextTick();
  const first = () => host.querySelector('pre span span');
  await expect.poll(() => first()?.style.backgroundColor).toBe(css(cga[12].hex));
  return { project, first };
}

test('without iCE colors a bright background is drawn dark, its letter blinking; with them it\'s bright and steady', async () => {
  const { project, first } = await mountBlue();

  project.sauceIceColors = false;
  await expect.poll(() => [first()?.style.backgroundColor, first()?.style.color]).toEqual([css(cga[4].hex), css(cga[15].hex)]);
  await expect.poll(() => first()?.style.color).toBe(css(cga[4].hex)); // unlit: the letter is the background's color
  await expect.poll(() => first()?.style.color).toBe(css(cga[15].hex)); // and back
  expect(project.cells[0].bg.hex).toBe(cga[12].hex); // the cells keep it bright: PIXEL, merges and exports read these

  project.sauceIceColors = true;
  await expect.poll(() => first()?.style.backgroundColor).toBe(css(cga[12].hex));
});

test('with reduced motion asked for, a blinking cell is drawn dark with its letter staying lit', async () => {
  const motion = reducedMotion(true);
  try {
    const { project, first } = await mountBlue();
    project.sauceIceColors = false;
    await expect.poll(() => first()?.style.backgroundColor).toBe(css(cga[4].hex));
    for (let i = 0; i < 4; i++) { // past two blinks' turns
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(first().style.color).toBe(css(cga[15].hex));
    }
  } finally {
    motion.mockRestore();
  }
});

// docs/model.md R14. A CGA drawing without iCE colors: bright blue (12) painted over the top half of one cell and over all
// of another, and a white A typed on the same color.
async function paintedAndTyped() {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 4, rows: 4 });
  project.quantize = 'cga';
  project.chars = '▄'; // paint as half blocks, on the layer too
  project.setLayerChars('edit', { chars: '▄' });
  await settle(project);
  const { r, g, b } = cga[12], blue = { r, g, b, alpha: 1 };
  project.paintEditPixels([{ x: 0, y: 0, ...blue }, { x: 1, y: 0, ...blue }, { x: 1, y: 1, ...blue }]);
  project.commitEdit();
  project.writeEditCells([{ col: 2, row: 0, attrs: { char: 'A', fg: cga[15].hex, bg: cga[12].hex } }]);
  project.commitEdit();
  await settle(project);
  project.setIceColors(false);
  return project;
}
// What a .pho draws when it's printed in a terminal: its phCa chunk's bytes, as text (docs/pho.md, In a terminal).
const printedArt = async (blob) => {
  const file = new Uint8Array(await blob.arrayBuffer()), latin1 = (b) => String.fromCharCode(...b);
  const at = file.findIndex((_, i) => latin1(file.subarray(i + 4, i + 8)) === 'phCa');
  return at < 0 ? '' : latin1(file.subarray(at + 8, at + 8 + new DataView(file.buffer).getUint32(at)));
};
const exported = async (project) => {
  let text;
  await project.exportFile('utf8ans', { sauce: false, deliver: async (blob) => { text = String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())); } });
  return text;
};
const look = ({ char, fg, bg }) => [char, fg.hex.toLowerCase(), bg.hex.toLowerCase()];

test('R14: without iCE colors paint never blinks: a bright half is the foreground of a ▀, a cell all bright a █, and only the typed character keeps its bright background', async () => {
  const project = await paintedAndTyped();
  expect(project.cells.slice(0, 3).map((cell) => cell.bg.hex.toLowerCase())).toEqual([cga[12].hex, cga[12].hex, cga[12].hex].map((h) => h.toLowerCase())); // the cells themselves: bright on top
  const steady = project.steadyCells();
  expect(look(steady[0])).toEqual(['▀', cga[12].hex.toLowerCase(), project.cells[0].fg.hex.toLowerCase()]);
  expect(look(steady[1])).toEqual(['█', cga[12].hex.toLowerCase(), cga[4].hex.toLowerCase()]);
  expect(steady[2]).toBe(project.cells[2]); // someone's own: it blinks
  expect(steady[3]).toBe(project.cells[3]);

  project.undo(); // iCE colors is an undo step
  expect(project.sauceIceColors).toBe(true);
  expect(project.steadyCells()).toBe(project.cells);
});

test('R14: a .pho printed in a terminal draws its paint steady too, as the .utf8ans export writes it', async () => {
  const project = await paintedAndTyped();
  const art = await printedArt(await project.projectFile()), text = await exported(project);
  expect(text).toContain(String.fromCharCode(...new TextEncoder().encode('▀'))); // the steady half, not a blink
  expect(art).toContain(text);
});

test('R14: an .ans exported without iCE colors writes paint steady (▀ and █ in the bright color) and blink only for the typed character', async () => {
  const project = await paintedAndTyped();
  let blob;
  await project.exportFile('ans', { deliver: (b) => { blob = b; }, sauce: false });
  const bytes = new Uint8Array(await blob.arrayBuffer()), text = new TextDecoder('latin1').decode(bytes);
  const esc = String.fromCharCode(27), sgrs = text.split(esc + '[').slice(1).map((part) => part.slice(0, part.indexOf('m')).split(';'));
  expect(sgrs.filter((codes) => codes.includes('5')).length).toBe(1); // one run blinks: the A
  expect(text.slice(text.indexOf('A') - 12, text.indexOf('A'))).toContain('[5;');
  expect(bytes.includes(0xdf)).toBe(true); // ▀
  expect(bytes.includes(0xdb)).toBe(true); // █
});

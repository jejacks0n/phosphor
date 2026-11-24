// Blink in the ANSI view: without iCE colors, a CGA drawing's bright background is drawn dark with its letter coming and
// going; with them, or in the PIXEL view and the cells everything else reads, it stays bright. (Read from the DOM view's
// spans: a WebGL canvas's pixels are gone by the time a test could read them.)
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
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
  const { project, workspace } = await createTestApp();
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
  app = createApp({ render: () => h(AnsiEditor, { view: 'output' }) }).use(getActivePinia()).use(i18n);
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

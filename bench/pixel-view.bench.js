// The PIXEL view over an opened file, every cell a pin (500k of them): the worst case for drawing the base's characters
// as they look (docs/model.md R11). Its first draw (the switch to the tab), a redraw while scrolling and the redraw after
// one cell is written, with the looks and without them (as it was before them), with All cells on (as a file used to
// open, to hide the stripes) and off (as it opens now). Asserts nothing: it prints a table.
// Run: npx vitest run --config bench/vitest.config.js --silent=false pixel-view
import { test } from 'vitest';
import { createApp, h } from 'vue';
import { getActivePinia } from 'pinia';
import { createTestApp } from '../tests/support/app.js';
import InputEditor from '@/components/InputEditor.vue';

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
async function settled(project) {
  await frame();
  while (project._renderQueued || project._rendering) await frame();
  await frame();
}

// Cells that differ from their neighbors, characters and colors.
const CHARS = [...'░▒▓█▀▄ABCxyz@#-=|/\\~'];
const hex = (i) => `#${[(i * 37) % 256, (i * 91) % 256, (i * 53) % 256].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const variedCells = (n) => Array.from({ length: n }, (_, i) => ({ char: CHARS[i % CHARS.length], fg: hex(i % 64), bg: hex((i * 7 + 3) % 64) }));

test('pixel view over an opened file', { timeout: 900_000 }, async () => {
  const rows = [];
  for (const [cols, lines] of [[100, 5000], [300, 1666]]) {
    for (const looks of [false, true]) {
      for (const allCells of [true, false]) {
        const { project, workspace } = await createTestApp();
        const start = performance.now();
        await project.openArtFile(new File([], 'bench.ans'), { art: { cols, rows: lines, cells: variedCells(cols * lines), palette: 'none', sauce: null } });
        await settled(project);
        const open = performance.now() - start;
        if (!looks) project.renderer.looksCanvas = () => null;
        Object.assign(workspace, { editorTab: 'input', ansiOverlay: 100, ansiOverlayAll: allCells });
        // The time spent inside animation frames: the view's redraws.
        let inFrames = 0;
        const raf = window.requestAnimationFrame;
        window.requestAnimationFrame = (fn) => raf((at) => {
          const from = performance.now();
          fn(at);
          inFrames += performance.now() - from;
        });
        const host = document.createElement('div');
        host.style.cssText = 'width:1400px;height:900px;position:fixed;left:0;top:0';
        document.body.append(host);
        const view = createApp({ render: () => h(InputEditor) });
        view.use(getActivePinia());
        const mounting = performance.now();
        view.mount(host);
        const mount = performance.now() - mounting;
        for (let i = 0; i < 4; i++) await frame();
        const first = mount + inFrames;
        const scroller = host.querySelector('article'), steps = 40;
        inFrames = 0;
        for (let i = 0; i < steps; i++) {
          scroller.scrollTop += 240;
          scroller.dispatchEvent(new Event('scroll'));
          await frame();
        }
        const scroll = inFrames / steps;
        inFrames = 0;
        project.writeBaseCells([{ col: 5, row: 60, char: '▒', fg: '#ffffff', bg: '#000000' }]);
        project.commitEdit();
        for (let i = 0; i < 3; i++) await frame();
        const edit = inFrames;
        window.requestAnimationFrame = raf;
        view.unmount();
        host.remove();
        rows.push({ grid: `${cols}x${lines}`, looks, allCells, 'open ms': Math.round(open), 'first draw ms': +first.toFixed(1), 'scroll redraw ms': +scroll.toFixed(2), 'redraw after one cell ms': +edit.toFixed(1), zoom: workspace.editZoom });
        project.clearImage();
      }
    }
  }
  for (const row of rows) console.log(`PIXEL VIEW ${JSON.stringify(row)}`);
});

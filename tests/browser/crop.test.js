// Crop (#211, the Select row's): the drawing cut to the selection's bounds, everything in them moved up and left to the
// corner, every layer and frame, the picture, the guides and zero; one undo step that brings back what was cut off.
import { test, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { i18n } from '@/i18n';
import EditToolbar from '@/components/EditToolbar.vue';
import { useRoomStore } from '@/store/RoomStore';
import { font8 } from '../support/blockFonts.js';
import { rectShape } from '@/document/shapes.js';
import { mirrorAxes } from '@/lib/mirror';

const INK = { fg: '#ffffff', bg: '#000000' };
const GREEN = '#00ff00';

async function scene({ cols = 20, rows = 20 } = {}) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols, rows });
  workspace.editorTab = 'output';
  const type = (col, row, char) => { project.typeAt(col, row, char, INK); project.commitEdit(); };
  const paint = (x, y) => { project.paintStroke([{ x, y, alpha: 1 }], GREEN); project.commitEdit(); };
  const own = (col, row) => project.editCells.get(`${col},${row}`)?.char ?? null;
  const crop = async (rect) => { await project.cropTo(rect); await settle(project); };
  return { project, workspace, type, paint, own, crop };
}

test('Crop cuts the drawing to the rectangle and moves it to the corner: cells, paint, the base\'s pins and pixels; one undo brings back what was cut off', async () => {
  const { project, type, paint, own, crop } = await scene();
  type(5, 3, 'A');
  type(1, 1, 'Z'); // cut off
  paint(6, 6);
  project.writeBaseCells([{ col: 7, row: 4, char: 'Q', fg: '#ff0000', bg: '#0000ff' }]);
  project.commitEdit();
  await settle(project);
  const version = project.history.version;
  await crop({ c0: 4, r0: 2, c1: 11, r1: 6 });
  expect([project.cols, project.rows]).toEqual([8, 10]);
  expect([own(1, 1), project.editCells.size]).toEqual(['A', 1]);
  expect(project.paintLayer.pixelAt(2, 2)?.g).toBe(255);
  expect(project.baseRecords.pins.get('3,2')).toBe('Q');
  expect(project.history.version).toBe(version + 1);

  project.undo();
  await settle(project);
  expect([project.cols, project.rows]).toEqual([20, 20]);
  expect([own(5, 3), own(1, 1)]).toEqual(['A', 'Z']);
  expect(project.paintLayer.pixelAt(6, 6)?.g).toBe(255);
  expect(project.baseRecords.pins.get('7,4')).toBe('Q');
  project.redo();
  await settle(project);
  expect([project.cols, project.rows, own(1, 1)]).toEqual([8, 10, 'A']);
});

test('the picture stays whole and moves by whole grid pixels, so the cells inside keep their colors, a crop edge mid image pixel included; a change of size after holds the grid, as with something drawn', async () => {
  const { project, crop } = await scene({ cols: 30, rows: 20 }); // the 64 x 64 picture letterboxed: 20 grid pixels wide, from column 5
  const image = project.image, fit = { ...project.fit };
  const look = (c0, r0, c1, r1) => {
    const out = [];
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
      const cell = project.cells[row * project.cols + col];
      out.push(`${cell.fg.hex}${cell.bg.hex}`); // the colors: Random's characters come from the seed and each cell's place, so they're new
    }
    return out;
  };
  const inside = look(7, 2, 20, 8); // column 7 is 6.4 image pixels in
  await crop({ c0: 7, r0: 2, c1: 20, r1: 8 });
  expect(look(0, 0, 13, 6)).toEqual(inside);
  expect([project.image, project.fit]).toEqual([image, { ...fit, dx: fit.dx - 7, dy: fit.dy - 4 }]);
  project.clearHistory(); // as a reopened file has none: the fit alone holds the crop
  project.cols = 16;
  await settle(project);
  expect([project.fit, look(0, 0, 13, 6)]).toEqual([{ ...fit, dx: fit.dx - 7, dy: fit.dy - 4 }, inside]);
  await project.setDrawingFont(font8); // a font of another height keeps the picture under the cells too: it still runs past the edge
  await settle(project);
  expect([project.fit.dx < 0, project.fit.dy < 0]).toEqual([true, true]);
});

test('after a crop from the top left, Into the image, Threshold and Bake read the picture where it is', async () => {
  const { project, crop } = await scene({ cols: 30, rows: 20 });
  await crop({ c0: 7, r0: 2, c1: 20, r1: 8 });
  const shown = () => project.cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`);
  const cropped = shown();
  project.threshold = 50;
  project.render();
  await settle(project);
  expect(shown()).not.toEqual(cropped);
  expect(new Set(project.cells.flatMap((c) => [c.fg.hex, c.bg.hex])).size).toBeLessThanOrEqual(2); // two colors, all over the crop
  project.threshold = 0;
  project.render();
  await settle(project);
  expect(shown()).toEqual(cropped);
  await project.bake();
  await settle(project);
  expect(shown()).toEqual(cropped);
  project.paintStroke([{ x: 3, y: 4, alpha: 1 }, { x: 3, y: 5, alpha: 1 }], GREEN);
  project.commitEdit();
  await project.mergeIntoPicture();
  await settle(project);
  const cell = project.cells[2 * project.cols + 3];
  expect([cell.fg.hex, cell.bg.hex, project.paintLayer.hasPaint]).toEqual([GREEN, GREEN, false]); // into the picture, where it was painted
  expect(shown().filter((look, i) => look !== cropped[i])).toHaveLength(1);
});

test('a stroke made before a crop still undoes once the crop is undone, and redoes after it', async () => {
  const { project, paint, crop } = await scene();
  paint(8, 8);
  await crop({ c0: 4, r0: 2, c1: 11, r1: 6 });
  expect(project.paintLayer.pixelAt(4, 4)?.g).toBe(255);
  project.undo(); // the crop
  project.undo(); // the stroke
  await settle(project);
  expect(project.paintLayer.pixelAt(8, 8)).toBe(null);
  project.redo();
  project.redo();
  await settle(project);
  expect([project.cols, project.paintLayer.pixelAt(4, 4)?.g]).toEqual([8, 255]);
});

test('in an animation, cropped from its middle frame, every frame\'s cells and shapes move, and undo puts each back', async () => {
  const { project, type, own, crop } = await scene();
  project.setAnimate(true);
  type(5, 3, 'A');
  project.addShape(rectShape(6, 6, 8, 8, { fill: '#ff0000' }));
  project.addFrame('duplicate');
  type(6, 3, 'B');
  project.addFrame('duplicate');
  project.showFrame(1);
  await crop({ c0: 4, r0: 2, c1: 11, r1: 6 });
  const corner = () => [...project.shapes.values()][0].m.slice(4);
  expect([own(1, 1), own(2, 1), corner()]).toEqual(['A', 'B', [-4, -4]]);
  project.showFrame(0);
  expect([own(1, 1), own(2, 1), corner()]).toEqual(['A', null, [-4, -4]]);
  project.showFrame(2);
  expect([own(1, 1), own(2, 1)]).toEqual(['A', 'B']);
  project.undo();
  await settle(project);
  project.showFrame(0);
  expect([own(5, 3), corner()]).toEqual(['A', [0, 0]]);
});

test('the rulers\' guides and zero move with the drawing; a guide cut off goes, and a zero on the edge goes back to 0 (mirror mode\'s middle)', async () => {
  const { workspace, project, crop } = await scene();
  workspace.addGuide('v', 6);
  workspace.addGuide('h', 1); // above the crop
  workspace.setRulerZero('x', 10);
  workspace.setRulerZero('y', 2); // on the crop's top edge
  await crop({ c0: 4, r0: 2, c1: 11, r1: 6 });
  expect(workspace.guides).toEqual([{ axis: 'v', pos: 2 }]);
  expect(workspace.rulerZero).toEqual({ x: 6, y: 0 });
  expect(mirrorAxes(workspace.rulerZero, project.cols)).toEqual({ x: 6, y: null });
  workspace.setRulerZero('x', 0);
  expect(mirrorAxes(workspace.rulerZero, project.cols).x).toBe(4); // the middle of the cropped drawing
  workspace.setRulerZero('x', 6);
  project.undo();
  expect(workspace.guides).toEqual([{ axis: 'v', pos: 6 }, { axis: 'h', pos: 1 }]);
  expect(workspace.rulerZero).toEqual({ x: 10, y: 2 });
});

test('a blank canvas keeps its one color, filling the cropped grid; an art layer moves with its cells', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(project);
  workspace.editorTab = 'output';
  const image = project.image;
  project.typeAt(6, 4, 'K', INK);
  project.commitEdit();
  workspace.selection = { c0: 6, r0: 4, c1: 6, r1: 4 };
  project.makeArtLayer();
  await settle(project);
  await project.cropTo({ c0: 4, r0: 2, c1: 11, r1: 6 });
  await settle(project);
  expect(project.image).toBe(image);
  expect(project.fit).toEqual({ dx: 0, dy: 0, dw: 8, dh: 10 });
  expect(project.cells[2 * project.cols + 2].char).toBe('K');
});

let mounted = null, host = null;
beforeAll(() => page.viewport(1200, 800));
afterAll(() => page.viewport(414, 896));
afterEach(() => { mounted?.unmount(); host?.remove(); mounted = host = null; });

test('the Select row\'s Crop, beside Set FG and Set BG: off with nothing selected; with a selection it crops, and a room\'s host is asked first', async () => {
  const { project, workspace, pinia } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(project);
  Object.assign(workspace, { editorTab: 'output' });
  workspace.setActiveTool('select');
  host = document.createElement('div');
  host.style.width = '1200px';
  document.body.append(host);
  mounted = createApp({ render: () => h(EditToolbar) }).use(pinia).use(i18n);
  mounted.mount(host);
  await nextTick();
  const crop = () => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Crop');
  expect([crop().disabled, crop().title]).toEqual([true, 'Crop: select cells first']);
  expect(crop().previousElementSibling.textContent).toBe('Set BG');
  workspace.selection = { c0: 2, r0: 2, c1: 9, r1: 5 };
  await nextTick();
  expect(crop().disabled).toBe(false);
  crop().click();
  await settle(project);
  expect([project.cols, project.rows, workspace.selection]).toEqual([8, 8, null]);

  useRoomStore().role = 'host';
  workspace.selection = { c0: 0, r0: 0, c1: 3, r1: 1 };
  await nextTick();
  crop().click();
  await nextTick();
  const dialog = () => document.querySelector('.choice');
  expect(project.cols).toBe(8); // asked first
  dialog().click();
  await settle(project);
  expect([project.cols, project.rows]).toEqual([4, 4]);
  useRoomStore().role = null;
});

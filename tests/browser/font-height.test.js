// A font of another height keeps the columns and changes the rows so the picture keeps its shape (fontGrid): paint and
// the base's own pixels follow the picture, characters and pins keep their column and line (docs/model.md R1), vector
// shapes move with the picture and art layers keep their cells. One undo step; a font of the same height is the
// settings step it always was.
import { test, expect, vi } from 'vitest';
import { toRaw } from 'vue';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { cp437Font, font8, font11 } from '../support/blockFonts.js';
import { fitRect } from '@/lib/Canvas.js';
import { rectShape, worldPoints } from '@/document/shapes.js';
import { readProject, writeProject } from '@/document/projectIO.js';
import { toastMessage } from '@/composables/useToast';
import { isArt } from '@/document/artLayers.js';
import { baseParams } from '@/store/settings.js';
import { ctx2d, canvasPng } from '@/lib/Canvas.js';

const PHOTO = '/tests/fixtures/images/photo.jpg'; // 96 x 64: 80 columns are 54 rows with square half cells
const RED = { r: 255, g: 0, b: 0 };

async function photo() {
  const app = await createTestApp();
  await loadImage(app.project, PHOTO);
  return app;
}
async function blank(cols, rows) {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols, rows, withLayer: true });
  await settle(app.project);
  return app;
}
const dab = (project, x, y) => {
  project.paintEditPixels([{ x, y, ...RED, alpha: 1 }]);
  project.commitEdit();
};
const grid = (project) => ({ cols: project.cols, rows: project.rows });
const maxY = (shape) => Math.max(...worldPoints(shape).map((p) => p.y));

test('a font of the same height is the settings step it was: the grid, fit and layers stay', async () => {
  const { project } = await photo();
  const fit = { ...toRaw(project.fit) }, paint = project.paintLayer, base = project.baseLayer;
  await project.setDrawingFont(cp437Font);
  expect(grid(project)).toEqual({ cols: 80, rows: 54 });
  expect(toRaw(project.fit)).toEqual(fit);
  expect(project.history.last.settingsOnly).toBe(true);
  expect(project.paintLayer).toBe(paint);
  expect(project.baseLayer).toBe(base);
});

test('8×16 to 8×8 keeps the columns, doubles the rows and fits the picture to the same shape', async () => {
  const { project } = await photo();
  await project.setDrawingFont(font8);
  await settle(project);
  expect(grid(project)).toEqual({ cols: 80, rows: 108 });
  expect(toRaw(project.fit)).toEqual(fitRect(96, 64, 80, 108, 0.5));
  expect(toRaw(project.fit)).toEqual({ dx: 0, dy: 0, dw: 80, dh: 107 });
  expect(project.paintLayer.rows).toBe(108);
  expect(project.baseLayer.rows).toBe(108);
  expect(project.renderer.pipelineCanvas.height).toBe(108); // processed again for the new grid
  // The lock keeps the picture's own shape in 8×8 cells, 80 x 106.67: lockedGrid(80, 0.75) is 80 x 107, a line fewer
  // than the 108 fontGrid gives (it keeps the lines: 54 doubled). A known one-line difference.
  expect(project.lockRatio).toBe(0.75);
  expect(project.aspectRatio).toBe(0);
  project.updateCols(80); // the lock looks again: 80 x 108 isn't 0.75's grid, so it keeps the grid's own shape
  expect(grid(project)).toEqual({ cols: 80, rows: 108 });
  expect(project.aspectRatio).toBe(80 / 108);
});

test('with nothing drawn a switch is a settings step: a Columns change after it refits the picture, and the switch still undoes', async () => {
  const { project } = await photo();
  await project.setDrawingFont(font8);
  await settle(project);
  expect(project.history.last.settingsOnly).toBe(true);
  project.updateCols(40);
  await settle(project);
  expect(grid(project)).toEqual({ cols: 40, rows: 54 });
  expect(project.resizesCanvas).toBe(false);
  expect(toRaw(project.fit)).toEqual(project.fitFor(40, 54));
  expect(toRaw(project.fit)).toEqual({ dx: 0, dy: 0, dw: 40, dh: 54 });
  project.undo(); // kept through the rescale (dropEdits keeps settings steps)
  await settle(project);
  expect(project.drawingFont).toBeNull();
  expect(grid(project)).toEqual({ cols: 80, rows: 54 });
  expect(toRaw(project.fit)).toEqual({ dx: 0, dy: 0, dw: 80, dh: 54 });
  expect(project.paintLayer.rows).toBe(54);
});

test('R1: characters and pins keep their column and line; paint and the base\'s own pixels follow the picture', async () => {
  const { project, workspace } = await photo();
  project.typeAt(3, 2, 'A');
  project.commitEdit();
  dab(project, 10, 10);
  workspace.pickLayer('base');
  project.writeBaseCells([{ col: 6, row: 3, char: 'P', fg: '#ffffff', bg: '#0000aa' }]);
  project.paintBasePixels([{ x: 12, y: 4, ...RED, alpha: 1 }]);
  project.commitEdit();
  workspace.pickLayer('edit');
  await settle(project);
  await project.setDrawingFont(font8);
  await settle(project);
  expect(project.editCellAt(3, 2).char).toBe('A');
  expect(project.cells[2 * 80 + 3].char).toBe('A');
  expect([...project.baseRecords.pins.keys()]).toEqual(['6,3']);
  const pinned = () => { const { fg, bg } = project.cells[3 * 80 + 6]; return [fg.hex, bg.hex]; };
  expect(pinned()).toEqual(['#ffffff', '#0000aa']); // its two pixels stay with it
  expect(project.baseLayer.pixelAt(6, 12)).toBeNull(); // and aren't copied where the picture moved
  expect(project.baseLayer.pixelAt(6, 13)).toBeNull();
  expect(project.paintLayer.pixelAt(10, 20)).toMatchObject({ ...RED });
  expect(project.paintLayer.pixelAt(10, 21)?.a).toBeGreaterThan(0);
  expect(project.paintLayer.pixelAt(10, 10)).toBeNull();
  expect(project.baseLayer.pixelAt(12, 8)).toMatchObject(RED);
  expect(project.baseLayer.pixelAt(12, 4)).not.toMatchObject(RED);
  project.undo();
  await settle(project);
  expect(grid(project)).toEqual({ cols: 80, rows: 54 });
  expect(pinned()).toEqual(['#ffffff', '#0000aa']);
});

test('vector shapes follow the picture; an art layer keeps its cells', async () => {
  const { project, workspace } = await blank(40, 40);
  project.typeAt(2, 1, 'H');
  project.commitEdit();
  workspace.selection = { c0: 1, r0: 0, c1: 4, r1: 2 };
  const art = project.makeArtLayer();
  const m = [...project.shapes.get(art).m];
  const key = project.addShape(rectShape(0, 0, 10, 10, { fill: '#0000ff' }));
  expect(maxY(project.shapes.get(key))).toBe(10);
  await project.setDrawingFont(font8);
  await settle(project);
  expect(toRaw(project.fit)).toEqual({ dx: 0, dy: 0, dw: 40, dh: 80 });
  expect(maxY(project.shapes.get(key))).toBe(20);
  expect(isArt(project.shapes.get(art))).toBe(true);
  expect(project.shapes.get(art).m).toEqual(m);
});

test('one undo step: undo brings back the font, grid, fit, layers and shapes; a stroke from before it is still undone; redo', async () => {
  const { project } = await photo();
  dab(project, 10, 10);
  const key = project.addShape(rectShape(0, 0, 10, 10, { fill: '#0000ff' }));
  const fit = { ...toRaw(project.fit) }, shapes = project.shapes, paint = project.paintLayer;
  await project.setDrawingFont(font8);
  await settle(project);
  expect(grid(project)).toEqual({ cols: 80, rows: 108 });
  project.undo();
  await settle(project);
  expect(grid(project)).toEqual({ cols: 80, rows: 54 });
  expect(project.drawingFont).toBeNull();
  expect(toRaw(project.fit)).toEqual(fit);
  expect(project.shapes).toBe(shapes);
  expect(project.paintLayer).toBe(paint);
  expect([project.paintLayer.rows, project.baseLayer.rows]).toEqual([54, 54]); // not extended to the grid undone from
  expect(project.paintLayer.pixelAt(10, 10)).toMatchObject(RED);
  project.undo(); // the shape
  project.undo(); // the stroke
  await settle(project);
  expect(project.paintLayer.pixelAt(10, 10)).toBeNull();
  project.redo();
  project.redo();
  project.redo();
  await settle(project);
  expect(grid(project)).toEqual({ cols: 80, rows: 108 });
  expect(project.drawingFont.name).toBe('Eight');
  expect(project.paintLayer.pixelAt(10, 20)).toMatchObject(RED);
  expect(maxY(project.shapes.get(key))).toBeCloseTo(10 * 107 / 54, 2); // a shape keeps three decimals
});

test('16 to 11 and back is undone to the grid it was, not a rounded one; on a drawing of only its base too', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 80, rows: 60 }); // no layer: the base is the one in use
  await settle(project);
  expect(project.editId).toBe('base');
  await project.setDrawingFont(font11);
  await settle(project);
  expect(grid(project)).toEqual({ cols: 80, rows: 88 });
  expect([project.paintLayer.rows, project.baseLayer.rows]).toEqual([88, 88]);
  project.undo();
  expect(grid(project)).toEqual({ cols: 80, rows: 60 }); // fontGrid(80, 88, 11, 16) would say 61
  await settle(project);
  expect([project.paintLayer.rows, project.baseLayer.rows]).toEqual([60, 60]);
});

test('a one-color picture and a Bake\'s picture still fill the grid after a switch, and after a Columns change', async () => {
  // A one-color picture fills any grid whatever its fit, so the output is what's checked, not the fit. A red one shows it.
  const { project } = await createTestApp();
  const red = Object.assign(document.createElement('canvas'), { width: 40, height: 40 }), ctx = ctx2d(red);
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 40, 40);
  await project.setImageFromFile(new File([await canvasPng(red)], 'red.png', { type: 'image/png' }));
  project.updateCols(40);
  await settle(project);
  expect(grid(project)).toEqual({ cols: 40, rows: 40 });
  await project.setDrawingFont(font8);
  await settle(project);
  expect(grid(project)).toEqual({ cols: 40, rows: 80 });
  project.updateCols(60); // the lock on: it keeps the grid's 0.5, which isn't the one-color picture's 1
  await settle(project);
  expect(grid(project)).toEqual({ cols: 60, rows: 120 });
  const out = project.renderer.pipelineCanvas, px = (x, y) => [...ctx2d(out).getImageData(x, y, 1, 1).data.slice(0, 3)];
  expect([out.width, out.height]).toEqual([60, 120]);
  for (const [x, y] of [[0, 0], [59, 0], [0, 119], [59, 119], [30, 60]]) expect(px(x, y)).toEqual([255, 0, 0]);

  const { project: baked } = await photo();
  baked.invert = 100;
  await settle(baked);
  await baked.bake();
  await settle(baked);
  const height = baked.image.naturalHeight;
  await baked.setDrawingFont(font8);
  await settle(baked);
  expect(baked.image.naturalHeight).toBe(2 * height);
  expect(baked.imageIsWorkingCopy).toBe(true);
  expect(baked.fitFor(baked.cols, baked.rows)).toEqual(toRaw(baked.fit));
  expect(toRaw(baked.fit)).toEqual({ dx: 0, dy: 0, dw: 80, dh: 108 });
});

test('with frames a font of another height is refused with a toast and nothing changes; one of the same height still changes', async () => {
  const { project } = await photo();
  project.addFrame('duplicate');
  const version = project.history.version;
  toastMessage.value = null;
  await project.setDrawingFont(font8);
  expect(toastMessage.value).toBe('A drawing with frames keeps its font\'s height, so it can\'t take Eight (8×8): this drawing\'s font is 8×16.');
  expect(project.drawingFont).toBeNull();
  expect(grid(project)).toEqual({ cols: 80, rows: 54 });
  expect(project.history.version).toBe(version);
  await project.setDrawingFont(cp437Font);
  expect(project.drawingFont.name).toBe('T');
  expect(grid(project)).toEqual({ cols: 80, rows: 54 });
});

test('past the limits the columns give way, the picture keeps its shape and a toast says the size', async () => {
  const { project } = await blank(80, 9000);
  toastMessage.value = null;
  await project.setDrawingFont(font8);
  expect(grid(project)).toEqual({ cols: 44, rows: 9900 });
  expect(toastMessage.value).toBe('Eight\'s cells are another shape: to keep the picture\'s, the grid is now 44 × 9900, the largest that fits.');
});

test('saved after a switch, the drawing reopens at its grid and fit, not refitted', async () => {
  const { project } = await photo();
  project.typeAt(3, 2, 'A');
  project.commitEdit();
  await project.setDrawingFont(font8);
  await settle(project);
  const file = new File([await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() })], 'a.phosphor');
  const { project: other } = await createTestApp();
  await other.openParts(await readProject(file), { filename: 'a' });
  other.render();
  await settle(other);
  expect(grid(other)).toEqual({ cols: 80, rows: 108 });
  expect(toRaw(other.fit)).toEqual(toRaw(project.fit));
  expect(other.cells.map((c) => c.char)).toEqual(project.cells.map((c) => c.char));
});

test('in a room the host\'s switch goes to the room as the whole document', async () => {
  const { project } = await photo();
  dab(project, 10, 10); // something drawn: the whole-layer step (with nothing drawn, the grid's change sends it: host.js)
  const sendDocument = vi.fn();
  project.startSharing({ send() {}, sendDocument, role: 'host', me: 'h' });
  await project.setDrawingFont(font8);
  expect(sendDocument).toHaveBeenCalledTimes(1);
  expect(grid(project)).toEqual({ cols: 80, rows: 108 });
});

test('the picture is processed again when only the cell\'s shape changes (the renderer\'s stored colors follow fitAspect)', async () => {
  const { project } = await photo();
  const params = { ...project.processParams, fit: null }, at = (fitAspect) => project.renderer.render(project.image, { ...params, fitAspect }, null, baseParams({ ...params, fitAspect }));
  await at(1);
  expect(project.renderer.imageAt(0, 27, 80, 54)).not.toEqual({ r: 0, g: 0, b: 0 }); // the photo fills the grid
  await at(0.5);
  expect(project.renderer.imageAt(0, 27, 80, 54)).toEqual({ r: 0, g: 0, b: 0 }); // 40 columns wide: letterboxed
});

test('typed in the same tick as a switch, a character waits for the new grid\'s render, never composed against the old one', async () => {
  const { project } = await blank(20, 10);
  project.typeAt(0, 0, 'A');
  project.typeAt(1, 0, 'A');
  project.commitEdit();
  await settle(project);
  const drawn = project.cells.map((c) => c.char);
  await project.setDrawingFont(font8);
  project.typeAt(0, 0, 'B');
  expect(project.cells.map((c) => c.char)).toEqual(drawn); // as last drawn, until the render
  await settle(project);
  expect(project.cells.slice(0, 2).map((c) => c.char)).toEqual(['B', 'A']);
  expect(project.cells.length).toBe(20 * 10);
});

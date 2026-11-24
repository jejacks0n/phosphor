// A bitmap font's half cell is 8 wide and height/2 tall: a picture with square pixels (a photo, a file) converts in that
// shape, and the aspect lock keeps it. A picture made from the grid (a blank canvas, a Bake, Into the image) already has
// grid pixels and fills the grid as it did. No bitmap font, or an 8×16 one, is a square half cell: exactly as before.
import { test, expect, vi } from 'vitest';
import { toRaw } from 'vue';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { cp437Font, font8, font11 } from '../support/blockFonts.js';
import { lockedGrid, MAX_COLS } from '@/lib/Cells.js';
import { ctx2d, canvasPng } from '@/lib/Canvas.js';

const PHOTO = '/tests/fixtures/images/photo.jpg'; // 96 x 64

// A w x h picture painted by paint(ctx), as a PNG file.
async function pictureFile(w, h, paint) {
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  paint(ctx2d(canvas));
  return new File([await canvasPng(canvas)], 'picture.png', { type: 'image/png' });
}

async function openPicture(project, w, h, paint) {
  await project.setImageFromFile(await pictureFile(w, h, paint));
  project.render();
  await settle(project);
}

// An app with the font chosen before any drawing (null: none).
async function appIn(font) {
  const app = await createTestApp();
  if (font) app.project.setDrawingFont(font);
  return app;
}

const redAt = (project, x, y) => ctx2d(project.renderer.pipelineCanvas).getImageData(x, y, 1, 1).data[0];
const whiteOverTop = (ctx) => {
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, 60, 40);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, 60, 30);
};

test('pixelAspect is 1 with no bitmap font and with an 8×16 one, 0.5 in 8×8, 11/16 in 8×11', async () => {
  for (const [font, aspect] of [[null, 1], [cp437Font, 1], [font8, 0.5], [font11, 11 / 16]]) {
    const { project } = await appIn(font);
    expect(project.pixelAspect).toBe(aspect);
  }
});

test('with an 8×16 font a photo opens, fits and converts exactly as with none', async () => {
  const opened = async (font) => {
    const { project } = await appIn(font);
    await loadImage(project, PHOTO);
    const { width, height } = project.renderer.pipelineCanvas;
    return {
      grid: { cols: project.cols, rows: project.rows, fit: { ...toRaw(project.fit) }, fitAspect: project.fitAspect },
      bytes: [...ctx2d(project.renderer.pipelineCanvas).getImageData(0, 0, width, height).data],
    };
  };
  const none = await opened(null), vga = await opened(cp437Font); // each settled and copied before the next app
  expect(none.grid).toEqual({ cols: 80, rows: 54, fit: { dx: 0, dy: 0, dw: 80, dh: 54 }, fitAspect: 1 });
  expect(vga.grid).toEqual(none.grid);
  expect(vga.bytes).toEqual(none.bytes);
});

test('with no font a photo is read for one color once as it opens, as before; in 8×8 the grid asks first', async () => {
  const reads = async (font) => {
    const { project } = await appIn(font);
    const blob = await (await fetch(PHOTO)).blob(), file = new File([blob], 'photo.jpg', { type: blob.type });
    const real = CanvasRenderingContext2D.prototype.getImageData, stacks = [];
    const spy = vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData').mockImplementation(function (...args) {
      stacks.push(new Error().stack); // findUniform's reads, not the upload's (it reads a picture it enlarges pixel for pixel)
      return real.apply(this, args);
    });
    try {
      await project.setImageFromFile(file);
      return spy.mock.calls.filter((args, i) => args.join() === '0,0,96,64' && stacks[i].includes('findUniform')).length; // findUniform reads the whole photo
    } finally {
      spy.mockRestore();
    }
  };
  expect(await reads(null)).toBe(1);
  expect(await reads(cp437Font)).toBe(1);
  expect(await reads(font8)).toBe(2); // the grid's shape depends on it (gridPicture), before the picture is in place
});

test('in an 8×8 font a photo opens at its own shape: photo.jpg at 80 columns is 107 rows, fit edge to edge', async () => {
  const { project } = await appIn(font8);
  await loadImage(project, PHOTO);
  expect({ cols: project.cols, rows: project.rows }).toEqual(lockedGrid(80, 1.5 * 0.5));
  expect({ cols: project.cols, rows: project.rows }).toEqual({ cols: 80, rows: 107 });
  expect(project.fitAspect).toBe(0.5);
  expect(project.gridRatio).toBe(0.75);
  expect(toRaw(project.fit)).toEqual({ dx: 0, dy: 0, dw: 80, dh: 107 });
});

test('in an 8×8 font the picture is not squashed: a 60 x 40 picture white over its top three quarters turns white at row 40 of 54', async () => {
  const at40 = async (font) => {
    const { project } = await appIn(font);
    project.cols = 40;
    await openPicture(project, 60, 40, whiteOverTop);
    return project;
  };
  const eight = await at40(font8);
  expect({ cols: eight.cols, rows: eight.rows }).toEqual({ cols: 40, rows: 54 });
  expect(redAt(eight, 20, 39)).toBeGreaterThan(200);
  expect(redAt(eight, 20, 42)).toBeLessThan(50);
  const sixteen = await at40(cp437Font);
  expect({ cols: sixteen.cols, rows: sixteen.rows }).toEqual({ cols: 40, rows: 27 });
  expect(redAt(sixteen, 20, 19)).toBeGreaterThan(200);
  expect(redAt(sixteen, 20, 21)).toBeLessThan(50);
});

test('in an 8×8 font the lock keeps the picture\'s shape, and maxRows the line limit', async () => {
  const { project } = await appIn(font8);
  await loadImage(project, PHOTO);
  expect(project.aspectLock).toBe(true);
  project.updateCols(40);
  expect({ cols: project.cols, rows: project.rows }).toEqual({ cols: 40, rows: 54 });
  project.updateRows(60);
  expect({ cols: project.cols, rows: project.rows }).toEqual({ cols: 45, rows: 60 });
  expect(project.maxRows).toBe(lockedGrid(MAX_COLS, 0.75).rows);
  expect(project.maxRows).toBe(400);
});

// locked() writes aspectRatio as a side effect: the grid's own shape when it has left both the kept one and the picture's.
test('in an 8×8 font a lock turned on keeps the grid\'s shape, and one at the picture\'s shape keeps the picture\'s', async () => {
  const { project } = await appIn(font8);
  await loadImage(project, PHOTO); // 80 x 107
  project.setAspectLock(false);
  project.updateRows(80);
  project.setAspectLock(true);
  expect(project.aspectRatio).toBe(1); // 80 / 80, written by locked()
  project.updateCols(40);
  expect({ cols: project.cols, rows: project.rows }).toEqual({ cols: 40, rows: 40 });
  project.setAspectLock(false);
  project.updateRows(54);
  project.setAspectLock(true);
  expect(project.aspectRatio).toBe(0); // 40 x 54 is the picture's shape in 8×8 cells (gridRatio), not 40 / 54
  project.updateCols(80);
  expect({ cols: project.cols, rows: project.rows }).toEqual({ cols: 80, rows: 107 });
});

test('in an 8×8 font a blank canvas, a Bake and Into the image fill the grid edge to edge; a Columns change refits the blank canvas and crops the other two at their grid pixels', async () => {
  const { project, workspace } = await appIn(font8);
  await project.setBlankCanvas({ cols: 40, rows: 40 });
  project.render();
  await settle(project);
  expect(project.fitAspect).toBe(1);
  expect(toRaw(project.fit)).toEqual({ dx: 0, dy: 0, dw: 40, dh: 40 });
  project.updateCols(60);
  await settle(project);
  expect({ cols: project.cols, rows: project.rows }).toEqual({ cols: 60, rows: 60 });
  expect(toRaw(project.fit)).toEqual({ dx: 0, dy: 0, dw: 60, dh: 60 });

  // At the 60 columns the blank canvas left: 60 x 80. photo.jpg's 64 rows are fewer than the grid's 80, so it's processed at
  // its own size, in grid pixels (96 x 128), and baked so: without that it bakes square-pixeled and refits letterboxed.
  await loadImage(project, PHOTO);
  project.invert = 100; // a slider moved: something to bake
  await settle(project);
  expect(project.canBake).toBe(true);
  await project.bake();
  await settle(project);
  expect(project.imageIsWorkingCopy).toBe(true);
  expect(project.fitAspect).toBe(1);
  expect(project.fitFor(project.cols, project.rows)).toEqual(toRaw(project.fit));
  expect(toRaw(project.fit)).toEqual({ dx: 0, dy: 0, dw: 60, dh: 80 });
  project.updateCols(30); // the Bake is a step: a canvas resize, which crops the picture at its grid pixels
  await settle(project);
  expect({ cols: project.cols, rows: project.rows }).toEqual({ cols: 30, rows: 40 });
  expect(project.resizesCanvas).toBe(true);
  expect(project.fitAspect).toBe(1);
  expect(toRaw(project.fit)).toEqual({ dx: 0, dy: 0, dw: 60, dh: 80 });
  expect(project.fitFor(30, 40)).toEqual({ dx: 0, dy: 0, dw: 30, dh: 40 }); // a refit would still be edge to edge

  await project.setBlankCanvas({ cols: 40, rows: 40, withLayer: true });
  await settle(project);
  workspace.pickLayer('edit');
  project.paintStroke(Array.from({ length: 6 }, (_, k) => ({ x: 4 + k, y: 6, alpha: 1 })), '#ff5555');
  project.commitEdit();
  await project.mergeIntoPicture();
  await settle(project);
  expect(project.imageIsWorkingCopy).toBe(true);
  expect(project.fitAspect).toBe(1);
  expect(project.fitFor(project.cols, project.rows)).toEqual({ dx: 0, dy: 0, dw: 40, dh: 40 });
  expect(toRaw(project.fit)).toEqual({ dx: 0, dy: 0, dw: 40, dh: 40 });
  expect(project.smoothingMatters).toBe(false);
  project.updateCols(20); // a step too: cropped the same way
  await settle(project);
  expect({ cols: project.cols, rows: project.rows }).toEqual({ cols: 20, rows: 20 });
  expect(project.fitAspect).toBe(1);
  expect(toRaw(project.fit)).toEqual({ dx: 0, dy: 0, dw: 40, dh: 40 });
});

test('a picture added to a layer in an 8×8 font keeps its shape: a square one covers 40 columns and 80 rows of a 40 x 80 grid', async () => {
  const square = () => pictureFile(20, 20, (ctx) => { ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 20, 20); });
  const added = async (font) => {
    const { project, workspace } = await appIn(font);
    await project.setBlankCanvas({ cols: 40, rows: 80 });
    await settle(project);
    workspace.pickLayer('base');
    const id = await project.addPictureToLayer(await square());
    expect(id).toBeTruthy();
    return project.paintOf(id);
  };
  const eight = await added(font8);
  expect(eight.pixelAt(20, 79)?.a).toBeGreaterThan(0);
  expect(eight.pixelAt(20, 0)?.a).toBeGreaterThan(0);
  const none = await added(null); // square half cells: 40 x 40 in the middle, as before
  expect(none.pixelAt(20, 0)).toBeNull();
  expect(none.pixelAt(20, 79)).toBeNull();
  expect(none.pixelAt(20, 40)?.a).toBeGreaterThan(0);
});

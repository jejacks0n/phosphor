// Everything that assumed one edit state: merging, baking, resizing, new documents and rooms, with frames.
import { test, expect, vi } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { cellIndex, charRowsOf, MAX_ANIMATION_CELLS, MAX_FRAME_CELLS, MAX_FRAMES, maxFramesFor } from '@/lib/Cells.js';
import { readProject } from '@/document/projectIO.js';

const INK = { fg: '#ffee00', bg: '#0044aa' };

async function animated({ cols = 20, rows = 20 } = {}) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols, rows });
  return { project, workspace };
}
const charAt = (project, col, row) => project.cells[cellIndex(col, row, project.cols)]?.char;
const type = (project, col, row, char) => { project.typeAt(col, row, char, INK); project.commitEdit(); };
const paint = (project, x, y, color = '#ff3300') => { project.paintStroke([{ x, y, alpha: 1 }], color); project.commitEdit(); };
const paintAt = (project, x, y) => { const p = project.paintLayer.pixelAt(x, y); return p && [p.r, p.g, p.b]; };

test('Merge down and Into the image are off with more than one frame and on with one', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  const edits = project.editCells;
  await project.mergeIntoPicture();
  project.mergeDown('edit');
  expect(project.editCells).toBe(edits);
  expect(project.baseLayer.hasPaint).toBe(false);
  project.deleteFrame();
  project.mergeDown('edit');
  await settle(project);
  expect(project.editCells.size).toBe(0);
  expect(project.baseLayer.hasPaint).toBe(true);
});

test('Bake applies to every frame cells and paint, keeps each frame looking the same, and undoes', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  paint(project, 6, 6);
  project.addFrame('blank');
  type(project, 2, 2, 'B');
  paint(project, 8, 8, '#2266cc');
  project.setSlider('brightness', 140);
  project.commitSliders();
  await settle(project);
  const look = [];
  for (const i of [0, 1]) { project.showFrame(i); look.push(cellsKey(project)); }
  const frames = project.frames.map((frame) => frame.changes);

  await project.bake();
  await settle(project);
  expect(project.brightness).toBe(100);
  for (const i of [1, 0]) {
    project.showFrame(i);
    await settle(project);
    expect(cellsKey(project).filter((key, at) => key !== look[i][at])).toEqual([]);
  }
  expect(project.frames[0].changes.get('1,1').cell.fg).not.toBe(INK.fg);

  project.showFrame(1);
  project.undo();
  await settle(project);
  expect(project.brightness).toBe(140);
  expect(project.frames.map((frame) => frame.changes)).toEqual(frames);
  expect(cellsKey(project)).toEqual(look[1]);
  project.redo();
  await settle(project);
  expect(project.brightness).toBe(100);
  expect(cellsKey(project).filter((key, at) => key !== look[1][at])).toEqual([]);
});

test('a scrub while Bake encodes starts it over, from the frame now showing', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  project.setSlider('brightness', 140);
  project.commitSliders();
  await settle(project);
  const baking = project.bake();
  project.showFrame(0);
  await baking;
  await settle(project);
  expect(project.brightness).toBe(100);
  expect(project.frame).toBe(0);
  expect(project.frames[0].changes.get('1,1').cell.fg).not.toBe(INK.fg);
  expect(charAt(project, 1, 1)).toBe('A');
});

test('resizing the grid applies to every frame; shrinking then growing brings back off-grid cells and paint', async () => {
  const { project } = await animated();
  type(project, 15, 8, 'A');
  paint(project, 16, 16);
  project.addFrame('wipe');
  type(project, 14, 7, 'B');
  paint(project, 15, 15, '#0000ff');
  project.updateCols(10);
  project.updateRows(10);
  await settle(project);
  expect(project.cells).toHaveLength(50);
  project.showFrame(0); // scrubbing on a shrunken grid, with what's past it held
  await settle(project);
  project.showFrame(1);
  await settle(project);
  project.updateCols(20);
  project.updateRows(20);
  await settle(project);
  expect(charAt(project, 14, 7)).toBe('B');
  expect(paintAt(project, 15, 15)).toEqual([0, 0, 255]);
  project.showFrame(0);
  await settle(project);
  expect(charAt(project, 15, 8)).toBe('A');
  expect(paintAt(project, 16, 16)).toEqual([255, 51, 0]);
  expect(charAt(project, 14, 7)).not.toBe('B');
});

test('the grid can’t grow past the animation limit with more than one frame', async () => {
  const { project } = await animated({ cols: 100, rows: 400 });
  await settle(project);
  project.addFrame('blank');
  expect(project.maxCols).toBe(Math.floor(MAX_ANIMATION_CELLS / 200));
  project.updateCols(5000);
  expect(project.cols * (project.rows / 2)).toBeLessThanOrEqual(MAX_ANIMATION_CELLS);
  project.updateCols(100);
  project.updateRows(100000);
  expect(project.cols * (project.rows >> 1)).toBeLessThanOrEqual(MAX_ANIMATION_CELLS);
  project.deleteFrame();
  expect(project.maxCols * (project.rows >> 1)).toBeGreaterThan(MAX_ANIMATION_CELLS);
});

test('moving between frames right after the grid changes, before its render, is safe', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  project.updateCols(30);
  project.showFrame(0);
  await settle(project);
  expect(project.cells).toHaveLength(30 * 10);
  expect(charAt(project, 1, 1)).toBe('A');
  project.updateCols(25);
  project.deleteFrame();
  await settle(project);
  expect(project.cells).toHaveLength(25 * 10);
});

test('canAnimate follows the size limit', async () => {
  const { project } = await animated({ cols: 100, rows: 100 });
  expect(project.canAnimate).toBe(true);
  project.rows = 2 * Math.ceil((MAX_ANIMATION_CELLS + 100) / 100);
  expect(project.canAnimate).toBe(false);
});

test('no more than the frame limit', async () => {
  const { project } = await animated({ cols: 4, rows: 4 });
  project.ensureLayer();
  project.frames = Array.from({ length: MAX_FRAMES }, () => project.frames[0]);
  const held = project.frames;
  project.addFrame('blank');
  expect(project.frames).toBe(held);
});

test('a new image or new document resets to one frame', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  await project.setBlankCanvas();
  await settle(project);
  expect(project.frames).toHaveLength(1);
  expect(project.frame).toBe(0);
  expect(project.canUndo).toBe(false);
  project.addFrame('blank');
  await loadImage(project, '/tests/fixtures/images/gradient.png');
  expect(project.frames).toHaveLength(1);
  project.addFrame('blank');
  project.clearImage();
  expect(project.frames).toHaveLength(1);
});

test('startRoom refuses a document with more than one frame', async () => {
  const { project } = await animated();
  project.addFrame('blank');
  const room = useRoomStore(), social = useSocialStore();
  const request = vi.spyOn(social, 'request');
  await expect(room.startRoom({ name: 'Night', welcome: '', isPublic: true, allowGuests: true, max: 12 })).resolves.toBe(false);
  expect(request).not.toHaveBeenCalled();
});

test('sharing starts with no way back to frames: the bar goes and undo can’t bring one back', async () => {
  const { project } = await animated();
  project.setAnimate(true);
  project.addFrame('blank');
  type(project, 1, 1, 'A');
  project.deleteFrame();
  project.startSharing({ send() {}, sendDocument() {}, role: 'host', me: 'host-id', roomId: 'r', hold() {}, release() {} });
  expect(project.animate).toBe(false);
  expect(project.canAnimate).toBe(false);
  project.undo();
  expect(project.frames).toHaveLength(1);
  project.stopSharing();
  expect(project.canAnimate).toBe(true);
});

test('a project from a host never makes frames: parts.frames is dropped', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  type(project, 2, 2, 'B');
  const parts = await project.projectParts();
  const { writeProject } = await import('@/document/projectIO.js');
  const opened = await readProject(new File([await writeProject({ imageBuffer: project.imageBuffer, ...parts })], 'x.phosphor'));
  await project.openFromHost(opened, { filename: 'x' });
  await settle(project);
  expect(project.frames).toHaveLength(1);
});

test('the limits are pinned: 40,000 cells, 1,000 frames, and 4 million cells across the frames', () => {
  expect([MAX_ANIMATION_CELLS, MAX_FRAMES, MAX_FRAME_CELLS]).toEqual([40_000, 1000, 4_000_000]);
  expect(maxFramesFor(80 * 25)).toBe(1000);
  expect(maxFramesFor(200 * 100)).toBe(200);
  expect(maxFramesFor(40_000)).toBe(100);
});

test('a large grid takes only so many frames, and a grid with many frames only grows so far', async () => {
  const { project } = await animated({ cols: 200, rows: 200 });
  expect(project.mostFrames).toBe(200);
  project.frames = Array.from({ length: 199 }, () => project.frames[0]);
  project.addFrame('blank');
  expect(project.frames).toHaveLength(200);
  project.addFrame('blank');
  expect(project.frames).toHaveLength(200);
  expect(project.cols * project.maxRows / 2).toBeLessThanOrEqual(MAX_FRAME_CELLS / 200);
  expect(project.maxCols * charRowsOf(project.rows)).toBeLessThanOrEqual(MAX_FRAME_CELLS / 200);
});

test('a grid grown past the limit with Animate on can’t gain frames, which a file couldn’t keep', async () => {
  const { project } = await animated({ cols: 20, rows: 20 });
  project.setAnimate(true);
  project.cols = 300;
  project.rows = 400;
  await settle(project);
  expect(project.canAnimate).toBe(false);
  project.addFrame('blank');
  expect(project.frames).toHaveLength(1);
});

test('a file whose frames can’t be read says so as it opens as a still', async () => {
  const { toastMessage } = await import('@/composables/useToast');
  const { writeProject } = await import('@/document/projectIO.js');
  const { project } = await animated();
  project.setAnimate(true);
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  const parts = await project.projectParts();
  const good = new File([await writeProject({ imageBuffer: project.imageBuffer, ...parts })], 'good.phosphor');
  parts.animation.frames[0].kind = 'a kind from a later Phosphor';
  const bad = new File([await writeProject({ imageBuffer: project.imageBuffer, ...parts })], 'bad.phosphor');

  toastMessage.value = null;
  await project.loadProject(good);
  expect(project.frames.length).toBe(2);
  expect(toastMessage.value).toBe(null);

  await project.loadProject(bad);
  expect(project.frames.length).toBe(1);
  expect(toastMessage.value).toMatch(/opened as a still/);
  toastMessage.value = null;
});

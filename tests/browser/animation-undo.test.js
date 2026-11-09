// Undo across frames: scrubbing is how animations get drawn, so undo has to survive it. Each frame keeps its own
// ledger, and undo runs strictly newest first, so whatever changed what lies under a stroke undoes before it does.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { cellIndex } from '@/lib/Cells.js';

const INK = { fg: '#ffee00', bg: '#0044aa' };

async function animated(frames = 1, { cols = 20, rows = 20 } = {}) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols, rows });
  for (let i = 1; i < frames; i++) project.addFrame('blank');
  project.clearHistory();
  project.showFrame(0);
  return { project, workspace };
}
const charAt = (project, col, row) => project.cells[cellIndex(col, row, project.cols)].char;
const type = (project, col, row, char) => { project.typeAt(col, row, char, INK); project.commitEdit(); };
const paint = (project, x, y, color = '#ff3300') => { project.paintStroke([{ x, y, alpha: 1 }], color); project.commitEdit(); };
const paintAt = (project, x, y) => { const p = project.paintLayer.pixelAt(x, y); return p && [p.r, p.g, p.b]; };
const RED = [255, 51, 0], BLUE = [0, 0, 255];

test('undoing a frame 3 stroke from frame 7 jumps to frame 3 and restores it, cells and paint', async () => {
  const { project } = await animated(8);
  project.showFrame(3);
  const clean = cellsKey(project);
  project.beginEdit();
  project.writeEditCells([{ col: 1, row: 1, attrs: { char: 'A', ...INK } }]);
  project.paintEditPixels([{ x: 6, y: 6, r: 255, g: 0, b: 0, alpha: 1 }]);
  project.commitEdit();
  project.showFrame(7);
  expect(charAt(project, 1, 1)).toBe('A');
  project.undo();
  expect(project.frame).toBe(3);
  expect(cellsKey(project)).toEqual(clean);
  expect(paintAt(project, 6, 6)).toBe(null);
  project.showFrame(7);
  expect(charAt(project, 1, 1)).not.toBe('A');
  expect(paintAt(project, 6, 6)).toBe(null);
});

test('undo from frame 7 undoes frame 7 strokes first, without jumping', async () => {
  const { project } = await animated(8);
  project.showFrame(3);
  type(project, 1, 1, 'A');
  project.showFrame(7);
  type(project, 2, 2, 'B');
  project.undo();
  expect(project.frame).toBe(7);
  expect(charAt(project, 2, 2)).not.toBe('B');
  expect(charAt(project, 1, 1)).toBe('A');
});

test('undo then redo across three frames ends exactly where it began', async () => {
  const { project } = await animated(3);
  type(project, 1, 1, 'A');
  paint(project, 6, 6);
  project.showFrame(1);
  type(project, 1, 1, 'B');
  paint(project, 6, 6, '#0000ff');
  project.showFrame(2);
  type(project, 2, 2, 'C');
  const shown = [0, 1, 2].map((i) => { project.showFrame(i); return cellsKey(project); });
  project.showFrame(2);

  for (let i = 0; i < 5; i++) project.undo();
  expect(project.frame).toBe(0);
  expect(project.canUndo).toBe(false);
  for (let i = 0; i < 5; i++) project.redo();
  expect(project.frame).toBe(2);
  expect([0, 1, 2].map((i) => { project.showFrame(i); return cellsKey(project); })).toEqual(shown);
});

test('a stroke on Wipe frame 7 undoes to empty, not to frame 3 at the same cell', async () => {
  const { project } = await animated(4);
  project.showFrame(3);
  type(project, 1, 1, 'A');
  paint(project, 6, 6);
  project.addFrame('wipe');
  const clean = cellsKey(project);
  type(project, 1, 1, 'W');
  paint(project, 6, 6, '#0000ff');
  project.undo();
  project.undo();
  expect(project.frame).toBe(4);
  expect(cellsKey(project)).toEqual(clean);
  expect(paintAt(project, 6, 6)).toBe(null);
});

test('undoing a delete brings the frame back with its own undo steps still working', async () => {
  const { project } = await animated(3);
  project.showFrame(1);
  type(project, 1, 1, 'A');
  paint(project, 6, 6);
  const drawn = cellsKey(project);
  project.deleteFrame();
  expect(project.frames).toHaveLength(2);
  project.undo();
  expect(project.frames).toHaveLength(3);
  expect(project.frame).toBe(1);
  expect(cellsKey(project)).toEqual(drawn);
  project.undo();
  expect(paintAt(project, 6, 6)).toBe(null);
  project.undo();
  expect(charAt(project, 1, 1)).not.toBe('A');
  project.redo();
  project.redo();
  expect(cellsKey(project)).toEqual(drawn);
});

test('steps on the frame after a deleted one still undo correctly', async () => {
  const { project } = await animated(3);
  project.showFrame(1);
  type(project, 1, 1, 'A');
  project.showFrame(2);
  type(project, 2, 2, 'B');
  project.showFrame(1);
  project.deleteFrame(); // frame 2's look stays, now holding the A
  expect(charAt(project, 1, 1)).toBe('A');
  type(project, 3, 3, 'C');
  project.undo(); // C
  expect(charAt(project, 3, 3)).not.toBe('C');
  expect(charAt(project, 1, 1)).toBe('A');
  project.undo(); // the delete
  expect(project.frames).toHaveLength(3);
  project.undo(); // B
  expect(project.frames[2]).toBe(project.currentFrame);
  expect(charAt(project, 2, 2)).not.toBe('B');
  expect(charAt(project, 1, 1)).toBe('A');
  project.undo(); // A
  expect(project.frame).toBe(1);
  expect(charAt(project, 1, 1)).not.toBe('A');
});

test('add and move undo and redo, and frames resolve the same afterward', async () => {
  const { project } = await animated(1);
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  type(project, 2, 2, 'B');
  project.addFrame('wipe');
  type(project, 3, 3, 'C');
  const look = () => project.frames.map((_, i) => [...project.resolvedOf(i).keys()].sort());
  const before = look();
  project.moveFrame(2, 0);
  const moved = look();
  expect(moved).not.toEqual(before);
  project.undo();
  expect(look()).toEqual(before);
  project.redo();
  expect(look()).toEqual(moved);
  project.undo();
  project.undo(); // C
  project.undo(); // the Wipe
  expect(project.frames).toHaveLength(2);
  project.undo(); // B
  project.undo(); // the Blank
  expect(project.frames).toHaveLength(1);
  expect(project.frame).toBe(0);
  expect(charAt(project, 1, 1)).toBe('A');
  for (let i = 0; i < 4; i++) project.redo();
  expect(look()).toEqual(before);
});

test('a slider undo does not change frame', async () => {
  const { project } = await animated(3);
  project.showFrame(2);
  project.setSlider('brightness', 140);
  project.commitSliders();
  project.showFrame(1);
  project.undo();
  expect(project.brightness).toBe(100);
  expect(project.frame).toBe(1);
});

test('Clear edit layer undoes to the frame and kind it had', async () => {
  const { project } = await animated(2);
  project.showFrame(1);
  type(project, 1, 1, 'A');
  paint(project, 6, 6);
  const drawn = cellsKey(project);
  project.clearEditLayer();
  expect(project.currentFrame.kind).toBe('wipe');
  project.showFrame(0);
  project.undo();
  expect(project.frame).toBe(1);
  expect(project.currentFrame.kind).toBe('blank');
  expect(cellsKey(project)).toEqual(drawn);
  project.undo(); // the strokes under the clear are back in reach
  expect(paintAt(project, 6, 6)).toBe(null);
  project.undo();
  expect(charAt(project, 1, 1)).not.toBe('A');
  project.redo();
  project.redo();
  project.redo();
  expect(project.currentFrame.kind).toBe('wipe');
  expect(project.editCells.size).toBe(0);
});

test('undo past the history limit stops cleanly, including a deleted frame whose steps dropped out', async () => {
  const { project } = await animated(2);
  project.showFrame(1);
  type(project, 1, 1, 'A');
  project.deleteFrame(); // its one step is now the oldest, and goes first
  const limit = project.history.limit;
  for (let i = 0; i < limit + 5; i++) type(project, i % 20, 5, String(i % 10));
  let undone = 0;
  while (project.canUndo && undone < limit * 2) { project.undo(); undone++; }
  expect(undone).toBe(limit);
  expect(project.canUndo).toBe(false);
  expect(() => project.undo()).not.toThrow();
  for (let i = 0; i < undone; i++) project.redo();
  expect(project.canRedo).toBe(false);
});

test('undo past the limit on frames that all still exist, jumping between them, stops cleanly', async () => {
  const { project } = await animated(3);
  const limit = project.history.limit;
  for (let i = 0; i < limit + 10; i++) {
    project.showFrame(i % 3);
    type(project, i % 20, i % 10, String(i % 10));
  }
  for (let i = 0; i < limit + 10; i++) project.undo();
  expect(project.canUndo).toBe(false);
  // What had dropped out became part of what's beneath: it stays, and nothing throws.
  project.showFrame(0);
  expect(charAt(project, 0, 0)).toBe('0');
});

// The ledger reads a whole tile the first time a stroke touches it. On a frame that's a problem a still doesn't
// have: a pixel in that tile it hasn't drawn on can change under it, by way of an earlier frame.
test('a stroke undoes to what an earlier frame put there since, even in a tile the frame has already drawn in', async () => {
  const { project } = await animated(2);
  project.showFrame(1);
  paint(project, 2, 2, '#00ff00'); // the frame's first stroke in this tile
  project.showFrame(0);
  paint(project, 3, 2); // carries into frame 1, at a pixel it hasn't drawn on
  project.showFrame(1);
  expect(paintAt(project, 3, 2)).toEqual(RED);
  paint(project, 3, 2, '#0000ff');
  expect(paintAt(project, 3, 2)).toEqual(BLUE);
  project.undo();
  expect(project.frame).toBe(1);
  expect(paintAt(project, 3, 2)).toEqual(RED);
});

test('and when that earlier change has itself been undone, the stroke undoes to what shows then', async () => {
  const { project } = await animated(2);
  project.showFrame(1);
  paint(project, 2, 2, '#00ff00');
  project.showFrame(0);
  paint(project, 3, 2);
  project.showFrame(1);
  expect(paintAt(project, 3, 2)).toEqual(RED); // the frame has seen it, and its ledger with it
  project.showFrame(0);
  project.undo(); // the earlier frame's stroke goes
  project.showFrame(1);
  expect(paintAt(project, 3, 2)).toBe(null);
  paint(project, 3, 2, '#0000ff');
  project.undo();
  expect(paintAt(project, 3, 2)).toBe(null);
});

test('after undoing on a frame, a later fix still carries through it', async () => {
  const { project } = await animated(3);
  paint(project, 2, 2);
  project.showFrame(1);
  paint(project, 2, 2, '#0000ff'); // frame 1 owns the cell
  project.undo();                  // and lets go of it
  project.showFrame(0);
  expect(project.frames[1].changes.size).toBe(0);
  paint(project, 2, 2, '#00ff00');
  project.showFrame(2);
  expect(paintAt(project, 2, 2)).toEqual([0, 255, 0]);
});

test('a frame scrubbed through keeps its look after undo and redo of strokes on either side', async () => {
  const { project } = await animated(3);
  type(project, 1, 1, 'A');
  project.showFrame(2);
  type(project, 2, 2, 'C');
  project.showFrame(1);
  const look = cellsKey(project);
  project.undo(); // C, on frame 2
  project.redo();
  await settle(project);
  project.showFrame(1);
  expect(cellsKey(project)).toEqual(look);
});

test('a deleted frame gives up what’s cached of it, and undoing the delete works it out again', async () => {
  const { project } = await animated();
  project.addFrame('wipe');
  project.paintStroke([{ x: 2, y: 2, alpha: 1 }], '#ff0000');
  project.commitEdit();
  const deleted = project.currentFrame;
  project.showFrame(0);
  project.resolvedOf(1);
  await project.builtFrame(1);
  expect(deleted.resolved && deleted.built).toBeTruthy();
  project.showFrame(1);
  project.deleteFrame();
  expect([deleted.resolved, deleted.built]).toEqual([null, null]);

  project.undo();
  expect(project.resolvedOf(1).has('2,1')).toBe(true);
  await project.builtFrame(1);
  project.redo(); // and again, on the way back out
  expect([deleted.resolved, deleted.built]).toEqual([null, null]);
});

test('each frame keeps each layer\'s changes', async () => {
  const { project, workspace } = await animated(2);
  const id = project.addLayer('cells', 'edit');
  type(project, 1, 1, 'a');
  workspace.pickLayer(id);
  type(project, 2, 2, 'x');
  project.showFrame(1);
  type(project, 2, 2, 'y');
  type(project, 3, 3, 'z');
  paint(project, 6, 6);
  workspace.pickLayer('edit');
  type(project, 1, 1, 'b');
  const chars = (cells) => Object.fromEntries([...cells].map(([key, { char }]) => [key, char]));
  const frame0 = () => {
    expect(chars(project.cellsOf(id))).toEqual({ '2,2': 'x' });
    expect(chars(project.cellsOf('edit'))).toEqual({ '1,1': 'a' });
    expect(project.paintOf(id).pixelAt(6, 6)).toBe(null);
  };
  const frame1 = () => {
    expect(chars(project.cellsOf(id))).toEqual({ '2,2': 'y', '3,3': 'z' });
    expect(chars(project.cellsOf('edit'))).toEqual({ '1,1': 'b' });
    expect(project.paintOf(id).pixelAt(6, 6)).not.toBe(null);
  };
  project.showFrame(0);
  frame0();
  project.showFrame(1);
  frame1();
  workspace.pickLayer(id);
  project.showFrame(0);
  frame0();
  project.showFrame(1);
  frame1();
  expect([...project.frames[1].changes.keys()].sort()).toEqual([`${id}:2,2`, `${id}:3,3`, `${id}:6,3`, '1,1'].sort()); // the paint at (6, 6) is cell 6,3
});

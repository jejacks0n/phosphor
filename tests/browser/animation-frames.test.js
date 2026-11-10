// Frames in the store: moving between them keeps each as it was left, and later fixes carry as the kinds say.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { cellIndex } from '@/lib/Cells.js';
import { cellState } from '@/document/frames.js';
import { pack } from '@/document/changes.js';

const COLS = 20, ROWS = 20;
const INK = { fg: '#ffee00', bg: '#0044aa' };

async function animated() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: COLS, rows: ROWS });
  return { project, workspace };
}
const charAt = (project, col, row) => project.cells[cellIndex(col, row, project.cols)].char;
const type = (project, col, row, char) => { project.typeAt(col, row, char, INK); project.commitEdit(); };
const paint = (project, x, y, color = '#ff3300', alpha = 1) => { project.paintEditPixels([{ x, y, ...rgb(color), alpha }], 100); project.commitEdit(); };
const rgb = (hex) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });
const paintAt = (project, x, y) => { const p = project.paintLayer.pixelAt(x, y); return p && [p.r, p.g, p.b]; };

test('Blank carries a later fix through', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  expect(charAt(project, 1, 1)).toBe('A');
  project.showFrame(0);
  type(project, 1, 1, 'B');
  project.showFrame(1);
  expect(charAt(project, 1, 1)).toBe('B');
  expect(project.frames[1].changes.size).toBe(0);
});

test('Duplicate stops a later fix', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  project.addFrame('duplicate');
  expect(charAt(project, 1, 1)).toBe('A');
  project.showFrame(0);
  type(project, 1, 1, 'B');
  project.showFrame(1);
  expect(charAt(project, 1, 1)).toBe('A');
});

test('Wipe shows nothing of before and stops a later fix', async () => {
  const { project } = await animated();
  const clean = cellsKey(project);
  type(project, 1, 1, 'A');
  paint(project, 5, 5);
  project.addFrame('wipe');
  expect(cellsKey(project)).toEqual(clean);
  project.showFrame(0);
  type(project, 1, 1, 'B');
  project.showFrame(1);
  expect(cellsKey(project)).toEqual(clean);
});

test('a frame inherits nothing from a later fix past one that changed the cell', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  type(project, 1, 1, 'X');
  project.addFrame('blank');
  project.showFrame(0);
  type(project, 1, 1, 'B');
  project.showFrame(1);
  expect(charAt(project, 1, 1)).toBe('X');
  project.showFrame(2);
  expect(charAt(project, 1, 1)).toBe('X');
});

test('going to a frame and back leaves project.cells deep-equal, with opaque and soft paint', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  paint(project, 5, 5);
  paint(project, 7, 7, '#33ff66', 0.05);
  paint(project, 8, 8, '#c8285a', 0.4);
  project.addFrame('blank');
  const shown = structuredClone(project.cells);
  project.showFrame(0);
  expect(project.cells).toEqual(shown);
  project.showFrame(1);
  expect(project.cells).toEqual(shown);
  // And again: nothing drifts.
  project.showFrame(0);
  project.showFrame(1);
  expect(project.cells).toEqual(shown);
});

test('visiting a Blank frame with soft inherited paint and editing elsewhere keeps a later fix carrying through it', async () => {
  const { project } = await animated();
  project.addFrame('blank');
  // A soft color as a file or a Bake holds it: not yet what a browser reads back (changes.js), which is what
  // gets a frame into trouble if it compares what it shows with what it inherited.
  const soft = (0xc8285a00 | 13) >>> 0;
  project.frames[0].changes = new Map([['2,2', cellState(null, soft, 0)]]);
  project.staleFrames(0);
  project.showFrame(0);
  project.showFrame(1);
  const read = project.paintLayer.gridPixels().data, i = (4 * project.cols + 2) * 4;
  expect(pack(read, i)).not.toBe(soft);

  type(project, 15, 8, 'E'); // edit elsewhere, so the frame works out its changes
  project.showFrame(0);
  expect([...project.frames[1].changes.keys()]).toEqual(['15,8']);
  paint(project, 2, 4, '#0000ff', 1); // the fix
  project.showFrame(1);
  expect(paintAt(project, 2, 4)).toEqual([0, 0, 255]);
});

test('a soft half inherited beside a change keeps the frame before it, exactly', async () => {
  const { project } = await animated();
  paint(project, 2, 4, '#c8285a', 0.05);
  const stored = () => project.resolvedOf(0).get('2,2').top;
  project.addFrame('blank');
  project.showFrame(0);
  const top = stored();
  project.showFrame(1);
  paint(project, 2, 5, '#00ff00', 1); // the other half of that cell
  project.showFrame(0);
  expect(project.frames[1].changes.get('2,2').top).toBe(top);
});

test('an erase on a Blank frame stays erased on later frames', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  paint(project, 6, 6);
  const before = charAt(project, 1, 1);
  project.addFrame('blank');
  project.clearEditCells([{ col: 1, row: 1 }]);
  project.commitEdit();
  project.eraseEditPixels([{ x: 6, y: 6 }]);
  project.commitEdit();
  const erased = charAt(project, 1, 1);
  expect(erased).not.toBe(before);
  project.addFrame('blank');
  expect(charAt(project, 1, 1)).toBe(erased);
  expect(paintAt(project, 6, 6)).toBe(null);
  project.showFrame(0);
  expect(charAt(project, 1, 1)).toBe('A');
  expect(paintAt(project, 6, 6)).toEqual([255, 51, 0]);
});

test('text typed a moment ago stays on its frame when the scrubber moves', async () => {
  const { project } = await animated();
  project.addFrame('blank');
  project.typeAt(3, 3, 'T', INK); // a typing run still open
  expect(project._stroke).toBeTruthy();
  project.showFrame(0);
  expect(project._stroke).toBeFalsy();
  expect(charAt(project, 3, 3)).not.toBe('T');
  project.showFrame(1);
  expect(charAt(project, 3, 3)).toBe('T');
});

test('a floating selection is set down on its own frame when the scrubber moves', async () => {
  const { project } = await animated();
  type(project, 2, 2, 'F');
  project.addFrame('duplicate');
  const rect = { c0: 2, r0: 2, c1: 2, r1: 2 };
  project.floatSelection(rect, ['edit'], 3, 0);
  expect(charAt(project, 5, 2)).toBe('F');
  project.showFrame(0);
  expect(project._float).toBeNull();
  expect(charAt(project, 2, 2)).toBe('F');
  expect(charAt(project, 5, 2)).not.toBe('F');
  project.showFrame(1);
  expect(charAt(project, 5, 2)).toBe('F');
  expect(charAt(project, 2, 2)).not.toBe('F');
});

test('a wide character on frame 1 beside a change on frame 2 lays out whole on both', async () => {
  const { project } = await animated();
  project.addFrame('blank');
  type(project, 6, 3, 'x'); // on frame 2, beside where the wide character will land
  project.showFrame(0);
  type(project, 5, 3, '漢');
  const at = (col) => project.cells[cellIndex(col, 3, project.cols)];
  expect(at(5).wide).toBe('lead');
  expect(at(6).wide).toBe('trail');
  project.showFrame(1);
  // The carried lead covers its neighbor, as a file holding both would: never half of one.
  expect(at(5).wide).toBe('lead');
  expect(at(6).wide).toBe('trail');
  expect(at(6).char).toBe('漢');
});

test('hasEdits is true on an empty frame when another frame has content', async () => {
  const { project } = await animated();
  expect(project.hasEdits).toBe(false);
  type(project, 1, 1, 'A');
  project.addFrame('wipe');
  expect(project.editCells.size).toBe(0);
  expect(project.hasPaint).toBe(false);
  expect(project.hasEdits).toBe(true);
});

test('a still never computes changes: frames[0].changes stays empty after strokes', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  paint(project, 5, 5);
  project.noteFrame();
  expect(project.frames).toHaveLength(1);
  expect(project.frames[0].changes.size).toBe(0);
});

test('Clear edit layer empties the layer on the frame, what it inherits there too, and the frame keeps its kind', async () => {
  const { project } = await animated();
  const clean = cellsKey(project);
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  type(project, 2, 2, 'B');
  project.clearEditLayer();
  await settle(project);
  expect(project.currentFrame.kind).toBe('blank');
  expect(project.editCells.size).toBe(0); // the A it inherited too
  expect(cellsKey(project)).toEqual(clean);
  project.showFrame(0);
  expect(charAt(project, 1, 1)).toBe('A');
});

test('Clear on a frame stops the carry: what\'s drawn on an earlier frame later doesn\'t show on it or after it, drawn on or saved', async () => {
  const { project } = await animated();
  const { readProject, writeProject } = await import('@/document/projectIO.js');
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  project.clearEditLayer();
  project.addFrame('blank'); // after the cleared frame
  project.showFrame(0);
  type(project, 3, 3, 'C'); // a spot no frame used
  project.showFrame(1);
  expect(charAt(project, 3, 3)).not.toBe('C');
  expect(charAt(project, 1, 1)).not.toBe('A');
  type(project, 5, 5, 'D'); // drawing on it doesn't bring the carry back
  expect(charAt(project, 3, 3)).not.toBe('C');
  expect(project.inheritedCells().size).toBe(0); // no ghost of them either
  project.showFrame(2);
  expect(charAt(project, 3, 3)).not.toBe('C');
  expect(charAt(project, 5, 5)).toBe('D');
  const file = await readProject(await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() }));
  expect(file.framesLost).toBe(false);
  await project.openParts(file, { filename: 'back' });
  await settle(project);
  project.showFrame(1);
  expect(charAt(project, 3, 3)).not.toBe('C');
  expect(charAt(project, 5, 5)).toBe('D');
  project.showFrame(0);
  expect(charAt(project, 3, 3)).toBe('C');
});

test('Clear edit layer on a still leaves it a still', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  project.clearEditLayer();
  await settle(project);
  expect(project.frames).toHaveLength(1);
  expect(project.currentFrame.kind).toBe('blank');
});

test('adding inserts after the current frame; deleting leaves the rest looking the same', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  type(project, 2, 2, 'B');
  project.addFrame('blank');
  type(project, 3, 3, 'C');
  const last = structuredClone(project.cells);
  project.showFrame(1);
  project.deleteFrame();
  expect(project.frames).toHaveLength(2);
  expect(project.frame).toBe(1);
  expect(structuredClone(project.cells)).toEqual(last);
  project.deleteFrame();
  expect(project.frames).toHaveLength(1);
  expect(charAt(project, 1, 1)).toBe('A');
  expect(charAt(project, 3, 3)).not.toBe('C');
  project.deleteFrame();
  expect(project.frames).toHaveLength(1);
});

test('moving a frame keeps its changes, so its look follows what comes before it', async () => {
  const { project } = await animated();
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  type(project, 2, 2, 'B');
  project.addFrame('wipe');
  type(project, 3, 3, 'C');
  project.moveFrame(1, 2); // the Blank now follows the Wipe
  expect(project.frame).toBe(1); // still on the Wipe, which moved up
  expect(charAt(project, 3, 3)).toBe('C');
  project.showFrame(2);
  expect(charAt(project, 2, 2)).toBe('B');
  expect(charAt(project, 3, 3)).toBe('C');
  expect(charAt(project, 1, 1)).not.toBe('A');
});

test('hold and fps are held to their ranges and count as edits', async () => {
  const { project } = await animated();
  const version = project.editVersion;
  project.setHold(0, 2.5);
  project.setFps(12);
  expect(project.frames[0].hold).toBe(2.5);
  expect(project.fps).toBe(12);
  expect(project.editVersion).toBe(version + 2);
  project.setHold(0, 999);
  project.setFps(0);
  expect(project.frames[0].hold).toBe(60);
  expect(project.fps).toBe(1);
});

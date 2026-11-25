// Shapes in an animation: each frame has its own, carried by a Blank frame as cells are, owned by a Duplicate,
// none on a Wipe; a deletion carries too. Built frames (playing, .gif, .cast) have them, and undo goes back to
// the frame a shape edit was made on.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { rectShape, translation, transformed } from '@/document/shapes.js';
import { copyShapes, pasteShapes } from '@/composables/vectorClipboard.js';
import { toastMessage } from '@/composables/useToast';
import { MOST_LAYERS } from '@/document/layerInfo.js';

const RED = { fill: '#ff0000' };

async function animated() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  return { project, workspace };
}
const keys = (project) => [...project.shapes.keys()];
const moveBy = (project, key, dx) => project.updateShapes([[key, transformed(project.shapes.get(key), translation(dx, 0))]]);
const x = (project, key) => project.shapes.get(key).m[4];

test('a Blank frame carries the shapes before it, and moving one there makes it that frame\'s, carried on until a frame that changed it', async () => {
  const { project } = await animated();
  const key = project.addShape(rectShape(2, 2, 8, 8, RED));
  project.addFrame('blank');
  project.addFrame('blank');
  project.addFrame('blank');
  for (const i of [1, 2, 3]) {
    project.showFrame(i);
    expect(keys(project)).toEqual([key]);
    expect(project.inheritedShapes()).toEqual(new Set([key]));
  }
  project.showFrame(1);
  moveBy(project, key, 4);
  expect(project.inheritedShapes()).toEqual(new Set());
  project.showFrame(3);
  moveBy(project, key, -2);
  project.showFrame(2);
  expect(x(project, key)).toBe(4); // frame 1's, carried
  project.showFrame(3);
  expect(x(project, key)).toBe(2);
  project.showFrame(0);
  expect(x(project, key)).toBe(0);
  await settle(project);
  const still = cellsKey(project);
  project.showFrame(1);
  await settle(project);
  expect(cellsKey(project)).not.toEqual(still); // drawn where frame 1 has it
});

test('Duplicate owns its shapes and Wipe starts with none', async () => {
  const { project } = await animated();
  const key = project.addShape(rectShape(2, 2, 8, 8, RED));
  project.addFrame('duplicate');
  project.showFrame(0);
  moveBy(project, key, 5);
  project.showFrame(1);
  expect(x(project, key)).toBe(0); // its own, from when it was made
  expect(project.inheritedShapes()).toEqual(new Set());
  project.addFrame('wipe');
  expect(keys(project)).toEqual([]);
});

test('deleting a shape on a frame carries forward', async () => {
  const { project } = await animated();
  const key = project.addShape(rectShape(2, 2, 8, 8, RED));
  project.addFrame('blank');
  project.addFrame('blank');
  project.showFrame(1);
  project.deleteShapes([key]);
  project.showFrame(2);
  expect(keys(project)).toEqual([]);
  project.showFrame(0);
  expect(keys(project)).toEqual([key]);
});

test('built frames (play, .gif, .cast) include each frame\'s shapes', async () => {
  const { project } = await animated();
  const key = project.addShape(rectShape(2, 2, 8, 8, RED));
  project.addFrame('blank');
  moveBy(project, key, 8);
  project.addFrame('wipe');
  project.addShape(rectShape(10, 10, 18, 18, { fill: '#00ff00', stroke: '#ffffff', width: 1.5 }));
  for (let i = 0; i < project.frames.length; i++) {
    project.showFrame(i);
    await settle(project);
    const built = await project.builtFrame(i);
    expect(built.cells.map((c) => c.char + c.fg.hex + c.bg.hex)).toEqual(cellsKey(project));
  }
});

test('undo of a shape edit on frame 2 from frame 0 goes back to frame 2', async () => {
  const { project } = await animated();
  const key = project.addShape(rectShape(2, 2, 8, 8, RED));
  project.addFrame('blank');
  project.addFrame('blank');
  project.clearHistory();
  project.showFrame(2);
  moveBy(project, key, 6);
  project.showFrame(0);
  project.undo();
  expect(project.frame).toBe(2);
  expect(x(project, key)).toBe(0);
  project.redo();
  expect(x(project, key)).toBe(6);
  project.showFrame(1);
  expect(x(project, key)).toBe(0);
});

test('pasted on another frame, shapes land where they were copied from; on top of their copies, a little past them', async () => {
  const { project, workspace } = await animated();
  workspace.vectorSelected = [project.addShape(rectShape(10, 10, 20, 20, RED))];
  expect(copyShapes(project, workspace)).toBe(true);
  const newest = () => [...project.shapes.values()].at(-1).m[4]; // the last pasted's x offset
  for (const kind of ['wipe', 'blank']) { // an empty frame, and one carrying the shapes from before it
    project.addFrame(kind);
    for (const offset of [0, 2, 4]) { // where it was copied from, then past each one pasted here
      expect(pasteShapes(project, workspace)).toBe(true);
      expect(newest(), `${kind} ${offset}`).toBe(offset);
    }
  }
});

// From PIXEL or ANSI (a cells layer picked), a paste of shapes makes its own vector layer.
for (const frames of [1, 2]) {
  test(`shapes pasted over a cells layer land on a new vector layer directly above it, picked, as one step (${frames} frame${frames > 1 ? 's' : ''})`, async () => {
    const { project, workspace } = await animated();
    const first = project.addShape(rectShape(2, 2, 8, 8, RED)), vector = project.shapes.get(first).layer ?? 'vector';
    workspace.vectorSelected = [first];
    expect(copyShapes(project, workspace)).toBe(true);
    if (frames > 1) project.addFrame('blank');
    workspace.pickLayer('edit');
    const above = project.addLayer('cells', 'edit'); // so "above the picked layer" isn't the top
    workspace.pickLayer('edit');
    const stack = project.layers.map((layer) => layer.id), undoable = project.history.version;

    expect(pasteShapes(project, workspace, workspace.vectorClipboard, workspace.vectorClipboardKeys, 'edit')).toBe(true);
    const made = project.layers[stack.indexOf('edit') + 1];
    expect(made.kind).toBe('vector');
    expect(project.layers.map((layer) => layer.id)).toEqual([...stack.slice(0, stack.indexOf('edit') + 1), made.id, ...stack.slice(stack.indexOf('edit') + 1)]);
    expect(made.id).not.toBe(vector);
    const pasted = keys(project).filter((key) => key !== first);
    expect(pasted).toHaveLength(1);
    expect(project.shapes.get(pasted[0]).layer).toBe(made.id);
    const past = frames > 1 ? 0 : 2; // as any paste: where it was copied from, or a little past the one that's there on this frame
    expect(project.shapes.get(pasted[0]).m).toEqual([1, 0, 0, 1, past, past]);
    expect(workspace.pickedLayer).toBe(made.id);
    expect(workspace.editorTab).toBe('vector');
    expect(workspace.vectorSelected).toEqual(pasted);
    expect(project.history.version).toBe(undoable + 1);

    project.undo(); // one step: the shapes and their layer
    await settle(project);
    expect(project.layers.map((layer) => layer.id)).toEqual(stack);
    expect(keys(project)).toEqual([first]);
    expect(project.layerById(above)).toBeTruthy();
    project.redo();
    await settle(project);
    expect(project.layers[stack.indexOf('edit') + 1].id).toBe(made.id);
    expect(keys(project).filter((key) => key !== first).map((key) => project.shapes.get(key).layer)).toEqual([made.id]);
  });
}

test('at the most layers, shapes pasted over a cells layer say so and nothing changes', async () => {
  const { project, workspace } = await animated();
  workspace.vectorSelected = [project.addShape(rectShape(2, 2, 8, 8, RED))];
  copyShapes(project, workspace);
  workspace.pickLayer('edit');
  while (project.layers.length < MOST_LAYERS) project.addLayer('cells', 'edit');
  const shapes = project.shapes, version = project.history.version;
  expect(pasteShapes(project, workspace, workspace.vectorClipboard, workspace.vectorClipboardKeys, 'edit')).toBe(false);
  expect(project.shapes).toBe(shapes);
  expect(project.layers).toHaveLength(MOST_LAYERS);
  expect(project.history.version).toBe(version);
  expect(toastMessage.value).toBe(`A drawing can have up to ${MOST_LAYERS} layers.`);
});

test('while the drawing is held, shapes pasted over a cells layer are refused, as any shape is', async () => {
  const { project, workspace } = await animated();
  workspace.vectorSelected = [project.addShape(rectShape(2, 2, 8, 8, RED))];
  copyShapes(project, workspace);
  workspace.pickLayer('edit');
  const shapes = project.shapes, layers = project.layers;
  project.setPaused(true);
  expect(pasteShapes(project, workspace, workspace.vectorClipboard, workspace.vectorClipboardKeys, 'edit')).toBe(false);
  project.setPaused(false);
  expect([project.shapes, project.layers]).toEqual([shapes, layers]);
});

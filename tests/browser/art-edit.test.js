// Stepping into an art layer: the usual drawing tools draw into the layer instead of the frame's drawing, which is
// kept aside, and each edit is one undo step that changes the layer on every frame it's on.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import eraser from '@/tools/eraser';
import { makeArt } from '@/document/artLayers.js';
import { withShape, isShapeKey } from '@/document/shapes.js';
import { readProject, writeProject } from '@/document/projectIO.js';
import { usePlayback } from '@/composables/usePlayback.js';

const RED = '#ff0000', GREEN = '#00ff00';
const rgb = (hex) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });
const at = (project, col, row) => project.cells[row * project.cols + col];

async function blank() {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(app.project);
  return app;
}

// A drawing (an X at (1, 1), paint at (0, 8)) and an art layer of one A at (4, 2), off the drawing.
async function withArt() {
  const app = await blank(), { project } = app;
  project.typeAt(1, 1, 'X', { fg: GREEN });
  project.commitEdit();
  project.paintEditPixels([{ x: 0, y: 16, ...rgb(GREEN), alpha: 1 }]);
  project.commitEdit();
  const key = project.addShape(makeArt({ m: [1, 0, 0, 1, 4, 4], art: { cols: 1, rows: 1, cells: [[0, 'A', null, RED]] } }));
  return { ...app, key };
}

// The frames' drawings, without their shapes.
const drawings = (project) => project.frames.map((frame) => JSON.stringify([...frame.changes].filter(([key]) => !isShapeKey(key))));

test('typing inside an art layer changes the layer, not the drawing, on every frame; one undo step each', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  project.typeAt(1, 1, 'X', { fg: GREEN });
  project.commitEdit();
  const key = project.addShape(makeArt({ m: [1, 0, 0, 1, 0, 0], art: { cols: 2, rows: 1, cells: [[0, 'A', RED, null]] } }));
  for (let i = 0; i < 6; i++) project.addFrame('blank');
  project.updateShapes([[key, withShape(project.shapes.get(key), { m: [1, 0, 0, 1, 8, 16] })]]); // keyed on 0 and 6
  project.showFrame(0);
  project.setKeyEasing(key, [{ part: 'transform', at: 0 }], 'linear');
  project.showFrame(3); // the layer's at (4, 4) here
  project.typeAt(2, 1, 'Q', { fg: GREEN }); // the frame's own drawing
  project.commitEdit();
  const places = project.frames.map((_, i) => project.resolvedOf(i).get(key).cell.m.slice(4));
  expect(places[3]).toEqual([4, 8]);
  const before = drawings(project), shown = at(project, 2, 1).char;

  expect(project.enterArt(key)).toBe(true);
  expect(project.artInside).toBe(key);
  expect(at(project, 4, 4).char).toBe('A');
  const version = project.history.version;
  project.typeAt(5, 4, 'Z', { fg: RED });
  project.noteFrame(); // as a ghost or a palette pick would, mid-stroke
  expect(drawings(project)).toEqual(before);
  project.commitEdit();
  expect(project.history.version).toBe(version + 1); // setArtContent's one step
  const art = { cols: 2, rows: 1, cells: [[0, 'A', RED, null], [1, 'Z', null, RED]] };
  expect(project.shapes.get(key).art).toEqual(art);
  expect(project.frames.map((_, i) => project.resolvedOf(i).get(key).cell.art)).toEqual(project.frames.map(() => art));
  expect(project.frames.map((_, i) => project.resolvedOf(i).get(key).cell.m.slice(4))).toEqual(places);
  expect(at(project, 5, 4).char).toBe('Z');
  expect(drawings(project)).toEqual(before); // nothing noted from the edit
  project.typeAt(4, 4, 'Y', { fg: RED }); // and the next edit, with a step taken since
  project.commitEdit();
  expect(project.history.version).toBe(version + 2);
  expect(project.shapes.get(key).art.cells[0]).toEqual([0, 'Y', RED, RED]);
  project.undo();
  expect(project.shapes.get(key).art).toEqual(art);
  expect(at(project, 4, 4).char).toBe('A');
  expect(drawings(project)).toEqual(before);

  project.leaveArt();
  expect(project.artInside).toBe(null);
  project.noteFrame();
  expect(drawings(project)).toEqual(before);
  expect(at(project, 2, 1).char).toBe(shown);
  expect(at(project, 5, 4).char).toBe('Z');
  for (const i of [0, 6, 3]) project.showFrame(i);
  expect(drawings(project)).toEqual(before);
});

test('drawing past the edge grows the layer, erasing an edge cell shrinks it, and the cells stay put', async () => {
  const { project, key } = await withArt();
  project.enterArt(key);
  project.typeAt(3, 1, 'B', { fg: RED }); // up and to the left
  project.commitEdit();
  project.paintEditPixels([{ x: 6, y: 5, ...rgb(GREEN), alpha: 1 }]); // a bottom half, to the right
  project.commitEdit();
  const grown = project.shapes.get(key);
  expect(grown.m).toEqual([1, 0, 0, 1, 3, 2]);
  expect(grown.art).toEqual({ cols: 4, rows: 2, cells: [[0, 'B', null, RED], [5, 'A', null, RED], [7, '▄', null, GREEN]] });
  expect([at(project, 3, 1).char, at(project, 4, 2).char]).toEqual(['B', 'A']);

  project.clearEditCells([{ col: 3, row: 1 }]);
  project.commitEdit();
  project.eraseEditPixels([{ x: 6, y: 5 }]);
  project.commitEdit();
  const shrunk = project.shapes.get(key);
  expect(shrunk.m).toEqual([1, 0, 0, 1, 4, 4]);
  expect(shrunk.art).toEqual({ cols: 1, rows: 1, cells: [[0, 'A', null, RED]] });
  expect(at(project, 4, 2).char).toBe('A');
  project.leaveArt();
  expect(at(project, 4, 2).char).toBe('A');
  expect(at(project, 3, 1).char).not.toBe('B');
});

test('erasing all of it leaves an empty layer where it was, gone from view as it goes', async () => {
  const { project, key } = await withArt();
  project.enterArt(key);
  project.clearEditCells([{ col: 4, row: 2 }]);
  expect(at(project, 4, 2).char).not.toBe('A'); // mid-edit: the shape layer doesn't draw the layer you're in
  project.leaveArt();
  expect(project.shapes.get(key).m).toEqual([1, 0, 0, 1, 4, 4]);
  expect(project.shapes.get(key).art).toEqual({ cols: 1, rows: 1, cells: [] });
  expect(at(project, 4, 2).char).not.toBe('A');
});

test('undo inside stops at the step-in', async () => {
  const { project, key } = await withArt();
  expect(project.canUndo).toBe(true);
  project.enterArt(key);
  expect(project.canUndo).toBe(false);
  project.typeAt(5, 2, 'Z', { fg: RED });
  project.commitEdit();
  expect(project.canUndo).toBe(true);
  project.undo();
  expect(project.shapes.get(key).art.cells).toEqual([[0, 'A', null, RED]]);
  expect(project.editCells.has('5,2')).toBe(false);
  expect(at(project, 5, 2).char).not.toBe('Z');
  expect(project.canUndo).toBe(false);
  project.undo(); // nothing: the drawing's steps are out of reach
  expect(project.artInside).toBe(key);
  expect(project.canRedo).toBe(true);
  project.redo();
  expect(project.editCells.get('5,2')?.char).toBe('Z');
  expect(at(project, 5, 2).char).toBe('Z');
  project.undo();
  project.leaveArt();
  expect(project.canUndo).toBe(true);
});

test('leaving keeps the drawing as it was and shows the layer drawn again', async () => {
  const { project, key } = await withArt();
  const cells = cellsKey(project), editCells = project.editCells, paintLayer = project.paintLayer;
  project.enterArt(key);
  expect(project.editCells).not.toBe(editCells);
  expect(at(project, 1, 1).char).not.toBe('X'); // the drawing's kept aside
  expect(project.shownCells[1 * 20 + 1].char).toBe('X'); // and shown as it was, dimmed
  project.leaveArt();
  expect(project.editCells).toBe(editCells);
  expect(project.paintLayer).toBe(paintLayer);
  expect(cellsKey(project)).toEqual(cells);
});

test('the rest dims while inside: what the drawing showed outside the layer, and the layer as it is', async () => {
  const { project, key } = await withArt();
  const x = at(project, 1, 1);
  project.enterArt(key);
  const shown = project.shownCells;
  expect(shown[20 + 1].char).toBe('X');
  expect(shown[20 + 1].fg.hex).not.toBe(x.fg.hex); // dimmed
  expect(shown[2 * 20 + 4]).toBe(project.cells[2 * 20 + 4]); // the layer's own cell, as it is
  project.typeAt(9, 6, 'N', { fg: RED }); // a typing run, past the layer's box: it shows as typed
  expect(project.shownCells[6 * 20 + 9].char).toBe('N');
  project.leaveArt();
  expect(project.shownCells).toBe(project.cells);
});

test('a slice inside sends none of the layer as drawing', async () => {
  const { project, key } = await withArt();
  project.enterArt(key);
  project.typeAt(5, 2, 'Z', { fg: RED });
  const id = project._stroke.id;
  project.sendSlice(); // as a room's timer does mid-stroke
  expect(project._ledger.bytesOf(id)).toBe(0);
  project.commitEdit();
  expect(project.shapes.get(key).art.cells).toContainEqual([1, 'Z', null, RED]);
});

test('a tab change, opening a file, a new document, a canvas resize, Animate off, a frame change or an export steps out first, keeping the edits', async () => {
  const typed = (project, key) => project.shapes.get(key)?.art.cells.some(([, char]) => char === 'Z');
  const cases = {
    tab: async ({ workspace }) => { workspace.editorTab = 'vector'; },
    resize: async ({ project }) => {
      project.cols = 24;
      await settle(project);
    },
    animateOff: async ({ project }) => project.setAnimate(false),
    frame: async ({ project }) => project.showFrame(1),
    export: async ({ project }) => project.exportFile('ans'), // its cells are the drawing's, with the layer
  };
  for (const [name, act] of Object.entries(cases)) {
    const app = await withArt(), { project, workspace, key } = app;
    if (name === 'animateOff') project.setAnimate(true);
    if (name === 'frame') {
      project.addFrame('blank');
      project.showFrame(0);
    }
    workspace.editorTab = 'output';
    expect([name, project.enterArt(key)]).toEqual([name, true]);
    project.typeAt(5, 2, 'Z', { fg: RED }); // a typing run, still open
    await act(app);
    expect([name, project.artInside, typed(project, key)]).toEqual([name, null, true]);
    expect([name, project.editCells.get('1,1')?.char]).toEqual([name, 'X']);
    expect([name, at(project, 5, 2).char]).toEqual([name, 'Z']);
    if (name === 'frame') expect(project.resolvedOf(0).get(key).cell.art.cells).toContainEqual([1, 'Z', null, RED]);
  }

  const opened = await withArt();
  const file = new File([await writeProject({ imageBuffer: opened.project.imageBuffer, ...await opened.project.projectParts() })], 'other.phosphor');
  const replacing = {
    open: async (project) => project.openParts(await readProject(file), { filename: 'other' }),
    newDocument: async (project) => project.clearImage(),
  };
  for (const [name, act] of Object.entries(replacing)) {
    const { project, key } = await withArt(), seen = [];
    project.$onAction(({ name: action, after }) => {
      if (action === 'leaveArt') after(() => seen.push(typed(project, key)));
    });
    project.enterArt(key);
    project.typeAt(5, 2, 'Z', { fg: RED });
    await act(project);
    expect([name, seen, project.artInside]).toEqual([name, [true], null]);
  }
});

test('a whole-layer action steps out first, so undoing it after leaves the drawing as it was', async () => {
  const cases = {
    clear: (project) => project.clearEditLayer(),
    clearFrame: (project) => project.clearEditLayer(),
    mergeUp: (project) => project.mergeUp({ c0: 0, r0: 0, c1: 9, r1: 9 }),
    mergeDown: (project) => project.mergeDown(),
    mergeIntoPicture: (project) => project.mergeIntoPicture(),
    bake: (project) => project.bake(),
    bakeFrames: (project) => project.bake(),
    mergeShapes: (project) => project.mergeShapes(),
    makeArtLayer: (project, workspace) => {
      workspace.selection = { c0: 0, r0: 0, c1: 2, r1: 2 };
      project.makeArtLayer();
    },
    setFrameState: (project) => project.setFrameState({ ...project.currentFrame }),
    setAllFrames: (project) => project.setAllFrames(project.frames.map(({ kind, changes }) => ({ kind, changes }))),
  };
  for (const [name, act] of Object.entries(cases)) {
    const { project, workspace, key } = await withArt();
    if (['clearFrame', 'bakeFrames', 'setFrameState', 'setAllFrames'].includes(name)) {
      project.addFrame('blank');
      project.showFrame(0);
    }
    if (name.startsWith('bake')) project.brightness = 140; // something for Bake to bake
    workspace.editorTab = 'output';
    project.enterArt(key);
    project.typeAt(5, 2, 'Z', { fg: RED });
    await act(project, workspace);
    await settle(project);
    const stayed = project.artInside;
    project.leaveArt();
    project.undo();
    await settle(project);
    if (project.hasFrames) project.showFrame(0);
    // The drawing as it was: none of the layer's cells or paint in it.
    expect([name, project.editCells.get('1,1')?.char, project.editCells.has('4,2'), project.editCells.has('5,2')]).toEqual([name, 'X', false, false]);
    expect([name, !!project.paintLayer.pixelAt(0, 16)]).toEqual([name, true]);
    expect([name, stayed]).toEqual([name, null]); // stepped out by the action itself
  }
});

test('with Base lit, the Eraser or a Delete inside takes from the layer alone, and the base stays', async () => {
  const { project, workspace, key } = await withArt();
  workspace.editorTab = 'output';
  project.enterArt(key);
  const records = project.baseRecords, version = project.baseLayer.version;
  workspace.eraseLayers = { base: true, edit: true };
  workspace.editEraserSize = 1;
  const ctx = { project, workspace, view: 'output' };
  eraser.begin(ctx, { x: 4.5, y: 4.5 });
  eraser.end(ctx);
  project.deleteSelection({ c0: 6, r0: 6, c1: 8, r1: 8 }, { base: true, edit: true });
  expect(project.shapes.get(key).art.cells).toEqual([]);
  expect(project.baseRecords).toBe(records);
  expect(project.baseLayer.version).toBe(version);
});

test('a paste inside of a block copied with Base lit draws in the layer alone, and the base stays', async () => {
  const { project, workspace, key } = await withArt();
  const block = project.copySelection({ c0: 0, r0: 0, c1: 2, r1: 2 }, { base: true, edit: true }); // as the clipboard copies
  expect(block.base).toBeTruthy();
  workspace.editorTab = 'output';
  project.enterArt(key);
  const records = project.baseRecords, version = project.baseLayer.version;
  project.pasteSelection(block, 6, 6);
  project.commitPending();
  expect(project.shapes.get(key).art.cells.some(([, char]) => char === 'X')).toBe(true);
  expect(project.baseRecords).toBe(records);
  expect(project.baseLayer.version).toBe(version);
});

test('a whole-layer action that has nothing to do leaves you inside', async () => {
  const { project, workspace, key } = await withArt();
  project.addFrame('blank'); // in an animation these don't apply, and with no slider moved there's nothing to bake
  project.showFrame(0);
  workspace.editorTab = 'output';
  project.enterArt(key);
  workspace.selection = null;
  await project.bake();
  await project.mergeIntoPicture();
  project.mergeDown();
  project.mergeShapes();
  project.makeArtLayer();
  expect(project.artInside).toBe(key);
});

test('in a room, a layer someone else is drawing in can be selected, not stepped into, moved or deleted', async () => {
  const { project, key } = await withArt();
  project.startSharing({ send: () => {}, role: 'host', me: 'me' });
  project._locks = { ann: key }; // what ann's cursor says (DrawingStore)
  expect(project.lockedBy(key)).toBe('ann');
  const shape = project.shapes.get(key);
  expect(project.enterArt(key)).toBe(false);
  project.updateShapes([[key, withShape(shape, { m: [1, 0, 0, 1, 8, 4] })]]);
  project.deleteShapes([key]);
  project.restackShapes([key], 'back');
  expect(project.shapes.get(key)).toBe(shape);
  project.selectShapes([key]);
  expect(project.history.last.selectionOnly).toBe(true);
  project._locks = { me: key, ann: null }; // my own, heard back after I'd stepped out
  expect(project.lockedBy(key)).toBe(null);
  expect(project.enterArt(key)).toBe(true);
  expect(project.lockedBy(key)).toBe('me');
  project.leaveArt();
  project.stopSharing();
});

test('autosave writes the drawing kept aside, not the layer being edited', async () => {
  const { project, key } = await withArt();
  project.enterArt(key);
  project.typeAt(5, 2, 'Z', { fg: RED });
  project.paintEditPixels([{ x: 5, y: 6, ...rgb(RED), alpha: 1 }]);
  project.commitEdit();
  const read = async () => readProject(new Blob([await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() })]));
  const inside = await read();
  project.leaveArt();
  const outside = await read();
  expect([...inside.editCells]).toEqual([...outside.editCells]);
  expect(inside.editCells.get('1,1')?.char).toBe('X');
  expect(inside.editCells.has('5,2')).toBe(false);
  expect(inside.paintBuffer).not.toBe(null);
  expect(new Uint8Array(inside.paintBuffer)).toEqual(new Uint8Array(outside.paintBuffer));
  expect(inside.shapes.get(key).art).toEqual(outside.shapes.get(key).art);
});

test('stepping in while an animation plays pauses it first, so a later pause does not step out again', async () => {
  const { project, workspace, key } = await withArt();
  const playback = usePlayback();
  project.setAnimate(true);
  project.addFrame('blank');
  project.addFrame('blank');
  project.setFps(60);
  project.showFrame(0);
  await playback.play();
  expect(workspace.playing).toBe(true);
  for (let i = 0; i < 400 && workspace.playFrame === 0; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
  expect(workspace.playFrame).not.toBe(0); // the frame showing is no longer the one edited

  expect(project.enterArt(key)).toBe(true);
  expect(workspace.playing).toBe(false);
  expect(project.frame).not.toBe(0); // paused on the frame it was showing
  playback.pause(); // a canvas press or key would
  expect(project.artInside).toBe(key);
});

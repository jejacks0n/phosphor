// A new drawing (a blank canvas, an opened picture or SVG) starts with only the base, picked, and the tools draw on the
// base until a layer is added. Opened ANSI files and projects that have a drawing layer keep it.
import { test, expect } from 'vitest';
import { toastMessage } from '@/composables/useToast';
import { getTool } from '@/tools';
import { typeAtCursor, typeText } from '@/composables/useTextTool.js';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { readProject, writeProject } from '@/document/projectIO.js';
import { AnsiFile } from '@/lib/AnsiFile';
import { buildCell, cellIndex } from '@/lib/Cells';
import { PALETTES } from '@/lib/ColorUtils';
import pencil from '@/tools/pencil';
import brush from '@/tools/brush';

const ids = (project) => project.layers.map((layer) => layer.id);
const WHITE = { fg: '#ffffff', bg: '#000000' };

async function blank() {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(app.project);
  return app;
}

// A Single line drag along row 2, from col 2 to col 5: '───' then the end, as the Pencil draws it.
function line({ project, workspace }) {
  Object.assign(workspace, { pencilDrawWith: 'single', pencilConnect: true, editFgColor: '#ffffff', editBgNone: true });
  const ctx = { project, workspace, view: 'output' }, at = (col) => ({ x: col + 0.5, y: 5 });
  pencil.begin(ctx, at(2), {});
  pencil.move(ctx, at(2), at(5));
  pencil.end(ctx);
}
const row2 = (project) => Array.from({ length: 4 }, (_, i) => project.cells[cellIndex(2 + i, 2, project.cols)].char).join('');

// A project written and opened again, as a file would be.
async function reopened(project) {
  const parts = await readProject(await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() }));
  await project.openParts(parts, { filename: 'again' });
  await settle(project);
}

test('a blank canvas starts with only the base, picked', async () => {
  const { project, workspace } = await blank();
  expect(ids(project)).toEqual(['base']);
  expect(workspace.pickedLayer).toBe('base');
  expect(project.editId).toBe('base');
});

test('an opened picture starts with only the base, picked', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { withLayer: false });
  expect(ids(project)).toEqual(['base']);
  expect(workspace.pickedLayer).toBe('base');
  expect(project.editId).toBe('base');
});

test('a stroke on a new drawing lands on the base', async () => {
  const app = await blank();
  line(app);
  await settle(app.project);
  expect(row2(app.project)).toBe('────');
  expect(app.project.editCells.size).toBe(0);
  expect(ids(app.project)).toEqual(['base']);
});

test('drawing on the base of a new drawing, then changing the grid, keeps the strokes where they are', async () => {
  const app = await blank();
  line(app);
  await settle(app.project);
  app.project.aspectLock = false;
  app.project.cols = 30;
  await settle(app.project);
  expect(app.project.cols).toBe(30);
  expect(row2(app.project)).toBe('────');
});

// After a reload nothing is left to undo, so only what's drawn can say the grid is a canvas: the base's pinned characters
// and its own pixels count, as a layer's cells and paint do.
test('characters drawn on the base stay where they are when the grid changes after the drawing is reopened', async () => {
  const app = await blank();
  line(app);
  await settle(app.project);
  await reopened(app.project);
  expect(app.project.history.canUndo).toBe(false);
  expect(app.project.resizesCanvas).toBe(true);
  app.project.aspectLock = false;
  app.project.cols = 30;
  await settle(app.project);
  expect(row2(app.project)).toBe('────');
});

test('paint on the base makes a grid change a canvas resize after the drawing is reopened', async () => {
  const app = await blank();
  Object.assign(app.workspace, { editFgColor: '#ff0000' });
  const ctx = { project: app.project, workspace: app.workspace, view: 'input' };
  brush.begin(ctx, { x: 4, y: 4 }, {});
  brush.end(ctx);
  await settle(app.project);
  await reopened(app.project);
  expect(app.project.baseLayer.hasPaint).toBe(true);
  expect(app.project.resizesCanvas).toBe(true);
});

test('a picture with nothing drawn on it still rescales', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { withLayer: false });
  expect(project.resizesCanvas).toBe(false);
});

// The base is the same on every frame, so what's drawn on it doesn't animate: the first stroke on it in a movie says so,
// once a drawing, and a stroke on a still or on a layer doesn't.
test('drawing on the base with more than one frame says once that the base is on every frame', async () => {
  const app = await blank();
  const ctx = { project: app.project, workspace: app.workspace, view: 'output' }, stroke = () => {
    toastMessage.value = null;
    getTool('pencil').begin(ctx, { x: 3.5, y: 5 }, {});
    getTool('pencil').end(ctx);
    return toastMessage.value;
  };
  expect(stroke()).toBe(null);   // a still
  app.project.addFrame('blank');
  const said = 'The base is the same on every frame. Add a layer to animate what you draw.';
  expect(stroke()).toBe(said);
  expect(stroke()).toBe(null);   // once
  app.workspace.pickLayer(app.project.addLayer('cells', 'base'));
  expect(stroke()).toBe(null);
  await app.project.setBlankCanvas({ cols: 20, rows: 20 });
  app.project.addFrame('blank');
  expect(stroke()).toBe(said);   // a new drawing says it again
});

test.each([
  ['a key', (project, workspace) => typeAtCursor(project, workspace, 'a')],
  ['a paste', (project, workspace) => typeText(project, workspace, 'ab')],
])('typing on the base with more than one frame says the base is on every frame: %s', async (_, type) => {
  const { project, workspace } = await blank();
  project.addFrame('blank');
  workspace.textCursor = { col: 1, row: 1 };
  toastMessage.value = null;
  type(project, workspace);
  expect(toastMessage.value).toBe('The base is the same on every frame. Add a layer to animate what you draw.');
});

test('a base-only drawing saves and opens as base only', async () => {
  const { project, workspace } = await blank();
  await reopened(project);
  expect(ids(project)).toEqual(['base']);
  expect(workspace.pickedLayer).toBe('base');
});

test('Add layer on a base-only drawing makes Layer 1, and the next stroke lands on it', async () => {
  const app = await blank();
  const id = app.project.addLayer('cells', 'base');
  app.workspace.pickLayer(id);
  expect(id).toBe('edit');
  expect(app.project.layerById(id).n).toBe(1);
  expect(ids(app.project)).toEqual(['base', 'edit']);
  line(app);
  await settle(app.project);
  expect(app.project.editCells.size).toBe(4);
  expect(row2(app.project)).toBe('────');
});

test('a project with a drawing layer keeps it, picked, when it opens over a base-only drawing', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  project.typeAt(1, 1, 'Q', WHITE);
  project.commitEdit();
  const parts = await readProject(await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() }));
  await project.setBlankCanvas({ cols: 20, rows: 20 });
  expect(ids(project)).toEqual(['base']);
  await project.openParts(parts, { filename: 'old' });
  await settle(project);
  expect(ids(project)).toEqual(['base', 'edit']);
  expect(workspace.pickedLayer).toBe('edit');
  expect(project.editCells.size).toBe(1);
});

test.each(['base', 'edit'])('an ANSI file opened with layer %s has Layer 1', async (layer) => {
  const { project, workspace } = await createTestApp();
  const cells = Array.from({ length: 8 }, () => buildCell(PALETTES.cga[0], PALETTES.cga[7], 'A', 'ansi'));
  await project.openArtFile(new File([new AnsiFile(4, 2, cells).toBlob({ colorMode: 'cga' })], 'two.ans'), { layer });
  await settle(project);
  expect(ids(project)).toEqual(['base', 'edit']);
  expect(workspace.pickedLayer).toBe('edit');
});

test('an ANSI file opened with Draw on top is a canvas to resize, not a picture to rescale', async () => {
  const { project } = await createTestApp();
  const cells = Array.from({ length: 8 }, () => buildCell(PALETTES.cga[0], PALETTES.cga[7], 'A', 'ansi'));
  await project.openArtFile(new File([new AnsiFile(4, 2, cells).toBlob({ colorMode: 'cga' })], 'two.ans'), { layer: 'base' });
  await settle(project);
  expect(project.resizesCanvas).toBe(true);
});

test('an opened SVG starts with the base and its vector layer', async () => {
  const { project } = await createTestApp();
  const text = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
  await project.openSvgFile(new File([text], 'box.svg', { type: 'image/svg+xml' }));
  await settle(project);
  expect(ids(project)).toEqual(['base', 'vector']);
});

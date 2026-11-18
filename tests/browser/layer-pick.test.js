// The picked layer (workspace.pickedLayer) decides the editor tabs: the base and the edit layer show PIXEL and ANSI, the
// vector layer VECTOR (and SAUCE), an art layer stepped into VECTOR and ANSI. followLayerPick keeps the pick in step with
// editorTab, so what sets the tab today still works.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, markRaw } from 'vue';
import { createTestApp, settle } from '../support/app.js';
import EditTabs from '@/components/EditTabs.vue';
import { i18n } from '@/i18n';
import { rectShape } from '@/document/shapes.js';
import { isArt } from '@/document/artLayers.js';
import { withPins } from '@/document/baseRecords.js';
import EditToolbar from '@/components/EditToolbar.vue';
import eraser from '@/tools/eraser';
import pencil from '@/tools/pencil';
import brush from '@/tools/brush';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { toastMessage, closeToast } from '@/composables/useToast.js';

const RED = '#ff0000';
let mounted = null;
afterEach(() => { mounted?.unmount(); mounted = null; closeToast(); });

async function blank() {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(app.project);
  return app;
}

// EditTabs, following the workspace's tab as App.vue's EditWorkspace does; the names of the tabs it shows.
async function tabsOf(workspace) {
  const host = document.createElement('div');
  mounted = createApp({ render: () => h(EditTabs, { modelValue: workspace.editorTab }) }).use(i18n);
  mounted.mount(host);
  return async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return [...host.querySelectorAll('[role=tab]')].map((b) => b.textContent.trim());
  };
}

function artLayer(project, workspace) {
  project.typeAt(2, 1, 'H', { fg: RED });
  project.commitEdit();
  workspace.selection = { c0: 1, r0: 0, c1: 6, r1: 2 };
  return project.makeArtLayer();
}

test('picking the vector layer shows VECTOR and SAUCE', async () => {
  const { project, workspace } = await blank();
  const names = await tabsOf(workspace);
  expect(await names()).toEqual(['PIXEL', 'ANSI', 'SAUCE']);
  project.addLayer('vector', 'base');
  workspace.pickLayer('vector');
  expect(workspace.pickedLayer).toBe('vector');
  expect(workspace.editorTab).toBe('vector');
  expect(await names()).toEqual(['VECTOR', 'SAUCE']);
});

test('picking the edit layer from VECTOR goes back to the art tab last shown', async () => {
  const { project, workspace } = await blank();
  project.addLayer('vector', 'base');
  workspace.editorTab = 'output';
  workspace.viewTab = 'output';
  workspace.pickLayer('vector');
  workspace.pickLayer('edit');
  expect(workspace.pickedLayer).toBe('edit');
  expect(workspace.editorTab).toBe('output');
});

test('the tab chosen decides the pick: VECTOR picks the vector layer, any other art tab the edit layer', async () => {
  const { workspace } = await blank();
  workspace.editorTab = 'vector';
  expect(workspace.pickedLayer).toBe('vector');
  workspace.editorTab = 'input';
  expect(workspace.pickedLayer).toBe('edit');
  workspace.pickLayer('base');
  workspace.editorTab = 'sauce';
  expect(workspace.pickedLayer).toBe('base');
});

test('Make art layer picks the vector layer', async () => {
  const { project, workspace } = await blank();
  expect(artLayer(project, workspace)).not.toBe(null);
  expect(workspace.pickedLayer).toBe('vector');
});

test('inside an art layer: VECTOR, ANSI and SAUCE, the vector row picked', async () => {
  const { project, workspace } = await blank();
  const key = artLayer(project, workspace);
  expect(isArt(project.shapes.get(key))).toBe(true);
  const names = await tabsOf(workspace);
  expect(project.enterArt(key)).toBe(true);
  workspace.editorTab = 'output';
  expect(await names()).toEqual(['VECTOR', 'ANSI', 'SAUCE']);
  expect(workspace.shownPick).toBe('vector');
  workspace.pickLayer('base');
  expect(workspace.pickedLayer).not.toBe('base');
  expect(project.artInside).toBeTruthy();
  workspace.pickLayer('edit');
  expect(project.artInside).toBeFalsy();
  expect(workspace.shownPick).toBe('edit');
  expect(await names()).toEqual(['PIXEL', 'ANSI', 'SAUCE']);
});

test('a vector layer above the first picked shows VECTOR and SAUCE, and inside an art layer on it VECTOR, ANSI and SAUCE', async () => {
  const { project, workspace } = await blank();
  project.addLayer('vector', 'base'); // the first, 'vector'
  const upper = project.addLayer('vector', 'edit'); // directly above the edit layer: where Make art layer puts the art
  const names = await tabsOf(workspace);
  workspace.pickLayer(upper);
  expect(workspace.editorTab).toBe('vector');
  expect(await names()).toEqual(['VECTOR', 'SAUCE']);
  workspace.pickLayer('edit');
  const key = artLayer(project, workspace);
  expect(project.shapes.get(key).layer).toBe(upper);
  expect(project.enterArt(key)).toBe(true);
  workspace.editorTab = 'output';
  expect(workspace.shownPick).toBe(upper);
  expect(await names()).toEqual(['VECTOR', 'ANSI', 'SAUCE']);
});

test('the vector layer stays when its last shape goes', async () => {
  const { project, workspace } = await blank();
  const key = project.addShape(rectShape(10, 10, 16, 20, { fill: RED }));
  expect(project.hasVectorLayer).toBe(true); // its first shape adds it
  workspace.editorTab = 'output';
  workspace.viewTab = 'output';
  workspace.pickLayer('vector');
  expect(workspace.pickedLayer).toBe('vector');
  project.deleteShapes([key]);
  expect(project.hasVectorLayer).toBe(true);
  expect(workspace.pickedLayer).toBe('vector');
  expect(workspace.editorTab).toBe('vector');
});

test('a picked layer that leaves the stack picks the one under it', async () => {
  const { project, workspace } = await blank();
  const id = project.addLayer('cells', 'edit');
  expect(workspace.pickLayer(id)).toBe(true);
  expect(workspace.pickedLayer).toBe(id);
  expect(project.editId).toBe(id);
  project.layers = project.layers.filter((l) => l.id !== id);
  expect(workspace.pickedLayer).toBe('edit');
  expect(project.editId).toBe('edit'); // the tools draw on the pick
});

test('an artist\'s picked layer that leaves the stack skips the base under it', async () => {
  const { project, workspace } = await blank();
  project.addLayer('vector', 'base');
  workspace.pickLayer('vector');
  project._sharing = { role: 'artist', heard: [] }; // an artist's sharing as flushHeard reads it
  project.layers = project.layers.filter((l) => l.id !== 'vector');
  expect(workspace.pickedLayer).toBe('edit');
  project._sharing = null;
});

test('the art tabs go back to the cells layer last picked, or the topmost while it is gone', async () => {
  const { project, workspace } = await blank();
  const id = project.addLayer('cells', 'edit');
  project.addLayer('vector', 'base');
  workspace.editorTab = 'output';
  workspace.viewTab = 'output';
  workspace.pickLayer('base');
  workspace.pickLayer('vector');
  workspace.editorTab = 'input';
  expect(workspace.pickedLayer).toBe('base');
  workspace.pickLayer('edit');
  workspace.pickLayer('vector');
  project.layers = project.layers.filter((l) => l.id !== 'edit');
  workspace.editorTab = 'output';
  expect(workspace.pickedLayer).toBe(id);
  expect(project.editId).toBe(id);
});

test('a new document picks the edit layer', async () => {
  const { project, workspace } = await blank();
  const id = project.addLayer('cells', 'edit');
  workspace.pickLayer(id);
  await project.setBlankCanvas({ withLayer: true, cols: 10, rows: 10 });
  expect(workspace.pickedLayer).toBe('edit');
});

test('an artist can not pick the base', async () => {
  const { project, workspace } = await blank();
  project._sharing = { role: 'artist', heard: [] }; // an artist's sharing as flushHeard reads it
  workspace.pickLayer('base');
  expect(workspace.pickedLayer).toBe('edit');
  project._sharing = null;
  workspace.pickLayer('base');
  expect(workspace.pickedLayer).toBe('base');
  project._sharing = { role: 'artist', heard: [] }; // an artist's sharing as flushHeard reads it
  expect(workspace.pickedLayer).toBe('edit');
});

test('an artist moved off the base picks the cells layer picked last, or the topmost, and the tools draw on it', async () => {
  const { project, workspace } = await blank();
  const id = project.addLayer('cells', 'edit');
  workspace.pickLayer(id);
  workspace.pickLayer('base');
  project._sharing = { role: 'artist', heard: [] }; // an artist's sharing as flushHeard reads it
  expect(workspace.pickedLayer).toBe(id);
  expect(project.editId).toBe(id);
  project._sharing = null;
});

// A cell with a pin under an edit cell: col 3, row 3.
function pinUnderEdit(project) {
  project.setBaseRecords(withPins(project.baseRecords, [{ col: 3, row: 3, char: 'P' }]));
  project.typeAt(3, 3, 'E', { fg: RED });
  project.commitEdit();
}

// The toolbar's tool ids, as it shows them.
function toolbarIds() {
  const host = document.createElement('div');
  mounted = createApp(EditToolbar).use(i18n);
  mounted.mount(host);
  return async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return [...host.querySelectorAll('[data-tool]')].map((b) => b.dataset.tool);
  };
}

test('every tool is offered with the base picked', async () => {
  const { workspace } = await blank();
  workspace.editorTab = 'output';
  workspace.pickLayer('edit');
  const ids = toolbarIds();
  const onEdit = await ids();
  expect(onEdit).toContain('pencil');
  workspace.outputActiveTool = 'pencil';
  workspace.pickLayer('base');
  expect(await ids()).toEqual(onEdit);
  expect(workspace.outputActiveTool).toBe('pencil'); // the tool out stays out
});

test('the Pencil on the base writes the cell as it shows', async () => {
  const { project, workspace } = await blank();
  const BLUE = '#0000aa';
  project.beginEdit();
  project.writeBaseCells([{ col: 3, row: 3, char: ' ', fg: BLUE, bg: BLUE }, { col: 4, row: 3, char: ' ', fg: BLUE, bg: BLUE }]);
  project.commitEdit();
  await settle(project);
  workspace.editorTab = 'output';
  workspace.pickLayer('base');
  Object.assign(workspace, { pencilDrawWith: 'single', editFgColor: RED, editFgNone: false, editBgNone: true }); // only FG set
  const ctx = { project, workspace, view: 'output' };
  pencil.begin(ctx, { x: 3.5, y: 7 });
  pencil.move(ctx, { x: 3.5, y: 7 }, { x: 4.5, y: 7 });
  pencil.end(ctx);
  await settle(project);
  const char = project.baseRecords.pins.get('3,3');
  expect(char).toMatch(/[─╶╴]/); // a pin is written there
  const cell = project.cells[3 * project.cols + 3];
  expect([cell.char, cell.fg.hex, cell.bg.hex]).toEqual([char, RED, BLUE]); // its FG over what showed
  expect(project.cellsOf('edit').size).toBe(0);
});

test('the Brush on the base paints base pixels', async () => {
  const { project, workspace } = await blank();
  workspace.editorTab = 'input';
  workspace.pickLayer('base');
  Object.assign(workspace, { editFgColor: RED, editBrushSize: 1, editBrushOpacity: 100, editBrushHardness: 100, editBrushFlow: 100 });
  const ctx = { project, workspace, view: 'input' };
  brush.begin(ctx, { x: 5.5, y: 5.5 });
  brush.end(ctx);
  await settle(project);
  const own = project.baseLayer.pixelAt(5, 5);
  expect(own && [own.r, own.g, own.b]).toEqual([255, 0, 0]);
  expect(project.paintOf('edit')?.hasPaint ?? false).toBe(false);
  expect(project.cells[2 * project.cols + 5].fg.hex).toBe(RED); // pixel (5, 5) is cell (5, 2)'s bottom half
  project.undo();
  expect(project.baseLayer.pixelAt(5, 5)).toBe(null);
});

// Typing's three modes on the base (docs/layers.md, Typing): Overwrite replaces the cell; Insert pushes every cell after
// the cursor along, its pixels, pin and all; Partial pushes the pinned characters, each with its colors, and leaves the
// base's paint where it is. Row 1: A and B pinned in red at 1 and 2, blue paint (no pin) at 4.
const BLUE_PAINT = { r: 0, g: 0, b: 255 };
async function baseRow() {
  const app = await blank(), { project, workspace } = app;
  project.beginEdit();
  project.writeBaseCells([{ col: 1, row: 1, char: 'A', fg: RED, bg: '#000000' }, { col: 2, row: 1, char: 'B', fg: RED, bg: '#000000' }]);
  project.writeBase([{ x: 4, y: 2, hex: '#0000ff' }, { x: 4, y: 3, hex: '#0000ff' }]);
  project.commitEdit();
  workspace.pickLayer('base');
  const pins = () => Array.from({ length: 6 }, (_, col) => project.baseRecords.pins.get(`${col},1`) ?? '.').join('');
  const own = (col) => project.baseLayer.pixelAt(col, 2);
  const shown = (col) => { const cell = project.cells[project.cols + col]; return [cell.char, cell.fg.hex]; };
  return { ...app, pins, own, shown };
}

test('Overwrite on the base replaces the cell and moves nothing', async () => {
  const { project, pins, own } = await baseRow();
  expect(project.typeAt(1, 1, 'X', { fg: '#ffffff' })).toBe(true);
  project.commitEdit();
  expect(pins()).toBe('.XB...');
  expect(own(4)).toMatchObject(BLUE_PAINT);
  expect(project.cellsOf('edit').size).toBe(0);
});

test('Insert on the base pushes every cell after the cursor along, paint and all; Delete pulls them back', async () => {
  const { project, pins, own, shown } = await baseRow();
  expect(project.typeAt(1, 1, 'X', { fg: '#ffffff' }, { mode: 'insert' })).toBe(true);
  project.commitEdit();
  await settle(project);
  expect(pins()).toBe('.XAB..');
  expect([shown(1), shown(2), shown(3)]).toEqual([['X', '#ffffff'], ['A', RED], ['B', RED]]);
  expect(own(5)).toMatchObject(BLUE_PAINT); // the paint moved with the row
  expect(own(4)).toMatchObject({ r: 0, g: 0, b: 0 }); // the black that was before it
  expect(project.cellsOf('edit').size).toBe(0);
  project.deleteAt(1, 1, { mode: 'insert' });
  project.commitEdit();
  await settle(project);
  expect(pins()).toBe('.AB...');
  expect(own(4)).toMatchObject(BLUE_PAINT);
  expect(project.baseRecords.pins.get(`${project.cols - 1},1`)).toBe(' '); // the cell left at the row's end: erased
  expect(project.backspaceAt(2, 1, { fg: '#ffffff' }, { mode: 'insert' })).toBe(1);
  project.commitEdit();
  expect(pins()).toBe('.B....');
  expect(own(3)).toMatchObject(BLUE_PAINT);
  project.undo();
  project.undo();
  project.undo();
  await settle(project);
  expect(pins()).toBe('.AB...');
  expect(own(4)).toMatchObject(BLUE_PAINT);
  expect(project.baseRecords.pins.has(`${project.cols - 1},1`)).toBe(false);
});

test('Partial on the base pushes the pinned characters with their colors and leaves the paint; a cell one leaves shows the picture again', async () => {
  const { project, pins, own, shown } = await baseRow();
  expect(project.typeAt(1, 1, 'X', { fg: '#ffffff' }, { mode: 'partial' })).toBe(true);
  project.commitEdit();
  await settle(project);
  expect(pins()).toBe('.XAB..');
  expect([shown(1), shown(2), shown(3)]).toEqual([['X', '#ffffff'], ['A', RED], ['B', RED]]);
  expect(own(4)).toMatchObject(BLUE_PAINT); // the paint, where it was
  expect(own(5)).toBeNull();
  project.deleteAt(1, 1, { mode: 'partial' });
  project.commitEdit();
  await settle(project);
  expect(pins()).toBe('.AB...');
  expect(own(3)).toBeNull(); // B left it: the base's own pixels there are gone, and the picture shows
  expect(shown(2)).toEqual(['B', RED]);
  project.typeAt(3, 1, 'C', { fg: RED }, { mode: 'partial' }); // a character moved onto paint takes its place
  project.typeAt(3, 1, 'D', { fg: RED }, { mode: 'partial' });
  project.commitEdit();
  expect(pins()).toBe('.ABDC.');
  expect(own(4)).toMatchObject({ r: 0, g: 0, b: 0 }); // C's background, over the blue
  project.undo();
  project.undo();
  project.undo();
  await settle(project);
  expect(pins()).toBe('.AB...');
  expect(own(4)).toMatchObject(BLUE_PAINT);
});

test('a space typed on the base puts no foreground color in the cell: its lower pixel stays as it was, in the PIXEL view too', async () => {
  const { project, own } = await baseRow();
  project.typeAt(8, 1, ' ', { fg: RED, bg: '#000000' });
  project.typeAt(9, 1, ' ', { fg: RED }); // BG None
  project.typeAt(1, 1, ' ', { fg: '#00ff00', bg: '#000000' }); // over the red A: its foreground stays, unseen
  project.commitEdit();
  await settle(project);
  expect([8, 9, 1].map((col) => project.baseRecords.pins.get(`${col},1`))).toEqual([' ', ' ', ' ']);
  expect([8, 9].map((col) => [project.rawColorAt(col, 2), project.rawColorAt(col, 3)])).toEqual([['#000000', '#000000'], ['#000000', '#000000']]);
  expect(project.rawColorAt(1, 3)).toBe(RED);
  expect(own(1)).toMatchObject({ r: 0, g: 0, b: 0 });
});

test('Delete on the base in Overwrite mode pulls the pinned characters, as it does a layer\'s', async () => {
  const { project, pins, own } = await baseRow();
  project.deleteAt(1, 1);
  project.commitEdit();
  expect(pins()).toBe('.B....');
  expect(own(4)).toMatchObject(BLUE_PAINT);
});

test('the eraser on the base erases the base, on the edit layer the edit layer', async () => {
  const { project, workspace } = await blank();
  pinUnderEdit(project);
  workspace.editEraserSize = 1;
  const ctx = { project, workspace, view: 'output' };
  const erase = () => { eraser.begin(ctx, { x: 3.5, y: 6.5 }); eraser.end(ctx); };
  workspace.pickLayer('base');
  erase();
  expect(project.baseRecords.pins.get('3,3')).toBe(' '); // the base erased to a pinned space
  expect(project.cellsOf('edit').get('3,3')?.char).toBe('E');
  project.setBaseRecords(withPins(project.baseRecords, [{ col: 3, row: 3, char: 'P' }]));
  workspace.pickLayer('edit');
  erase();
  expect(project.editCellAt(3, 3)).toBeUndefined();
  expect(project.baseRecords.pins.get('3,3')).toBe('P');
});

// Each view has its own Eraser size: the ANSI view's in cells (starting at 1), the PIXEL view's in pixels (5).
test('the eraser in the ANSI view starts at one cell: a click on the base pins one space, whatever the PIXEL view\'s size', async () => {
  const { project, workspace } = await blank();
  expect([workspace.editEraserCells, workspace.editEraserSize]).toEqual([1, 5]);
  const ctx = { project, workspace, view: 'output' };
  workspace.pickLayer('base');
  eraser.begin(ctx, { x: 5.5, y: 8.5 });
  eraser.end(ctx);
  expect([...project.baseRecords.pins.keys()]).toEqual(['5,4']);
  workspace.editEraserCells = 2; // the extra column right, the extra row below
  eraser.begin(ctx, { x: 10.5, y: 8.5 });
  eraser.end(ctx);
  expect([...project.baseRecords.pins.keys()].sort()).toEqual(['10,4', '10,5', '11,4', '11,5', '5,4']);
});

// Selections work on what's shown (workspace.selectionIds), whatever layer is picked; hiding a layer leaves it out.
async function selecting() {
  const app = await blank();
  const { project, workspace } = app;
  pinUnderEdit(project);
  workspace.editorTab = 'output';
  workspace.pickLayer('edit');
  workspace.setActiveTool('select');
  workspace.selection = { c0: 2, r0: 2, c1: 4, r1: 4 };
  mounted = createApp({ setup() { useKeyboardShortcuts(project, workspace); return () => null; } });
  mounted.mount(document.createElement('div'));
  const press = (key, extra = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, ...extra }));
  return { ...app, press };
}
const pin = (project) => project.baseRecords.pins.get('3,3');

test('selectionIds is the shown cells layers, bottom first, whatever is picked', async () => {
  const { project, workspace } = await blank();
  const top = project.addLayer('cells', 'edit');
  project.addLayer('vector', 'base');
  workspace.pickLayer('edit');
  expect(workspace.selectionIds).toEqual(['base', 'edit', top]);
  project.setLayerHidden('base', true);
  expect(workspace.selectionIds).toEqual(['edit', top]);
  workspace.pickLayer('base');
  project.setLayerHidden('edit', true);
  project.setLayerHidden('base', false);
  expect(workspace.selectionIds).toEqual(['base', top]);
});

test('Copy takes every shown layer, the base too with the edit layer picked; a hidden one is left out', async () => {
  const { project, workspace, press } = await selecting();
  const edit = () => workspace.clipboard.parts.find((part) => part.id === 'edit');
  press('c', { ctrlKey: true });
  expect(edit().cells.some(Boolean)).toBe(true);
  expect(workspace.clipboard.base.pins).toContain('P');
  project.setLayerHidden('base', true);
  press('c', { ctrlKey: true });
  expect(edit().cells.some(Boolean)).toBe(true);
  expect(workspace.clipboard.base).toBeUndefined();
  project.setLayerHidden('base', false);
  workspace.pickLayer('base');
  press('c', { ctrlKey: true });
  expect(edit().cells.some(Boolean)).toBe(true);   // the edit layer is shown, though the base is picked
  expect(workspace.clipboard.base.pins).toContain('P');
});

test('the toolbar\'s Copy takes the shown layers too', async () => {
  const { project, workspace } = await blank();
  pinUnderEdit(project);
  workspace.editorTab = 'output';
  workspace.pickLayer('edit');
  workspace.setActiveTool('select');
  workspace.selection = { c0: 2, r0: 2, c1: 4, r1: 4 };
  const host = document.createElement('div');
  document.body.append(host);
  mounted = createApp(EditToolbar).use(i18n);
  mounted.mount(host);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const copy = [...host.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Copy ('));
  copy.click();
  host.remove();
  expect(workspace.clipboard.base.pins).toContain('P');
  expect(workspace.clipboard.parts.map((part) => part.id)).toEqual(['edit']);
  expect(workspace.clipboard.parts[0].cells.some(Boolean)).toBe(true);
});

test('Set FG on a selection recolors every shown layer, the base cell too with the edit layer picked; with the base hidden, only the edit cell', async () => {
  const { project, workspace } = await blank();
  const GREEN = '#00ff00';
  project.setBaseRecords(withPins(project.baseRecords, [{ col: 2, row: 2, char: 'P' }]));
  project.typeAt(3, 3, 'E', { fg: RED });
  project.commitEdit();
  workspace.editorTab = 'output';
  workspace.pickLayer('edit');
  workspace.setActiveTool('select');
  workspace.selection = { c0: 2, r0: 2, c1: 4, r1: 4 };
  workspace.editFgColor = GREEN;
  const host = document.createElement('div');
  document.body.append(host);
  mounted = createApp(EditToolbar).use(i18n);
  mounted.mount(host);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const setFg = () => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Set FG').click();
  project.setLayerHidden('base', true);
  setFg();
  expect(project.editCellAt(3, 3).fg).toBe(GREEN);
  expect(project.completeAt(2, 2).fg).not.toBe(GREEN);
  project.undo();
  project.setLayerHidden('base', false);
  setFg();
  host.remove();
  expect(project.editCellAt(3, 3).fg).toBe(GREEN);
  expect(project.completeAt(2, 2).fg).toBe(GREEN);
});

test('Copy with every layer hidden leaves the clipboard as it was', async () => {
  const { project, workspace, press } = await selecting();
  press('c', { ctrlKey: true });
  const kept = workspace.clipboard;
  project.setLayerHidden('base', true);
  project.setLayerHidden('edit', true);
  press('c', { ctrlKey: true });
  expect(workspace.clipboard).toBe(kept);
});

test('Cut takes and removes every shown layer; with the base hidden, only the edit cell', async () => {
  const { project, workspace, press } = await selecting();
  project.setLayerHidden('base', true);
  press('x', { ctrlKey: true });
  expect(workspace.clipboard.base).toBeUndefined();
  expect(project.editCellAt(3, 3)).toBeUndefined();
  expect(pin(project)).toBe('P');
  project.undo();
  project.setLayerHidden('base', false);
  press('x', { ctrlKey: true });
  expect(workspace.clipboard.base.pins).toContain('P');
  expect(project.editCellAt(3, 3)).toBeUndefined();
  expect(pin(project)).toBe(' ');
});

test('Delete with Select, and a nudge, act on the shown layers; the Wand\'s Delete too', async () => {
  const { project, workspace, press } = await selecting();
  project.setLayerHidden('base', true);
  press('Delete');
  expect(project.editCellAt(3, 3)).toBeUndefined();
  expect(pin(project)).toBe('P');
  project.undo();
  project.setLayerHidden('base', false);
  press('ArrowRight');   // each layer's part moves on its own layer: the edit cell on the edit layer, the pin on the base
  expect(project.editCellAt(4, 3)?.char).toBe('E');
  expect(project.baseRecords.pins.get('4,3')).toBe('P');
  expect(pin(project)).not.toBe('P');
  project.undo();

  workspace.selection = null;
  workspace.setActiveTool('wand');
  const mask = new Uint8Array(20 * 10);
  mask[3 * 20 + 3] = 1;
  workspace.wand = markRaw({ view: 'output', width: 20, height: 10, mask, within: null });
  project.setLayerHidden('base', true);
  press('Delete');
  expect(project.editCellAt(3, 3)).toBeUndefined();
  expect(pin(project)).toBe('P');
  project.undo();
  project.setLayerHidden('base', false);
  press('Delete');
  expect(project.editCellAt(3, 3)).toBeUndefined();
  expect(pin(project)).toBe(' ');
});

test('a new document opens on the edit layer, whatever was picked before', async () => {
  const { project, workspace } = await blank();
  workspace.editorTab = 'output';
  workspace.pickLayer('base');
  await project.setBlankCanvas({ withLayer: true, cols: 10, rows: 10 });
  expect(workspace.pickedLayer).toBe('edit');

  workspace.pickLayer('base');
  const blob = await (await fetch('/tests/fixtures/ansi/past-the-edge.ans')).blob();
  await project.openArtFile(new File([blob], 'past-the-edge.ans'));
  await settle(project);
  expect(workspace.pickedLayer).toBe('edit');
});

test('with the base picked, a tool key chooses any tool, with nothing to say', async () => {
  const { project, workspace } = await blank();
  workspace.editorTab = 'output';
  workspace.pickLayer('base');
  mounted = createApp({ setup() { useKeyboardShortcuts(project, workspace); return () => null; } });
  mounted.mount(document.createElement('div'));
  const press = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
  workspace.setActiveTool('eraser');
  press('p');
  expect(workspace.activeTool).toBe('pencil');
  press('b');
  expect(workspace.activeTool).toBe('brush');
  expect(toastMessage.value).toBeFalsy();
});

test('a document restored with VECTOR showing keeps VECTOR and its vector layer picked', async () => {
  const { project, workspace } = await blank();
  project.addLayer('vector', 'base');
  project.addShape(rectShape(2, 2, 6, 6, { fill: RED }));
  project.commitEdit();
  workspace.pickLayer('vector');
  expect(workspace.editorTab).toBe('vector');
  const { readProject, writeProject } = await import('@/document/projectIO.js');
  const parts = await readProject(await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() }));
  await project.openParts(parts, { filename: 'back', documentId: 'restored' }); // as autosave's restore opens it: a new document id
  await settle(project);
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', 'edit']);
  expect(workspace.editorTab).toBe('vector');
  expect(workspace.pickedLayer).toBe('vector');
});

// A version brought back (restoreVersion's path): autosave's record opened under the same document id.
async function restoreSame(project) {
  const { writeProject } = await import('@/document/projectIO.js');
  const rest = await (await writeProject({ ...await project.projectParts(), imageBuffer: new ArrayBuffer(0) })).arrayBuffer();
  await project.restoreDocument({ record: { rest, filename: project.filename, savedToFile: false, dirty: false }, imageBuffer: project.imageBuffer }, { documentId: project.documentId });
  await settle(project);
}

test('a version brought back, or a file opened, on VECTOR picks the topmost vector layer', async () => {
  const { project, workspace } = await blank();
  project.addLayer('vector', 'base');
  const upper = project.addLayer('vector', 'edit');
  workspace.pickLayer('vector'); // the first one: the open picks the topmost, as from any other tab
  expect(workspace.editorTab).toBe('vector');
  await restoreSame(project);
  expect(workspace.editorTab).toBe('vector');
  expect(workspace.pickedLayer).toBe(upper);
});

test('a version brought back from VECTOR keeps Layer 1\'s cells and VECTOR', async () => {
  const { project, workspace } = await blank();
  const { cellsKey } = await import('../support/app.js');
  project.typeAt(1, 1, 'A', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  project.addLayer('vector', 'base');
  workspace.pickLayer('vector');
  await settle(project);
  const shown = cellsKey(project);
  await restoreSame(project);
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', 'edit']);
  expect(project.cellsOf('edit').has('1,1')).toBe(true);
  expect(cellsKey(project)).toEqual(shown);
  expect(workspace.editorTab).toBe('vector');
  expect(workspace.pickedLayer).toBe('vector');
});

test('a version brought back with a cells layer under the edit layer picked draws on the layer picked', async () => {
  const { project, workspace } = await blank();
  const low = project.addLayer('cells', 'base'); // [base, L1, edit]
  workspace.pickLayer(low);
  project.typeAt(1, 1, 'A', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  await restoreSame(project);
  expect(project.layers.map((l) => l.id)).toEqual(['base', low, 'edit']);
  expect(project.cellsOf(low).has('1,1')).toBe(true);
  expect(project.editId).toBe(workspace.pickedLayer);
});

test('undoing a Delete layer of the picked layer picks it again, and the next stroke lands on it', async () => {
  const { project, workspace } = await blank();
  workspace.pickLayer('edit');
  expect(project.deleteLayer('edit')).toBe(true);
  expect(workspace.pickedLayer).toBe('base');
  project.undo();
  expect(workspace.pickedLayer).toBe('edit');
  project.redo();
  expect(workspace.pickedLayer).toBe('base');
  project.undo();
  expect(workspace.pickedLayer).toBe('edit');
  expect(project.editId).toBe('edit');
  project.paintStroke([{ x: 4, y: 6, alpha: 1 }], RED);
  project.commitEdit();
  expect(project.baseLayer.hasPaint).toBe(false);
  expect(project.paintOf('edit').pixelAt(4, 6)).not.toBe(null);
});

test('undoing a Merge down picks the layer it brings back; a layer picked that the undo doesn\'t bring back stays picked', async () => {
  const { project, workspace } = await blank();
  const top = project.addLayer('cells', 'edit');
  workspace.pickLayer(top);
  project.typeAt(2, 2, 'C', { fg: RED });
  project.commitEdit();
  expect(project.mergeDown(top)).toBe(true);
  expect(workspace.pickedLayer).toBe('edit');
  project.undo();
  expect(workspace.pickedLayer).toBe(top);
  expect(project.editId).toBe(top);
  project.typeAt(3, 3, 'D', { fg: RED });
  project.commitEdit();
  expect([...project.cellsOf(top).keys()]).toEqual(['2,2', '3,3']);
  project.undo(); // the D
  workspace.pickLayer('edit'); // merged from Layer 2's ⋯ with Layer 1 picked, the undo doesn't pick Layer 2
  expect(project.mergeDown(top)).toBe(true);
  project.undo();
  expect(workspace.pickedLayer).toBe('edit');
  expect(project.editId).toBe('edit');
});

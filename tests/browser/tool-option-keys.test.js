// The tools' own keys: a tool's key again steps its kind (Shapes', the Gradient's, Dodge's and Burn's range, VECTOR's
// Shape row), D and Shift+D step Draw with, a digit sets the amount (two quickly, exactly), Shift+[ and Shift+] the
// hardness or the Eraser's edge, and on VECTOR [ and ] a polygon's Sides. None of them while typing in Edit Mode. The
// events are built from the table's keys for the platform the tests run on, with the code they're matched by.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp } from 'vue';
import { createTestApp } from '../support/app.js';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { commandById, commandContext, runCommand } from '@/lib/commands';
import { keysFor, parseKey } from '@/lib/keymap';
import { textKeyAction } from '@/lib/TextKeys';
import vshape from '@/tools/vshape.js';

let app = null;
afterEach(() => {
  app?.unmount();
  app = null;
  vi.restoreAllMocks();
});

async function setup(view = 'output') {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  workspace.editorTab = view;
  app = createApp({ setup() { useKeyboardShortcuts(project, workspace); return () => null; } });
  app.mount(document.createElement('div'));
  return { project, workspace };
}

// What a key types on a US layout, Shift held or not.
const SHIFTED = { BracketLeft: '{', BracketRight: '}' }, PLAIN = { BracketLeft: '[', BracketRight: ']' };
const eventOf = (str, init = {}) => {
  const k = parseKey(str), letter = !k.code && /^[a-z]$/i.test(k.key);
  const code = k.code ?? (letter ? `Key${k.key.toUpperCase()}` : undefined);
  const key = k.code ? (/^Digit/.test(k.code) ? k.code.slice(5) : (k.shift ? SHIFTED : PLAIN)[k.code]) : letter ? (k.shift ? k.key.toUpperCase() : k.key.toLowerCase()) : k.key;
  return new KeyboardEvent('keydown', { code, key, shiftKey: k.shift, altKey: k.alt, bubbles: true, cancelable: true, ...init });
};
const dispatch = (e) => {
  window.dispatchEvent(e);
  return e;
};
const press = (str, init) => dispatch(eventOf(str, init)); // a key by the grammar: 'U', 'Shift+G'
const pressCommand = (id, init) => press(keysFor(commandById(id).keys)[0], init);
const digit = (n) => press(`Digit${n}`);

test('U chooses Shapes, and again steps its kind: Ellipse, Line, then Rectangle; a held U steps nothing', async () => {
  const { workspace } = await setup();
  workspace.setActiveTool('brush');
  expect(press('U').defaultPrevented).toBe(true);
  expect([workspace.activeTool, workspace.shapeKind]).toEqual(['shapes', 'rect']);
  press('U');
  expect(workspace.shapeKind).toBe('ellipse');
  press('U', { repeat: true });
  expect(workspace.shapeKind).toBe('ellipse');
  press('U');
  expect(workspace.shapeKind).toBe('line');
  press('U');
  expect(workspace.shapeKind).toBe('rect');
});

test('Shift+G twice makes the Gradient Spherical; R twice leaves Blur as it was; O again steps Dodge\'s range', async () => {
  const { workspace } = await setup();
  workspace.setActiveTool('pencil');
  press('Shift+G');
  expect([workspace.activeTool, workspace.gradientShape]).toEqual(['gradient', 'linear']);
  press('Shift+G');
  expect(workspace.gradientShape).toBe('spherical');
  press('R');
  expect(press('R').defaultPrevented).toBe(true);
  expect([workspace.activeTool, workspace.retouchRange]).toEqual(['blur', 'midtones']);
  press('O');
  press('O');
  expect([workspace.activeTool, workspace.retouchRange]).toEqual(['dodge', 'highlights']);
});

test('the command list\'s Shapes row with Shapes chosen keeps its kind: the step is the key\'s', async () => {
  const { project, workspace } = await setup();
  workspace.setActiveTool('shapes');
  runCommand('tool.shapes', commandContext(project, workspace));
  expect([workspace.activeTool, workspace.shapeKind]).toEqual(['shapes', 'rect']);
});

test('D with the Pencil in ANSI steps Draw with to Single, Shift+D back; Shapes\' Ellipse skips the line styles', async () => {
  const { workspace } = await setup();
  workspace.setActiveTool('pencil');
  expect(pressCommand('tool.drawWithNext').defaultPrevented).toBe(true);
  expect(workspace.pencilDrawWith).toBe('single');
  pressCommand('tool.drawWithPrev');
  expect(workspace.pencilDrawWith).toBe('normal');
  pressCommand('tool.drawWithPrev'); // wraps to the last
  expect(workspace.pencilDrawWith).toBe('half');
  // Shapes' Draw with hides the line styles for an Ellipse: from Character on, past them to Half-block.
  workspace.setActiveTool('shapes');
  workspace.shapeKind = 'ellipse';
  workspace.shapeDrawWith = 'char';
  pressCommand('tool.drawWithNext');
  expect(workspace.shapeDrawWith).toBe('half');
  workspace.shapeKind = 'rect';
  workspace.shapeDrawWith = 'char';
  pressCommand('tool.drawWithNext');
  expect(workspace.shapeDrawWith).toBe('single');
});

test('D does nothing with a tool that has no Draw with, nor in PIXEL', async () => {
  const { workspace } = await setup('input');
  workspace.setActiveTool('pencil');
  expect(pressCommand('tool.drawWithNext').defaultPrevented).toBe(false);
  expect(workspace.pencilDrawWith).toBe('normal');
});

test('a digit sets the Brush\'s opacity in tens, two within a second exactly; 0 alone is 100', async () => {
  const { workspace } = await setup();
  let now = 10_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  workspace.setActiveTool('brush');
  expect(digit(4).defaultPrevented).toBe(true);
  expect(workspace.editBrushOpacity).toBe(40);
  now += 500;
  digit(5);
  expect(workspace.editBrushOpacity).toBe(45);
  now += 500;
  digit(0); // a third is a first again
  expect(workspace.editBrushOpacity).toBe(100);
  now += 300;
  digit(5);
  expect(workspace.editBrushOpacity).toBe(5);
  now += 300;
  digit(4);
  now += 1000; // too late to join it
  digit(5);
  expect(workspace.editBrushOpacity).toBe(50);
});

test('5 with the Wand sets its tolerance 50; a first digit on another tool\'s amount doesn\'t join it', async () => {
  const { workspace } = await setup();
  vi.spyOn(Date, 'now').mockReturnValue(50_000);
  workspace.setActiveTool('brush');
  digit(4);
  workspace.setActiveTool('wand');
  digit(5);
  expect([workspace.editBrushOpacity, workspace.wandTolerance]).toEqual([40, 50]);
});

test('Shift+] raises the Brush\'s hardness by 10 and Shift+[ lowers it, leaving the size; ] leaves the hardness', async () => {
  const { workspace } = await setup();
  workspace.setActiveTool('brush');
  expect(pressCommand('tool.harder').defaultPrevented).toBe(true);
  expect([workspace.editBrushHardness, workspace.editBrushSize]).toEqual([60, 2.5]);
  pressCommand('tool.softer');
  pressCommand('tool.softer');
  expect([workspace.editBrushHardness, workspace.editBrushSize]).toEqual([40, 2.5]);
  press(']');
  expect([workspace.editBrushHardness, workspace.editBrushSize]).toEqual([40, 3.5]);
  workspace.editBrushHardness = 95;
  pressCommand('tool.harder');
  expect(workspace.editBrushHardness).toBe(100);
});

test('Shift+] makes a Soft Eraser Hard, and Shift+[ makes it Soft again', async () => {
  const { workspace } = await setup();
  workspace.setActiveTool('eraser');
  workspace.editEraserSoft = true;
  pressCommand('tool.harder');
  expect(workspace.editEraserSoft).toBe(false);
  pressCommand('tool.harder');
  expect(workspace.editEraserSoft).toBe(false);
  pressCommand('tool.softer');
  expect(workspace.editEraserSoft).toBe(true);
});

test('Shift+] with a ] that carries Shift on its layout still leaves the size alone', async () => {
  const { workspace } = await setup();
  workspace.setActiveTool('brush');
  dispatch(new KeyboardEvent('keydown', { code: 'BracketRight', key: ']', shiftKey: true, bubbles: true, cancelable: true }));
  expect([workspace.editBrushHardness, workspace.editBrushSize]).toEqual([60, 2.5]);
});

test('[ on VECTOR\'s Shape tool with Polygon takes Sides from 5 to 4; a selected polygon follows, one undo step', async () => {
  const { project, workspace } = await setup('vector');
  workspace.setActiveTool('vshape');
  workspace.vectorShapeKind = 'polygon';
  expect(press('[').defaultPrevented).toBe(true);
  expect(workspace.vectorSides).toBe(4);
  const ctx = { project, workspace, view: 'vector', unit: { x: 8, y: 8 } };
  vshape.begin(ctx, { x: 2, y: 2 }, {});
  vshape.move(ctx, { x: 2, y: 2 }, { x: 12, y: 12 });
  vshape.end(ctx);
  const [key] = workspace.vectorSelected;
  expect(project.shapes.get(key).points).toHaveLength(4);
  press(']');
  press(']');
  expect(project.shapes.get(key).points).toHaveLength(6);
  project.commitPending();
  project.undo();
  expect(project.shapes.get(key).points).toHaveLength(4);
  workspace.vectorShapeKind = 'rect'; // no Sides showing: nothing
  expect(press(']').defaultPrevented).toBe(false);
  // U again steps the VECTOR Shape row.
  press('U');
  expect(workspace.vectorShapeKind).toBe('ellipse');
});

test('with Edit Mode\'s cursor placed none of them run: D and 4 type', async () => {
  const { workspace } = await setup();
  workspace.setActiveTool('brush');
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 0, row: 0 };
  const keys = [eventOf('D'), eventOf('Shift+D'), eventOf('Digit4'), eventOf('Shift+BracketRight'), eventOf('T')];
  for (const e of keys) expect(dispatch(e).defaultPrevented, e.code).toBe(false);
  expect(workspace.textCursor).toEqual({ col: 0, row: 0 });
  expect([workspace.editBrushOpacity, workspace.editBrushHardness]).toEqual([100, 50]);
  expect(textKeyAction(eventOf('D'), { editable: false })).toEqual({ type: 'char', char: 'd' });
  expect(textKeyAction(eventOf('Digit4'), { editable: false })).toEqual({ type: 'char', char: '4' });
});

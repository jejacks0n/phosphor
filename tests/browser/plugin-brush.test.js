// A plugin's brushes as tools: slots, order, keys, options kept in the browser, rooms (tools/index.js, pluginBrush.js).
import { test, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { createTestApp, settle } from '../support/app.js';
import { onPlugin } from '../support/pluginSolvers.js';
import { i18n } from '@/i18n';
import EditToolbar from '@/components/EditToolbar.vue';
import ShortcutsDialog from '@/components/ShortcutsDialog.vue';
import { getTool, toolSlots, pluginTools } from '@/tools';
import { usePluginStore } from '@/store/PluginStore';
import { useRoomStore } from '@/store/RoomStore';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { toastMessage } from '@/composables/useToast';
import { HANG_KEY } from '@/plugins/hangMark';
import { ownHangMark } from '../support/ownHangMark.js';
import { cellIndex, halfColors, mix } from '@/lib/Cells';
import { t } from '@/i18n/index.js';
import builtinBrush from '@/tools/brush';
import '@/assets/global.css'; // the color tokens, for the icon colors

let mounted = null, host = null;
beforeAll(() => page.viewport(1200, 800));
afterAll(() => page.viewport(414, 896));
afterEach(() => { keys?.unmount(); keys = null; mounted?.unmount(); host?.remove(); mounted = host = null; localStorage.clear(); vi.restoreAllMocks(); });

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>';
const brush = (over = {}) => ({
  id: 'smear', name: 'Smear', icon: ICON, key: 'J', size: 'size',
  options: [
    { id: 'size', kind: 'slider', name: 'Size', min: 1, max: 5, step: 0.5, default: 2 },
    { id: 'wet', kind: 'checkbox', name: 'Wet', default: false },
    { id: 'mode', kind: 'choice', name: 'Mode', choices: ['Drag', 'Spread'], default: 0 },
    { id: 'tint', kind: 'color', name: 'Tint', default: '#ff0000' },
  ],
  begin() {}, move() {}, end() {}, ...over,
});
const start = async (tab = 'output') => {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(app.project);
  app.workspace.editorTab = tab;
  return app;
};
let keys = null;
const listen = ({ project, workspace }) => {
  keys = createApp({ setup() { useKeyboardShortcuts(project, workspace); return () => null; } }).use(getActivePinia());
  keys.mount(document.createElement('div'));
};
const mount = async (component) => {
  host = document.createElement('div');
  document.body.append(host);
  mounted = createApp({ render: () => h(component) }).use(getActivePinia()).use(i18n);
  mounted.mount(host);
  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(resolve));
};

test('a brush has a slot after the built-ins in PIXEL and ANSI, not in VECTOR', async () => {
  const app = await start('input');
  const [ref] = (await onPlugin({ brushes: [brush()] })).brushes;
  const last = toolSlots('input', app.project).at(-1);
  expect(last.id).toBe(ref);
  expect(last.tools[0].section).toBe('plugin');
  expect(toolSlots('vector', app.project).some((slot) => slot.id === ref)).toBe(false);
  expect(getTool(ref).title).toBe('Smear (Midnight)');
});

test('two plugins come in the Plugins dialog order, whatever they registered in', async () => {
  const app = await start('input');
  const [b] = (await onPlugin({ brushes: [brush({ id: 'b', key: null })] }, { pluginId: 'phosphor.b' })).brushes;
  const [a] = (await onPlugin({ brushes: [brush({ id: 'a', key: null })] }, { pluginId: 'phosphor.a' })).brushes;
  const names = usePluginStore().plugins.map(({ id }) => id);
  const wanted = [a, b].sort((x, y) => names.indexOf(x.split('/')[0].slice(7)) - names.indexOf(y.split('/')[0].slice(7)));
  expect(pluginTools().map((tool) => tool.id)).toEqual(wanted);
  expect(toolSlots('input', app.project).slice(-2).map((slot) => slot.id)).toEqual(wanted);
});

test('a dropped brush is no tool and the active tool reads Brush; so is a room, plugins off, and its plugin off', async () => {
  const app = await start('input');
  const [ref] = (await onPlugin({ brushes: [brush()] })).brushes;
  app.workspace.setActiveTool(ref);
  expect(app.workspace.activeTool).toBe(ref);
  useRoomStore().role = 'host';
  expect(toolSlots('input', app.project).some((slot) => slot.id === ref)).toBe(false);
  expect(app.workspace.activeTool).toBe('brush');
  useRoomStore().role = null;
  expect(app.workspace.activeTool).toBe(ref);
  usePluginStore().off = true;
  expect(pluginTools()).toEqual([]);
  expect(app.workspace.activeTool).toBe('brush');
  usePluginStore().off = false;
  const plugin = usePluginStore().plugins.find(({ id }) => id === 'phosphor.outlines');
  plugin.enabled = false;
  expect(pluginTools()).toEqual([]);
  expect(app.workspace.activeTool).toBe('brush');
  plugin.enabled = true;
  expect(app.workspace.activeTool).toBe(ref);
  usePluginStore().dropScript('phosphor.outlines');
  expect(getTool(ref).id).toBe('none');
  expect(app.workspace.activeTool).toBe('brush');
});

test('keys: a built-in keeps its key, the earlier plugin keeps its own, and the key chooses the brush', async () => {
  const app = await start('input');
  await onPlugin({ brushes: [brush({ id: 'x', key: 'B' }), brush({ id: 'y', key: 'J' })] }, { pluginId: 'phosphor.a' });
  await onPlugin({ brushes: [brush({ id: 'z', key: 'J' })] }, { pluginId: 'phosphor.b' });
  const keys = Object.fromEntries(pluginTools().map((tool) => [tool.id, tool.keys]));
  expect(keys['plugin:phosphor.a/x']).toEqual([]);
  expect(keys['plugin:phosphor.a/y']).toEqual(['J']);
  expect(keys['plugin:phosphor.b/z']).toEqual([]);
  listen(app);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
  expect(app.workspace.activeTool).toBe('plugin:phosphor.a/y');
});

test('keys: X, L and N (Animate\'s), and D (Draw with) are the editor\'s, so a brush asking for one has none; Shift+X is free', async () => {
  await start('input');
  await onPlugin({ brushes: ['X', 'L', 'Shift+L', 'N', 'Shift+N', 'D', 'Shift+D', 'Shift+X'].map((key, i) => brush({ id: `k${i}`, key })) });
  expect(pluginTools().map((tool) => tool.keys)).toEqual([[], [], [], [], [], [], [], ['Shift+X']]);
});

test('the toolbar draws the options, keeps changes, and ] steps the size to its cap', async () => {
  const app = await start('input');
  const [ref] = (await onPlugin({ brushes: [brush()] })).brushes;
  app.workspace.setActiveTool(ref);
  await mount(EditToolbar);
  expect(host.querySelector('input[type=range]')).toBeTruthy();
  const color = host.querySelector('input[type=color]');
  expect(color.getAttribute('aria-label')).toBe('Tint');
  expect(color.closest('label.color-wrapper').textContent.trim()).toBe('Tint'); // its name beside it, as a slider's and a checkbox's
  expect(color.value).toBe('#ff0000');
  color.value = '#00ff00';
  color.dispatchEvent(new Event('input'));
  expect(app.workspace.pluginTools[`brush:${ref}`].tint).toBe('#00ff00');
  [...host.querySelectorAll('.checkbox-wrapper')].find((l) => l.textContent.trim() === 'Wet').querySelector('input').click();
  expect(app.workspace.pluginTools[`brush:${ref}`].wet).toBe(true);
  const trigger = [...host.querySelectorAll('.option-menu .dropdown-trigger')].at(-1);
  trigger.click();
  await nextTick();
  expect([...host.querySelectorAll('button.choice')].map((b) => b.textContent.trim())).toEqual(['Drag', 'Spread']);
  const spread = [...host.querySelectorAll('button.choice')][1];
  spread.click();
  expect(app.workspace.pluginTools[`brush:${ref}`].mode).toBe(1);
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(JSON.parse(localStorage.getItem('phosphor.pluginTools'))[`brush:${ref}`].mode).toBe(1);
  // A fresh Pinia and workspace read the kept value back through the option's own get.
  const tool = getTool(ref);
  const pinia = getActivePinia(), other = createPinia();
  setActivePinia(other);
  const fresh = useWorkspaceStore(other);
  expect(tool.options.find((o) => o.label === 'Mode').get(fresh)).toBe(1);
  setActivePinia(pinia);
  listen(app);
  const size = tool.options.find((o) => o.size);
  size.set(app.workspace, 4.5);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }));
  expect(size.get(app.workspace)).toBe(5);
  expect(size.decimals).toBe(1);
  // Shift+] is the hardness's, which this brush hasn't: the size stays, even on a layout where ] carries Shift.
  size.set(app.workspace, 4.5);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', code: 'BracketRight', shiftKey: true, bubbles: true }));
  expect(size.get(app.workspace)).toBe(4.5);
});

test('the shortcuts list has a Plugin tools group only with plugin keys', async () => {
  await start('input');
  await mount(ShortcutsDialog);
  const titles = () => [...document.querySelectorAll('h4')].map((h) => h.textContent);
  expect(titles()).not.toContain('Plugin tools');
  mounted.unmount();
  host.remove();
  await onPlugin({ brushes: [brush()] });
  await mount(ShortcutsDialog);
  const group = [...document.querySelectorAll('section')].find((s) => s.querySelector('h4')?.textContent === 'Plugin tools');
  expect(group.querySelector('kbd').textContent).toBe('J');
});

// Painting (pluginBrush.js): a brush's puts laid through the project's paint actions, one undo step a stroke.
const RED = { r: 255, g: 0, b: 0 }, GREEN = { r: 0, g: 255, b: 0 }, BLUE = { r: 0, g: 0, b: 255 };
// A plugin brush whose begin, move and end are the calls given, its tool, and a stroke drawn with it (begin, a move
// between each two points, end): false when begin refused it.
async function painter(calls, { tab = 'input', hash = 'h' } = {}) {
  const app = await start(tab);
  const [ref] = (await onPlugin({ brushes: [brush({ key: null, ...calls })] }, { hash })).brushes;
  const tool = getTool(ref), ctx = { project: app.project, workspace: app.workspace, view: tab };
  const stroke = (points, event = {}) => {
    if (tool.begin(ctx, points[0], event) === false) return false;
    for (let i = 1; i < points.length; i++) tool.move(ctx, points[i - 1], points[i]);
    tool.end(ctx);
    return true;
  };
  return { ...app, ref, tool, ctx, stroke };
}
const at = (x, y) => ({ x: x + 0.5, y: y + 0.5 });
const paintAt = (project, x, y) => project.paintLayer.pixelAt(x, y);

test('a put lays its color at its alpha over what the picked layer had: clear on a layer, white on the base', async () => {
  const { project, workspace, stroke } = await painter({ move(from, to, paint) { paint.put(3, 4, RED, 0.5); } });
  stroke([at(3, 4)]);
  expect(paintAt(project, 3, 4)).toMatchObject({ r: 255, g: 0, b: 0 });
  expect(paintAt(project, 3, 4).a).toBeCloseTo(0.5, 2);
  workspace.pickLayer('base');
  project.paintEditPixels([{ x: 3, y: 4, r: 255, g: 255, b: 255, alpha: 1 }]);
  project.commitEdit();
  stroke([at(3, 4)]);
  expect(project.baseColorAt(3, 4)).toBe('#ff8080');
});

test('the last put to a pixel in a stroke wins, with no build-up', async () => {
  let n = 0;
  const { project, stroke } = await painter({
    move(from, to, paint) {
      if (++n === 1) {
        paint.put(3, 4, RED, 1);
        paint.put(3, 4, GREEN, 0.5);
      } else paint.put(3, 4, BLUE, 0.5);
    },
  });
  stroke([at(3, 4), at(4, 4)]);
  expect(paintAt(project, 3, 4)).toMatchObject({ r: 0, g: 0, b: 255 });
  expect(paintAt(project, 3, 4).a).toBeCloseTo(0.5, 2);
});

test('shown and own read the stroke\'s start, whatever an earlier call put; own is null where a layer is clear, and shown at a: 1 on the base', async () => {
  let n = 0;
  const read = [];
  const { project, workspace, stroke } = await painter({
    move(from, to, paint) {
      if (++n === 1) paint.put(3, 4, RED, 1);
      else read.push([paint.shown(3, 4), paint.own(3, 4), paint.shown(-1, 4), paint.own(3, 99)]);
    },
  });
  stroke([at(3, 4), at(4, 4)]);
  expect(paintAt(project, 3, 4)).toMatchObject({ r: 255, g: 0, b: 0, a: 1 });
  expect(read).toEqual([[{ r: 0, g: 0, b: 0 }, null, null, null]]); // the blank canvas's black; the layer clear
  workspace.pickLayer('base');
  n = 0;
  read.length = 0;
  stroke([at(3, 4), at(4, 4)]);
  expect(project.baseColorAt(3, 4)).toBe('#ff0000');
  expect(read[0][1]).toEqual({ ...read[0][0], a: 1 }); // the base is opaque, and own has an a wherever it isn't null
  expect(read[0][0]).toEqual({ r: 0, g: 0, b: 0 });
});

test('a color is { r, g, b } or [r, g, b], each channel held to 0..255; a write with a channel that isn\'t a finite number is dropped', async () => {
  const { project, stroke } = await painter({
    move(from, to, paint) {
      paint.put(1, 4, [0, 255, 0], 1);
      paint.set(2, 4, [300.4, -20, 127.6], 1);
      paint.put(3, 4, { r: 0, g: 0, b: 999 }, 1);
      paint.put(4, 4, [NaN, 0, 0], 1);
      paint.put(5, 4, { r: Infinity, g: 0, b: 0 }, 1);
      paint.put(6, 4, { r: '255', g: 0, b: 0 }, 1);
      paint.put(7, 4, [255, 0], 1);
    },
  });
  stroke([at(1, 4)]);
  expect(paintAt(project, 1, 4)).toMatchObject({ r: 0, g: 255, b: 0, a: 1 });
  expect(paintAt(project, 2, 4)).toMatchObject({ r: 255, g: 0, b: 128, a: 1 });
  expect(paintAt(project, 3, 4)).toMatchObject({ r: 0, g: 0, b: 255, a: 1 });
  for (const x of [4, 5, 6, 7]) expect(paintAt(project, x, 4), `${x}`).toBe(null);
});

test('a put outside the selection, off the grid or at a fraction is ignored', async () => {
  const { project, workspace, stroke } = await painter({
    move(from, to, paint) {
      for (const [x, y] of [[3, 5], [0, 0], [1.5, 5], [-1, 5], [3, 40]]) paint.put(x, y, RED, 1);
    },
  });
  workspace.selection = { c0: 1, r0: 1, c1: 5, r1: 3 };
  const laid = vi.spyOn(project, 'putEditPixels');
  stroke([at(3, 5)]);
  expect(laid.mock.calls.flatMap(([pixels]) => pixels).map(({ x, y }) => `${x},${y}`)).toEqual(['3,5']); // [3, 40] is off the grid: dropped
  expect(paintAt(project, 3, 5)).toMatchObject({ r: 255, a: 1 });
  for (const [x, y] of [[0, 0], [1, 5], [2, 5], [0, 5]]) expect(paintAt(project, x, y), `${x},${y}`).toBe(null);
});

test('a whole stroke is one undo step', async () => {
  const { project, stroke } = await painter({
    begin(pos, paint) { paint.put(1, 1, RED, 1); },
    move(from, to, paint) { paint.put(Math.floor(to.x), Math.floor(to.y), GREEN, 1); },
    end(paint) { paint.put(9, 9, BLUE, 1); },
  });
  const version = project.history.version;
  stroke([at(2, 2), at(3, 3), at(4, 4), at(5, 5)]);
  expect([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [9, 9]].every(([x, y]) => paintAt(project, x, y)?.a === 1)).toBe(true);
  expect(project.history.version).toBe(version + 1);
  project.undo();
  expect([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [9, 9]].map(([x, y]) => paintAt(project, x, y))).toEqual(Array(6).fill(null));
});

test('on a hidden layer begin is refused with the hidden toast, and the plugin is never called', async () => {
  const calls = [];
  const { project, stroke } = await painter({ begin() { calls.push('begin'); }, move() { calls.push('move'); } });
  project.setLayerHidden(project.editId, true);
  toastMessage.value = null;
  expect(stroke([at(3, 4)])).toBe(false);
  expect(toastMessage.value).toBe(t('layers.hiddenToast'));
  expect(calls).toEqual([]);
});

test('Shift-click is one move from the last stroke\'s end', async () => {
  const moves = [];
  const { stroke } = await painter({ move(from, to) { moves.push([from, to]); } });
  stroke([{ x: 2, y: 2 }, { x: 8, y: 2 }]);
  moves.length = 0;
  stroke([{ x: 5, y: 10 }], { shiftKey: true });
  expect(moves).toEqual([[{ x: 8, y: 2 }, { x: 5, y: 10 }]]);
});

test('a brush that throws: its stroke is taken back, no undo step, nothing more is called, and it says so', async () => {
  let n = 0, ended = false;
  const { project, tool, ctx } = await painter({
    move(from, to, paint) {
      if (++n === 1) paint.put(3, 4, RED, 1);
      else throw new Error('boom');
    },
    end() { ended = true; },
  });
  const version = project.history.version, last = project.history.last;
  toastMessage.value = null;
  tool.begin(ctx, at(3, 4), {});
  expect(paintAt(project, 3, 4)).toMatchObject({ r: 255 });
  tool.move(ctx, at(3, 4), at(4, 4)); // throws
  tool.move(ctx, at(4, 4), at(5, 4));
  tool.end(ctx);
  expect(paintAt(project, 3, 4)).toBe(null);
  expect([project.history.version, project.history.last, project._stroke]).toEqual([version, last, null]);
  expect([n, ended]).toEqual([2, false]);
  expect(toastMessage.value).toBe('Smear failed: boom');
  expect(usePluginStore().problems['phosphor.outlines']).toBe('Smear failed: boom');
});

test('R5: in ANSI a put makes the cells Colors only would: a ▄ where a layer\'s own cell shows no character, as the Brush\'s', async () => {
  const { project, workspace, stroke } = await painter({ move(from, to, paint) { paint.put(Math.floor(to.x), Math.floor(to.y), paint.fg, 1); } }, { tab: 'output' });
  project.writeEditCells([
    { col: 5, row: 5, attrs: { char: ' ', fg: '#ff0000' } },                // shows nothing: the black background
    { col: 6, row: 5, attrs: { char: ' ', fg: '#000000', bg: '#0000ff' } }, // shows its blue background
    { col: 12, row: 5, attrs: { char: '%', fg: '#ff0000' } },               // a character with ink
  ]);
  project.commitEdit();
  await settle(project);
  Object.assign(workspace, { editFgColor: '#ffffff', brushDrawWith: 'normal', editBrushSize: 1, editBrushHardness: 100, editBrushFlow: 100, editBrushOpacity: 100 });
  const look = () => [5, 6, 12].map((col) => [project.editCellAt(col, 5), project.cells[cellIndex(col, 5, project.cols)].char, paintAt(project, col, 10), paintAt(project, col, 11)]);
  const draw = (tool) => {
    for (const col of [5, 6, 12]) {
      const ctx = { project, workspace, view: 'output' };
      if (tool) {
        tool.begin(ctx, at(col, 10), {});
        tool.end(ctx);
      } else stroke([at(col, 10)]);
    }
  };
  draw(null);
  await settle(project);
  const plugin = look();
  expect(plugin.map(([entry]) => entry?.char)).toEqual(['▄', '▄', '%']);
  for (let i = 0; i < 3; i++) project.undo();
  await settle(project);
  draw(builtinBrush);
  await settle(project);
  expect(plugin).toEqual(look());
});

test('a brush\'s first begin, move and end of a visit each run under the hang mark, and later ones don\'t', async () => {
  ownHangMark('plugin-brush');
  const marks = [];
  const mark = (hook) => () => { marks.push([hook, JSON.parse(localStorage.getItem(HANG_KEY))?.pluginId ?? null]); };
  const { stroke } = await painter({ begin: mark('begin'), move: mark('move'), end: mark('end') }, { hash: 'hang' });
  stroke([at(3, 4), at(4, 4)]);
  stroke([at(3, 4)]);
  const marked = 'phosphor.outlines';
  expect(marks).toEqual([
    ['begin', marked], ['move', marked], ['move', null], ['end', marked],
    ['begin', null], ['move', null], ['end', null],
  ]);
  expect(localStorage.getItem(HANG_KEY)).toBe(null);
});

test('dab takes a size that is a number, up to the Brush\'s largest, and a hardness between 0 and 1', async () => {
  const dabs = [];
  const { stroke } = await painter({ move(from, to, paint) { dabs.push([NaN, 'x', Infinity, 1e9, 25, 30].map((size) => paint.dab(from, from, size, 1).length)); dabs.push(paint.dab(from, from, 20, NaN).length, paint.dab(from, from, 20, 1).length); } });
  stroke([{ x: 10, y: 10 }]);
  const [[nan, text, infinity, huge, past, thirty], soft, hard] = dabs;
  expect([nan, text, infinity]).toEqual([0, 0, 0]);
  expect(huge).toBe(past);
  expect(past).toBe(thirty);
  expect(past).toBe(hard); // the Brush's largest, 20, whatever was asked above it
  expect(soft).toBe(hard);
});

test('an error\'s words are cut short in the toast and the plugin\'s row', async () => {
  const { tool, ctx } = await painter({ move() { throw new Error('x'.repeat(5000)); } });
  toastMessage.value = null;
  tool.begin(ctx, at(3, 4), {});
  tool.end(ctx);
  expect(toastMessage.value.length).toBeLessThan(300);
  expect(usePluginStore().problems['phosphor.outlines']).toBe(toastMessage.value);
});

test('the plugins reloaded mid-stroke: the stroke ends on the script it began on, as one undo step, nothing left open', async () => {
  const { project, ref, tool, ctx } = await painter({
    move(from, to, paint) { paint.put(Math.floor(to.x), Math.floor(to.y), RED, 1); },
    end(paint) { paint.put(9, 9, GREEN, 1); },
  }, { hash: 'one' });
  const version = project.history.version;
  tool.begin(ctx, at(2, 2), {});
  tool.move(ctx, at(2, 2), at(3, 3));
  // A Reload: the script is registered again, a new stamp, the tools made again, the brush's script now another.
  await onPlugin({ brushes: [brush({ key: null, move(from, to, paint) { paint.put(0, 0, BLUE, 1); } })] }, { hash: 'two' });
  const rebuilt = getTool(ref);
  expect(rebuilt).not.toBe(tool);
  rebuilt.move(ctx, at(3, 3), at(4, 4));
  rebuilt.end(ctx);
  expect(project._stroke).toBe(null);
  expect(project.history.version).toBe(version + 1);
  expect([[2, 2], [3, 3], [4, 4], [9, 9]].map(([x, y]) => paintAt(project, x, y)?.g)).toEqual([0, 0, 0, 255]);
  expect(paintAt(project, 0, 0)).toBe(null); // the new script wasn't part of it
  project.undo();
  expect([[2, 2], [3, 3], [4, 4], [9, 9]].map(([x, y]) => paintAt(project, x, y))).toEqual(Array(4).fill(null));
});

test('a choice option with no glyphs has no empty glyph column, and a currentColor icon is the color of the built-ins\'', async () => {
  const app = await start('input');
  const stroked = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2 12C5 12 6 6 9 6" fill="none" stroke="currentColor"/><circle cx="3" cy="12" r="2" fill="currentColor"/></svg>';
  const [ref] = (await onPlugin({ brushes: [brush({ icon: stroked })] })).brushes;
  app.workspace.setActiveTool(ref);
  await mount(EditToolbar);
  [...host.querySelectorAll('.option-menu .dropdown-trigger')].at(-1).click();
  await nextTick();
  const choice = [...host.querySelectorAll('button.choice')].find((b) => b.textContent.trim() === 'Drag');
  expect(choice.querySelector('span.glyph')).toBeNull();
  // A built-in's paths take the fill the toolbar gives its svg (faint, lit when active); currentColor is that fill too.
  const plugin = [...host.querySelectorAll('svg')].find((svg) => svg.querySelector('circle[fill]'));
  for (const active of [true, false]) {
    app.workspace.setActiveTool(active ? ref : 'brush');
    await nextTick();
    const fill = getComputedStyle(plugin).fill;
    expect(fill).toBe(active ? 'rgb(255, 255, 255)' : getComputedStyle(host.querySelector('button:not(.active):not(.primary) > svg')).fill);
    expect(getComputedStyle(plugin.querySelector('circle')).fill).toBe(fill);
    expect(getComputedStyle(plugin.querySelector('path')).stroke).toBe(fill);
  }
});

// R5 (docs/model.md): a plugin brush's paint is laid as the Brush's Colors only is, so over a character of the layer's
// own with ink it's paint over the letter, which tints it (R2). The brush reads and writes paint, never characters.
const shownAt = (project, col, row) => { const cell = project.cells[cellIndex(col, row, project.cols)]; return [cell.char, cell.fg.c, cell.bg.c]; };
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 2);

for (const tab of ['input', 'output']) {
  test(`R5: in ${tab === 'input' ? 'PIXEL' : 'ANSI'} a put at half alpha over a letter of the layer's own tints it as the Brush at 50% does`, async () => {
    const { project, workspace, stroke, ctx } = await painter({ move(from, to, paint) { for (const { x, y } of paint.dab(from, to, 4, 1)) paint.put(x, y, RED, 0.5); } }, { tab });
    project.typeAt(5, 2, 'A', { fg: '#ffffff', bg: '#0000ff' });
    project.commitPending();
    await settle(project);
    Object.assign(workspace, { editFgColor: '#ff0000', brushDrawWith: 'normal', editBrushSize: 4, editBrushHardness: 100, editBrushFlow: 100, editBrushOpacity: 50 });
    builtinBrush.begin(ctx, { x: 5.5, y: 5 }, {});
    builtinBrush.end(ctx);
    await settle(project);
    const [char, fg, bg] = shownAt(project, 5, 2), paint = paintAt(project, 5, 4);
    expect([char, near(fg, [255, 127, 127]), near(bg, [128, 0, 127])]).toEqual(['A', true, true]); // pink on purple: still a letter
    project.undo();
    stroke([{ x: 5.5, y: 5 }]);
    await settle(project);
    const [char2, fg2, bg2] = shownAt(project, 5, 2), paint2 = paintAt(project, 5, 4);
    expect([char2, near(fg2, fg), near(bg2, bg)]).toEqual(['A', true, true]);
    expect(paint2).toMatchObject({ r: paint.r, g: paint.g, b: paint.b });
    expect(paint2.a).toBeCloseTo(paint.a, 1);
    expect(project.editCellAt(5, 2)).toMatchObject({ char: 'A', fg: '#ffffff', bg: '#0000ff' });
  });
}

// The cells a brush can meet on a layer: clear, painted, a letter with and without paint over it, a blank cell of the
// layer's own in a color (paint to Colors only), and a frozen one.
async function meadow(calls) {
  const made = await painter(calls, { tab: 'output' });
  const { project } = made;
  project.putEditPixels([{ x: 2, y: 4, r: 10, g: 200, b: 30, a: 0.5 }, { x: 8, y: 4, r: 200, g: 100, b: 0, a: 0.25 }]);
  project.writeEditCells([
    { col: 6, row: 2, attrs: { char: 'A', fg: '#ffffff', bg: '#0000ff' } },
    { col: 8, row: 2, attrs: { char: 'B', fg: '#ffffff', bg: '#0000ff' } },                    // with paint over it (8, 4)
    { col: 10, row: 2, attrs: { char: ' ', fg: '#000000', bg: '#0000ff' } },                  // shows its blue: paint to Colors only
  ]);
  project.commitEdit();
  project.putEditPixels([{ x: 12, y: 4, r: 9, g: 9, b: 9, a: 1 }, { x: 12, y: 5, r: 9, g: 9, b: 9, a: 1 }]);
  project.commitEdit();
  project.setEditCells(new Map([...project.editCells, ['12,2', Object.freeze({ char: '%', fg: '#ff0000', bg: '#ffffff', frozen: true })]]), ['12,2']);
  await settle(project);
  return made;
}
const SPOTS = [[0, 4], [2, 4], [6, 4], [8, 4], [10, 4], [12, 4]]; // clear, paint, a letter, a letter under paint, a colored blank, frozen

test('own reads the paint a write lands on: a letter reads as the paint over it, a colored blank cell as its color, and written back nothing changes', async () => {
  const read = [];
  const { project, stroke } = await meadow({
    move(from, to, paint) {
      for (const [x, y] of SPOTS) {
        const own = paint.own(x, y);
        read.push(own);
        paint.set(x, y, own, own ? own.a : 0);
      }
    },
  });
  const cells = () => JSON.stringify([[...project.editCells], SPOTS.map(([x, y]) => paintAt(project, x, y))]);
  const before = cells(), version = project.history.version;
  stroke([at(0, 4)]);
  expect(read[0]).toBe(null);
  expect(near([read[1].r, read[1].g, read[1].b], [10, 200, 30])).toBe(true); // kept at half alpha: a step of rounding
  expect(read[2]).toBe(null);                                   // the letter isn't paint
  expect(near([read[3].r, read[3].g, read[3].b], [200, 100, 0])).toBe(true); // the paint over the letter
  expect(read[3].a).toBeCloseTo(0.25, 2);
  expect(read[4]).toMatchObject({ r: 0, g: 0, b: 255, a: 1 });  // what it shows, which Colors only makes paint of
  expect(read[5]).toMatchObject({ r: 9, g: 9, b: 9, a: 1 });    // a frozen cell's paint, under it
  expect(cells()).toBe(before);
  expect([project.history.version, project._stroke]).toEqual([version, null]);
});

test('set makes a pixel\'s paint exactly a color at an alpha, and clears it at 0, where put lays over what was there', async () => {
  let call = 0;
  const { project, workspace, stroke } = await meadow({
    move(from, to, paint) {
      if (++call > 1) return;
      paint.set(2, 4, RED, 0.25);          // over paint at 0.5: thinner, where a put could only add
      paint.set(8, 4, null, 0);            // the paint over a letter cleared: the letter stays
      paint.set(0, 4, BLUE, 0.5);
      paint.put(0, 5, BLUE, 1);
      paint.set(0, 5, GREEN, 1);           // the last write to a pixel wins, whichever call made it
      paint.set(0, 6, RED, 1);
      paint.put(0, 6, GREEN, 0.5);         // over what the stroke began with (clear), not over the red
      paint.set(1, 4, RED, NaN);           // not a number: ignored
      paint.set(1.5, 4, RED, 1);
      paint.set(1, 99, RED, 1);
      paint.set(14, 4, null, 0);           // clear already: nothing to do
    },
  });
  const version = project.history.version;
  stroke([at(0, 4)]);
  await settle(project);
  expect(paintAt(project, 2, 4)).toMatchObject({ r: 255, g: 0, b: 0 });
  expect(paintAt(project, 2, 4).a).toBeCloseTo(0.25, 2);
  expect(paintAt(project, 8, 4)).toBe(null);
  expect(project.editCellAt(8, 2)).toMatchObject({ char: 'B', fg: '#ffffff', bg: '#0000ff' });
  expect(paintAt(project, 0, 4).a).toBeCloseTo(0.5, 2);
  expect(paintAt(project, 0, 5)).toMatchObject({ r: 0, g: 255, b: 0, a: 1 });
  expect(paintAt(project, 0, 6)).toMatchObject({ r: 0, g: 255, b: 0 });
  expect(paintAt(project, 0, 6).a).toBeCloseTo(0.5, 2);
  expect(paintAt(project, 1, 4)).toBe(null);
  expect(project.editCellAt(7, 2)).toBe(undefined); // (14, 4)'s cell: a clear pixel cleared leaves no ▄ behind
  expect(project.history.version).toBe(version + 1);
  // On the base, where every pixel is opaque, set is put: the color at its alpha over what shows.
  workspace.pickLayer('base');
  call = 0;
  stroke([at(0, 4)]);
  expect(project.baseColorAt(0, 4)).toBe('#000080');
});

// shown is what shows at a pixel up to the picked layer: paint, and the cells typed or pasted there or on a layer under
// it, a character as its ink over its background at pixel scale. Not paint alone: a block of colored spaces is color.
const WHITE = { r: 255, g: 255, b: 255 }, DEEP = { r: 0, g: 0, b: 255 };
test('shown reads what shows at a pixel: paint, a blank cell in a color, a letter as it looks, on the layer and on one under it', async () => {
  const read = [];
  const { project, workspace, stroke } = await meadow({ move(from, to, paint) { read.push(SPOTS.map(([x, y]) => [paint.shown(x, y), paint.own(x, y)])); } });
  const close = (color, want, what) => expect(near([color.r, color.g, color.b], [want.r, want.g, want.b]), `${what}: ${JSON.stringify(color)} for ${JSON.stringify(want)}`).toBe(true);
  const expected = [
    { r: 0, g: 0, b: 0 },                                          // clear: the black canvas under it
    mix({ r: 0, g: 0, b: 0 }, { r: 10, g: 200, b: 30 }, 0.5),      // paint at half over it
    halfColors({ char: 'A', bg: DEEP, fg: WHITE })[0],             // the top half of a white A on blue
    halfColors({ char: 'B', bg: mix(DEEP, { r: 200, g: 100, b: 0 }, 0.25), fg: WHITE })[0], // a B whose background the paint over it tints
    DEEP,                                                          // a blank cell in blue
    { r: 9, g: 9, b: 9 },                                          // a frozen cell: the paint under it
  ];
  stroke([at(0, 4)]);
  read[0].forEach(([shown], i) => close(shown, expected[i], `spot ${i}`));
  // From a layer above, the same shows through, and none of it is that layer's own.
  workspace.pickLayer(project.addLayer('cells', project.editId));
  stroke([at(0, 4)]);
  read[1].forEach(([shown, own], i) => {
    close(shown, expected[i], `from above, spot ${i}`);
    expect(own).toBe(null);
  });
});

// Both pixels of each cell, as a dab covers them: paint over a letter tints its background from the top half and its
// ink from the bottom (R2), so one half alone isn't paint over that half's look.
test('a put lands over what shown read, whatever is there: read again, the pixel is that much of the way to the color', async () => {
  let pass = 0;
  const read = [[], []];
  const { stroke } = await meadow({
    move(from, to, paint) {
      for (const [x, y] of SPOTS) {
        read[pass].push(paint.shown(x, y));
        if (pass === 0) for (const py of [y, y + 1]) paint.put(x, py, RED, 0.5);
      }
    },
  });
  stroke([at(0, 4)]);
  pass = 1;
  stroke([at(0, 4)]);
  read[0].forEach((was, i) => {
    const want = mix(was, RED, 0.5), got = read[1][i];
    expect(near([got.r, got.g, got.b], [want.r, want.g, want.b]), `spot ${i}: ${JSON.stringify(got)} for ${JSON.stringify(want)}`).toBe(true);
  });
});

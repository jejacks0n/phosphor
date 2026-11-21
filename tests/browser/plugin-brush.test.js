// A plugin's brushes as tools: slots, order, keys, options kept in the browser, rooms (tools/index.js, pluginBrush.js).
import { test, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { createTestApp, settle } from '../support/app.js';
import { onPlugin } from '../support/pluginSolvers.js';
import { i18n } from '@/i18n';
import EditToolbar from '@/components/EditToolbar.vue';
import ShortcutsDialog from '@/components/ShortcutsDialog.vue';
import { getTool, toolSlots, pluginTools } from '@/tools';
import { usePluginStore } from '@/store/PluginStore';
import { useRoomStore } from '@/store/RoomStore';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';

let mounted = null, host = null;
beforeAll(() => page.viewport(1200, 800));
afterAll(() => page.viewport(414, 896));
afterEach(() => { keys?.unmount(); keys = null; mounted?.unmount(); host?.remove(); mounted = host = null; localStorage.clear(); });

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

test('a dropped brush is no tool and the active tool reads Brush; so is a room', async () => {
  const app = await start('input');
  const [ref] = (await onPlugin({ brushes: [brush()] })).brushes;
  app.workspace.setActiveTool(ref);
  expect(app.workspace.activeTool).toBe(ref);
  useRoomStore().role = 'host';
  expect(toolSlots('input', app.project).some((slot) => slot.id === ref)).toBe(false);
  expect(app.workspace.activeTool).toBe('brush');
  useRoomStore().role = null;
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

test('the toolbar draws the options, keeps changes, and ] steps the size to its cap', async () => {
  const app = await start('input');
  const [ref] = (await onPlugin({ brushes: [brush()] })).brushes;
  app.workspace.setActiveTool(ref);
  await mount(EditToolbar);
  expect(host.querySelector('input[type=range]')).toBeTruthy();
  const color = host.querySelector('input[type=color]');
  expect(color.getAttribute('aria-label')).toBe('Tint');
  expect(color.value).toBe('#ff0000');
  color.value = '#00ff00';
  color.dispatchEvent(new Event('input'));
  expect(app.workspace.pluginTools[ref].tint).toBe('#00ff00');
  [...host.querySelectorAll('.checkbox-wrapper')].find((l) => l.textContent.trim() === 'Wet').querySelector('input').click();
  expect(app.workspace.pluginTools[ref].wet).toBe(true);
  const trigger = [...host.querySelectorAll('.option-menu .dropdown-trigger')].at(-1);
  trigger.click();
  await nextTick();
  expect([...host.querySelectorAll('button.choice')].map((b) => b.textContent.trim())).toEqual(['Drag', 'Spread']);
  const spread = [...host.querySelectorAll('button.choice')][1];
  spread.click();
  expect(app.workspace.pluginTools[ref].mode).toBe(1);
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(JSON.parse(localStorage.getItem('phosphor.pluginTools'))[ref].mode).toBe(1);
  listen(app);
  const tool = getTool(ref);
  const size = tool.options.find((o) => o.size);
  size.set(app.workspace, 4.5);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }));
  expect(size.get(app.workspace)).toBe(5);
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

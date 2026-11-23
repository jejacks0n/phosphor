// The editor's own choices (store/kept.js): the colors, the tool on each tab and the tools' options are kept in this
// browser, so a new page (a reload, a crash) brings them back, and New project leaves them.
import { test, expect, vi } from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createTestApp, settle } from '../support/app.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { TOOLS } from '@/tools/index.js';
import { KEPT, TAB_TOOLS } from '@/store/kept.js';

async function setup() {
  const stores = await createTestApp();
  await stores.project.setBlankCanvas({ withLayer: true, cols: 20, rows: 10 });
  await settle(stores.project);
  return stores;
}

// The workspace a new page makes: its own Pinia, with only what this browser kept.
function reloaded() {
  setActivePinia(createPinia());
  return useWorkspaceStore();
}

test('the colors, the tool on each tab and the tools\' options come back on a new page', async () => {
  const { workspace } = await setup();
  workspace.setColor('fg', '#123456');
  workspace.setColor('bg', null);
  workspace.editorTab = 'output';
  workspace.setActiveTool('wand');
  workspace.editorTab = 'vector';
  workspace.setActiveTool('pen');
  workspace.editBrushSize = 9;
  workspace.bucketMatch.char = false;
  workspace.pickLayers = { fg: false, bg: true };
  workspace.vectorStyle = { ...workspace.vectorStyle, stroke: '#ff00ff', width: 3 };
  workspace.activeChar = '▒';
  await nextTick();
  const again = reloaded();
  expect(again.editFgColor).toBe('#123456');
  expect(again.editBgNone).toBe(true);
  expect(again.outputActiveTool).toBe('wand');
  expect(again.slotFaces.select).toBe('wand');
  expect(again.vectorActiveTool).toBe('pen');
  expect(again.inputActiveTool).toBe('brush');
  expect(again.editBrushSize).toBe(9);
  expect(again.bucketMatch).toEqual({ fg: true, bg: true, char: false });
  expect(again.pickLayers).toEqual({ fg: false, bg: true });
  expect(again.vectorStyle).toMatchObject({ fill: 'fg', stroke: '#ff00ff', width: 3 });
  expect(again.activeChar).toBe('▒');
});

test('the moment\'s state starts over', async () => {
  const { workspace } = await setup();
  workspace.selection = { c0: 0, r0: 0, c1: 2, r1: 2 };
  workspace.inputScrollX = 40;
  workspace.colorBox = 'fg';
  await nextTick();
  const again = reloaded();
  expect(again.selection).toBeNull();
  expect(again.inputScrollX).toBeNull();
  expect(again.colorBox).toBeNull();
});

test('a tool held with a key is not kept as the tab\'s tool', async () => {
  const { workspace } = await setup();
  workspace.setActiveTool('bucket');
  await nextTick();
  workspace.holdTool('picker', 'alt');
  await nextTick();
  expect(workspace.inputActiveTool).toBe('picker');
  expect(reloaded().inputActiveTool).toBe('bucket'); // a crash with Alt down
  setActivePinia(workspace.$pinia);   // a tool chosen while one's held is chosen
  workspace.setActiveTool('eraser');
  await nextTick();
  expect(reloaded().inputActiveTool).toBe('eraser');
});

test('they stay as they are for New project and a drawing opened', async () => {
  const { project, workspace } = await setup();
  workspace.setColor('fg', '#abcdef');
  workspace.setActiveTool('pencil');
  workspace.wandTolerance = 40;
  expect(await workspace.newProject()).toBe(true);
  expect(workspace.editFgColor).toBe('#abcdef');
  expect(workspace.inputActiveTool).toBe('pencil');
  expect(workspace.wandTolerance).toBe(40);
  await project.setBlankCanvas({ withLayer: true, cols: 10, rows: 10 });
  await settle(project);
  expect(workspace.editFgColor).toBe('#abcdef');
  expect(workspace.inputActiveTool).toBe('pencil');
});

test('what this browser holds that is not good now starts at the default', async () => {
  await setup();
  localStorage.setItem('phosphor.inputActiveTool', '"lasso"');
  localStorage.setItem('phosphor.editBrushSize', '99');
  localStorage.setItem('phosphor.editFgColor', 'not json');
  localStorage.setItem('phosphor.wandMatch', '{"fg":false,"bg":"yes"}');
  const again = reloaded();
  expect(again.inputActiveTool).toBe('brush');
  expect(again.editBrushSize).toBe(2.5);
  expect(again.editFgColor).toBe('#ffffff');
  expect(again.wandMatch).toEqual({ fg: false, bg: false, char: true });
});

test('a plugin brush that is not installed is the Brush, until it is', async () => {
  await setup();
  localStorage.setItem('phosphor.inputActiveTool', '"plugin:phosphor.smear/smear"');
  const again = reloaded();
  expect(again.inputActiveTool).toBe('plugin:phosphor.smear/smear');
  expect(again.activeTool).toBe('brush');
});

test('a browser that keeps nothing gives the defaults', async () => {
  await setup();
  const getItem = Storage.prototype.getItem;
  Storage.prototype.getItem = () => { throw new Error('storage blocked'); };
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {}); // the workspace's other kept fields say so
  try {
    const again = reloaded();
    expect(again.editFgColor).toBe('#ffffff');
    expect(again.outputActiveTool).toBe('hand');
  } finally {
    Storage.prototype.getItem = getItem;
    logged.mockRestore();
  }
});

// The kept tool lists and options are written out in kept.js, which can't import the tools: they must agree with them.
test('each tab\'s tools are the ones kept.js knows', () => {
  for (const tab of ['input', 'output', 'vector']) {
    expect([...TAB_TOOLS[tab]].sort()).toEqual(TOOLS.filter((tool) => tool.views.includes(tab)).map((tool) => tool.id).sort());
  }
});

test('every built-in tool option is kept, with the values the toolbar offers', async () => {
  await setup();
  const elsewhere = ['rulers', 'rulerOpacity']; // the Hand's, kept on their own (WorkspaceStore)
  for (const tool of TOOLS) {
    for (const option of tool.options ?? []) {
      if (elsewhere.includes(option.key)) continue;
      const entry = KEPT.find((e) => e.key === option.key);
      expect(entry, `${tool.id}: ${option.key}`).toBeDefined();
      if (entry.clean) {
        if (option.options) expect(Object.keys(entry.clean(null, entry.default()))).toEqual(option.options.map((o) => o.key));
        continue;
      }
      if (option.min !== undefined) {
        expect(entry.good(option.min) && entry.good(option.max), `${option.key}'s range`).toBe(true);
        expect(entry.good(option.min - 0.01) || entry.good(option.max + 0.01), `${option.key}'s range`).toBe(false);
      }
      for (const choice of option.choices ?? []) expect(entry.good(choice.value), `${option.key}: ${choice.value}`).toBe(true);
    }
  }
});

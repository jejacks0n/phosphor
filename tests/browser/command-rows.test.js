// The command list's rows that have no key: the drawing's, the layers', VECTOR's, the room's, and each tool option's,
// each running what its button runs (the same shared function) and, when it can't run, saying the button's reason.
import { test, expect, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { setLocale, te } from '@/i18n';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { COMMANDS, commandById, commandContext, listedCommands, optionCommands, reasonWords, runCommand } from '@/lib/commands';
import { offeredTools } from '@/tools';
import { searchCommands } from '@/lib/commandSearch';
import { rectShape } from '@/document/shapes.js';
import { makeArt } from '@/document/artLayers.js';
import { useRoomStore } from '@/store/RoomStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { MOST_LAYERS } from '@/document/layerInfo.js';
import { getActivePinia } from 'pinia';
import EditToolbar from '@/components/EditToolbar.vue';
import ControlPanel from '@/components/ControlPanel.vue';
import { i18n } from '@/i18n';

const ctxOf = (project, workspace) => commandContext(project, workspace);
const words = (c) => (c.title ?? c.label)();
const reasonOf = (id, project, workspace) => {
  const reason = commandById(id).available(ctxOf(project, workspace));
  return reason === true ? true : reasonWords(reason);
};

async function drawing() {
  const stores = await createTestApp();
  await stores.project.setBlankCanvas({ withLayer: true, cols: 20, rows: 10 });
  await settle(stores.project);
  stores.workspace.editorTab = 'output';
  return stores;
}

test('Layer: Duplicate duplicates the picked layer; on the base it is unavailable and says why', async () => {
  const { project, workspace } = await drawing();
  expect(words(commandById('layer.duplicate'))).toBe('Layer: Duplicate');
  expect(runCommand('layer.duplicate', ctxOf(project, workspace))).toBeTruthy();
  await settle(project);
  expect(project.layers.map((layer) => layer.name ?? null)).toEqual([null, null, 'Layer 1 copy']);
  expect(workspace.pickedLayer).toBe(project.layers[2].id);
  workspace.pickLayer('base');
  expect(reasonOf('layer.duplicate', project, workspace)).toBe('Not on the base layer');
  expect(reasonOf('layer.delete', project, workspace)).toBe('Not on the base layer');
  while (project.layers.length < MOST_LAYERS) project.addLayer('cells', 'edit');
  workspace.pickLayer('edit');
  expect(reasonOf('layer.duplicate', project, workspace)).toBe(`A drawing can have up to ${MOST_LAYERS} layers.`);
});

test('Layer: Delete, Pick the base, Hide and Show act on the picked layer as the list does', async () => {
  const { project, workspace } = await drawing();
  project.addLayer('cells', 'edit');
  const top = project.layers[2].id;
  workspace.pickLayer(top);
  runCommand('layer.hide', ctxOf(project, workspace));
  expect(project.layerById(top).hidden).toBe(true);
  expect(listedCommands(ctxOf(project, workspace)).map(({ id }) => id)).not.toContain('layer.hide'); // hidden already: Show is offered
  runCommand('layer.show', ctxOf(project, workspace));
  expect(project.layerById(top).hidden).toBeFalsy();
  runCommand('layer.delete', ctxOf(project, workspace));
  expect(project.layerById(top)).toBeFalsy();
  runCommand('layer.pickBase', ctxOf(project, workspace));
  expect(workspace.pickedLayer).toBe('base');
});

test('Layer: Rename shows LAYERS and asks the list to rename the picked row', async () => {
  const { project, workspace } = await drawing();
  workspace.sidePanelTab = 'social';
  runCommand('layer.rename', ctxOf(project, workspace));
  expect(workspace.sidePanelTab).toBe('layers');
  expect(workspace.renameRequest).toBe('edit');
});

test('Wand: Contiguous flips wandContiguous and chooses the Wand; Shapes: Ellipse sets shapeKind', async () => {
  const { project, workspace } = await drawing();
  workspace.setActiveTool('pencil');
  const ids = listedCommands(ctxOf(project, workspace)).map(({ id }) => id);
  expect(ids).toContain('option.wand.wandContiguous');
  const was = workspace.wandContiguous;
  const contiguous = commandById('option.wand.wandContiguous') ?? listedCommands(ctxOf(project, workspace)).find(({ id }) => id === 'option.wand.wandContiguous');
  expect(words(contiguous)).toBe('Magic Wand: Contiguous');
  runCommand('option.wand.wandContiguous', ctxOf(project, workspace));
  expect(workspace.wandContiguous).toBe(!was);
  expect(workspace.activeTool).toBe('wand');

  runCommand('option.shapes.shapeKind.ellipse', ctxOf(project, workspace));
  expect(workspace.shapeKind).toBe('ellipse');
  expect(workspace.activeTool).toBe('shapes');
  const ellipse = listedCommands(ctxOf(project, workspace)).find(({ id }) => id === 'option.shapes.shapeKind.ellipse');
  expect(words(ellipse)).toBe('Shapes: Ellipse');
});

test('a toggle choice keeps one lit, as the toolbar\'s toggles do', async () => {
  const { project, workspace } = await drawing();
  workspace.wandMatch = { fg: true, bg: false, char: false };
  runCommand('option.wand.wandMatch.fg', ctxOf(project, workspace)); // the last one lit: stays
  expect(workspace.wandMatch).toEqual({ fg: true, bg: false, char: false });
  runCommand('option.wand.wandMatch.bg', ctxOf(project, workspace));
  expect(workspace.wandMatch).toEqual({ fg: true, bg: true, char: false });
});

test('every generated option row has words, in English and French, and an id of its own', async () => {
  const { project, workspace } = await drawing();
  for (const locale of ['en', 'fr']) {
    await setLocale(locale, { persist: false });
    for (const view of ['input', 'output', 'vector']) {
      workspace.editorTab = view;
      const rows = offeredTools(view, project).flatMap((tool) => optionCommands(tool, view));
      expect(rows.length, view).toBeGreaterThan(0);
      expect(new Set(rows.map(({ id }) => id)).size, view).toBe(rows.length);
      const said = rows.map(words);
      expect(said.filter((w, i) => said.indexOf(w) !== i), `${locale} ${view}: two rows read the same`).toEqual([]);
      for (const row of rows) {
        const said = words(row);
        expect(said, `${view} ${row.id}`).toMatch(/\S ?: \S/); // French puts a space before the colon
        expect(said, row.id).not.toMatch(/undefined|tools\.|shortcuts\./);
      }
    }
  }
  await setLocale('en', { persist: false });
});

test('the room rows: End room and Leave room unavailable outside a room, End room for the host', async () => {
  const { project, workspace } = await drawing();
  const room = useRoomStore();
  for (const id of ['rooms.end', 'rooms.copyAddress', 'rooms.stats', 'rooms.leave']) expect(reasonOf(id, project, workspace), id).toBe('Not in a room');
  expect(reasonOf('rooms.showCursors', project, workspace)).toBe('Only while drawing together in a room');
  expect(reasonOf('rooms.start', project, workspace)).toBe(true);
  room.role = 'watch';
  expect(reasonOf('rooms.end', project, workspace)).toBe('Only the host can do this');
  expect(reasonOf('rooms.start', project, workspace)).toBe('Leave the room first');
  room.role = 'host';
  expect(reasonOf('rooms.end', project, workspace)).toBe(true);
  expect(listedCommands(ctxOf(project, workspace)).map(({ id }) => id)).not.toContain('rooms.leave'); // a host ends it
  runCommand('rooms.stats', ctxOf(project, workspace));
  expect([room.statsOpen, workspace.sidePanelTab]).toEqual([true, 'social']);
  room.close();
  expect(room.statsOpen).toBe(false); // not open again in the next room
  const drawingStore = useDrawingStore(), shown = drawingStore.showCursors;
  project.startSharing({ send: vi.fn(), role: 'host', me: 'host' });
  runCommand('rooms.showCursors', ctxOf(project, workspace));
  expect(drawingStore.showCursors).toBe(!shown);
  project.stopSharing();
});

test('Bake runs what the Bake button runs', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/photo.jpg', { cols: 20, rows: 20 });
  await settle(project);
  project.setSlider('contrast', 130);
  const bake = vi.spyOn(workspace, 'bake').mockImplementation(() => {});
  runCommand('drawing.bake', ctxOf(project, workspace));
  expect(bake).toHaveBeenCalledTimes(1);
  const host = document.createElement('div'), toolbar = createApp(EditToolbar).use(i18n);
  document.body.append(host);
  toolbar.mount(host);
  try {
    await nextTick();
    host.querySelector('.actions-container button[title^="Apply all current slider"]').click();
    expect(bake).toHaveBeenCalledTimes(2);
  } finally {
    toolbar.unmount();
    host.remove();
  }
  bake.mockRestore();
  project.resetSliders?.();
});

test('Bake and Flatten say the button\'s reason; Flatten opens its question', async () => {
  const { project, workspace } = await drawing();
  expect(reasonOf('drawing.bake', project, workspace)).toBe('Nothing to bake: all sliders are at default values and there are no shapes on the image.');
  runCommand('drawing.flatten', ctxOf(project, workspace));
  expect(workspace.flattening).toBe(true);
  project.addFrame('blank');
  expect(reasonOf('drawing.flatten', project, workspace)).toBe('Flatten replaces the underlying image across all frames, so it is only available for single-frame artwork.');
});

test('Selected shapes: to front and to back restack as one step, on VECTOR with shapes selected', async () => {
  const { project, workspace } = await drawing();
  const keys = [0, 1, 2].map((i) => project.addShape(rectShape(i, i, 6, 6, { fill: '#ff0000' })));
  workspace.editorTab = 'vector';
  expect(reasonOf('vector.toFront', project, workspace)).toBe('Select shapes first');
  workspace.vectorSelected = [keys[0]];
  const z = () => keys.map((key) => project.shapes.get(key).z);
  runCommand('vector.toFront', ctxOf(project, workspace));
  expect(z()[0]).toBeGreaterThan(Math.max(z()[1], z()[2]));
  project.undo();
  expect(z()[0]).toBeLessThan(Math.min(z()[1], z()[2]));
  workspace.vectorSelected = [keys[2]];
  runCommand('vector.toBack', ctxOf(project, workspace));
  expect(z()[2]).toBeLessThan(Math.min(z()[0], z()[1]));
  const count = project.shapes.size;
  runCommand('vector.duplicate', ctxOf(project, workspace));
  expect(project.shapes.size).toBe(count + 1);
  expect(workspace.vectorClipboard).toBeFalsy(); // a duplicate isn't a copy
});

test('every row added here has words in en and fr, and a reason with words in both', async () => {
  const { project, workspace } = await drawing();
  const ids = COMMANDS.filter((c) => /^(drawing\.(bake|flatten|mergeDown|canvasSize|animate|font)|layer\.|vector\.(forward|backward|toFront|toBack|duplicate)|rooms\.)/.test(c.id));
  expect(ids.length).toBeGreaterThan(20);
  for (const c of ids) {
    expect(te(c.label.path, 'en') && te(c.label.path, 'fr'), c.id).toBe(true);
    const reason = c.available?.(ctxOf(project, workspace)) ?? true;
    if (reason !== true) {
      const [key] = [reason].flat();
      expect(te(key, 'en') && te(key, 'fr'), `${c.id}: ${key}`).toBe(true);
    }
  }
});

// The persona scripts' Cmd+K steps (docs/qa/personas): what each types finds its row first.
test('the searches the persona scripts type find their row first', async () => {
  const { project, workspace } = await drawing();
  useRoomStore().role = 'host';
  workspace.selection = { c0: 0, r0: 0, c1: 2, r1: 2 };
  const rows = listedCommands(ctxOf(project, workspace)).map((c) => ({ id: c.id, words: words(c) }));
  const first = (query) => searchCommands(query, rows)[0]?.id;
  expect(Object.fromEntries(['exp ans', 'exp png', 'utf8', 'pick base', 'flatten', 'art layer', 'bake', 'animate', 'end room', 'stats']
    .map((query) => [query, first(query)]))).toEqual({
    'exp ans': 'file.export.ans', 'exp png': 'file.export.png', utf8: 'file.export.utf8ans', 'pick base': 'layer.pickBase',
    flatten: 'drawing.flatten', 'art layer': 'layer.makeArt', bake: 'drawing.bake', animate: 'drawing.animate',
    'end room': 'rooms.end', stats: 'rooms.stats',
  });
  useRoomStore().role = null;
  expect(searchCommands('start room', listedCommands(ctxOf(project, workspace)).map((c) => ({ id: c.id, words: words(c) })))[0].id).toBe('rooms.start');
});

// The command list's Dimensions: the cursor in the field, its number picked to type over; on a narrow screen (the
// browser tests' window) in the settings drawer, opened first.
test('Dimensions puts the cursor in the field, in the drawer opened for it', async () => {
  const { project, workspace } = await drawing();
  const host = document.body.appendChild(document.createElement('div')), panel = createApp(ControlPanel).use(getActivePinia()).use(i18n);
  panel.mount(host);
  try {
    runCommand('drawing.canvasSize', ctxOf(project, workspace));
    await expect.poll(() => document.activeElement?.id).toBe('cols');
    expect(workspace.settingsOpen).toBe(true);
  } finally {
    panel.unmount();
    host.remove();
  }
});

// A pick with no row (VECTOR before its first shape picks the vector layer that shape will bring) offers no layer row,
// and the layer in use missing from the stack (an artist's in a room with only the base) still gives Make art layer's
// reason, named by default.
test('the layer rows want the picked row there; Make art layer\'s reason names a layer not in the stack yet', async () => {
  const stores = await createTestApp();
  const { project, workspace } = stores;
  await project.setBlankCanvas({ cols: 20, rows: 10 });
  await settle(project);
  workspace.editorTab = 'vector';
  expect(project.layerById(workspace.shownPick)).toBeFalsy();
  const ids = listedCommands(ctxOf(project, workspace)).map(({ id }) => id);
  for (const id of ['layer.rename', 'layer.duplicate', 'layer.delete', 'layer.hide', 'layer.show']) expect(ids, id).not.toContain(id);
  project.startSharing({ send: vi.fn(), role: 'host', me: 'host' });
  workspace.editorTab = 'output';
  workspace.selection = { c0: 0, r0: 0, c1: 2, r1: 2 };
  project.editId = 'edit';   // as an artist's is with only the base: the base isn't theirs, and 'edit' isn't there yet
  expect(project.layers.some((layer) => layer.id === project.editId)).toBe(false);
  expect(reasonOf('layer.makeArt', project, workspace)).toBe('Add a vector layer above Layer 1 first.');
  project.stopSharing();
});

// Fix round 1: each row grays with what its button or field says, by the same test.
test('Dimensions is off, saying who, while someone is inside an art layer, as its field is', async () => {
  const { project, workspace } = await drawing();
  const art = project.addShape(makeArt({ m: [1, 0, 0, 1, 2, 4], art: { cols: 3, rows: 2, cells: [[0, 'A', '#0000ff', '#ff0000']] } }));
  expect(reasonOf('drawing.canvasSize', project, workspace)).toBe(true);
  useDrawingStore().cursors = { ann: { at: null, view: null, name: 'Ann', inside: art } };
  expect(reasonOf('drawing.canvasSize', project, workspace)).toBe('Ann is currently editing an art layer');
  expect(reasonOf('drawing.canvasSize', project, workspace)).toBe(useDrawingStore().someoneInside); // the field's title
});

test('Make art layer is off with nothing drawn in the selection, as its button is, and on with something', async () => {
  const { project, workspace } = await drawing();
  workspace.setActiveTool('select');
  workspace.selection = { c0: 0, r0: 0, c1: 2, r1: 2 };
  expect(reasonOf('layer.makeArt', project, workspace)).toBe('Nothing is drawn in the selected cells.');
  project.typeAt(1, 1, 'A');
  expect(reasonOf('layer.makeArt', project, workspace)).toBe(true);
});

test('Bake\'s and Flatten\'s questions go with the toolbar, so one left open doesn\'t come back on the next drawing', async () => {
  const { workspace } = await drawing();
  const host = document.createElement('div'), toolbar = createApp(EditToolbar).use(i18n);
  document.body.append(host);
  toolbar.mount(host);
  Object.assign(workspace, { baking: 'CGA', bakingFinal: true, flattening: true });
  await nextTick();
  toolbar.unmount();
  host.remove();
  expect([workspace.baking, workspace.bakingFinal, workspace.flattening]).toEqual([null, false, false]);
});

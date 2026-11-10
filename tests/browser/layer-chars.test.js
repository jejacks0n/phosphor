// Each layer's own character settings (charsOf, setLayerChars, layerParams): an old document gives every layer the
// document's, a new layer copies the picked one's, and the left column (ControlPanel.vue) shows the picked layer's under
// its name, with the picture's settings only while the picture's layer is picked.
import { test, expect, afterEach, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, settle, cellsKey } from '../support/app.js';
import { drawnDocument } from '../support/scenes.js';
import { rectShape, ellipseShape, makeShape } from '@/document/shapes.js';
import { readProject, writeProject } from '@/document/projectIO.js';
import { CHAR_KEYS } from '@/store/settings.js';
import ControlPanel from '@/components/ControlPanel.vue';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

const topLevel = (project) => Object.fromEntries(CHAR_KEYS.map((key) => [key, project[key]]));

async function blank() {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols: 20, rows: 10 });
  await settle(app.project);
  return app;
}

test('an old document gives every layer today\'s settings and shows the same', async () => {
  const { project, workspace } = await createTestApp();
  Object.assign(project, { chars: '.:#', charChoice: 'best' }); // the document's, as a phase-1 file has them
  await drawnDocument(project, workspace);
  project.addShape(rectShape(2, 2, 12, 10, { fill: '#ff0000' }));
  project.commitEdit();
  await settle(project);
  const shown = cellsKey(project);
  const blob = await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() });
  expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 8))).toBe('PHOSPHOR'); // it fits the old form
  await project.openParts(await readProject(blob), { filename: 'old' });
  await settle(project);
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', 'edit']);
  expect(project.charsOf('edit')).toEqual(topLevel(project));
  expect(project.charsOf('vector')).toEqual(topLevel(project));
  expect(project.charsOf('base')).toEqual(topLevel(project));
  expect(project.lowerGroup.upper).toEqual([]);
  expect(cellsKey(project)).toEqual(shown);
});

test('changing Layer 1\'s characters leaves the picture alone', async () => {
  const { project } = await blank();
  project.paintStroke([{ x: 3, y: 4, alpha: 1 }, { x: 3, y: 5, alpha: 1 }], '#ff0000');
  project.commitEdit();
  await settle(project);
  const before = cellsKey(project), at = 2 * 20 + 3;
  project.markSaved();
  expect(project.isDirty).toBe(false);
  project.setLayerChars('edit', { chars: '#' });
  expect(project.isDirty).toBe(true); // a layer's own settings are saved with it
  await settle(project);
  expect(project.cells[at].char).toBe('#');
  const after = cellsKey(project);
  expect(after.filter((cell, i) => i !== at)).toEqual(before.filter((cell, i) => i !== at));
  expect(project.chars).not.toBe('#');
  expect(project.charsOf('edit').chars).toBe('#');
});

test('Layer 1\'s own settings are saved, in the stack form, and come back on open', async () => {
  const { project } = await blank();
  project.setLayerChars('edit', { chars: '#', charChoice: 'best' });
  const own = project.charsOf('edit');
  const blob = await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() });
  expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 8))).toBe('PHOSPHR2');
  await project.openParts(await readProject(blob), { filename: 'own' });
  await settle(project);
  expect(project.charsOf('edit')).toEqual(own);
  expect(project.charsOf('base')).toEqual(topLevel(project));
});

test('setLayerChars says whether anything changed', async () => {
  const { project } = await blank();
  expect(project.setLayerChars('base', { chars: project.chars })).toBe(false);
  expect(project.setLayerChars('base', { chars: '#' })).toBe(true);
  expect(project.chars).toBe('#');
  expect(project.setLayerChars('edit', { chars: project.charsOf('edit').chars })).toBe(false);
  expect(project.setLayerChars('edit', { chars: '@' })).toBe(true);
});

test('a new layer copies the picked layer\'s settings', async () => {
  const { project, workspace } = await blank();
  project.setLayerChars('edit', { chars: '#', charChoice: 'best', solids: 60 });
  workspace.pickLayer('edit');
  const id = project.addLayer('cells', workspace.pickedLayer);
  expect(project.charsOf(id)).toEqual(project.charsOf('edit'));
  workspace.pickLayer('base');
  const vector = project.addLayer('vector', 'base');
  expect(project.charsOf(vector)).toEqual(topLevel(project));
});

async function mountPanel() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(ControlPanel).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
}
const fieldsets = () => [...host.querySelectorAll('aside > fieldset')];
const sectionOf = (words) => fieldsets().find((set) => set.querySelector('legend').textContent.includes(words));

test('the Characters legend names the picked layer, and Picture · Base and Image filters show only with Base picked', async () => {
  const { project, workspace } = await blank();
  workspace.pickLayer('edit');
  await mountPanel();
  expect(sectionOf('Characters · Layer 1')).toBeTruthy();
  expect(sectionOf('Characters · Layer 1').textContent).toContain('Used where paint or a picture on Layer 1 becomes characters.');
  expect(sectionOf('Picture')).toBeUndefined();
  expect(sectionOf('Image filters')).toBeUndefined();
  expect(host.querySelector('#smoothing')).toBeNull();
  expect(sectionOf('Drawing').textContent).toContain('all layers');
  expect(sectionOf('Adjustments')).toBeTruthy(); // the drawing's groups stay
  workspace.pickLayer('base');
  await nextTick();
  expect(sectionOf('Characters · Base')).toBeTruthy();
  expect(sectionOf('Characters · Base').textContent).not.toContain('Used where');
  expect(sectionOf('Picture · Base').disabled).toBe(false);
  expect(sectionOf('Image filters').disabled).toBe(false);
  expect(fieldsets().map((set) => set.querySelector('legend').textContent.trim().split(/\s+/)[0]))
    .toEqual(['Drawing', 'Transforms', 'Adjustments', 'Characters', 'Picture', 'Image']);
  const vector = project.addLayer('vector', 'edit');
  workspace.pickLayer(vector);
  await nextTick();
  expect(sectionOf('Characters · Vector 1')).toBeTruthy(); // every layer converts something
  expect(sectionOf('Picture')).toBeUndefined();
});

test('Characters and Picture fold on their titles like the slider groups, and stay folded when the panel comes back', async () => {
  const { workspace } = await blank();
  workspace.pickLayer('base');
  await mountPanel();
  const fold = (words) => sectionOf(words).querySelector('legend button.fold');
  for (const words of ['Characters', 'Picture']) {
    expect(fold(words).getAttribute('aria-expanded')).toBe('true');
    fold(words).click();
    await nextTick();
    expect(fold(words).getAttribute('aria-expanded')).toBe('false');
    expect(sectionOf(words).classList).toContain('folded');
  }
  expect(host.querySelector('#charChoice').checkVisibility()).toBe(false);
  expect(host.querySelector('#smoothing').checkVisibility()).toBe(false);
  expect(host.querySelector('#group-adjust').checkVisibility()).toBe(true); // the others stay open
  expect(JSON.parse(localStorage.getItem('phosphor.panel.folded'))).toEqual(['characters', 'picture']);
  app.unmount();
  host.remove();
  await mountPanel();
  expect(fold('Characters').getAttribute('aria-expanded')).toBe('false');
  expect(host.querySelector('#charChoice').checkVisibility()).toBe(false);
  fold('Characters').click();
  await nextTick();
  expect(host.querySelector('#charChoice').checkVisibility()).toBe(true);
});

test('the Characters note says what a vector layer converts', async () => {
  const { project, workspace } = await blank();
  const id = project.addLayer('vector', 'edit');
  workspace.pickLayer(id);
  await mountPanel();
  expect(sectionOf('Characters · Vector 1').textContent).toContain('Shapes and art layers on Vector 1 convert with these.');
});

test('Choose characters edits the picked layer', async () => {
  const { project, workspace } = await blank();
  const id = project.addLayer('cells', 'edit');
  workspace.pickLayer(id);
  await mountPanel();
  const select = host.querySelector('#charChoice');
  select.value = 'best';
  select.dispatchEvent(new Event('change'));
  await nextTick();
  expect(project.charsOf(id).charChoice).toBe('best');
  expect(project.charsOf('edit').charChoice).toBe('random');
  expect(project.charChoice).toBe('random');
  expect(select.value).toBe('best');
  workspace.pickLayer('edit');
  await nextTick();
  expect(host.querySelector('#charChoice').value).toBe('random');
});

test('a layer\'s own settings keep the room off', async () => {
  const { project } = await blank();
  expect(project.fitsRoom).toBe(true);
  project.setLayerChars('edit', { seed: 'another' });
  expect(project.fitsRoom).toBe(false);
  project.setLayerChars('edit', { seed: project.seed });
  expect(project.fitsRoom).toBe(true);
});

test('Flatten gives every layer the base\'s settings as they come out, and undo gives each its own back', async () => {
  const { project } = await blank();
  project.setLayerChars('edit', { chars: '#', charChoice: 'best' });
  const own = project.charsOf('edit');
  expect(await project.flattenDrawing({ layer: 'edit' })).toBe(true);
  await settle(project);
  expect(project.charsOf('edit')).toEqual(topLevel(project));
  expect(project.lowerGroup.cells).toBe('edit');
  project.undo();
  await settle(project);
  expect(project.charsOf('edit')).toEqual(own);
});

test('in a room a layer\'s own settings are refused, and the base\'s, the host\'s or heard, are every layer\'s', async () => {
  const { project } = await blank();
  project.startSharing({ send: () => {}, role: 'host', me: 'mine' });
  try {
    expect(project.setLayerChars('edit', { chars: '#' })).toBe(false);
    expect(project.charsOf('edit').chars).not.toBe('#');
    project.setLayerChars('base', { chars: '#' });
    expect(project.charsOf('edit').chars).toBe('#');
    project.applySettings({ seed: 'heard' }); // as an artist hears the host's
    expect(project.charsOf('edit').seed).toBe('heard');
    expect(project.fitsRoom).toBe(true);
  } finally {
    project.stopSharing();
  }
});

test('in a room the Characters section edits Base, whichever layer is picked, and every layer follows', async () => {
  const { project, workspace } = await blank();
  workspace.pickLayer('edit');
  project.startSharing({ send: () => {}, role: 'host', me: 'mine' });
  try {
    await mountPanel();
    expect(sectionOf('Characters · Base')).toBeTruthy();
    expect(sectionOf('Characters · Base').textContent).not.toContain('Used where');
    const select = host.querySelector('#charChoice');
    select.value = 'best';
    select.dispatchEvent(new Event('change'));
    await nextTick();
    expect(project.charChoice).toBe('best');
    expect(project.charsOf('edit').charChoice).toBe('best');
    expect(project.fitsRoom).toBe(true);
    expect(select.value).toBe('best');
  } finally {
    project.stopSharing();
  }
});

// A circle drawn on a vector layer, in the lower group (right on Base, converted with Base's settings) or as an upper
// layer (above Layer 1, its own settings differing only in a seed they don't use), every layer set to settings: the
// cells it shows.
// moved: the circle drawn first a few cells over and composed, then moved, so what an upper layer kept of it catches up.
// under: Base's and Layer 1's settings, when not settings (an upper layer only).
// looks: what Copy takes of each cell instead (storedLookAt), as it shows (with brightness at 120 to show it's stored).
async function circleOn(where, settings, { moved = false, under = settings, looks = false } = {}) {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 24, rows: 24, quantize: 'cga', ...(looks && { brightness: 120 }) });
  await settle(project);
  const vector = project.addLayer('vector', where);
  for (const id of ['base', 'edit']) project.setLayerChars(id, under);
  project.setLayerChars(vector, where === 'base' ? settings : { ...settings, seed: 'its own' }); // an upper layer by its settings
  workspace.pickLayer(vector);
  const key = project.addShape(ellipseShape(2.3 - 3 * moved, 3.1 + 5 * moved, 21.6 - 3 * moved, 22.4 + 5 * moved, { fill: '#ff5555' }));
  project.commitEdit();
  await settle(project);
  if (moved) {
    project.updateShapes([[key, { ...project.shapes.get(key), points: ellipseShape(2.3, 3.1, 21.6, 22.4).points }]]);
    project.commitEdit();
    await settle(project);
  }
  expect(project.lowerGroup.upper.length).toBe(where === 'base' ? 0 : 1);
  if (!looks) return cellsKey(project);
  const shows = (hex) => project.renderer.effective(hex, project.processParams).hex;
  return project.cells.map((cell, i) => {
    const look = project.storedLookAt(i % 24, Math.floor(i / 24));
    return [cellsKey(project)[i], `${look.char}${shows(look.fg)}${shows(look.bg)}`];
  });
}
const halfBlocks = new Set([' ', '█', '▀', '▄']);

for (const [name, settings] of [['By shape', { charChoice: 'shape', solids: 0 }], ['Best match', { charChoice: 'best', chars: '▄░▒▓█', solids: 0 }]]) {
  test(`under ${name} a circle on an upper vector layer picks the characters it does in the lower group`, async () => {
    const lower = await circleOn('base', settings), upper = await circleOn('edit', settings);
    expect(lower.some((cell) => !halfBlocks.has(cell[0]))).toBe(true); // its edges cross cells
    expect(upper).toEqual(lower);
    expect(await circleOn('edit', settings, { moved: true })).toEqual(lower);
  });
}

test('By shape on an upper vector layer over a picture of Random picks the characters it does in the lower group', async () => {
  const settings = { charChoice: 'shape', solids: 0 };
  const lower = await circleOn('base', settings), upper = await circleOn('edit', settings, { under: { charChoice: 'random' } });
  const reached = lower.map((cell, i) => i).filter((i) => !lower[i].endsWith('#000000#000000'));
  expect(reached.length).toBeGreaterThan(50);
  expect(reached.map((i) => upper[i])).toEqual(reached.map((i) => lower[i]));
});

// White paint at half opacity over black, on Base (converted with Base's settings) or on an upper cells layer (its
// own, differing only in a seed they don't use), every layer set to settings: the cell it's in.
async function paintedOn(where, settings) {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 8, rows: 8, quantize: 'cga' });
  await settle(project);
  for (const id of ['base', 'edit']) project.setLayerChars(id, settings);
  const layer = where === 'base' ? 'base' : project.addLayer('cells', 'edit');
  if (layer !== 'base') project.setLayerChars(layer, { ...settings, seed: 'its own' });
  workspace.pickLayer(layer);
  workspace.editBrushOpacity = 50;
  project.paintStroke([{ x: 3, y: 4, alpha: 1 }, { x: 3, y: 5, alpha: 1 }], '#ffffff');
  project.commitEdit();
  await settle(project);
  expect(project.lowerGroup.upper.length).toBe(where === 'base' ? 0 : 1);
  return cellsKey(project)[2 * 8 + 3];
}

test('under Best match paint on an upper cells layer makes the cell the same paint makes on Base', async () => {
  const settings = { charChoice: 'best', chars: '▄░▒▓█', solids: 0 };
  const base = await paintedOn('base', settings);
  expect(halfBlocks.has(base[0])).toBe(false); // a shade: its colors aren't the palette's
  expect(await paintedOn('edit', settings)).toBe(base);
});

// A small rect inside a big ellipse on an upper vector layer of its own settings, on a 40 x 64 canvas: moved times
// (each an edit of its own) 0.7 grid pixels down and right, or drawn there to begin with (none), then
// rendered whole at another brightness.
async function movedInside(settings, moves) {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 40, rows: 64, quantize: 'cga' });
  await settle(project);
  const vector = project.addLayer('vector', 'edit');
  project.setLayerChars(vector, { ...settings, seed: 'its own' });
  workspace.pickLayer(vector);
  project.addShape(ellipseShape(2.3, 3.1, 37.6, 60.4, { fill: '#ff5555' }));
  const rect = (d) => rectShape(10.4 + d, 20.2 + d, 14.7 + d, 26.6 + d, { fill: '#55ff55' }).points;
  const key = project.addShape(makeShape({ points: rect(moves ? 0 : 0.7 * 6), closed: true, fill: '#55ff55' }));
  project.commitEdit();
  await settle(project);
  for (let i = 1; i <= moves; i++) {
    project.updateShapes([[key, { ...project.shapes.get(key), points: rect(0.7 * i) }]]);
    project.commitEdit();
    await settle(project);
  }
  project.brightness = 120; // a whole render that reads the layer again
  project.render();
  await settle(project);
  return cellsKey(project);
}

for (const [name, settings] of [['By shape', { charChoice: 'shape', solids: 0 }], ['Random', { charChoice: 'random' }]]) {
  test(`under ${name} an upper vector layer moved in small steps, then rendered whole, shows what a fresh drawing does`, async () => {
    expect(await movedInside(settings, 6)).toEqual(await movedInside(settings, 0));
  });
}

for (const [name, settings] of [['By shape', { charChoice: 'shape', solids: 0 }], ['Best match', { charChoice: 'best', chars: '▄░▒▓█', solids: 0 }]]) {
  test(`under ${name} Copy takes the colors an upper vector layer's cells show`, async () => {
    const looks = await circleOn('edit', settings, { looks: true });
    expect(looks.filter(([shown]) => !halfBlocks.has(shown[0])).length).toBeGreaterThan(4);
    expect(looks.map(([, look]) => look)).toEqual(looks.map(([shown]) => shown));
  });
}

for (const [name, settings] of [['By shape', { charChoice: 'shape', solids: 0 }], ['Best match', { charChoice: 'best', chars: '▄░▒▓█', solids: 0 }]]) {
  test(`under ${name} Copy takes the colors an upper vector layer's cells show under a layer above, composing it once`, async () => {
    const { project, workspace } = await createTestApp();
    await project.setBlankCanvas({ cols: 24, rows: 24, quantize: 'cga', brightness: 120 });
    await settle(project);
    const vector = project.addLayer('vector', 'edit');
    project.setLayerChars(vector, { ...settings, seed: 'its own' });
    workspace.pickLayer(vector);
    project.addShape(ellipseShape(2.3, 3.1, 21.6, 22.4, { fill: '#ff5555' }));
    project.commitEdit();
    const above = project.addLayer('cells', vector); // its characters over every cell, the colors the ones under
    workspace.pickLayer(above);
    const all = Array.from({ length: 24 * 12 }, (_, i) => ({ col: i % 24, row: Math.floor(i / 24) }));
    project.writeEditCells(all.map((cell) => ({ ...cell, attrs: { char: '#' } })));
    project.commitEdit();
    await settle(project);
    expect(project.lowerGroup.upper.slice(-2)).toEqual([vector, above]);
    const composes = vi.spyOn(project.renderer, 'composeUpper');
    const { shown } = project.copySelection(project.gridRect(), [above]);
    expect(composes.mock.calls.length).toBeLessThanOrEqual(2); // the level once for the whole copy, not once a cell
    composes.mockRestore();
    const shows = (hex) => project.renderer.effective(hex, project.processParams).hex;
    const reached = all.map((cell, i) => i).filter((i) => shown[i]); // where a shape is
    expect(reached.length).toBeGreaterThan(100);
    expect(reached.map((i) => `${shown[i].char}${shows(shown[i].fg)}${shows(shown[i].bg)}`)).toEqual(reached.map((i) => cellsKey(project)[i]));
    expect(reached.map((i) => shown[i])).toEqual(reached.map((i) => project.storedLookAt(all[i].col, all[i].row))); // as a cell at a time
  });
}

// An upper vector layer under By shape keeps its samples (Renderer.sampleBytes) only while it's an upper By shape layer,
// and every layer's together within the renderer's budget, the oldest given up first.
async function sampled() {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 40, rows: 64, quantize: 'cga' });
  await settle(project);
  const vector = project.addLayer('vector', 'edit');
  project.setLayerChars(vector, { charChoice: 'shape', seed: 'its own' });
  workspace.pickLayer(vector);
  project.addShape(ellipseShape(2.3, 3.1, 37.6, 60.4, { fill: '#ff5555' }));
  project.commitEdit();
  await settle(project);
  expect(project.renderer.sampleBytes).toBeGreaterThan(0);
  return { project, vector };
}

test('an upper vector layer gives its By shape samples back once it\'s Random', async () => {
  const { project, vector } = await sampled();
  project.setLayerChars(vector, { charChoice: 'random' });
  project.render(); // as the app does on a layer's settings changing
  await settle(project);
  expect(project.renderer.sampleBytes).toBe(0);
});

test('an upper vector layer gives its By shape samples back once it joins the lower group', async () => {
  const { project, vector } = await sampled();
  for (const id of ['base', 'edit']) project.setLayerChars(id, project.charsOf(vector));
  project.moveLayer(vector, 1); // right on Base, with its settings
  await settle(project);
  expect(project.lowerGroup.upper).toEqual([]);
  expect(project.renderer.sampleBytes).toBe(0);
});

test('the By shape samples of upper layers stay within the renderer\'s budget, and what shows doesn\'t change', async () => {
  const { project } = await sampled();
  const shown = cellsKey(project), all = project.renderer.sampleBytes;
  project.renderer.sampleBudget = Math.floor(all / 3);
  project.render();
  await settle(project);
  expect(project.renderer.sampleBytes).toBeLessThanOrEqual(project.renderer.sampleBudget);
  expect(project.renderer.sampleBytes).toBeGreaterThan(0);
  expect(cellsKey(project)).toEqual(shown);
});

// Every character setting is an undo step on every layer: a pick, a set typed or picked, a slider's drag (and a run of
// key nudges), the seed typed or rolled. Each undone puts the layer's settings back and leaves the others alone.
async function undoable(pick) {
  const { project, workspace } = await blank();
  workspace.pickLayer(pick);
  await mountPanel();
  const version = project.history.version;
  const steps = () => project.history.version - version;
  return { project, steps, field: (id) => host.querySelector(`#${id}`) };
}
const change = async (el, value, type = 'change') => {
  el.value = value;
  el.dispatchEvent(new Event(type));
  await nextTick();
};

test('Choose characters picked is one undo step, on a layer and on Base', async () => {
  for (const pick of ['edit', 'base']) {
    const { project, steps, field } = await undoable(pick);
    await change(field('charChoice'), 'best');
    expect(project.charsOf(pick).charChoice, pick).toBe('best');
    expect(steps()).toBe(1);
    project.undo();
    expect(project.charsOf(pick).charChoice).toBe('random');
    project.redo();
    expect(project.charsOf(pick).charChoice).toBe('best');
  }
});

test('the Characters set typed is one undo step, a set picked from ▾ another, and its field keeps Cmd+Z for its own typing', async () => {
  const { project, steps, field } = await undoable('edit');
  const was = project.charsOf('edit').chars;
  const input = field('chars');
  await change(input, '#@');
  expect(project.charsOf('edit').chars).toBe('#@');
  await change(host.querySelector('.charset-field select'), '1');
  expect(project.charsOf('edit').chars).not.toBe('#@');
  expect(steps()).toBe(2);
  const keys = createApp({ setup() { useKeyboardShortcuts(project, useWorkspaceStore()); return () => null; } });
  keys.mount(document.createElement('div'));
  try {
    input.focus();
    input.value = '#@x'; // typed, not committed yet
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }));
    expect(steps()).toBe(2); // the field's own, not the app's
    input.blur();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, cancelable: true }));
    expect(project.charsOf('edit').chars).toBe('#@');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, cancelable: true }));
    expect(project.charsOf('edit').chars).toBe(was);
  } finally {
    keys.unmount();
  }
});

test('a Solids drag is one undo step, and key nudges a moment apart are one more', async () => {
  const { project, steps, field } = await undoable('edit');
  project.setLayerChars('edit', { charChoice: 'best' });
  project.commitLayerChars();
  await nextTick();
  const start = steps(), slider = field('solids');
  for (const value of [30, 40, 50]) await change(slider, String(value), 'input');
  slider.dispatchEvent(new Event('pointerdown'));
  await change(slider, '55');
  expect(project.charsOf('edit').solids).toBe(55);
  expect(steps() - start).toBe(1);
  for (const value of [56, 57, 58]) await change(slider, String(value)); // arrow keys: each a change, a nudge
  expect(steps() - start).toBe(2);
  project.undo();
  expect(project.charsOf('edit').solids).toBe(55);
  project.undo();
  expect(project.charsOf('edit').solids).toBe(25);
  expect(project.charsOf('base').solids).toBe(25);
});

test('the seed typed is one undo step, and the dice roll another', async () => {
  const { project, steps, field } = await undoable('edit');
  const was = project.charsOf('edit').seed;
  await change(field('seed'), 'typed');
  expect(project.charsOf('edit').seed).toBe('typed');
  host.querySelector('#seed + button').click();
  await nextTick();
  const rolled = project.charsOf('edit').seed;
  expect(rolled).not.toBe('typed');
  expect(steps()).toBe(2);
  project.undo();
  expect(project.charsOf('edit').seed).toBe('typed');
  project.undo();
  expect(project.charsOf('edit').seed).toBe(was);
  expect(project.seed).toBe(was);
});

test('with real keys: a seed typed and entered, then Cmd+Z, undoes the step and the field shows it; typing not yet entered keeps Cmd+Z its own', async () => {
  const { project } = await undoable('edit');
  const keys = createApp({ setup() { useKeyboardShortcuts(project, useWorkspaceStore()); return () => null; } });
  keys.mount(document.createElement('div'));
  try {
    const was = project.charsOf('edit').seed, seed = host.querySelector('#seed');
    await userEvent.click(seed);
    await userEvent.keyboard('{Control>}a{/Control}{Meta>}a{/Meta}typed{Enter}');
    expect(project.charsOf('edit').seed).toBe('typed');
    await userEvent.keyboard('{ControlOrMeta>}z{/ControlOrMeta}');
    expect(project.charsOf('edit').seed).toBe(was); // the app's undo: the step
    await nextTick();
    expect(seed.value).toBe(was);
    expect(project.canRedo).toBe(true);
    seed.blur();
    await nextTick();
    expect(project.charsOf('edit').seed).toBe(was); // no step on the way out
    expect(project.canRedo).toBe(true);

    await userEvent.click(seed);
    await userEvent.keyboard('more');
    const version = project.history.version;
    await userEvent.keyboard('{ControlOrMeta>}z{/ControlOrMeta}');
    expect(project.history.version).toBe(version); // the field's own typing, not entered yet
    expect(project.canRedo).toBe(true);
  } finally {
    keys.unmount();
  }
});

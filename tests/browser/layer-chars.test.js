// Each layer's own character settings (charsOf, setLayerChars, layerParams): an old document gives every layer the
// document's, a new layer copies the picked one's, and the left column (ControlPanel.vue) shows the picked layer's under
// its name, with the picture's settings only on the picture's layer.
import { test, expect, afterEach } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, settle, cellsKey } from '../support/app.js';
import { drawnDocument } from '../support/scenes.js';
import { rectShape } from '@/document/shapes.js';
import { readProject, writeProject } from '@/document/projectIO.js';
import { CHAR_KEYS } from '@/store/settings.js';
import ControlPanel from '@/components/ControlPanel.vue';

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

test('the Characters legend names the picked layer, the Picture section names Base and is off elsewhere', async () => {
  const { workspace } = await blank();
  workspace.pickLayer('edit');
  await mountPanel();
  expect(sectionOf('Characters · Layer 1')).toBeTruthy();
  expect(sectionOf('Characters · Layer 1').textContent).toContain('Used where paint or a picture on Layer 1 becomes characters.');
  const picture = sectionOf('Picture · Base');
  expect(picture.disabled).toBe(true);
  expect(picture.textContent).toContain('Pick Base in Layers to change the picture.');
  expect(picture.title).toBe('Pick Base in Layers to change the picture.');
  expect(sectionOf('Drawing').textContent).toContain('all layers');
  workspace.pickLayer('base');
  await nextTick();
  expect(sectionOf('Characters · Base')).toBeTruthy();
  expect(sectionOf('Characters · Base').textContent).not.toContain('Used where');
  expect(sectionOf('Picture · Base').disabled).toBe(false);
  expect(sectionOf('Picture · Base').textContent).not.toContain('Pick Base');
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

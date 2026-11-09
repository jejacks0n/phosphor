// The LAYERS list (LayersList.vue): the drawing's layers top first, a row picked to decide the tabs, an eye to hide one,
// a click on the picked row's name (or a double-click) to rename it, ⋯ to rename or move it, + Layer and + Vector layer under it.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import { rectShape } from '@/document/shapes.js';
import LayersList from '@/components/LayersList.vue';
import { MOST_LAYERS } from '@/document/layerInfo.js';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

async function mount(before = () => {}) {
  const stores = await createTestApp();
  await stores.project.setBlankCanvas({ cols: 20, rows: 10 });
  await settle(stores.project);
  stores.workspace.editorTab = 'output';
  before(stores);
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(LayersList).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  return stores;
}
const rows = () => [...host.querySelectorAll('li')];
const names = () => rows().map((li) => li.querySelector('button.pick').textContent.trim());
const pickOf = (i) => rows()[i].querySelector('button.pick');
const eyeOf = (i) => rows()[i].querySelector('button.eye');
const addButton = (label = '+ Vector layer') => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
const menuOf = (i) => rows()[i].querySelector('button.dropdown-trigger');
// The row's ⋯ menu opened, its items by their words. A moment passes before an item is clicked: Vue skips a click
// dispatched in the same millisecond the menu mounted (a real click never is).
async function openMenu(i) {
  menuOf(i).click();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const items = [...rows()[i].querySelectorAll('.dropdown-content button')];
  return (label) => items.find((b) => b.textContent.trim() === label);
}
const key = async (el, k) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  await nextTick();
};

test('lists edit, vector and base, top first', async () => {
  await mount(({ project }) => project.addShape(rectShape(0, 0, 4, 4, { fill: '#ff0000' })));
  expect(names()).toEqual(['Layer 1', 'Vector 1', 'Base']);
  expect(pickOf(0).getAttribute('aria-pressed')).toBe('true');
});

test('+ Layer adds directly above the pick and picks it', async () => {
  const { project, workspace } = await mount();
  expect(names()).toEqual(['Layer 1', 'Base']);
  addButton('+ Layer').click();
  await nextTick();
  expect(names()).toEqual(['Layer 2', 'Layer 1', 'Base']);
  expect(workspace.pickedLayer).toBe(project.layers[2].id);
  expect(pickOf(0).getAttribute('aria-pressed')).toBe('true');
  pickOf(2).click(); // the base: the next goes directly above it
  await nextTick();
  addButton('+ Layer').click();
  await nextTick();
  expect(names()).toEqual(['Layer 2', 'Layer 1', 'Layer 3', 'Base']);
  expect(workspace.pickedLayer).toBe(project.layers[1].id);
});

test('+ Vector layer always shows and adds above the pick', async () => {
  const { workspace } = await mount();
  addButton().click();
  await nextTick();
  expect(names()).toEqual(['Vector 1', 'Layer 1', 'Base']);
  expect(pickOf(0).getAttribute('aria-pressed')).toBe('true');
  expect(workspace.pickedLayer).toBe('vector');
  expect(workspace.editorTab).toBe('vector');
  expect(addButton()).toBeDefined();
  addButton().click();
  await nextTick();
  expect(names()).toEqual(['Vector 2', 'Vector 1', 'Layer 1', 'Base']);
});

test('Move up and Move down in ⋯ reorder; the bottom row has no ⋯', async () => {
  const { project } = await mount(({ project }) => project.addLayer('cells', 'edit'));
  expect(names()).toEqual(['Layer 2', 'Layer 1', 'Base']);
  expect(menuOf(2)).toBeNull();
  expect(menuOf(0).getAttribute('aria-label')).toBe('Layer 2 options');
  let item = await openMenu(0);
  expect(item('Move up').disabled).toBe(true); // the top
  expect(item('Move down').disabled).toBe(false);
  expect(item('Rename')).toBeDefined();
  item('Move down').click();
  await settle(project); // a move draws the stack again
  expect(names()).toEqual(['Layer 1', 'Layer 2', 'Base']);
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'L1', 'edit']);
  item = await openMenu(1);
  expect(item('Move down').disabled).toBe(true); // directly on the bottom
  item('Move up').click();
  await settle(project);
  expect(names()).toEqual(['Layer 2', 'Layer 1', 'Base']);
  expect(project.canUndo).toBe(true);
});

test('Duplicate and Delete in ⋯: the copy goes directly above and is picked, and Delete takes it away', async () => {
  const { project, workspace } = await mount();
  expect(names()).toEqual(['Layer 1', 'Base']);
  let item = await openMenu(0);
  item('Duplicate').click();
  await settle(project);
  expect(names()).toEqual(['Layer 1 copy', 'Layer 1', 'Base']);
  expect(workspace.pickedLayer).toBe(project.layers[2].id);
  item = await openMenu(0);
  item('Delete').click();
  await settle(project);
  expect(names()).toEqual(['Layer 1', 'Base']);
  expect(workspace.pickedLayer).toBe('edit');
});

test('in a room the ⋯ items that change the stack are off with the reason', async () => {
  await mount(({ project }) => { project._sharing = { role: 'host' }; });
  const item = await openMenu(0);
  for (const label of ['Duplicate', 'Delete', 'Move up', 'Move down']) {
    expect(item(label).disabled).toBe(true);
    expect(item(label).title).toBe('Adding, deleting and moving layers isn\'t available in a room yet.');
  }
  expect(item('Rename').disabled).toBe(false);
  expect(addButton('+ Layer').disabled).toBe(true);
  expect(addButton('+ Layer').title).toBe('Adding, deleting and moving layers isn\'t available in a room yet.');
  expect(addButton().disabled).toBe(false); // the vector layer the room is missing
});

test('at the most layers + Layer, + Vector layer and Duplicate are off and say why', async () => {
  await mount(({ project }) => { while (project.layers.length < MOST_LAYERS) project.addLayer('cells', 'edit'); });
  for (const label of ['+ Layer', '+ Vector layer']) {
    expect(addButton(label).disabled).toBe(true);
    expect(addButton(label).title).toBe(`A drawing holds at most ${MOST_LAYERS} layers.`);
  }
  const item = await openMenu(0);
  expect(item('Duplicate').disabled).toBe(true);
  expect(item('Duplicate').title).toBe(`A drawing holds at most ${MOST_LAYERS} layers.`);
  expect(item('Delete').disabled).toBe(false);
});

test('picking a row picks its layer', async () => {
  const { workspace } = await mount();
  pickOf(1).click();
  await nextTick();
  expect(workspace.pickedLayer).toBe('base');
  expect(pickOf(1).getAttribute('aria-pressed')).toBe('true');
});

test('the eye hides and shows', async () => {
  const { project } = await mount();
  expect(eyeOf(0).getAttribute('aria-label')).toBe('Hide Layer 1');
  expect(eyeOf(0).hasAttribute('aria-pressed')).toBe(false);   // its label says what it does
  eyeOf(0).click();
  await nextTick();
  expect(project.layerById('edit').hidden).toBe(true);
  expect(eyeOf(0).getAttribute('aria-label')).toBe('Show Layer 1');
  eyeOf(0).click();
  await nextTick();
  expect(project.layerById('edit').hidden).toBe(false);
});

test('double-click renames, Escape cancels, blank puts the default back', async () => {
  const { project } = await mount();
  const name = () => rows()[0].querySelector('.name');
  const input = () => rows()[0].querySelector('input');

  name().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await nextTick();
  expect(input().getAttribute('maxlength')).toBe('40');
  expect(input().getAttribute('aria-label')).toBe('Rename Layer 1');
  expect(document.activeElement).toBe(input());
  input().value = 'Ink';
  input().dispatchEvent(new Event('input'));
  await key(input(), 'Enter');
  expect(input()).toBeNull();
  expect(project.layerById('edit').name).toBe('Ink');
  expect(names()[0]).toBe('Ink');
  await nextTick();
  expect(document.activeElement).toBe(pickOf(0));   // focus back on the row, not lost

  name().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await nextTick();
  input().value = 'Nope';
  input().dispatchEvent(new Event('input'));
  await key(input(), 'Escape');
  expect(input()).toBeNull();
  expect(names()[0]).toBe('Ink');
  expect(document.activeElement).toBe(pickOf(0));

  name().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await nextTick();
  input().value = '   ';
  input().dispatchEvent(new Event('input'));
  input().blur();   // blur commits, as Enter does
  await nextTick();
  expect(input()).toBeNull();
  expect(project.layerById('edit').name).toBe(null);
  expect(names()[0]).toBe('Layer 1');

  await key(pickOf(1), 'F2');   // the keyboard's way in
  expect(rows()[1].querySelector('input').getAttribute('aria-label')).toBe('Rename Base');
});

test('a click on the picked row\'s name renames it; on another row it only picks', async () => {
  const { workspace } = await mount();
  const nameOf = (i) => rows()[i].querySelector('.name');
  const input = () => host.querySelector('input');

  pickOf(0).click();   // the row itself, as Enter or Space presses it: no box
  await nextTick();
  expect(input()).toBeNull();

  nameOf(1).click();   // the base, not picked: picked, no box
  await nextTick();
  expect(workspace.pickedLayer).toBe('base');
  expect(input()).toBeNull();

  nameOf(1).click();   // now picked: the box
  await nextTick();
  expect(input()?.getAttribute('aria-label')).toBe('Rename Base');
  expect(document.activeElement).toBe(input());
});

test('a row\'s title is its name, so a long one can be read; an off row\'s says why', async () => {
  const { project } = await mount();
  const long = 'the frame around the whole picture, in a';
  project.renameLayer('edit', long);
  await nextTick();
  expect(pickOf(0).title).toBe(long);
  expect(pickOf(1).title).toBe('Base');
});

test('inside an art layer the vector row shows as picked and the base row is off', async () => {
  const { project, workspace } = await mount();
  project.typeAt(2, 1, 'H', { fg: '#ff0000' });
  project.commitEdit();
  workspace.selection = { c0: 1, r0: 0, c1: 6, r1: 2 };
  expect(project.enterArt(project.makeArtLayer())).toBe(true);
  await nextTick();
  expect(names()).toEqual(['Layer 1', 'Vector 1', 'Base']);
  expect(pickOf(1).getAttribute('aria-pressed')).toBe('true');
  expect(pickOf(2).getAttribute('aria-disabled')).toBe('true');
  expect(reasonOf(pickOf(2))).toBe('Inside an art layer, tools draw on the edit layer only.');
});

// The reason an off row gives a screen reader: the text its aria-describedby names.
const reasonOf = (button) => button.getAttribute('aria-describedby').split(' ').map((id) => document.getElementById(id).textContent).join(' ');

test('the base row is off for an artist', async () => {
  const { workspace } = await mount(({ project }) => { project._sharing = { role: 'artist' }; });
  const pickSpy = vi.spyOn(workspace, 'pickLayer');
  expect(pickOf(1).getAttribute('aria-disabled')).toBe('true');
  expect(reasonOf(pickOf(1))).toBe("Only the room's host can change this.");
  expect(pickOf(1).title).toBe("Only the room's host can change this.");
  pickOf(1).click();
  await nextTick();
  expect(pickSpy).not.toHaveBeenCalled();
  expect(workspace.pickedLayer).toBe('edit');
  expect(pickOf(0).hasAttribute('aria-disabled')).toBe(false);
  expect(pickOf(0).hasAttribute('aria-describedby')).toBe(false);
});

test('Enter and the blur after it rename once; Enter while an IME is composing keeps the box', async () => {
  const { project } = await mount();
  const spy = vi.spyOn(project, 'renameLayer');
  const input = () => rows()[0].querySelector('input');
  rows()[0].querySelector('.name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await nextTick();
  input().value = 'Ink';
  input().dispatchEvent(new Event('input'));
  input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
  await nextTick();
  expect(input()).not.toBeNull();
  expect(spy).not.toHaveBeenCalled();
  const box = input();
  box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  box.dispatchEvent(new FocusEvent('blur'));   // the box going takes focus with it
  await nextTick();
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledWith('edit', 'Ink');
});

test('on SAUCE it says so', async () => {
  const { workspace } = await mount();
  expect(rows()).toHaveLength(2);
  workspace.editorTab = 'sauce';
  await nextTick();
  expect(rows()).toHaveLength(0);
  expect(host.textContent.trim()).toBe("Layers show while a drawing's art is showing.");
});

test('with nothing open it says so', async () => {
  await mount(({ project }) => { project.image = null; });
  expect(rows()).toHaveLength(0);
  expect(host.textContent.trim()).toBe("Layers show while a drawing's art is showing.");
});

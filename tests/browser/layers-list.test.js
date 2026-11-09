// The LAYERS list (LayersList.vue): the drawing's layers top first, a row picked to decide the tabs, an eye to hide one,
// a double-click to rename it, and + Vector layer while there's none.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import { rectShape } from '@/document/shapes.js';
import LayersList from '@/components/LayersList.vue';

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
const addButton = () => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === '+ Vector layer');
const key = async (el, k) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  await nextTick();
};

test('lists edit, vector and base, top first', async () => {
  await mount(({ project }) => project.addShape(rectShape(0, 0, 4, 4, { fill: '#ff0000' })));
  expect(names()).toEqual(['Layer 1', 'Vector 1', 'Base']);
  expect(pickOf(0).getAttribute('aria-pressed')).toBe('true');
  expect(addButton()).toBeUndefined();
});

test('no shapes and no vector layer: two rows and + Vector layer', async () => {
  const { workspace } = await mount();
  expect(names()).toEqual(['Layer 1', 'Base']);
  addButton().click();
  await nextTick();
  expect(names()).toEqual(['Layer 1', 'Vector 1', 'Base']);
  expect(pickOf(1).getAttribute('aria-pressed')).toBe('true');
  expect(pickOf(0).getAttribute('aria-pressed')).toBe('false');
  expect(workspace.editorTab).toBe('vector');
  expect(addButton()).toBeUndefined();
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
  expect(project.layerInfo.edit.hidden).toBe(true);
  expect(eyeOf(0).getAttribute('aria-label')).toBe('Show Layer 1');
  eyeOf(0).click();
  await nextTick();
  expect(project.layerInfo.edit.hidden).toBe(false);
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
  expect(project.layerInfo.edit.name).toBe('Ink');
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
  expect(project.layerInfo.edit.name).toBe(null);
  expect(names()[0]).toBe('Layer 1');

  await key(pickOf(1), 'F2');   // the keyboard's way in
  expect(rows()[1].querySelector('input').getAttribute('aria-label')).toBe('Rename Base');
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

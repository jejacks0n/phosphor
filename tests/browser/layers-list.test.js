// The LAYERS list (LayersList.vue): the drawing's layers top first, a row picked to decide the tabs, an eye to hide one,
// a click on the picked row's name (or a double-click) to rename it, ⋯ to rename or move it, and a header over it counting
// the layers, with Add layer and Add vector layer.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import { rectShape } from '@/document/shapes.js';
import LayersList from '@/components/LayersList.vue';
import { useDrawingStore } from '@/store/DrawingStore';
import { MOST_LAYERS } from '@/document/layerInfo.js';
import { ownsKey } from '@/lib/fields';
import { useTextTool } from '@/composables/useTextTool';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

async function mount(before = () => {}, { withLayer = true } = {}) {
  const stores = await createTestApp();
  await stores.project.setBlankCanvas({ withLayer, cols: 20, rows: 10 });
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
const addButton = (label = 'Add vector layer') => host.querySelector(`div.head button[aria-label="${label}"]`);
const count = () => host.querySelector('div.head span.count').textContent.trim();
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

test('Add layer adds directly above the pick and picks it', async () => {
  const { project, workspace } = await mount();
  expect(names()).toEqual(['Layer 1', 'Base']);
  expect(count()).toBe(`2 of ${MOST_LAYERS} layers`);
  addButton('Add layer').click();
  await nextTick();
  expect(names()).toEqual(['Layer 2', 'Layer 1', 'Base']);
  expect(count()).toBe(`3 of ${MOST_LAYERS} layers`);
  expect(workspace.pickedLayer).toBe(project.layers[2].id);
  expect(pickOf(0).getAttribute('aria-pressed')).toBe('true');
  pickOf(2).click(); // the base: the next goes directly above it
  await nextTick();
  addButton('Add layer').click();
  await nextTick();
  expect(names()).toEqual(['Layer 2', 'Layer 1', 'Layer 3', 'Base']);
  expect(workspace.pickedLayer).toBe(project.layers[1].id);
});

test('a new drawing lists only the base, counted as 1 of the most layers, and Add layer makes Layer 1', async () => {
  const { workspace } = await mount(() => {}, { withLayer: false });
  expect(names()).toEqual(['Base']);
  expect(count()).toBe(`1 of ${MOST_LAYERS} layers`);
  addButton('Add layer').click();
  await nextTick();
  expect(names()).toEqual(['Layer 1', 'Base']);
  expect(workspace.pickedLayer).toBe('edit');
});

test('Add vector layer always shows and adds above the pick', async () => {
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

test('an item chosen from ⋯ with the keyboard leaves focus in the list: on the trigger, or after Delete on the row picked', async () => {
  const { project, workspace } = await mount();
  let item = await openMenu(0);
  item('Duplicate').focus();
  item('Duplicate').click(); // Enter on a focused button
  await settle(project);
  await nextTick();
  expect(names()).toEqual(['Layer 1 copy', 'Layer 1', 'Base']);
  expect(document.activeElement).toBe(menuOf(1)); // Layer 1's ⋯, which the item was chosen from
  item = await openMenu(0);
  item('Delete').focus();
  item('Delete').click();
  await settle(project);
  await nextTick();
  expect(names()).toEqual(['Layer 1', 'Base']);
  expect(workspace.pickedLayer).toBe('edit');
  expect(document.activeElement).toBe(pickOf(0)); // the row is gone: the one picked now, not the page
});

test('in a room the ⋯ items and the add buttons that change the stack are on, as alone, and Add layer goes above the pick', async () => {
  const send = vi.fn();
  const { project, workspace } = await mount(({ project }) => {
    project.addLayer('cells', 'edit');
    project.addLayer('cells', 'edit');
    project.startSharing({ send, role: 'host', me: 'host' });
  });
  const item = await openMenu(1);
  for (const label of ['Rename', 'Duplicate', 'Delete', 'Move up', 'Move down']) {
    expect(item(label).disabled, label).toBe(false);
    expect(item(label).title, label).toBe('');
  }
  for (const label of ['Add layer', 'Add vector layer']) expect(addButton(label).disabled, label).toBe(false);
  addButton('Add layer').click();
  await nextTick();
  expect(project.layers[2].id).toBe(workspace.pickedLayer);
  expect(project.layers[1].id).toBe('edit');
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ t: 'layers', by: 'host', made: workspace.pickedLayer }));
  project.stopSharing();
});

test('while a room\'s drawing is paused, nothing that changes the stack is on, and says why', async () => {
  const { project } = await mount(({ project }) => {
    project.addLayer('cells', 'edit');
    project.startSharing({ send: vi.fn(), role: 'host', me: 'host' });
    useDrawingStore().paused = true;
  });
  const why = 'Not while drawing is paused.';
  for (const label of ['Add layer', 'Add vector layer']) {
    expect(addButton(label).disabled, label).toBe(true);
    expect(addButton(label).title, label).toBe(why);
  }
  const item = await openMenu(0);
  for (const label of ['Rename', 'Duplicate', 'Delete', 'Move up', 'Move down']) {
    expect(item(label).disabled, label).toBe(true);
    expect(item(label).title, label).toBe(why);
  }
  await key(pickOf(0), 'F2');
  expect(host.querySelector('input')).toBe(null);   // no rename by its key either
  project.stopSharing();
});

test('at the most layers Add layer, Add vector layer and Duplicate are off and say why', async () => {
  await mount(({ project }) => { while (project.layers.length < MOST_LAYERS) project.addLayer('cells', 'edit'); });
  for (const label of ['Add layer', 'Add vector layer']) {
    expect(addButton(label).disabled).toBe(true);
    expect(addButton(label).title).toBe(`A drawing can have up to ${MOST_LAYERS} layers.`);
  }
  const item = await openMenu(0);
  expect(item('Duplicate').disabled).toBe(true);
  expect(item('Duplicate').title).toBe(`A drawing can have up to ${MOST_LAYERS} layers.`);
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

// The command list's Layer: Rename asks through workspace.renameRequest: the list showing takes it, one mounted after
// the ask too (a narrow screen's panel, opened by the row).
test('a rename asked by the command list opens the row\'s box, in a list mounted after the ask too', async () => {
  const { workspace } = await mount(({ workspace }) => { workspace.renameRequest = 'edit'; });
  await nextTick();
  const input = () => rows()[0].querySelector('input');
  expect(input()).not.toBeNull();
  expect(document.activeElement).toBe(input());
  expect(workspace.renameRequest).toBe(null);
  await key(input(), 'Escape');
  workspace.renameRequest = 'edit';
  await nextTick();
  await nextTick();
  expect(input()).not.toBeNull();  await key(input(), 'Escape');
  workspace.renameRequest = 'vector';   // no row for it: let go, so no box opens later
  await nextTick();
  expect(workspace.renameRequest).toBe(null);
  expect(input()).toBeNull();
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
  expect(names()).toEqual(['Vector 1', 'Layer 1', 'Base']); // made directly over Layer 1
  expect(pickOf(0).getAttribute('aria-pressed')).toBe('true');
  expect(pickOf(2).getAttribute('aria-disabled')).toBe('true');
  expect(reasonOf(pickOf(2))).toBe('Inside an art layer, drawing tools work on the art layer only.');
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
  expect(host.textContent.trim()).toBe('Layers appear while your artwork is showing.');
});

test('with nothing open it says so', async () => {
  await mount(({ project }) => { project.image = null; });
  expect(rows()).toHaveLength(0);
  expect(host.textContent.trim()).toBe('Layers appear while your artwork is showing.');
});

// The rows walked with the keys, as the tabs are: ↑ ↓ Home End move focus and pick as they go, past a row that's off,
// and the rows own them (data-walk), so the view doesn't take focus for them.
test('↓ on a focused row focuses and picks the next, ↑ the one above, Home and End the ends; Alt+↓ is left alone', async () => {
  const { project, workspace } = await mount(({ project }) => project.addLayer('cells', 'edit'));
  const top = project.layers[2].id;
  pickOf(0).focus();
  const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
  pickOf(0).dispatchEvent(down);
  await nextTick();
  await nextTick();
  expect(down.defaultPrevented).toBe(true);
  expect(workspace.pickedLayer).toBe('edit');
  expect(document.activeElement).toBe(pickOf(1));
  expect(ownsKey(pickOf(1), down)).toBe(true);
  await key(pickOf(1), 'End');
  await nextTick();
  expect(workspace.pickedLayer).toBe('base');
  expect(document.activeElement).toBe(pickOf(2));
  await key(pickOf(2), 'ArrowUp');
  await nextTick();
  expect(workspace.pickedLayer).toBe('edit');
  await key(pickOf(1), 'Home');
  await nextTick();
  expect(workspace.pickedLayer).toBe(top);
  const altDown = new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true });
  pickOf(0).dispatchEvent(altDown);
  expect(altDown.defaultPrevented).toBe(false);
  expect(workspace.pickedLayer).toBe(top);
});

test('for an artist End stops at the row above the base, which is off', async () => {
  const { workspace } = await mount(({ project, workspace }) => {
    workspace.pickLayer(project.addLayer('cells', 'edit'));
    project._sharing = { role: 'artist', heard: [] };
  });
  pickOf(0).focus();
  await key(pickOf(0), 'End');
  await nextTick();
  expect(workspace.pickedLayer).toBe('edit');
  expect(document.activeElement).toBe(pickOf(1));
  await key(pickOf(1), 'ArrowDown');
  await nextTick();
  expect(workspace.pickedLayer).toBe('edit');
  expect(document.activeElement).toBe(pickOf(1));
});

// With Edit Mode's cursor placed the rows keep the keys: the cursor doesn't move, and walking off a vector row onto a
// cells row (ANSI again, so typing's in use again) leaves focus on the row rather than handing it to typing.
test('with the cursor placed, ↓ walks from a vector row onto a cells row, the cursor stays and focus stays on the row', async () => {
  const textarea = document.body.appendChild(Object.assign(document.createElement('textarea'), {}));
  textarea.dataset.textInput = '';
  let typingApp = null;
  try {
    const { project, workspace } = await mount(({ project, workspace }) => {
      const vector = project.addLayer('vector', 'edit');
      workspace.setActiveTool('text');
      workspace.textCursor = { col: 3, row: 2 };
      workspace.pickLayer(vector);
    });
    typingApp = createApp({ setup() { useTextTool(project, workspace, ref(textarea)); return () => null; } }).use(getActivePinia()).use(i18n);
    typingApp.mount(document.createElement('div'));
    expect(workspace.editorTab).toBe('vector');
    pickOf(0).focus();
    await key(pickOf(0), 'ArrowDown');
    await new Promise((resolve) => setTimeout(resolve, 10)); // past typing's refocus
    expect(workspace.pickedLayer).toBe('edit');
    expect(workspace.editorTab).toBe('output');
    expect(document.activeElement).toBe(pickOf(1));
    expect(workspace.textCursor).toEqual({ col: 3, row: 2 });
    await key(pickOf(1), 'ArrowUp');
    await key(pickOf(0), 'ArrowDown');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(document.activeElement).toBe(pickOf(1));
    for (const arrow of ['ArrowLeft', 'ArrowRight']) { // the rows' too, doing nothing: the cursor stays
      const e = new KeyboardEvent('keydown', { key: arrow, bubbles: true, cancelable: true });
      pickOf(1).dispatchEvent(e);
      expect(e.defaultPrevented, arrow).toBe(true);
      expect(workspace.textCursor, arrow).toEqual({ col: 3, row: 2 });
    }
    expect(workspace.pickedLayer).toBe('edit');
    expect(project.layers).toHaveLength(3);
  } finally {
    typingApp?.unmount();
    textarea.remove();
  }
});

// A row clicked keeps no such hold: typing takes the keyboard back once a click picks a cells row from a vector one, as
// it does for any button clicked.
test('with the cursor placed, a click on a cells row from a vector one hands focus back to typing', async () => {
  const textarea = document.body.appendChild(document.createElement('textarea'));
  textarea.dataset.textInput = '';
  let typingApp = null;
  try {
    const { project, workspace } = await mount(({ project, workspace }) => {
      const vector = project.addLayer('vector', 'edit');
      workspace.setActiveTool('text');
      workspace.textCursor = { col: 3, row: 2 };
      workspace.pickLayer(vector);
    });
    typingApp = createApp({ setup() { useTextTool(project, workspace, ref(textarea)); return () => null; } }).use(getActivePinia()).use(i18n);
    typingApp.mount(document.createElement('div'));
    window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    pickOf(1).focus(); // where the press puts focus
    pickOf(1).click();
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(workspace.editorTab).toBe('output');
    expect(document.activeElement).toBe(textarea);
  } finally {
    typingApp?.unmount();
    textarea.remove();
  }
});

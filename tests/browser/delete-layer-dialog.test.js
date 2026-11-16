// Delete in a room asks first (DeleteLayerDialog): everyone in the room loses the layer and what's on it, and no one can
// undo that. Alone, Delete is an undo step and doesn't ask.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import LayersList from '@/components/LayersList.vue';
import DeleteLayerDialog from '@/components/DeleteLayerDialog.vue';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
  vi.restoreAllMocks();
});

async function mount() {
  const stores = await createTestApp();
  await stores.project.setBlankCanvas({ cols: 20, rows: 10 });
  stores.project.addLayer('cells', 'edit');
  await settle(stores.project);
  stores.workspace.editorTab = 'output';
  host = document.body.appendChild(document.createElement('div'));
  app = createApp({ render: () => [h(LayersList), h(DeleteLayerDialog)] }).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  return stores;
}
const names = () => [...host.querySelectorAll('li')].map((li) => li.querySelector('button.pick').textContent.trim());
// The top row's ⋯ Delete, a moment after the menu mounts (Vue skips a click in the same millisecond).
async function deleteTopRow() {
  host.querySelector('li button.dropdown-trigger').click();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 5));
  [...host.querySelector('li').querySelectorAll('.dropdown-content button')].find((b) => b.textContent.trim() === 'Delete').click();
  await nextTick();
}
// The question is a modal, on the body.
const dialog = () => document.querySelector('dialog[open]');
const choices = () => [...document.querySelectorAll('button.choice')].map((b) => b.querySelector('b').textContent.trim());

test('in a room, Delete asks first; Cancel keeps the layer; alone it doesn\'t ask', async () => {
  const { project, workspace } = await mount();
  const top = project.layers.at(-1).id;
  project._sharing = { role: 'host', me: 'host' };
  const deletes = vi.spyOn(project, 'deleteLayer').mockReturnValue(true);
  await deleteTopRow();
  expect(workspace.deleteLayerAsk).toEqual({ id: top });
  expect(dialog().querySelector('h3').textContent).toBe('Delete Layer 2 for everyone?');
  expect(dialog().querySelector('p.sub').textContent).toBe('Everyone in the room loses this layer and what\'s on it. This can\'t be undone.');
  expect(choices()).toEqual(['Delete layer']);
  dialog().querySelector('button.cancel').click();
  await nextTick();
  expect(dialog()).toBe(null);
  expect(workspace.deleteLayerAsk).toBe(null);
  expect(deletes).not.toHaveBeenCalled();
  expect(names()).toEqual(['Layer 2', 'Layer 1', 'Base']);

  await deleteTopRow();
  document.querySelector('button.choice').click();
  await nextTick();
  expect(deletes).toHaveBeenCalledWith(top);
  expect(dialog()).toBe(null);

  deletes.mockRestore();
  project._sharing = null;
  await deleteTopRow();
  await settle(project);
  expect(dialog()).toBe(null);
  expect(workspace.deleteLayerAsk).toBe(null);
  expect(names()).toEqual(['Layer 1', 'Base']);
});

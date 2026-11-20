// The plugin store: installed plugins kept in IndexedDB, read from a manifest file, switched on and off and removed,
// and what happens to the theme in use when its plugin stops offering it. Real IndexedDB, a database of this file's own.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import midnight from '../fixtures/plugins/midnight/phosphor-plugin.json?raw';
import { MOST_MANIFEST_BYTES } from '@/plugins/manifest';
import { loadPlugins, putPlugin } from '@/plugins/storage';
import { usePluginStore } from '@/store/PluginStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { ownDatabase } from '../support/socialDatabase.js';

const MIDNIGHT = 'plugin:jane.midnight/midnight';

beforeEach(() => ownDatabase('phosphor-plugins', 'plugin-store')());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem('phosphor.theme');
});

const file = (text, name = 'phosphor-plugin.json') => new File([text], name, { type: 'application/json' });
const changed = (change) => {
  const raw = JSON.parse(midnight);
  change(raw);
  return JSON.stringify(raw);
};
const stores = () => {
  setActivePinia(createPinia());
  return { store: usePluginStore(), workspace: useWorkspaceStore() };
};
const installed = async (store, text = midnight) => store.install((await store.read(file(text))).manifest);

test('a manifest read from a file is installed on, listed, and still there after a load in a new store', async () => {
  const { store } = stores();
  const read = await store.read(file(midnight));
  expect(read.manifest.id).toBe('jane.midnight');
  expect(read.replaces).toBe(null);
  await store.install(read.manifest);
  expect(store.plugins).toHaveLength(1);
  expect(store.plugins[0]).toMatchObject({ id: 'jane.midnight', enabled: true, source: 'file' });

  const again = stores().store;
  await again.load();
  expect(again.plugins.map(({ id }) => id)).toEqual(['jane.midnight']);
  expect(again.themes).toEqual([{
    ref: MIDNIGHT, name: 'Midnight', base: 'dark',
    colors: { background: '#0b1020', accent: '#7aa2f7', 'surface-0': '#10162b' },
  }]);
});

test('a file that is not a manifest is refused in words, and nothing is stored', async () => {
  const { store } = stores();
  await expect(store.read(file('{nope'))).rejects.toMatchObject({ userMessage: 'That file isn\'t a plugin\'s manifest.' });
  await expect(store.read(file(' '.repeat(MOST_MANIFEST_BYTES + 1))))
    .rejects.toMatchObject({ userMessage: 'That file is too big to be a plugin\'s manifest.' });
  await expect(store.read(file(changed((m) => { m.themes[0].colors.accent = 'red'; }))))
    .rejects.toMatchObject({ userMessage: 'The theme “Midnight” sets “accent” to “red”, which isn\'t a hex color.' });
  expect(await loadPlugins()).toEqual([]);
});

test('off, its themes leave the list and the theme in use goes to its base; on again, they are back', async () => {
  const { store, workspace } = stores();
  await installed(store);
  workspace.theme = MIDNIGHT;
  await store.setEnabled('jane.midnight', false);
  expect(store.themes).toEqual([]);
  expect(workspace.theme).toBe('dark');
  await store.setEnabled('jane.midnight', true);
  expect(store.themes.map(({ ref }) => ref)).toEqual([MIDNIGHT]);
  expect(workspace.theme).toBe('dark');
});

test('removed, it is forgotten and the theme in use goes to its base', async () => {
  const { store, workspace } = stores();
  await installed(store, changed((m) => { m.themes[0].base = 'light'; }));
  workspace.theme = MIDNIGHT;
  await store.uninstall('jane.midnight');
  expect(store.plugins).toEqual([]);
  expect(workspace.theme).toBe('light');
  expect(await loadPlugins()).toEqual([]);
});

test('a newer version replaces it and keeps it off; without the theme in use, the app goes to its base', async () => {
  const { store, workspace } = stores();
  await installed(store);
  await store.setEnabled('jane.midnight', false);
  const read = await store.read(file(changed((m) => { m.version = '1.1.0'; })));
  expect(read.replaces.manifest.version).toBe('1.0.0');
  await store.install(read.manifest);
  expect(store.plugins).toHaveLength(1);
  expect(store.plugins[0]).toMatchObject({ enabled: false, manifest: { version: '1.1.0' } });

  await store.setEnabled('jane.midnight', true);
  workspace.theme = MIDNIGHT;
  await installed(store, changed((m) => { m.version = '1.2.0'; m.themes[0].id = 'dusk'; }));
  expect(workspace.theme).toBe('dark');
});

test('a stored record that is no longer a good manifest is skipped', async () => {
  const { store } = stores();
  const manifest = JSON.parse(midnight);
  await putPlugin({ id: 'jane.midnight', manifest, enabled: true, source: 'file', installedAt: 1 });
  await putPlugin({ id: 'jane.later', manifest: { ...manifest, id: 'jane.later', phosphor: 2 }, enabled: true, source: 'file', installedAt: 2 });
  await store.load();
  expect(store.plugins.map(({ id }) => id)).toEqual(['jane.midnight']);
});

test('a browser that will not keep anything starts with no plugins and says so', async () => {
  const { store } = stores();
  vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('no', 'SecurityError'); });
  await store.load();
  expect(store.plugins).toEqual([]);
  expect(store.unavailable).toBe(true);
});

test('started with plugins off, no theme is on offer though the plugins are listed', async () => {
  const { store } = stores();
  await installed(store);
  store.off = true;
  expect(store.themes).toEqual([]);
  expect(store.plugins).toHaveLength(1);
});

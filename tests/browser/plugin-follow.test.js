// An author's plugin, installed through the browser's picker, keeps a link to its file: Reload reads it again, and
// Follow file takes each save. Real handles from the origin's private file system stand in for a picked file.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import midnight from '../../plugins/midnight/phosphor-plugin.json?raw';
import { usePluginStore, linksFiles } from '@/store/PluginStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { ownDatabase } from '../support/socialDatabase.js';
import { ownHangMark } from '../support/ownHangMark.js';

const ID = 'phosphor.midnight';
let dir, name, handle, store;

beforeEach(async () => {
  await ownDatabase('phosphor-plugins', 'plugin-follow')();
  ownHangMark('plugin-follow');
  dir = await navigator.storage.getDirectory();
  name = `plugin-${Math.random().toString(36).slice(2)}.json`;
  handle = await dir.getFileHandle(name, { create: true });
  await write(midnight);
  window.showOpenFilePicker = vi.fn(async () => [handle]);
});
afterEach(async () => {
  for (const id of Object.keys(store?.following ?? {})) await store.follow(id, false);
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.showOpenFilePicker = undefined; // as tests/support/noFilePickers.js leaves it
  await dir.removeEntry(name).catch(() => {});
  localStorage.removeItem('phosphor.theme');
});

async function write(text) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}
const changed = (change) => {
  const raw = JSON.parse(midnight);
  change(raw);
  return JSON.stringify(raw);
};
const newStore = () => {
  setActivePinia(createPinia());
  useWorkspaceStore();
  return usePluginStore();
};
const picked = async () => {
  store = newStore();
  const { manifest, handle: kept } = await store.pick();
  await store.install(manifest, { handle: kept });
  return store;
};
// A save a moment later, so its lastModified differs from the one seen.
const save = async (text) => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  await write(text);
};

test('picked with the browser\'s picker, a plugin keeps its file, and Reload takes what it now holds without asking', async () => {
  expect(linksFiles()).toBe(true);
  store = newStore();
  const read = await store.pick();
  expect(read.manifest.id).toBe(ID);
  expect(read.replaces).toBe(null);
  expect(await read.handle.isSameEntry(handle)).toBe(true);
  await store.install(read.manifest, { handle: read.handle });
  expect(await store.plugins[0].handle.isSameEntry(handle)).toBe(true);

  await write(changed((m) => { m.version = '1.0.1'; m.themes[0].colors['surface-0'] = '#000000'; }));
  expect(await store.reload(ID)).toBe(true);
  expect(store.plugins[0].manifest.version).toBe('1.0.1');
  expect(store.themes[0].colors['surface-0']).toBe('#000000');
});

test('the kept file is still there after a load in a new store', async () => {
  await picked();
  store = newStore();
  await store.load();
  expect(await store.reload(ID)).toBe(true);
});

test('a save that is not a good manifest keeps the last good version and says why; the next good save clears it', async () => {
  await picked();
  await write('{nope');
  expect(await store.reload(ID)).toBe(false);
  expect(store.problems[ID]).toBe('That file isn\'t a plugin\'s manifest.');
  expect(store.plugins[0].manifest.version).toBe('1.0.0');
  await write(midnight);
  expect(await store.reload(ID)).toBe(true);
  expect(store.problems[ID]).toBeUndefined();
});

test('a file that became another plugin is refused', async () => {
  await picked();
  await write(changed((m) => { m.id = 'jane.other'; }));
  expect(await store.reload(ID)).toBe(false);
  expect(store.problems[ID]).toBe('That file is now a different plugin (jane.other).');
  expect(store.plugins).toHaveLength(1);
});

test('followed, a saved file is taken by itself; unfollowed, it is left', async () => {
  await picked();
  await store.follow(ID, true);
  expect(store.following[ID]).toBe(true);
  await save(changed((m) => { m.version = '1.0.2'; }));
  await store.checkFollowed();
  expect(store.plugins[0].manifest.version).toBe('1.0.2');
  await store.follow(ID, false);
  await save(changed((m) => { m.version = '1.0.3'; }));
  await store.checkFollowed();
  expect(store.plugins[0].manifest.version).toBe('1.0.2');
});

test('a followed file left alone is not read again', async () => {
  await picked();
  await store.follow(ID, true);
  const reload = vi.spyOn(store, 'reload');
  await store.checkFollowed();
  await store.checkFollowed();
  expect(reload).not.toHaveBeenCalled();
});

test('a followed file that is gone stops being followed and says so', async () => {
  await picked();
  await store.follow(ID, true);
  await dir.removeEntry(name);
  await store.checkFollowed();
  expect(store.following[ID]).toBeUndefined();
  expect(store.problems[ID]).toBe('That file can\'t be read anymore.');
  expect(store.plugins).toHaveLength(1);
});

test('the timer runs only while something is followed', async () => {
  await picked();
  vi.useFakeTimers();
  await store.follow(ID, true);
  expect(vi.getTimerCount()).toBe(1);
  await store.follow(ID, false);
  expect(vi.getTimerCount()).toBe(0);
  await store.follow(ID, true);
  await store.uninstall(ID);
  expect(vi.getTimerCount()).toBe(0);
  expect(store.following[ID]).toBeUndefined();
});

test('installed again through a plain file, the link is forgotten', async () => {
  await picked();
  await store.follow(ID, true);
  const { manifest } = await store.read(new File([changed((m) => { m.version = '1.0.4'; })], 'phosphor-plugin.json'));
  await store.install(manifest);
  expect(store.plugins[0].handle).toBeUndefined();
  expect(store.following[ID]).toBeUndefined();
});

test('canceling the picker installs nothing', async () => {
  store = newStore();
  window.showOpenFilePicker = vi.fn(async () => { throw new DOMException('The user aborted a request.', 'AbortError'); });
  expect(await store.pick()).toBe(null);
  expect(store.plugins).toEqual([]);
});

test('a followed folder takes a save of either file', async () => {
  const folder = await dir.getDirectoryHandle(`folder-${Math.random().toString(36).slice(2)}`, { create: true });
  const put = async (file, text) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    const writable = await (await folder.getFileHandle(file, { create: true })).createWritable();
    await writable.write(text);
    await writable.close();
  };
  const SCRIPT = (name) => `export default { solvers: [{ id: 'edges', name: '${name}', styles: ['ansi'], reach: 0, solve: () => ({ char: ' ', fg: 0, bg: 0 }) }] };`;
  const EDGES = 'plugin:phosphor.midnight/edges';
  try {
    await put('phosphor-plugin.json', changed((m) => { m.script = 'outlines.js'; }));
    await put('outlines.js', SCRIPT('Edges'));
    window.showDirectoryPicker = vi.fn(async () => folder);
    store = newStore();
    const picked = await store.pickFolder();
    await store.install(picked.manifest, { script: picked.script, handle: picked.handle });
    await store.follow(ID, true);
    const reload = vi.spyOn(store, 'reload');
    await store.checkFollowed();
    expect(reload).not.toHaveBeenCalled();

    await put('outlines.js', SCRIPT('Edges 2'));
    await store.checkFollowed();
    expect(store.solvers[EDGES].name).toBe('Edges 2');

    await put('phosphor-plugin.json', changed((m) => { m.script = 'outlines.js'; m.version = '1.0.5'; }));
    await store.checkFollowed();
    expect(store.plugins[0].manifest.version).toBe('1.0.5');
    expect(reload).toHaveBeenCalledTimes(2);
    expect(store.following[ID]).toBe(true);
  } finally {
    store.dropSolvers(ID);
    window.showDirectoryPicker = undefined;
    await dir.removeEntry(folder.name, { recursive: true });
  }
});

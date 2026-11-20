// The plugin store with scripts: read without running anything, imported only at Install, kept with its hash, loaded on
// each visit for the plugins that are on, and an author's folder reloaded through its handle. Real IndexedDB, a database
// of this file's own; the registry outlives a Pinia, so each test drops what it registered.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { HANG_KEY, beginRun } from '@/plugins/hangMark';
import { sha256 } from '@/plugins/script';
import { solverRef } from '@/plugins/solvers';
import { loadPlugins, putPlugin } from '@/plugins/storage';
import { usePluginStore } from '@/store/PluginStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { zipOf } from '../support/zipOf.js';
import { ownDatabase } from '../support/socialDatabase.js';
import { ownHangMark } from '../support/ownHangMark.js';

const ID = 'jane.outlines';
const EDGES = solverRef(ID, 'edges');
const manifest = (change = () => {}) => {
  const raw = { phosphor: 1, id: ID, name: 'Outlines', version: '1.0.0', author: 'Jane', script: 'outlines.js' };
  change(raw);
  return JSON.stringify(raw);
};
// An Outlines-like script; top runs at its top level, so a test sees when it was imported.
const script = ({ id = 'edges', name = 'Edges', top = '' } = {}) => `${top}
export default { solvers: [{ id: '${id}', name: '${name}', styles: ['ansi'], reach: 1, chars: '/', solve: () => ({ char: '/', fg: 0, bg: 0 }) }] };`;
const pkg = (manifestText = manifest(), scriptText = script()) => [
  { path: 'phosphor-plugin.json', file: new File([manifestText], 'phosphor-plugin.json') },
  { path: 'outlines.js', file: new File([scriptText], 'outlines.js') },
];

let store;
const newStore = () => {
  setActivePinia(createPinia());
  useWorkspaceStore();
  return usePluginStore();
};
const installed = async (from = pkg()) => {
  const { manifest: read, script: text } = await store.read(from);
  await store.install(read, { script: text });
};

beforeEach(async () => {
  await ownDatabase('phosphor-plugins', 'plugin-scripts')();
  ownHangMark('plugin-scripts');
  globalThis.ran = 0;
  store = newStore();
});
afterEach(async () => {
  for (const id of Object.keys(store?.following ?? {})) await store.follow(id, false);
  store?.dropSolvers(ID);
  localStorage.removeItem(HANG_KEY);
  vi.restoreAllMocks();
  window.showOpenFilePicker = undefined;
  window.showDirectoryPicker = undefined;
  delete globalThis.ran;
});

test('installing a plugin with a script registers its solvers, and nothing runs before install', async () => {
  const read = await store.read(pkg(manifest(), script({ top: 'globalThis.ran++;' })));
  expect(read).toMatchObject({ manifest: { id: ID, script: 'outlines.js' }, replaces: null, handle: null });
  expect(read.script).toContain('globalThis.ran++');
  expect(globalThis.ran).toBe(0);
  expect(store.solvers[EDGES]).toBeUndefined();

  await store.install(read.manifest, { script: read.script });
  expect(globalThis.ran).toBe(1);
  expect(store.solvers[EDGES]).toMatchObject({ pluginId: ID, name: 'Edges', reach: 1 });
  const [record] = await loadPlugins();
  expect(record).toMatchObject({ id: ID, enabled: true, script: read.script, scriptHash: await sha256(read.script) });
  expect(localStorage.getItem(HANG_KEY)).toBe(null); // the import's mark is cleared
});

test('a script that fails its checks installs nothing and keeps the older version', async () => {
  const bad = await store.read(pkg(manifest(), 'export default { solvers: [{ id: "x" }] }'));
  await expect(store.install(bad.manifest, { script: bad.script })).rejects.toMatchObject({ userMessage: expect.stringContaining('solvers[0]') });
  expect(store.plugins).toEqual([]);
  expect(await loadPlugins()).toEqual([]);

  await installed();
  const broken = await store.read(pkg(manifest((m) => { m.version = '1.1.0'; }), 'export default {'));
  await expect(store.install(broken.manifest, { script: broken.script })).rejects.toMatchObject({ userMessage: expect.stringContaining('couldn\'t be loaded') });
  expect(store.plugins[0].manifest.version).toBe('1.0.0');
  expect((await loadPlugins())[0].manifest.version).toBe('1.0.0');
  expect(store.solvers[EDGES]).toBeDefined();
  expect(localStorage.getItem(HANG_KEY)).toBe(null);
});

test('a manifest that names a script is not installed without it', async () => {
  const { manifest: read } = await store.read(pkg());
  await expect(store.install(read)).rejects.toMatchObject({ userMessage: 'The plugin names a script, outlines.js, that isn\'t in it.' });
  expect(store.plugins).toEqual([]);
});

test('off unregisters, on registers, remove unregisters; each bumps solverStamp', async () => {
  await installed();
  let stamp = store.solverStamp;
  await store.setEnabled(ID, false);
  expect(store.solvers[EDGES]).toBeUndefined();
  expect(store.solverStamp).toBeGreaterThan(stamp);
  stamp = store.solverStamp;
  await store.setEnabled(ID, true);
  expect(store.solvers[EDGES]).toBeDefined();
  expect(store.solverStamp).toBeGreaterThan(stamp);
  stamp = store.solverStamp;
  await store.uninstall(ID);
  expect(store.solvers[EDGES]).toBeUndefined();
  expect(store.solverStamp).toBeGreaterThan(stamp);
});

test('a load imports only on plugins, and none under plugins=off', async () => {
  await installed(pkg(manifest(), script({ top: 'globalThis.ran++;' })));
  await store.setEnabled(ID, false);
  globalThis.ran = 0;

  store = newStore(); // a new visit
  await store.load();
  expect(globalThis.ran).toBe(0);
  expect(store.solvers[EDGES]).toBeUndefined();

  await store.setEnabled(ID, true);
  expect(globalThis.ran).toBe(1);
  store.dropSolvers(ID);
  store = newStore();
  await store.load();
  expect(globalThis.ran).toBe(2);
  expect(store.solvers[EDGES]).toBeDefined();
  await store.load(); // the dialog opening: what this visit has is kept, not imported again
  expect(globalThis.ran).toBe(2);

  store.dropSolvers(ID);
  store = newStore();
  store.off = true;
  await store.load();
  expect(globalThis.ran).toBe(2);
  expect(store.solvers[EDGES]).toBeUndefined();
  expect(store.plugins).toHaveLength(1);
});

test('a plugin with a script is not installed while plugins are off', async () => {
  store.off = true;
  const read = await store.read(pkg(manifest(), script({ top: 'globalThis.ran++;' })));
  await expect(store.install(read.manifest, { script: read.script })).rejects.toMatchObject({ userMessage: expect.stringContaining('off for this visit') });
  expect(globalThis.ran).toBe(0);
  expect(await loadPlugins()).toEqual([]);
});

test('a stored script whose hash no longer matches is not loaded and says so', async () => {
  await installed();
  store.dropSolvers(ID);
  const [record] = await loadPlugins();
  await putPlugin({ ...record, script: script({ name: 'Swapped' }) });
  store = newStore();
  await store.load();
  expect(store.solvers[EDGES]).toBeUndefined();
  expect(store.problems[ID]).toBe('Outlines\'s kept script isn\'t the one that was installed, so it isn\'t loaded. Install it again.');
});

test('a hang mark left by the last visit switches that plugin off with the reason', async () => {
  await installed();
  store.dropSolvers(ID);
  localStorage.setItem(HANG_KEY, JSON.stringify({ pluginId: ID, page: 'a-page-no-one-holds' }));
  store = newStore();
  await store.load();
  expect(localStorage.getItem(HANG_KEY)).toBe(null);
  expect(store.plugins[0].enabled).toBe(false);
  expect((await loadPlugins())[0].enabled).toBe(false);
  expect(store.solvers[EDGES]).toBeUndefined();
  expect(store.problems[ID]).toBe('Outlines stopped Phosphor responding last time, so it\'s off.');

  await store.load(); // a later load this visit doesn't read the mark again
  expect(store.problems[ID]).toBeDefined();
  await store.setEnabled(ID, true);
  expect(store.solvers[EDGES]).toBeDefined();
  expect(store.problems[ID]).toBeUndefined();

  localStorage.setItem(HANG_KEY, ID); // a later load this visit doesn't read the mark at all
  await store.load();
  expect(store.plugins[0].enabled).toBe(true);
  expect(store.problems[ID]).toBeUndefined();
});

test('a mark another open page holds is not a hang', async () => {
  await installed();
  store.dropSolvers(ID);
  beginRun(ID); // this page stands in for the other: it holds its lock
  store = newStore();
  await store.load();
  expect(store.plugins[0].enabled).toBe(true);
  expect(store.problems[ID]).toBeUndefined();
});

// A script whose import waits: ran goes up first, so a test knows the import is under way.
const slow = (name) => script({ name, top: 'globalThis.ran++; await new Promise((resolve) => setTimeout(resolve, 300));' });

test('a new script installed while a load imports the old one is the one registered', async () => {
  await installed(pkg(manifest(), slow('Edges')));
  store.dropSolvers(ID);
  globalThis.ran = 0;
  store = newStore();
  const loading = store.load();
  await vi.waitFor(() => expect(globalThis.ran).toBe(1));
  await installed(pkg(manifest((m) => { m.version = '1.1.0'; }), script({ name: 'Edges 2' })));
  await loading;
  expect(store.solvers[EDGES].name).toBe('Edges 2');
  expect(store.plugins[0].manifest.version).toBe('1.1.0');
});

test('switched off while switching on imports, it stays off', async () => {
  await installed(pkg(manifest(), slow('Edges')));
  await store.setEnabled(ID, false);
  globalThis.ran = 0;
  const on = store.setEnabled(ID, true);
  await vi.waitFor(() => expect(globalThis.ran).toBe(1));
  await store.setEnabled(ID, false);
  await on;
  expect(store.plugins[0].enabled).toBe(false);
  expect((await loadPlugins())[0].enabled).toBe(false);
  expect(store.solvers[EDGES]).toBeUndefined();
});

// A folder in the origin's private file system stands in for a picked one.
async function folder(files) {
  const root = await navigator.storage.getDirectory();
  const name = `plugin-${Math.random().toString(36).slice(2)}`;
  const dir = await root.getDirectoryHandle(name, { create: true });
  const put = async (file, text) => {
    const writable = await (await dir.getFileHandle(file, { create: true })).createWritable();
    await writable.write(text);
    await writable.close();
  };
  for (const [file, text] of Object.entries(files)) await put(file, text);
  return { dir, put, remove: () => root.removeEntry(name, { recursive: true }) };
}

test('a reload that adds a script waits for allowCode; declineCode drops it; Follow resumes after either', async () => {
  const theme = { id: 'ink', name: 'Ink', base: 'dark', colors: {} };
  const plain = manifest((m) => { delete m.script; m.themes = [theme]; });
  const { dir, put, remove } = await folder({ 'phosphor-plugin.json': plain });
  try {
    window.showDirectoryPicker = vi.fn(async () => dir);
    const picked = await store.pickFolder();
    expect(picked.script).toBe(null);
    await store.install(picked.manifest, { handle: picked.handle });
    await store.follow(ID, true);

    await put('outlines.js', script({ top: 'globalThis.ran++;' }));
    await put('phosphor-plugin.json', manifest((m) => { m.themes = [theme]; }));
    expect(await store.reload(ID)).toBe(false);
    expect(store.problems[ID]).toBeUndefined();
    expect(store.pendingCode[ID]).toMatchObject({ manifest: { script: 'outlines.js' }, scriptText: expect.stringContaining('ran++') });
    expect(store.following[ID]).toBeUndefined();
    expect(globalThis.ran).toBe(0);
    expect(store.plugins[0].manifest.script).toBe('');

    await store.declineCode(ID);
    expect(store.pendingCode[ID]).toBeUndefined();
    expect(store.plugins[0].manifest.script).toBe('');
    expect(store.following[ID]).toBe(true); // only the code was declined

    expect(await store.reload(ID)).toBe(false);
    expect(store.following[ID]).toBeUndefined();
    expect(await store.allowCode(ID)).toBe(true);
    expect(store.following[ID]).toBe(true);
    expect(globalThis.ran).toBe(1);
    expect(store.pendingCode[ID]).toBeUndefined();
    expect(store.solvers[EDGES]).toBeDefined();
    expect(store.plugins[0]).toMatchObject({ manifest: { script: 'outlines.js' }, script: expect.stringContaining('ran++') });
    expect(await store.plugins[0].handle.isSameEntry(dir)).toBe(true);
  } finally {
    await remove();
  }
});

test('a changed script of a plugin already running code is taken by Reload as before', async () => {
  const { dir, put, remove } = await folder({ 'phosphor-plugin.json': manifest(), 'outlines.js': script() });
  try {
    window.showDirectoryPicker = vi.fn(async () => dir);
    const picked = await store.pickFolder();
    await store.install(picked.manifest, { script: picked.script, handle: picked.handle });
    expect(store.solvers[EDGES].name).toBe('Edges');

    await put('outlines.js', script({ name: 'Edges 2' }));
    expect(await store.reload(ID)).toBe(true);
    expect(store.pendingCode[ID]).toBeUndefined();
    expect(store.solvers[EDGES].name).toBe('Edges 2');

    await put('outlines.js', script({ id: 'lines', name: 'Lines' }));
    expect(await store.reload(ID)).toBe(true);
    expect(store.solvers[EDGES]).toBeUndefined(); // the old script's solvers are gone
    expect(store.solvers[solverRef(ID, 'lines')]).toBeDefined();

    await put('outlines.js', 'export default {');
    expect(await store.reload(ID)).toBe(false);
    expect(store.problems[ID]).toContain('couldn\'t be loaded');
    expect(store.solvers[solverRef(ID, 'lines')]).toBeDefined(); // the last good one stays
  } finally {
    await remove();
  }
});

test('pick takes a .zip; pickFolder keeps the folder\'s handle for Reload', async () => {
  const zip = new File([await zipOf([['outlines-main/phosphor-plugin.json', manifest()], ['outlines-main/outlines.js', script()]])], 'outlines-main.zip');
  window.showOpenFilePicker = vi.fn(async () => [{ kind: 'file', getFile: async () => zip }]);
  const fromZip = await store.pick();
  expect(window.showOpenFilePicker.mock.calls[0][0].types[0].accept).toMatchObject({ 'application/zip': ['.zip'] });
  expect(fromZip).toMatchObject({ manifest: { id: ID }, script: script(), handle: null });

  window.showDirectoryPicker = vi.fn(async () => { throw new DOMException('The user aborted a request.', 'AbortError'); });
  expect(await store.pickFolder()).toBe(null);

  const { dir, remove } = await folder({ 'phosphor-plugin.json': manifest(), 'outlines.js': script() });
  try {
    window.showDirectoryPicker = vi.fn(async () => dir);
    const picked = await store.pickFolder();
    expect(picked.handle).toBe(dir);
    await store.install(picked.manifest, { script: picked.script, handle: picked.handle });
    store = newStore(); // a new visit: the handle is kept with the record
    await store.load();
    expect(await store.reload(ID)).toBe(true);
  } finally {
    await remove();
  }
});

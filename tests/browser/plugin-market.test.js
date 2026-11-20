// The marketplace in the plugin store (web): the list loaded once a visit from /plugins.json, a listed plugin's files
// fetched from raw GitHub and checked against the list's hashes, and installs that remember their listing. fetch is
// stubbed with tests/fixtures/plugin-list.json and the files it lists; real IndexedDB, a database of this file's own.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';
import listText from '../fixtures/plugin-list.json?raw';
import outlinesManifest from '../../plugins/outlines/phosphor-plugin.json?raw';
import outlinesScript from '../../plugins/outlines/outlines.js?raw';
import midnightManifest from '../../plugins/midnight/phosphor-plugin.json?raw';
import rainManifest from '../fixtures/plugins/rain/phosphor-plugin.json?raw';
import { MOST_SCRIPT_BYTES } from '@/plugins/manifest';
import { loadPlugins } from '@/plugins/storage';
import { usePluginStore } from '@/store/PluginStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { ownDatabase } from '../support/socialDatabase.js';
import { ownHangMark } from '../support/ownHangMark.js';

const CHANGED = 'This plugin changed after it was listed. Try again after the list is next updated.';
const UNAVAILABLE = 'The marketplace couldn\'t be reached. Check your connection and try again.';
const OFF = 'Plugins are off for this visit, so a plugin that runs code can\'t be installed now.';
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const RAW = 'https://raw.githubusercontent.com';

// What the stubbed fetch serves, by URL; a test changes a file here before it's fetched.
let served;
const serve = () => {
  served = {
    '/plugins.json': listText,
    [`${RAW}/jejacks0n/phosphor/${COMMIT}/plugins/outlines/phosphor-plugin.json`]: outlinesManifest,
    [`${RAW}/jejacks0n/phosphor/${COMMIT}/plugins/outlines/outlines.js`]: outlinesScript,
    [`${RAW}/jejacks0n/phosphor/${COMMIT}/plugins/midnight/phosphor-plugin.json`]: midnightManifest,
    [`${RAW}/kim/phosphor-rain/${COMMIT}/phosphor-plugin.json`]: rainManifest,
  };
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (url in served
    ? new Response(served[url]) : new Response('Not found', { status: 404 })));
};

let store, fetched;
const newStore = () => {
  setActivePinia(createPinia());
  useWorkspaceStore();
  return usePluginStore();
};
const entry = (id) => store.marketFor(id);
const installListed = async (id) => {
  const read = await store.readListed(entry(id));
  await store.install(read.manifest, { script: read.script, listing: read.listing });
  return read;
};

beforeEach(async () => {
  await ownDatabase('phosphor-plugins', 'plugin-market')();
  ownHangMark('plugin-market');
  fetched = serve();
  store = newStore();
});
afterEach(() => {
  store?.dropSolvers('phosphor.outlines');
  vi.restoreAllMocks();
});

test('the list loads once a visit from /plugins.json, with every entry the fixture lists, and again only when asked', async () => {
  expect(store.market).toEqual({ status: 'idle', entries: [], built: null, reason: null });
  await store.loadMarket();
  expect(store.market.status).toBe('ready');
  expect(store.market.built).toBe('2026-11-20T12:00:00.000Z');
  expect(store.market.entries.map(({ manifest }) => manifest.id)).toEqual(['phosphor.outlines', 'phosphor.midnight', 'kim.rain']);
  expect(entry('kim.rain')).toMatchObject({ official: false, repo: 'kim/phosphor-rain', path: '', commit: COMMIT, scriptHash: null });
  expect(entry('jane.nope')).toBe(null);
  expect(fetched).toHaveBeenCalledTimes(1);
  expect(fetched.mock.calls[0][0]).toBe('/plugins.json');

  await store.loadMarket();
  expect(fetched).toHaveBeenCalledTimes(1);
  await store.loadMarket({ again: true });
  expect(fetched).toHaveBeenCalledTimes(2);
  expect(store.market.status).toBe('ready');
});

test('a list that is missing, not JSON or for a newer Phosphor leaves the market failed and empty, with why', async () => {
  delete served['/plugins.json'];
  await store.loadMarket();
  expect(store.market).toEqual({ status: 'failed', entries: [], built: null, reason: 'unreachable' });

  served['/plugins.json'] = '<html>nope</html>';
  await store.loadMarket({ again: true });
  expect(store.market).toEqual({ status: 'failed', entries: [], built: null, reason: 'notJson' });

  served['/plugins.json'] = JSON.stringify({ ...JSON.parse(listText), format: 2 });
  await store.loadMarket({ again: true });
  expect(store.market).toEqual({ status: 'failed', entries: [], built: null, reason: 'newer' });

  served['/plugins.json'] = listText;
  await store.loadMarket({ again: true });
  expect(store.market.status).toBe('ready');
  expect(store.market.reason).toBe(null);
});

test('a listed plugin is installed from its raw files, kept as from the marketplace with its listing', async () => {
  await store.loadMarket();
  const read = await store.readListed(entry('phosphor.outlines'));
  expect(read).toMatchObject({ manifest: { id: 'phosphor.outlines' }, script: outlinesScript, replaces: null, handle: null });
  expect(read.listing).toEqual({ repo: 'jejacks0n/phosphor', path: 'plugins/outlines', commit: COMMIT, official: true });
  // the dialog may hold what it read reactively; what's kept is a plain copy
  await store.install(read.manifest, { script: read.script, listing: reactive({ ...read.listing }) });
  expect(store.plugins[0]).toMatchObject({ id: 'phosphor.outlines', source: 'marketplace', listing: read.listing });

  const again = newStore();
  await again.load();
  expect(again.plugins[0]).toMatchObject({ source: 'marketplace', listing: read.listing });
  store.dropSolvers('phosphor.outlines');
  store = again;
});

test('a served file one byte off its listed hash is refused in words, and an older version stays', async () => {
  await store.loadMarket();
  const files = [
    { path: 'phosphor-plugin.json', file: new File([outlinesManifest.replace('1.0.0', '0.9.0')], 'phosphor-plugin.json') },
    { path: 'outlines.js', file: new File([outlinesScript], 'outlines.js') },
  ];
  const fromFile = await store.read(files);
  await store.install(fromFile.manifest, { script: fromFile.script });
  const older = await loadPlugins();

  served[`${RAW}/jejacks0n/phosphor/${COMMIT}/plugins/outlines/outlines.js`] = `${outlinesScript} `;
  await expect(store.readListed(entry('phosphor.outlines'))).rejects.toMatchObject({ userMessage: CHANGED });
  served[`${RAW}/kim/phosphor-rain/${COMMIT}/phosphor-plugin.json`] = rainManifest.replace('1.2.0', '1.3.0');
  await expect(store.readListed(entry('kim.rain'))).rejects.toMatchObject({ userMessage: CHANGED });

  expect(await loadPlugins()).toEqual(older);
  expect(store.plugins.map(({ id, manifest }) => [id, manifest.version])).toEqual([['phosphor.outlines', '0.9.0']]);
});

// A 404 or a file over its cap is a repository changed (deleted, made private, grown) since the list was made, not the
// connection; the connection's words are for a fetch that fails or a server that answers with anything else.
test('a served file that\'s gone, or over its cap, has changed since it was listed', async () => {
  await store.loadMarket();
  delete served[`${RAW}/kim/phosphor-rain/${COMMIT}/phosphor-plugin.json`];
  await expect(store.readListed(entry('kim.rain'))).rejects.toMatchObject({ userMessage: CHANGED });

  served[`${RAW}/jejacks0n/phosphor/${COMMIT}/plugins/outlines/outlines.js`] = 'x'.repeat(MOST_SCRIPT_BYTES + 1);
  await expect(store.readListed(entry('phosphor.outlines'))).rejects.toMatchObject({ userMessage: CHANGED });
  expect(await loadPlugins()).toEqual([]);
});

test('a served file that can\'t be reached, or answers with an error but a 404, says the marketplace couldn\'t be reached', async () => {
  await store.loadMarket();
  const rain = `${RAW}/kim/phosphor-rain/${COMMIT}/phosphor-plugin.json`;
  fetched.mockImplementation(async (url) => (url === rain ? new Response('down', { status: 500 }) : new Response(served[url])));
  await expect(store.readListed(entry('kim.rain'))).rejects.toMatchObject({ userMessage: UNAVAILABLE });
  fetched.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
  await expect(store.readListed(entry('kim.rain'))).rejects.toMatchObject({ userMessage: UNAVAILABLE });
  expect(await loadPlugins()).toEqual([]);
});

test('a marketplace plugin is not listed only once a loaded list lacks its repo and path', async () => {
  await store.loadMarket();
  await installListed('kim.rain');
  expect(store.notListed('kim.rain')).toBe(false);

  served['/plugins.json'] = JSON.stringify({ ...JSON.parse(listText), plugins: JSON.parse(listText).plugins.slice(0, 2) });
  await store.loadMarket({ again: true });
  expect(store.notListed('kim.rain')).toBe(true);
  expect(store.notListed('phosphor.outlines')).toBe(false); // not installed

  store.market.status = 'loading';
  expect(store.notListed('kim.rain')).toBe(false);
  delete served['/plugins.json'];
  await store.loadMarket({ again: true });
  expect(store.market.status).toBe('failed');
  expect(store.notListed('kim.rain')).toBe(false);
});

test('with plugins off, the list loads, a theme installs, and a plugin with a script is refused in today\'s words', async () => {
  store.off = true;
  await store.loadMarket();
  expect(store.market.status).toBe('ready');
  await installListed('phosphor.midnight');
  const read = await store.readListed(entry('phosphor.outlines'));
  await expect(store.install(read.manifest, { script: read.script, listing: read.listing })).rejects.toMatchObject({ userMessage: OFF });
  expect(store.plugins.map(({ id }) => id)).toEqual(['phosphor.midnight']);
});

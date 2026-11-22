// The Plugins dialog: its two tabs, and on Installed what's installed, installing from a manifest file after asking, the
// on and off switch, Remove after asking, where a plugin came from, Update and No longer listed, and what it says when
// the browser keeps nothing or the visit started with plugins off; full window on a narrow screen. The marketplace's
// list is tests/fixtures/plugin-list.json, through a stubbed fetch.
import { afterEach, beforeEach, expect, onTestFinished, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import midnight from '../../plugins/midnight/phosphor-plugin.json?raw';
import fog from '../fixtures/plugins/fog/phosphor-plugin.json?raw';
import { i18n } from '@/i18n';
import PluginsDialog from '@/components/PluginsDialog.vue';
import { usePluginStore } from '@/store/PluginStore';
import { readManifest } from '@/plugins/manifest';
import { solverRef } from '@/plugins/solvers';
import { ownDatabase } from '../support/socialDatabase.js';
import { ownHangMark } from '../support/ownHangMark.js';
import { zipOf } from '../support/zipOf.js';
import { serveMarket, listWith, COMMIT, RAW } from '../support/servedMarket.js';
import { sha256 } from '@/plugins/hash';
import '@/assets/global.css';

let app, host, loads = [], served, fetched;
beforeEach(async () => {
  await ownDatabase('phosphor-plugins', 'plugins-dialog')();
  ownHangMark('plugins-dialog');
  ({ served, fetched } = serveMarket());
});
afterEach(async () => {
  await Promise.all(loads);
  loads = [];
  usePluginStore().dropScript('phosphor.midnight'); // the registry outlives the Pinia
  app?.unmount();
  host?.remove();
  app = host = null;
  vi.restoreAllMocks();
  localStorage.removeItem('phosphor.theme');
});

// The dialog, on Installed unless `tab` is null (the dialog then picks), over a new Pinia or the one given (opened again
// in the same visit). `before` may install first.
const mount = async (before = () => {}, { tab = 'installed', pinia = createPinia() } = {}) => {
  setActivePinia(pinia);
  const store = usePluginStore();
  for (const name of ['load', 'loadMarket']) {
    if (store[name].wrapped) continue;
    const real = store[name];
    store[name] = Object.assign((...args) => { const loading = real(...args); loads.push(loading); return loading; }, { wrapped: true });
  }
  await before(store);
  if (tab) store.dialogTab = tab;
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(PluginsDialog).use(pinia).use(i18n);
  app.mount(host);
  await Promise.all(loads); // the dialog's own loads, done before anything's installed
  return store;
};
const unmount = () => {
  app.unmount();
  host.remove();
  app = host = null;
};
const changed = (change) => {
  const raw = JSON.parse(midnight);
  change(raw);
  return JSON.stringify(raw);
};
// A file picked in the hidden input, as the browser's own chooser would.
const pick = async (text) => {
  const input = document.querySelector('dialog input[type=file]');
  const files = new DataTransfer();
  files.items.add(new File([text], 'phosphor-plugin.json', { type: 'application/json' }));
  input.files = files.files;
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(heading()).not.toBe('Plugins'));
};
// What the dialog showing is called: a question's title, or the Plugins dialog's name (its tabs are in a title's place).
const heading = () => document.querySelector('dialog h3')?.textContent ?? document.querySelector('dialog').getAttribute('aria-label');
const dialogText = () => document.querySelector('dialog').textContent;
const installed = async (text = midnight) => {
  await pick(text);
  await page.getByRole('button', { name: /^(Install|Replace)/ }).click();
  await expect.element(page.getByRole('dialog', { name: 'Plugins' })).toBeVisible();
};

test("a loaded plugin's row counts what its script adds", async () => {
  const store = await mount();
  await store.install(readManifest(midnight));
  store.useScript('phosphor.midnight', 'h', { brushes: [{ id: 'a' }], shapes: [{ id: 'b' }], filters: [{ id: 'c' }] });
  await expect.element(page.getByText('1 brush')).toBeVisible();
  const row = document.querySelector('dialog li').textContent;
  for (const words of ['1 theme', '1 brush', '1 shape', '1 filter']) expect(row).toContain(words);
  expect(row).not.toContain('solver');
});

test('empty, it says what plugins are; a manifest picked is asked about, then listed', async () => {
  const store = await mount();
  await expect.element(page.getByRole('link', { name: 'How plugins work' })).toBeVisible();
  await pick(midnight);
  expect(heading()).toBe('Install Midnight 1.2.0?');
  expect(dialogText()).toContain('by Phosphor');
  expect(dialogText()).toContain('Adds 1 theme. Runs no code.');
  expect(dialogText()).not.toContain('runs code in Phosphor');
  await page.getByRole('button', { name: /^Install/ }).click();
  await expect.element(page.getByRole('dialog', { name: 'Plugins' })).toBeVisible();
  const row = document.querySelector('dialog li');
  for (const words of ['Midnight', '1.2.0', 'by Phosphor', '1 theme', 'A deep blue theme for late nights.']) expect(row.textContent).toContain(words);
  const link = row.querySelector('a');
  expect(link.href).toBe('https://github.com/jejacks0n/phosphor/tree/main/plugins/midnight');
  expect(link.textContent).toBe('github.com/jejacks0n/phosphor/tree/main/plugins/midnight');
  expect(link.rel).toContain('noopener');
  expect(store.plugins).toHaveLength(1);
});

test('Cancel at the question installs nothing', async () => {
  const store = await mount();
  await pick(midnight);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect.element(page.getByRole('dialog', { name: 'Plugins' })).toBeVisible();
  expect(store.plugins).toEqual([]);
});

test('a file that is not a manifest shows why, and the next good file clears it', async () => {
  await mount();
  const input = () => document.querySelector('dialog input[type=file]');
  await vi.waitFor(() => expect(input()).not.toBe(null));
  const files = new DataTransfer();
  files.items.add(new File(['{nope'], 'phosphor-plugin.json'));
  input().files = files.files;
  input().dispatchEvent(new Event('change'));
  await expect.element(page.getByRole('alert')).toHaveTextContent('That file isn\'t a plugin\'s manifest.');
  await installed();
  expect(page.getByRole('alert').query()).toBe(null);
});

test('a manifest\'s words are shown as text', async () => {
  await mount();
  await installed(changed((m) => { m.name = '<img src=x onerror=alert(1)>'; m.description = '<b>bold</b>'; }));
  const dialog = document.querySelector('dialog');
  expect(dialog.querySelector('img')).toBe(null);
  expect(dialog.querySelector('li b')).toBe(null);
  expect(dialog.querySelector('li').textContent).toContain('<img src=x onerror=alert(1)>');
  expect(dialog.querySelector('li').textContent).toContain('<b>bold</b>');
});

test('the switch turns a plugin off and on', async () => {
  const store = await mount();
  await installed();
  const toggle = page.getByRole('switch', { name: 'Midnight' });
  await expect.element(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect.element(toggle).toHaveAttribute('aria-checked', 'false');
  expect(store.plugins[0].enabled).toBe(false);
  await toggle.click();
  await expect.element(toggle).toHaveAttribute('aria-checked', 'true');
  expect(store.plugins[0].enabled).toBe(true);
});

test('Remove is a trash can named for its plugin', async () => {
  await mount();
  await installed();
  const remove = page.getByRole('button', { name: 'Remove Midnight' }).element();
  expect(remove.textContent.trim()).toBe('');
  expect(remove.querySelector('svg')).not.toBeNull();
  expect(remove.title).toBe('Remove Midnight');
});

test('Remove asks first, then forgets it', async () => {
  const store = await mount();
  await installed();
  await page.getByRole('button', { name: 'Remove Midnight' }).click();
  expect(heading()).toBe('Remove Midnight?');
  expect(dialogText()).toContain('Its themes go with it.');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect.element(page.getByRole('dialog', { name: 'Plugins' })).toBeVisible();
  expect(store.plugins).toHaveLength(1);
  await page.getByRole('button', { name: 'Remove Midnight' }).click();
  await page.getByRole('button', { name: /^Remove/ }).click();
  await expect.element(page.getByRole('dialog', { name: 'Plugins' })).toBeVisible();
  expect(store.plugins).toEqual([]);
});

test('installing a plugin again asks to replace it', async () => {
  const store = await mount();
  await installed();
  await pick(changed((m) => { m.version = '1.3.0'; }));
  expect(heading()).toBe('Replace Midnight 1.2.0 with 1.3.0?');
  await page.getByRole('button', { name: /^Replace/ }).click();
  await expect.element(page.getByRole('dialog', { name: 'Plugins' })).toBeVisible();
  expect(store.plugins[0].manifest.version).toBe('1.3.0');
});

test('a browser that will not keep plugins says so and offers no install', async () => {
  await mount();
  vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('no', 'SecurityError'); });
  // the mount's load may already be under way with the real open: wait for the one this spy answers
  await usePluginStore().load();
  await expect.element(page.getByText('This browser isn\'t keeping plugins, so none can be installed.')).toBeVisible();
  await expect.element(page.getByRole('button', { name: 'Install from a file…' })).toBeDisabled();
});

test('started with plugins off, it says so and still lists them', async () => {
  const store = await mount((plugins) => { plugins.off = true; });
  await installed();
  await expect.element(page.getByText(/Plugins are off for this visit/)).toBeVisible();
  expect(store.plugins).toHaveLength(1);
  expect(document.querySelector('dialog li').textContent).toContain('Midnight');
});

// A file of the origin's private file system, as the browser's picker would give.
const privateFile = async (text) => {
  const dir = await navigator.storage.getDirectory(), name = `dialog-${Math.random().toString(36).slice(2)}.json`;
  const file = await dir.getFileHandle(name, { create: true }), writable = await file.createWritable();
  await writable.write(text);
  await writable.close();
  return { file, remove: () => dir.removeEntry(name) };
};

test('a plugin installed through the browser\'s picker shows From a file, Reload and Follow file; one from a plain file shows none of them', async () => {
  const store = await mount();
  await installed();
  expect(dialogText()).not.toContain('From a file');
  expect(page.getByRole('button', { name: 'Reload Midnight' }).query()).toBe(null);
  expect(page.getByRole('switch', { name: 'Follow Midnight\'s file' }).query()).toBe(null);

  const { file, remove } = await privateFile(midnight);
  await store.install(JSON.parse(midnight), { handle: file });
  await expect.element(page.getByRole('button', { name: 'Reload Midnight' })).toBeVisible();
  expect(dialogText()).toContain('From a file');
  await expect.element(page.getByRole('switch', { name: 'Follow Midnight\'s file' })).toHaveAttribute('aria-checked', 'false');
  await remove();
});

test('Reload and the Follow file switch call the store, and a problem shows on the row', async () => {
  const store = await mount();
  const { file, remove } = await privateFile(midnight);
  await store.install(JSON.parse(midnight), { handle: file });
  const reload = vi.spyOn(store, 'reload').mockResolvedValue(true);
  const follow = vi.spyOn(store, 'follow').mockImplementation(async (id, on) => {
    if (on) store.following[id] = true;
    else delete store.following[id];
  });
  await page.getByRole('button', { name: 'Reload Midnight' }).click();
  expect(reload).toHaveBeenCalledWith('phosphor.midnight');
  const following = page.getByRole('switch', { name: 'Follow Midnight\'s file' });
  await following.click();
  expect(follow).toHaveBeenCalledWith('phosphor.midnight', true);
  await expect.element(following).toHaveAttribute('aria-checked', 'true');
  await following.click();
  expect(follow).toHaveBeenLastCalledWith('phosphor.midnight', false);
  await expect.element(following).toHaveAttribute('aria-checked', 'false');

  store.problems['phosphor.midnight'] = 'That file can\'t be read anymore.';
  await expect.element(page.getByRole('alert')).toHaveTextContent('That file can\'t be read anymore.');
  await remove();
});

// A file dropped on an element, as the browser would: true when the page took the drop (it didn't navigate to the file).
const drop = (element, text) => {
  const dataTransfer = new DataTransfer();
  if (text !== undefined) dataTransfer.items.add(new File([text], 'phosphor-plugin.json', { type: 'application/json' }));
  element.dispatchEvent(new DragEvent('dragover', { dataTransfer, bubbles: true, cancelable: true }));
  const event = new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event.defaultPrevented;
};

test('a manifest dropped anywhere on the dialog is asked about, and a drop on the question is taken without leaving the page', async () => {
  await mount();
  await expect.element(page.getByRole('dialog', { name: 'Plugins' })).toBeVisible();
  expect(drop(document.querySelector('dialog > .head'), midnight)).toBe(true);
  await vi.waitFor(() => expect(heading()).toBe('Install Midnight 1.2.0?'));
  expect(drop(document.querySelector('dialog > .head'), midnight)).toBe(true);
  expect(heading()).toBe('Install Midnight 1.2.0?');
});

test('a browser that will not keep plugins asks nothing about a dropped file, and one that fails to keep it says so', async () => {
  const store = await mount();
  await pick(midnight);
  vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('no', 'QuotaExceededError'); });
  await page.getByRole('button', { name: /^Install/ }).click();
  await expect.element(page.getByRole('alert')).toHaveTextContent('This browser didn\'t keep the plugin.');
  expect(store.plugins).toEqual([]);

  store.unavailable = true;
  expect(drop(document.querySelector('dialog > .head'), midnight)).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(heading()).toBe('Plugins');
});

test('Tab goes from the last row on to Install from a file…, past the hidden file input', async () => {
  await mount();
  await installed();
  page.getByRole('button', { name: 'Remove Midnight' }).element().focus(); // the row's last control
  await userEvent.tab();
  expect(document.activeElement.textContent).toBe('Install from a file…');
});

// A plugin with a script: Midnight's manifest naming edges.js, whose one solver is Edges.
const SCRIPT = "export default { solvers: [{ id: 'edges', name: 'Edges', styles: ['ansi'], reach: 1, chars: '/', solve: () => ({ char: '/', fg: 0, bg: 0 }) }] };";
const scripted = (change = () => {}) => changed((m) => { m.script = 'edges.js'; change(m); });
const WARNING = '⚠ This plugin runs code in Phosphor. Install it only if you trust where it came from.';
// A folder picked in the hidden folder input, as the browser's own chooser would.
const pickFolder = async (manifestText, script = SCRIPT) => {
  const input = document.querySelector('dialog input[webkitdirectory]');
  const files = new DataTransfer();
  files.items.add(new File([manifestText], 'phosphor-plugin.json', { type: 'application/json' }));
  files.items.add(new File([script], 'edges.js', { type: 'text/javascript' }));
  input.files = files.files;
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(heading()).not.toBe('Plugins'));
};

test('the question for a plugin with a script warns that it runs code; a theme-only one says it runs none', async () => {
  window.showDirectoryPicker = undefined; // a browser with no folder picker: the hidden input
  onTestFinished(() => { delete window.showDirectoryPicker; });
  const store = await mount();
  const chooser = vi.spyOn(document.querySelector('dialog input[webkitdirectory]'), 'click').mockImplementation(() => {});
  await page.getByRole('button', { name: 'Install from a folder…' }).click();
  expect(chooser).toHaveBeenCalled(); // the hidden input's chooser
  await pickFolder(scripted());
  expect(heading()).toBe('Install Midnight 1.2.0?');
  expect(dialogText()).toContain('Adds 1 theme and a script.');
  expect(dialogText()).toContain(WARNING);
  expect(dialogText()).not.toContain('Runs no code');
  await page.getByRole('button', { name: /^Install/ }).click();
  await expect.element(page.getByRole('dialog', { name: 'Plugins' })).toBeVisible();
  expect(store.solvers[solverRef('phosphor.midnight', 'edges')]).toMatchObject({ name: 'Edges' });
  expect(document.querySelector('dialog li').textContent).toContain('Runs code');

  await pickFolder(scripted((m) => { m.version = '1.3.0'; delete m.themes; }));
  expect(dialogText()).toContain('Adds a script.');
  expect(dialogText()).toContain(WARNING);
  await page.getByRole('button', { name: 'Cancel' }).click();

  // a script that won't load is refused in its own words, and nothing is kept
  await pickFolder(scripted((m) => { m.version = '1.4.0'; }), 'export default {');
  await page.getByRole('button', { name: /^Replace/ }).click();
  await vi.waitFor(() => expect(document.querySelector('dialog [role=alert]')?.textContent).toMatch(/^The plugin's script couldn't be loaded: ./));
  expect(store.plugins[0].manifest.version).toBe('1.2.0');
});

test('the file button takes a .zip as well as a manifest, and the folder button uses the browser\'s folder picker where it has one', async () => {
  const store = await mount();
  expect(document.querySelector('dialog input[type=file]:not([webkitdirectory])').accept).toBe('.zip,.json,application/zip,application/json');
  const folder = await navigator.storage.getDirectory().then((root) => root.getDirectoryHandle(`dialog-${Math.random().toString(36).slice(2)}`, { create: true }));
  onTestFinished(() => navigator.storage.getDirectory().then((root) => root.removeEntry(folder.name, { recursive: true })));
  for (const [name, text] of [['phosphor-plugin.json', scripted()], ['edges.js', SCRIPT]]) {
    const writable = await (await folder.getFileHandle(name, { create: true })).createWritable();
    await writable.write(text);
    await writable.close();
  }
  window.showDirectoryPicker = async () => folder;
  onTestFinished(() => { delete window.showDirectoryPicker; });
  await page.getByRole('button', { name: 'Install from a folder…' }).click();
  await vi.waitFor(() => expect(heading()).toBe('Install Midnight 1.2.0?'));
  await page.getByRole('button', { name: /^Install/ }).click();
  await expect.element(page.getByRole('button', { name: 'Reload Midnight' })).toBeVisible(); // the folder's kept
  expect(store.plugins[0].handle.kind).toBe('directory');
  expect(dialogText()).toContain('From a folder');
  expect(dialogText()).not.toContain('From a file');
});

// A folder dropped: the browser hands its entries over webkitGetAsEntry, which a real DataTransfer can't be given.
const entry = (name, text) => ({ isFile: true, isDirectory: false, name, fullPath: `/midnight/${name}`, file: (resolve) => resolve(new File([text], name)) });
const folderDrop = (children) => {
  let read = false;
  const dir = { isFile: false, isDirectory: true, name: 'midnight', createReader: () => ({ readEntries: (resolve) => resolve(read ? [] : (read = true, children)) }) };
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { items: [{ webkitGetAsEntry: () => dir }], files: [] } });
  document.querySelector('dialog > .head').dispatchEvent(event);
  return event.defaultPrevented;
};

test('a dropped folder is asked about; a dropped zip too', async () => {
  await mount();
  expect(folderDrop([entry('phosphor-plugin.json', scripted()), entry('edges.js', SCRIPT)])).toBe(true);
  await vi.waitFor(() => expect(heading()).toBe('Install Midnight 1.2.0?'));
  expect(dialogText()).toContain(WARNING);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect.element(page.getByRole('dialog', { name: 'Plugins' })).toBeVisible();

  const zip = await zipOf([['midnight-main/phosphor-plugin.json', scripted()], ['midnight-main/edges.js', SCRIPT]]);
  const data = new DataTransfer();
  data.items.add(new File([zip], 'midnight-main.zip', { type: 'application/zip' }));
  document.querySelector('dialog > .head').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(heading()).toBe('Install Midnight 1.2.0?'));
  expect(dialogText()).toContain('Adds 1 theme and a script.');
});

test('a row waiting on code asks before running it', async () => {
  const store = await mount();
  await installed();
  const allow = vi.spyOn(store, 'allowCode').mockImplementation(async (id) => { delete store.pendingCode[id]; return true; });
  const decline = vi.spyOn(store, 'declineCode').mockImplementation(async (id) => { delete store.pendingCode[id]; });
  store.pendingCode['phosphor.midnight'] = { manifest: JSON.parse(scripted()), scriptText: SCRIPT, handle: null, following: false };
  await expect.element(page.getByText('Midnight now runs code. Allow?')).toBeVisible();
  expect(page.getByRole('status').query()?.textContent).toBe('Midnight now runs code. Allow?'); // heard when a Reload brings it
  expect(document.querySelector('dialog li').textContent).toContain(WARNING);
  await page.getByRole('button', { name: 'Not now for Midnight' }).click();
  expect(decline).toHaveBeenCalledWith('phosphor.midnight');
  await expect.element(page.getByText('Midnight now runs code. Allow?')).not.toBeInTheDocument();
  await vi.waitFor(() => expect(document.activeElement).toBe(page.getByRole('switch', { name: 'Midnight' }).element())); // not lost with the buttons

  store.pendingCode['phosphor.midnight'] = { manifest: JSON.parse(scripted()), scriptText: SCRIPT, handle: null, following: false };
  await page.getByRole('button', { name: 'Allow Midnight to run code' }).click();
  expect(allow).toHaveBeenCalledWith('phosphor.midnight');
  await expect.element(page.getByText('Midnight now runs code. Allow?')).not.toBeInTheDocument();
  await vi.waitFor(() => expect(document.activeElement).toBe(page.getByRole('switch', { name: 'Midnight' }).element()));
});

// The tabs.
const tab = (name) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const selected = () => document.querySelector('dialog [role=tab][aria-selected=true]').textContent.trim();

test('Marketplace and Installed are tabs: arrow keys move between them, and Installed shows its count', async () => {
  await mount(async (store) => { await store.install(JSON.parse(midnight)); });
  const tabs = [...document.querySelectorAll('dialog > .head [role=tablist] [role=tab]')]; // the dialog's first line, in a title's place
  expect(tabs.map((one) => one.textContent.replace(/\s+/g, ' ').trim())).toEqual(['Marketplace', 'Installed 1']);
  expect(document.querySelector('dialog h3')).toBeNull();
  expect(document.querySelector('dialog').getAttribute('aria-label')).toBe('Plugins');
  const panel = page.getByRole('tabpanel').element();
  expect(panel.getAttribute('aria-labelledby')).toBe(tabs[1].id);
  expect(tabs[1].getAttribute('aria-controls')).toBe(panel.id);
  expect(tabs[0].hasAttribute('aria-controls')).toBe(false); // its panel isn't there to point at
  expect(tabs.map((one) => one.tabIndex)).toEqual([-1, 0]);
  expect(panel.querySelector('li').textContent).toContain('Midnight');

  tabs[1].focus();
  await userEvent.keyboard('{ArrowRight}');
  await expect.element(tab('Marketplace')).toHaveAttribute('aria-selected', 'true');
  expect(document.activeElement).toBe(tab('Marketplace').element());
  expect(page.getByRole('tabpanel').element().textContent).toContain('Anyone\'s plugins');
  expect(tabs[0].getAttribute('aria-controls')).toBe(page.getByRole('tabpanel').element().id);
  expect(tabs[1].hasAttribute('aria-controls')).toBe(false);
  await userEvent.keyboard('{ArrowLeft}');
  await expect.element(tab('Installed')).toHaveAttribute('aria-selected', 'true');
  await tab('Marketplace').click();
  await expect.element(tab('Marketplace')).toHaveAttribute('aria-selected', 'true');
});

test('it opens on Marketplace with nothing installed and on Installed with something, then on the tab last used this visit; it loads the list once', async () => {
  const pinia = createPinia();
  let store = await mount(() => {}, { tab: null, pinia });
  expect(selected()).toBe('Marketplace');
  await store.install(JSON.parse(midnight)); // installing doesn't move it
  await vi.waitFor(() => expect(tab('Installed').element().textContent).toMatch(/Installed\s*1/));
  expect(selected()).toBe('Marketplace');
  await tab('Installed').click();
  unmount();
  await mount(() => {}, { tab: null, pinia });
  expect(selected()).toMatch(/^Installed/);
  expect(fetched.mock.calls.filter(([url]) => url === '/plugins.json')).toHaveLength(1);

  unmount();
  store = await mount(() => {}, { tab: null }); // another visit, the plugin kept
  expect(store.plugins).toHaveLength(1);
  expect(selected()).toMatch(/^Installed/);
});

test('opening the dialog calls loadMarket once', async () => {
  let calls = 0;
  await mount((store) => {
    const real = store.loadMarket;
    store.loadMarket = (...args) => { calls++; return real(...args); };
  });
  expect(calls).toBe(1);
});

// Installed: where a marketplace plugin came from, Update and No longer listed.
const listing = (repo, path) => ({ repo, path, commit: COMMIT, official: repo === 'jejacks0n/phosphor' });
const row = (name) => [...document.querySelectorAll('dialog li')].find((one) => one.querySelector('.name').textContent === name);
const withListed = async (store) => {
  await store.install(JSON.parse(midnight), { listing: listing('jejacks0n/phosphor', 'plugins/midnight') });
  await store.install(JSON.parse(fog), { listing: listing('kim/phosphor-fog', '') });
  await store.install(JSON.parse(changed((m) => { m.id = 'jane.dusk'; m.name = 'Dusk'; m.author = 'Jane'; })));
};

test('an Installed row says Official or From the marketplace, Update when the list has a higher version of the same listing, and No longer listed', async () => {
  served['/plugins.json'] = listWith((plugins) => {
    plugins.find(({ manifest }) => manifest.id === 'phosphor.midnight').manifest.version = '1.3.0';
    return plugins.filter(({ manifest }) => manifest.id !== 'kim.fog');
  });
  const store = await mount(withListed);
  await vi.waitFor(() => expect(store.market.status).toBe('ready'));
  expect(row('Midnight').querySelector('.badge').textContent).toBe('Official');
  expect(row('Midnight').textContent).not.toContain('From the marketplace');
  expect(row('Fog').textContent).toContain('From the marketplace');
  expect(row('Dusk').textContent).not.toContain('From the marketplace');
  await expect.element(page.getByRole('button', { name: 'Update Midnight' })).toBeVisible();
  expect([...row('Midnight').querySelectorAll('.badge')].map((badge) => badge.textContent)).toEqual(['Official', 'Update to 1.3.0']);
  expect(row('Fog').querySelector('button.update')).toBe(null);
  expect(row('Fog').textContent).not.toContain('Update to');
  expect(row('Fog').textContent).toContain('No longer listed');
  expect(row('Midnight').textContent).not.toContain('No longer listed');
  expect(row('Dusk').textContent).not.toContain('No longer listed');

  // the list's 1.3.0, served at its commit with its hash
  const newer = changed((m) => { m.version = '1.3.0'; }), hash = await sha256(newer);
  served[`${RAW}/jejacks0n/phosphor/${COMMIT}/plugins/midnight/phosphor-plugin.json`] = newer;
  served['/plugins.json'] = listWith((plugins) => {
    const entry = plugins.find(({ manifest }) => manifest.id === 'phosphor.midnight');
    entry.manifest.version = '1.3.0';
    entry.manifestHash = hash;
  });
  await store.loadMarket({ again: true });
  await page.getByRole('button', { name: 'Update Midnight' }).click();
  await vi.waitFor(() => expect(heading()).toBe('Replace Midnight 1.2.0 with 1.3.0?'));
  expect(dialogText()).toContain('Official');
  await page.getByRole('button', { name: /^Replace/ }).click();
  await vi.waitFor(() => expect(store.plugins.find(({ id }) => id === 'phosphor.midnight').manifest.version).toBe('1.3.0'));
  await expect.element(page.getByRole('dialog', { name: 'Plugins' })).toBeVisible();
  expect(selected()).toMatch(/^Installed/);
  expect(page.getByRole('button', { name: 'Update Midnight' }).query()).toBe(null);
});

test('with no list, Installed works and shows neither Update nor No longer listed', async () => {
  delete served['/plugins.json'];
  const store = await mount(withListed);
  await vi.waitFor(() => expect(store.market.status).toBe('failed'));
  expect(dialogText()).not.toContain('No longer listed');
  expect(document.querySelector('dialog button.update')).toBe(null);
  const toggle = page.getByRole('switch', { name: 'Fog' });
  await toggle.click();
  await expect.element(toggle).toHaveAttribute('aria-checked', 'false');
});

// The width: 860px above 700px wide on both tabs; the whole window at 700 and below, with a row's buttons under its text.
const sized = async (width, height) => {
  await page.viewport(width, height);
  await vi.waitFor(() => expect(window.innerWidth).toBe(width));
};

test('860px wide on both tabs on a wide window; the whole window at 700px, a row\'s buttons under its text', async () => {
  try {
    await sized(1200, 800);
    await mount(async (store) => { await store.install(JSON.parse(midnight)); });
    const dialog = () => document.querySelector('dialog');
    expect(dialog().getBoundingClientRect().width).toBe(860);
    const act = () => row('Midnight').querySelector('div.act').getBoundingClientRect();
    const text = () => row('Midnight').querySelector('div.text').getBoundingClientRect();
    expect(act().left).toBeGreaterThanOrEqual(text().right); // beside it
    await tab('Marketplace').click();
    expect(dialog().getBoundingClientRect().width).toBe(860);
    await tab('Installed').click();

    await sized(700, 800);
    await vi.waitFor(() => expect(dialog().getBoundingClientRect().toJSON()).toMatchObject({ x: 0, y: 0, width: 700, height: 800 }));
    expect(getComputedStyle(dialog()).borderTopLeftRadius).toBe('0px');
    expect(act().top).toBeGreaterThanOrEqual(text().bottom);
    const close = dialog().querySelector('button.close').getBoundingClientRect();
    expect(close.top).toBeGreaterThanOrEqual(0);
    expect(close.right).toBeLessThanOrEqual(700);

    await sized(701, 800);
    await vi.waitFor(() => expect(dialog().getBoundingClientRect().width).toBe(661)); // 20px clear of each side
    expect(act().left).toBeGreaterThanOrEqual(text().right);
  } finally {
    await sized(414, 896);
  }
});

test('only the rows scroll: the tabs and the install buttons stay where they are', async () => {
  const store = await mount();
  for (let i = 0; i < 20; i++) {
    await store.install(readManifest(changed((raw) => { raw.id = `phosphor.night${i}`; raw.name = `Night ${i}`; })));
  }
  await vi.waitFor(() => expect(document.querySelectorAll('dialog li')).toHaveLength(20));
  const body = document.querySelector('dialog > div.body');
  const rows = document.querySelector('dialog ul');
  const tab = document.querySelector('dialog [role=tab]');
  const add = page.getByRole('button', { name: /^Install from a file/ }).element();
  expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight + 1);
  expect(rows.scrollHeight).toBeGreaterThan(rows.clientHeight);
  const before = [tab.getBoundingClientRect().top, add.getBoundingClientRect().top];
  rows.scrollTop = 400;
  await vi.waitFor(() => expect(rows.scrollTop).toBe(400));
  expect([tab.getBoundingClientRect().top, add.getBoundingClientRect().top]).toEqual(before);
  for (let i = 0; i < 20; i++) await store.uninstall(`phosphor.night${i}`);
});

// The Plugins dialog: what's installed, installing from a manifest file after asking, the on and off switch, Remove
// after asking, and what it says when the browser keeps nothing or the visit started with plugins off.
import { afterEach, beforeEach, expect, onTestFinished, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import midnight from '../fixtures/plugins/midnight/phosphor-plugin.json?raw';
import { i18n } from '@/i18n';
import PluginsDialog from '@/components/PluginsDialog.vue';
import { usePluginStore } from '@/store/PluginStore';
import { solverRef } from '@/plugins/solvers';
import { ownDatabase } from '../support/socialDatabase.js';
import { ownHangMark } from '../support/ownHangMark.js';
import { zipOf } from '../support/zipOf.js';
import '@/assets/global.css';

let app, host, loads = [];
beforeEach(async () => {
  await ownDatabase('phosphor-plugins', 'plugins-dialog')();
  ownHangMark('plugins-dialog');
});
afterEach(async () => {
  await Promise.all(loads);
  loads = [];
  usePluginStore().dropSolvers('jane.midnight'); // the registry outlives the Pinia
  app?.unmount();
  host?.remove();
  app = host = null;
  vi.restoreAllMocks();
  localStorage.removeItem('phosphor.theme');
});

const mount = async (before = () => {}) => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = usePluginStore(), load = store.load;
  store.load = (...args) => { const loading = load(...args); loads.push(loading); return loading; };
  before(store);
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(PluginsDialog).use(pinia).use(i18n);
  app.mount(host);
  await Promise.all(loads); // the dialog's own load, done before anything's installed
  return store;
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
  await vi.waitFor(() => expect(document.querySelector('dialog h3')?.textContent).not.toBe('Plugins'));
};
const heading = () => document.querySelector('dialog h3').textContent;
const dialogText = () => document.querySelector('dialog').textContent;
const installed = async (text = midnight) => {
  await pick(text);
  await page.getByRole('button', { name: /^(Install|Replace)/ }).click();
  await expect.element(page.getByRole('heading', { name: 'Plugins' })).toBeVisible();
};

test('empty, it says what plugins are; a manifest picked is asked about, then listed', async () => {
  const store = await mount();
  await expect.element(page.getByRole('link', { name: 'How plugins work' })).toBeVisible();
  await pick(midnight);
  expect(heading()).toBe('Install Midnight 1.0.0?');
  expect(dialogText()).toContain('by Jane');
  expect(dialogText()).toContain('Adds 1 theme. Runs no code.');
  expect(dialogText()).not.toContain('runs code in Phosphor');
  await page.getByRole('button', { name: /^Install/ }).click();
  await expect.element(page.getByRole('heading', { name: 'Plugins' })).toBeVisible();
  const row = document.querySelector('dialog li');
  for (const words of ['Midnight', '1.0.0', 'by Jane', '1 theme', 'A deep blue theme for late nights.']) expect(row.textContent).toContain(words);
  const link = row.querySelector('a');
  expect(link.href).toBe('https://github.com/jane/phosphor-midnight');
  expect(link.textContent).toBe('github.com/jane/phosphor-midnight');
  expect(link.rel).toContain('noopener');
  expect(store.plugins).toHaveLength(1);
});

test('Cancel at the question installs nothing', async () => {
  const store = await mount();
  await pick(midnight);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect.element(page.getByRole('heading', { name: 'Plugins' })).toBeVisible();
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
  await expect.element(page.getByRole('heading', { name: 'Plugins' })).toBeVisible();
  expect(store.plugins).toHaveLength(1);
  await page.getByRole('button', { name: 'Remove Midnight' }).click();
  await page.getByRole('button', { name: /^Remove/ }).click();
  await expect.element(page.getByRole('heading', { name: 'Plugins' })).toBeVisible();
  expect(store.plugins).toEqual([]);
});

test('installing a plugin again asks to replace it', async () => {
  const store = await mount();
  await installed();
  await pick(changed((m) => { m.version = '1.1.0'; }));
  expect(heading()).toBe('Replace Midnight 1.0.0 with 1.1.0?');
  await page.getByRole('button', { name: /^Replace/ }).click();
  await expect.element(page.getByRole('heading', { name: 'Plugins' })).toBeVisible();
  expect(store.plugins[0].manifest.version).toBe('1.1.0');
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
  expect(reload).toHaveBeenCalledWith('jane.midnight');
  const following = page.getByRole('switch', { name: 'Follow Midnight\'s file' });
  await following.click();
  expect(follow).toHaveBeenCalledWith('jane.midnight', true);
  await expect.element(following).toHaveAttribute('aria-checked', 'true');
  await following.click();
  expect(follow).toHaveBeenLastCalledWith('jane.midnight', false);
  await expect.element(following).toHaveAttribute('aria-checked', 'false');

  store.problems['jane.midnight'] = 'That file can\'t be read anymore.';
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
  await expect.element(page.getByRole('heading', { name: 'Plugins' })).toBeVisible();
  expect(drop(document.querySelector('dialog h3'), midnight)).toBe(true);
  await vi.waitFor(() => expect(heading()).toBe('Install Midnight 1.0.0?'));
  expect(drop(document.querySelector('dialog h3'), midnight)).toBe(true);
  expect(heading()).toBe('Install Midnight 1.0.0?');
});

test('a browser that will not keep plugins asks nothing about a dropped file, and one that fails to keep it says so', async () => {
  const store = await mount();
  await pick(midnight);
  vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('no', 'QuotaExceededError'); });
  await page.getByRole('button', { name: /^Install/ }).click();
  await expect.element(page.getByRole('alert')).toHaveTextContent('This browser didn\'t keep the plugin.');
  expect(store.plugins).toEqual([]);

  store.unavailable = true;
  expect(drop(document.querySelector('dialog h3'), midnight)).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(heading()).toBe('Plugins');
});

test('Tab goes from the last row on to Install from a file…, past the hidden file input', async () => {
  await mount();
  await installed();
  const link = document.querySelector('dialog li a');
  link.focus();
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
  await vi.waitFor(() => expect(document.querySelector('dialog h3')?.textContent).not.toBe('Plugins'));
};

test('the question for a plugin with a script warns that it runs code; a theme-only one says it runs none', async () => {
  window.showDirectoryPicker = undefined; // a browser with no folder picker: the hidden input
  onTestFinished(() => { delete window.showDirectoryPicker; });
  const store = await mount();
  const chooser = vi.spyOn(document.querySelector('dialog input[webkitdirectory]'), 'click').mockImplementation(() => {});
  await page.getByRole('button', { name: 'Install from a folder…' }).click();
  expect(chooser).toHaveBeenCalled(); // the hidden input's chooser
  await pickFolder(scripted());
  expect(heading()).toBe('Install Midnight 1.0.0?');
  expect(dialogText()).toContain('Adds 1 theme and a script.');
  expect(dialogText()).toContain(WARNING);
  expect(dialogText()).not.toContain('Runs no code');
  await page.getByRole('button', { name: /^Install/ }).click();
  await expect.element(page.getByRole('heading', { name: 'Plugins' })).toBeVisible();
  expect(store.solvers[solverRef('jane.midnight', 'edges')]).toMatchObject({ name: 'Edges' });
  expect(document.querySelector('dialog li').textContent).toContain('Runs code');

  await pickFolder(scripted((m) => { m.version = '1.1.0'; delete m.themes; }));
  expect(dialogText()).toContain('Adds a script.');
  expect(dialogText()).toContain(WARNING);
  await page.getByRole('button', { name: 'Cancel' }).click();

  // a script that won't load is refused in its own words, and nothing is kept
  await pickFolder(scripted((m) => { m.version = '1.2.0'; }), 'export default {');
  await page.getByRole('button', { name: /^Replace/ }).click();
  await vi.waitFor(() => expect(document.querySelector('dialog [role=alert]')?.textContent).toMatch(/^The plugin's script couldn't be loaded: ./));
  expect(store.plugins[0].manifest.version).toBe('1.0.0');
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
  await vi.waitFor(() => expect(heading()).toBe('Install Midnight 1.0.0?'));
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
  document.querySelector('dialog h3').dispatchEvent(event);
  return event.defaultPrevented;
};

test('a dropped folder is asked about; a dropped zip too', async () => {
  await mount();
  expect(folderDrop([entry('phosphor-plugin.json', scripted()), entry('edges.js', SCRIPT)])).toBe(true);
  await vi.waitFor(() => expect(heading()).toBe('Install Midnight 1.0.0?'));
  expect(dialogText()).toContain(WARNING);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect.element(page.getByRole('heading', { name: 'Plugins' })).toBeVisible();

  const zip = await zipOf([['midnight-main/phosphor-plugin.json', scripted()], ['midnight-main/edges.js', SCRIPT]]);
  const data = new DataTransfer();
  data.items.add(new File([zip], 'midnight-main.zip', { type: 'application/zip' }));
  document.querySelector('dialog h3').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(heading()).toBe('Install Midnight 1.0.0?'));
  expect(dialogText()).toContain('Adds 1 theme and a script.');
});

test('a row waiting on code asks before running it', async () => {
  const store = await mount();
  await installed();
  const allow = vi.spyOn(store, 'allowCode').mockImplementation(async (id) => { delete store.pendingCode[id]; return true; });
  const decline = vi.spyOn(store, 'declineCode').mockImplementation(async (id) => { delete store.pendingCode[id]; });
  store.pendingCode['jane.midnight'] = { manifest: JSON.parse(scripted()), scriptText: SCRIPT, handle: null, following: false };
  await expect.element(page.getByText('Midnight now runs code. Allow?')).toBeVisible();
  expect(page.getByRole('status').query()?.textContent).toBe('Midnight now runs code. Allow?'); // heard when a Reload brings it
  expect(document.querySelector('dialog li').textContent).toContain(WARNING);
  await page.getByRole('button', { name: 'Not now for Midnight' }).click();
  expect(decline).toHaveBeenCalledWith('jane.midnight');
  await expect.element(page.getByText('Midnight now runs code. Allow?')).not.toBeInTheDocument();
  await vi.waitFor(() => expect(document.activeElement).toBe(page.getByRole('switch', { name: 'Midnight' }).element())); // not lost with the buttons

  store.pendingCode['jane.midnight'] = { manifest: JSON.parse(scripted()), scriptText: SCRIPT, handle: null, following: false };
  await page.getByRole('button', { name: 'Allow Midnight to run code' }).click();
  expect(allow).toHaveBeenCalledWith('jane.midnight');
  await expect.element(page.getByText('Midnight now runs code. Allow?')).not.toBeInTheDocument();
  await vi.waitFor(() => expect(document.activeElement).toBe(page.getByRole('switch', { name: 'Midnight' }).element()));
});

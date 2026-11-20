// The Plugins dialog: what's installed, installing from a manifest file after asking, the on and off switch, Remove
// after asking, and what it says when the browser keeps nothing or the visit started with plugins off.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import midnight from '../fixtures/plugins/midnight/phosphor-plugin.json?raw';
import { i18n } from '@/i18n';
import PluginsDialog from '@/components/PluginsDialog.vue';
import { usePluginStore } from '@/store/PluginStore';
import { ownDatabase } from '../support/socialDatabase.js';
import '@/assets/global.css';

let app, host, loads = [];
beforeEach(() => ownDatabase('phosphor-plugins', 'plugins-dialog')());
afterEach(async () => {
  await Promise.all(loads);
  loads = [];
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

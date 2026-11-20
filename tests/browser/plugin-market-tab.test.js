// The Plugins dialog's Marketplace tab: the loaded list as cards (art band, name, version, Official or author, what it
// adds, the description), searched and filtered, each card's button by what's installed, installing through the
// install question, and a list that couldn't be had. fetch is stubbed with tests/fixtures/plugin-list.json and the
// files it lists; real IndexedDB, a database of this file's own.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import midnight from '../../plugins/midnight/phosphor-plugin.json?raw';
import rain from '../fixtures/plugins/rain/phosphor-plugin.json?raw';
import { i18n } from '@/i18n';
import PluginsDialog from '@/components/PluginsDialog.vue';
import { usePluginStore } from '@/store/PluginStore';
import { ownDatabase } from '../support/socialDatabase.js';
import { ownHangMark } from '../support/ownHangMark.js';
import { serveMarket, listWith, listed, COMMIT, RAW } from '../support/servedMarket.js';
import '@/assets/global.css';

const WARNING = '⚠ This plugin runs code in Phosphor. Install it only if you trust where it came from.';
const UNAVAILABLE = 'The marketplace couldn\'t be reached. Check your connection and try again.';
const NEWER = 'This marketplace needs a newer Phosphor. Update Phosphor to see it.';
const CHANGED = 'This plugin changed after it was listed. Try again after the list is next updated.';

let app, host, loads = [], served;
beforeEach(async () => {
  await ownDatabase('phosphor-plugins', 'plugin-market-tab')();
  ownHangMark('plugin-market-tab');
  ({ served } = serveMarket());
});
afterEach(async () => {
  await Promise.all(loads);
  loads = [];
  usePluginStore().dropSolvers('phosphor.outlines'); // the registry outlives the Pinia
  app?.unmount();
  host?.remove();
  app = host = null;
  vi.restoreAllMocks();
});

// The dialog over a new Pinia, its own loads awaited; `before` may install first (and pick the tab).
const mount = async (before = async () => {}) => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = usePluginStore();
  for (const name of ['load', 'loadMarket']) {
    const real = store[name];
    store[name] = (...args) => { const loading = real(...args); loads.push(loading); return loading; };
  }
  await before(store);
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(PluginsDialog).use(pinia).use(i18n);
  app.mount(host);
  await Promise.all(loads);
  await Promise.all(loads); // a load started by one that finished
  return store;
};
const cards = () => [...document.querySelectorAll('dialog li.card')];
const card = (name) => cards().find((one) => one.querySelector('.name').textContent === name);
const names = () => cards().map((one) => one.querySelector('.name').textContent);
const heading = () => document.querySelector('dialog h3').textContent;
const dialogText = () => document.querySelector('dialog').textContent;
const button = (name) => card(name).querySelector('div.foot button');
const amber = listed({ description: 'The warm glow of a 1983 terminal.', script: 'amber.js' });

test('with nothing installed it opens on Marketplace: the line under the tabs and a card per entry, Official first, then by name', async () => {
  served['/plugins.json'] = listWith((plugins) => [...plugins, amber]);
  await mount();
  await expect.element(page.getByRole('tab', { name: 'Marketplace' })).toHaveAttribute('aria-selected', 'true');
  expect(page.getByRole('tabpanel').element().textContent).toContain('Anyone\'s plugins, as their authors made them.');
  expect(names()).toEqual(['Midnight', 'Outlines', 'Amber CRT', 'Rain']);

  const outlines = card('Outlines');
  for (const words of ['1.0.0', 'Official', 'Adds a script']) expect(outlines.textContent).toContain(words);
  expect(outlines.textContent).not.toContain('by Phosphor');
  const description = outlines.querySelector('p.description');
  expect(description.textContent).toBe('Draws - | / and \\ along a picture\'s outlines, darker side on lighter, and leaves the rest to By shape.');
  expect(description.title).toBe(description.textContent);
  const link = outlines.querySelector('a.name');
  expect(link.href).toBe('https://github.com/jejacks0n/phosphor/tree/main/plugins/outlines');
  expect(link.target).toBe('_blank');
  expect(link.rel).toContain('noopener');

  const rainCard = card('Rain');
  for (const words of ['1.2.0', 'by Kim', '1 theme']) expect(rainCard.textContent).toContain(words);
  expect(rainCard.textContent).not.toContain('Official');
  expect(card('Amber CRT').querySelector('a.name').href).toBe('https://github.com/sam/phosphor-amber'); // no homepage: the repo
});

test('the art band: the preview as text, else a block per theme color, else empty', async () => {
  served['/plugins.json'] = listWith((plugins) => [
    ...plugins,
    amber,
    listed({ id: 'sam.bold', name: 'Bold', script: 'bold.js', preview: '<b>x</b>' }),
    listed({ id: 'sam.two', name: 'Two', themes: [
      { id: 'dusk', name: 'Dusk', base: 'dark', colors: { background: '#010203', 'surface-0': '#040506', accent: '#070809' } },
      { id: 'dawn', name: 'Dawn', base: 'light', colors: { background: '#a0a1a2', accent: '#b0b1b2' } },
    ] }),
  ]);
  await mount();
  const art = (name) => card(name).querySelector('div.art');
  expect(art('Outlines').textContent).toBe(' ╱──╲ \n│    │\n ╲──╱ ');
  expect(art('Bold').textContent).toBe('<b>x</b>');
  expect(art('Bold').querySelector('b')).toBe(null);
  const blocks = (name) => [...art(name).querySelectorAll('i')].map((block) => getComputedStyle(block).backgroundColor);
  expect(blocks('Midnight')).toEqual(['rgb(11, 16, 32)', 'rgb(16, 22, 43)', 'rgb(122, 162, 247)']);
  // each theme's background, surface and accent, a slot the theme leaves to its base left out
  expect(blocks('Two')).toEqual(['rgb(1, 2, 3)', 'rgb(4, 5, 6)', 'rgb(7, 8, 9)', 'rgb(160, 161, 162)', 'rgb(176, 177, 178)']);
  expect(art('Amber CRT').textContent).toBe('');
  expect(art('Amber CRT').children).toHaveLength(0);
});

test('search matches name, author, description and id; the filter is All, Official, Themes or Solvers', async () => {
  served['/plugins.json'] = listWith((plugins) => [...plugins, amber]);
  await mount();
  const search = page.getByRole('searchbox', { name: 'Search plugins' });
  const find = async (words) => {
    await search.fill(words);
    return names();
  };
  expect(await find('RAIN')).toEqual(['Rain']);
  expect(await find('sam ortiz')).toEqual(['Amber CRT']);
  expect(await find('late nights')).toEqual(['Midnight']);
  expect(await find('phosphor.outl')).toEqual(['Outlines']);
  expect(await find('nothing like it')).toEqual([]);
  expect(dialogText()).toContain('No plugins match.');
  await search.fill('');

  const filter = page.getByRole('combobox', { name: 'Show' });
  expect([...filter.element().options].map((option) => option.textContent)).toEqual(['All', 'Official', 'Themes', 'Solvers']);
  await filter.selectOptions('Official');
  expect(names()).toEqual(['Midnight', 'Outlines']);
  await filter.selectOptions('Themes');
  expect(names()).toEqual(['Midnight', 'Rain']);
  await filter.selectOptions('Solvers');
  expect(names()).toEqual(['Outlines', 'Amber CRT']);
  await search.fill('amber');
  expect(names()).toEqual(['Amber CRT']);
  await filter.selectOptions('All');
  await search.fill('');
  expect(names()).toHaveLength(4);
});

test('a card\'s button reads Install, Installed, Update or Replace by what is installed', async () => {
  served['/plugins.json'] = listWith((plugins) => {
    plugins.find(({ manifest }) => manifest.id === 'kim.rain').manifest.version = '1.3.0';
  });
  await mount(async (store) => {
    const listing = (repo, path) => ({ repo, path, commit: COMMIT, official: repo === 'jejacks0n/phosphor' });
    await store.install(JSON.parse(midnight), { listing: listing('jejacks0n/phosphor', 'plugins/midnight') });
    await store.install(JSON.parse(rain), { listing: listing('kim/phosphor-rain', '') });
    // the same id from a file: not the listed one
    await store.install({ ...JSON.parse(midnight), id: 'phosphor.outlines', name: 'My outlines' });
    store.dialogTab = 'market';
  });
  await vi.waitFor(() => expect(names()).toHaveLength(3));
  expect(button('Midnight').textContent).toBe('Installed');
  expect(button('Midnight').disabled).toBe(true);
  expect(button('Rain').textContent).toBe('Update');
  expect(button('Outlines').textContent).toBe('Replace');
  expect(button('Outlines').disabled).toBe(false);

  await usePluginStore().uninstall('kim.rain');
  await vi.waitFor(() => expect(button('Rain').textContent).toBe('Install'));
});

test('Install asks first, naming Official and warning of code, and the answer installs it as from the marketplace', async () => {
  const store = await mount();
  await expect.element(page.getByRole('tab', { name: 'Marketplace' })).toHaveAttribute('aria-selected', 'true');
  await vi.waitFor(() => expect(names()).toHaveLength(3));
  button('Outlines').click();
  await vi.waitFor(() => expect(heading()).toBe('Install Outlines 1.0.0?'));
  expect(document.querySelector('dialog p.sub').textContent).toBe('Official');
  expect(dialogText()).toContain('Adds a script.');
  expect(dialogText()).toContain(WARNING);
  await page.getByRole('button', { name: /^Install/ }).click();
  await vi.waitFor(() => expect(store.plugins).toHaveLength(1));
  expect(store.plugins[0]).toMatchObject({
    id: 'phosphor.outlines', source: 'marketplace',
    listing: { repo: 'jejacks0n/phosphor', path: 'plugins/outlines', commit: COMMIT, official: true },
  });
  // back on the tab it was asked from
  await expect.element(page.getByRole('tab', { name: 'Marketplace' })).toHaveAttribute('aria-selected', 'true');
  await vi.waitFor(() => expect(button('Outlines').textContent).toBe('Installed'));

  button('Rain').click();
  await vi.waitFor(() => expect(heading()).toBe('Install Rain 1.2.0?'));
  expect(document.querySelector('dialog p.sub').textContent).toBe('by Kim, from the marketplace, kim/phosphor-rain');
  expect(dialogText()).not.toContain(WARNING);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect.element(page.getByRole('tab', { name: 'Marketplace' })).toBeVisible();
  expect(store.plugins).toHaveLength(1);
});

test('Replace names where the new one comes from, and the answer keeps its listing', async () => {
  const store = await mount(async (plugins) => {
    await plugins.install(JSON.parse(rain)); // from a file
    plugins.dialogTab = 'market';
  });
  await vi.waitFor(() => expect(button('Rain').textContent).toBe('Replace'));
  button('Rain').click();
  await vi.waitFor(() => expect(heading()).toBe('Replace Rain 1.2.0 with 1.2.0?'));
  expect(document.querySelector('dialog p.sub').textContent).toBe('by Kim, from the marketplace, kim/phosphor-rain');
  await page.getByRole('button', { name: /^Replace/ }).click();
  await vi.waitFor(() => expect(store.plugins[0].source).toBe('marketplace'));
  expect(store.plugins[0].listing).toEqual({ repo: 'kim/phosphor-rain', path: '', commit: COMMIT, official: false });
});

test('a listed plugin whose files changed says so on the tab, and installs nothing', async () => {
  served[`${RAW}/kim/phosphor-rain/${COMMIT}/phosphor-plugin.json`] = rain.replace('1.2.0', '1.3.0');
  const store = await mount();
  await vi.waitFor(() => expect(names()).toHaveLength(3));
  button('Rain').click();
  await expect.element(page.getByRole('alert')).toHaveTextContent(CHANGED);
  expect(heading()).toBe('Plugins');
  expect(store.plugins).toEqual([]);
});

test('a list that can\'t be had says so, and Try again loads it again', async () => {
  delete served['/plugins.json'];
  const store = await mount();
  await expect.element(page.getByText(UNAVAILABLE)).toBeVisible();
  expect(cards()).toEqual([]);
  served['/plugins.json'] = listWith(() => {});
  const again = vi.spyOn(store, 'loadMarket');
  await page.getByRole('button', { name: 'Try again' }).click();
  expect(again).toHaveBeenCalledWith({ again: true });
  await vi.waitFor(() => expect(names()).toEqual(['Midnight', 'Outlines', 'Rain']));
  expect(page.getByText(UNAVAILABLE).query()).toBe(null);
});

test('a list for a newer Phosphor asks for an update in place of the connection\'s words', async () => {
  served['/plugins.json'] = JSON.stringify({ ...JSON.parse(listWith(() => {})), format: 2 });
  await mount();
  await expect.element(page.getByText(NEWER)).toBeVisible();
  expect(page.getByRole('alert').element().textContent).toBe(NEWER);
  expect(page.getByText(UNAVAILABLE).query()).toBe(null);
  expect(cards()).toEqual([]);
});

test('Tab goes from the search field to the filter, then into the cards', async () => {
  await mount();
  await vi.waitFor(() => expect(names()).toHaveLength(3));
  page.getByRole('searchbox', { name: 'Search plugins' }).element().focus();
  await userEvent.tab();
  expect(document.activeElement).toBe(page.getByRole('combobox', { name: 'Show' }).element());
  await userEvent.tab();
  expect(document.activeElement).toBe(card('Midnight').querySelector('a.name'));
});

test('a card read late never takes the place of the question already showing', async () => {
  const store = await mount();
  await vi.waitFor(() => expect(names()).toHaveLength(3));
  const real = store.readListed.bind(store);
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  vi.spyOn(store, 'readListed').mockImplementation(async (entry) => {
    if (entry.manifest.id === 'phosphor.outlines') await held;
    return real(entry);
  });
  button('Outlines').click(); // a script, read slowly
  button('Rain').click();
  await vi.waitFor(() => expect(heading()).toBe('Install Rain 1.2.0?'));
  release();
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(heading()).toBe('Install Rain 1.2.0?');
  expect(dialogText()).not.toContain(WARNING);
  expect(store.plugins).toEqual([]);
});

test('a card being read says Reading… and can\'t be pressed again until its question is up or the read fails; the rest stay usable', async () => {
  const store = await mount();
  await vi.waitFor(() => expect(names()).toHaveLength(3));
  const real = store.readListed.bind(store);
  const held = {};
  vi.spyOn(store, 'readListed').mockImplementation(async (entry) => {
    await new Promise((resolve, reject) => { held[entry.manifest.id] = { resolve, reject }; });
    return real(entry);
  });
  button('Outlines').click();
  await vi.waitFor(() => expect(button('Outlines').textContent).toBe('Reading…'));
  expect(button('Outlines').disabled).toBe(true);
  expect(button('Rain').textContent).toBe('Install');
  expect(button('Rain').disabled).toBe(false);
  expect(button('Midnight').disabled).toBe(false);

  held['phosphor.outlines'].reject(Object.assign(new Error('changed'), { userMessage: CHANGED }));
  await expect.element(page.getByRole('alert')).toHaveTextContent(CHANGED);
  expect(button('Outlines').textContent).toBe('Install');
  expect(button('Outlines').disabled).toBe(false);

  button('Rain').click();
  await vi.waitFor(() => expect(button('Rain').textContent).toBe('Reading…'));
  held['kim.rain'].resolve();
  await vi.waitFor(() => expect(heading()).toBe('Install Rain 1.2.0?'));
  await page.getByRole('button', { name: 'Cancel' }).click();
  await vi.waitFor(() => expect(heading()).toBe('Plugins'));
  expect(button('Rain').textContent).toBe('Install');
  expect(button('Rain').disabled).toBe(false);
});

test('a browser that will not keep plugins asks nothing about a card', async () => {
  const store = await mount();
  await vi.waitFor(() => expect(names()).toHaveLength(3));
  store.unavailable = true;
  const read = vi.spyOn(store, 'readListed');
  button('Rain').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(read).not.toHaveBeenCalled();
  expect(heading()).toBe('Plugins');
});

test('the search, the filter and where the grid was scrolled to come back after a question', async () => {
  const themed = (i) => listed({ id: `sam.theme${i}`, name: `Theme ${i}`, description: 'Another theme.', themes: [
    { id: 'one', name: 'One', base: 'dark', colors: { background: '#101010', accent: '#808080' } },
  ] });
  served['/plugins.json'] = listWith((plugins) => [...plugins, amber, ...Array.from({ length: 8 }, (_, i) => themed(i))]);
  await mount();
  await vi.waitFor(() => expect(names()).toHaveLength(12));
  await page.getByRole('combobox', { name: 'Show' }).selectOptions('Themes');
  await page.getByRole('searchbox', { name: 'Search plugins' }).fill('theme');
  expect(names()).toHaveLength(10);
  const body = () => document.querySelector('dialog > div.body');
  body().scrollTop = 300;
  await vi.waitFor(() => expect(body().scrollTop).toBe(300));

  button('Rain').click();
  await vi.waitFor(() => expect(heading()).toBe('Install Rain 1.2.0?'));
  await page.getByRole('button', { name: 'Cancel' }).click();
  await vi.waitFor(() => expect(heading()).toBe('Plugins'));
  expect(page.getByRole('searchbox', { name: 'Search plugins' }).element().value).toBe('theme');
  expect(page.getByRole('combobox', { name: 'Show' }).element().value).toBe('themes');
  expect(names()).toHaveLength(10);
  await vi.waitFor(() => expect(body().scrollTop).toBe(300));
});

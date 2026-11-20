// The theme on the page (useTheme, as App.vue runs it): a plugin's theme as its base and its colors on <html>, the copy
// kept in localStorage for index.html's first paint, and the theme of a plugin this tab doesn't know.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import midnight from '../../plugins/midnight/phosphor-plugin.json?raw';
import { THEME_CACHE_KEY } from '@/plugins/themes';
import { putPlugin } from '@/plugins/storage';
import { useTheme } from '@/composables/useTheme';
import { usePluginStore } from '@/store/PluginStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { ownDatabase } from '../support/socialDatabase.js';
import '@/assets/global.css';

const MIDNIGHT = 'plugin:phosphor.midnight/midnight';
const DUSK = { theme: 'plugin:sam.dusk/dusk', base: 'light', colors: { text: '#123456' } };
const html = document.documentElement;

let app, loads = [];
beforeEach(() => ownDatabase('phosphor-plugins', 'plugin-theme')());
afterEach(async () => {
  await Promise.all(loads);   // a plugin looked for after the test, or the next test's delete finds the database open
  loads = [];
  app?.unmount();
  app = null;
  vi.restoreAllMocks();
  html.removeAttribute('style');
  delete html.dataset.theme;
  localStorage.removeItem('phosphor.theme');
  localStorage.removeItem(THEME_CACHE_KEY);
});

const stores = () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const plugins = usePluginStore(), load = plugins.load;
  plugins.load = (...args) => { const loading = load(...args); loads.push(loading); return loading; };
  return { pinia, plugins, workspace: useWorkspaceStore() };
};
const mount = (pinia) => {
  app = createApp({ setup() { useTheme(); return () => null; } }).use(pinia);
  app.mount(document.createElement('div'));
};
const kept = () => JSON.parse(localStorage.getItem(THEME_CACHE_KEY));
const property = (name) => html.style.getPropertyValue(name);

test('a plugin theme puts its base and its colors on the page, and Dark takes them off', async () => {
  const { pinia, plugins, workspace } = stores();
  mount(pinia);
  await plugins.install(JSON.parse(midnight));
  workspace.theme = MIDNIGHT;
  await nextTick();
  expect(html.dataset.theme).toBe('dark');
  expect(property('--surface-0')).toBe('#10162b');
  expect(getComputedStyle(document.body).backgroundColor).toBe('rgb(16, 22, 43)');
  expect(kept()).toEqual({ theme: MIDNIGHT, base: 'dark', colors: JSON.parse(midnight).themes[0].colors });

  workspace.theme = 'dark';
  await nextTick();
  expect(property('--surface-0')).toBe('');
  expect(localStorage.getItem(THEME_CACHE_KEY)).toBe(null);
});

test('a theme from a plugin this tab has not loaded is painted from the kept copy, which is left as it is', async () => {
  localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(DUSK));
  const { pinia, plugins, workspace } = stores();
  workspace.theme = DUSK.theme;
  mount(pinia);
  await plugins.load();
  await nextTick();
  expect(html.dataset.theme).toBe('light');
  expect(property('--text')).toBe('#123456');
  expect(kept()).toEqual(DUSK);
  expect(workspace.theme).toBe(DUSK.theme);
});

test('with neither the plugin nor a kept copy, the page is Dark and the choice is kept', async () => {
  const { pinia, plugins, workspace } = stores();
  workspace.theme = DUSK.theme;
  mount(pinia);
  await plugins.load();
  await nextTick();
  expect(html.dataset.theme).toBe('dark');
  expect(property('--text')).toBe('');
  expect(workspace.theme).toBe(DUSK.theme);
});

test('started with plugins off, the page shows the base without the colors and the kept copy stays', async () => {
  localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(DUSK));
  const { pinia, plugins, workspace } = stores();
  plugins.off = true;
  workspace.theme = DUSK.theme;
  mount(pinia);
  await plugins.load();
  await nextTick();
  expect(html.dataset.theme).toBe('light');
  expect(property('--text')).toBe('');
  expect(kept()).toEqual(DUSK);
});

test('a plugin installed in another tab is picked up when its theme arrives', async () => {
  const { pinia, plugins, workspace } = stores();
  mount(pinia);
  await plugins.load();
  await putPlugin({ id: 'phosphor.midnight', manifest: JSON.parse(midnight), enabled: true, source: 'file', installedAt: 1 });
  workspace.theme = MIDNIGHT;
  await expect.poll(() => property('--surface-0')).toBe('#10162b');
});

// The settings column's footer: a select of the themes plugins add, beside the Dark, Light and System icons and there
// only when a plugin offers one, the Plugins button that opens the dialog, and on a narrow screen, where the settings
// are a drawer, a Commands button under it that opens the command list.
import { afterEach, beforeEach, expect, onTestFinished, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import midnight from '../../plugins/midnight/phosphor-plugin.json?raw';
import { i18n } from '@/i18n';
import ProjectFooter from '@/components/ProjectFooter.vue';
import { usePluginStore } from '@/store/PluginStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { ownDatabase } from '../support/socialDatabase.js';
import '@/assets/global.css';

const MIDNIGHT = 'plugin:phosphor.midnight/midnight';

let app, host;
beforeEach(() => ownDatabase('phosphor-plugins', 'plugin-picker')());
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
  vi.restoreAllMocks();
  localStorage.removeItem('phosphor.theme');
});

const mount = () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const plugins = usePluginStore(), workspace = useWorkspaceStore();
  host = document.createElement('div');
  host.style.width = '280px';
  document.body.append(host);
  app = createApp(ProjectFooter).use(pinia).use(i18n);
  app.mount(host);
  return { plugins, workspace };
};
const select = () => page.getByRole('combobox', { name: 'Plugin themes' });

test('with no plugin theme there is no select, and Plugins opens the dialog', async () => {
  const { workspace } = mount();
  await nextTick();
  expect(select().query()).toBe(null);
  await page.getByRole('button', { name: 'Plugins' }).click();
  expect(workspace.pluginsOpen).toBe(true);
});

test('a plugin theme is picked in the select, which unchecks the icons; an icon puts the select back', async () => {
  const { plugins, workspace } = mount();
  await plugins.install(JSON.parse(midnight));
  await expect.element(select()).toBeVisible();
  expect([...select().element().options].map((option) => option.text.trim())).toEqual(['Themes (from plugins)…', 'Midnight']);
  expect(select().element().value).toBe('');

  await userEvent.selectOptions(select(), MIDNIGHT);
  expect(workspace.theme).toBe(MIDNIGHT);
  await nextTick();
  expect(host.querySelectorAll('input[type=radio]:checked')).toHaveLength(0);

  await page.getByRole('radio', { name: 'Light' }).click();
  expect(workspace.theme).toBe('light');
  await nextTick();
  expect(select().element().value).toBe('');
});

test('a theme whose plugin is switched off leaves the select', async () => {
  const { plugins } = mount();
  await plugins.install(JSON.parse(midnight));
  await expect.element(select()).toBeVisible();
  await plugins.setEnabled('phosphor.midnight', false);
  await nextTick();
  expect(select().query()).toBe(null);
});

// A phone has no Cmd+K: where the settings are a drawer, Commands opens the command list and shuts the drawer, so what
// the command does shows. A wide screen has the key, and no button.
test('on a narrow screen Commands opens the command list and shuts the drawer; a wide screen has none', async () => {
  const { workspace } = mount();
  workspace.settingsOpen = true;
  await page.getByRole('button', { name: 'Commands' }).click();
  expect(workspace.commandListOpen).toBe(true);
  expect(workspace.settingsOpen).toBe(false);

  await page.viewport(1400, 800);
  onTestFinished(() => page.viewport(414, 896));
  await expect.poll(() => page.getByRole('button', { name: 'Commands' }).query()).toBe(null);
  expect(page.getByRole('button', { name: 'Plugins' }).query()).not.toBe(null);
});

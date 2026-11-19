// On a phone the settings are a drawer opened by the menu button (f2): opened from the keys, focus goes into it, so Tab
// goes on through the settings; Escape shuts it and focus goes back to the menu button. Escape in a field you type in
// is the field's (it puts back what was typed), and an open tip takes it first.
import { afterEach, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, loadImage } from '../support/app.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import ControlPanel from '@/components/ControlPanel.vue';
import EditTabs from '@/components/EditTabs.vue';

let app, host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

test('the settings drawer takes focus when opened from the keys, and Escape shuts it', async () => {
  await page.viewport(414, 896);
  const { project } = await createTestApp();
  const workspace = useWorkspaceStore();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => [h(ControlPanel), h(EditTabs, { modelValue: 'input' })] }).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();

  const menu = host.querySelector('button.menu-btn');
  menu.focus();
  await userEvent.keyboard('{Enter}');
  expect(workspace.settingsOpen).toBe(true);
  await expect.element(page.getByRole('button', { name: 'About Phosphor', exact: true })).toHaveFocus();
  // Tab goes on through the settings: Dimensions' help, then Dimensions. An open tip takes the Escape: it shuts, the
  // drawer stays.
  await userEvent.keyboard('{Tab}');
  const help = page.getByRole('button', { name: 'Help: Dimensions', exact: true });
  await expect.element(help).toHaveFocus();
  await userEvent.keyboard('{Enter}');
  await expect.element(help).toHaveAttribute('aria-expanded', 'true');
  await userEvent.keyboard('{Escape}');
  await expect.element(help).toHaveAttribute('aria-expanded', 'false');
  expect(workspace.settingsOpen).toBe(true);

  // Escape in Dimensions puts back what was typed; the drawer stays.
  await userEvent.keyboard('{Tab}');
  const cols = page.getByRole('spinbutton', { name: 'Dimensions', exact: true });
  await expect.element(cols).toHaveFocus();
  await userEvent.keyboard('9{Escape}');
  await expect.element(cols).toHaveValue(40);
  await expect.element(cols).toHaveFocus();
  expect(workspace.settingsOpen).toBe(true);

  // Escape anywhere else in the drawer (here the help button, its tip shut) shuts it, and focus goes back to the menu
  // button.
  await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
  await expect.element(help).toHaveFocus();
  await userEvent.keyboard('{Escape}');
  expect(workspace.settingsOpen).toBe(false);
  expect(document.activeElement).toBe(menu);
});

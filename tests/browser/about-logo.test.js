// The logo at the top of the settings panel opens About, as the footer's About Phosphor does; it's a button, named for
// keyboards and screen readers, and still shows the logo picture, hovered or not.
import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import ControlPanel from '@/components/ControlPanel.vue';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import '@/assets/global.css';

let app, host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

test('the settings panel\'s logo is a button named About Phosphor that opens About', async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const workspace = useWorkspaceStore();
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(ControlPanel).use(pinia).use(i18n);
  app.mount(host);
  await nextTick();
  const logo = host.querySelector('button.logo');
  expect(logo.getAttribute('aria-label')).toBe('About Phosphor');
  expect(getComputedStyle(logo).backgroundImage).toContain('logo');
  await userEvent.hover(logo); // buttons' hover look sets background, which mustn't take the picture away
  expect(getComputedStyle(logo).backgroundImage).toContain('logo');
  expect(workspace.showAboutModal).toBe(false);
  await userEvent.click(logo);
  expect(workspace.showAboutModal).toBe(true);
});

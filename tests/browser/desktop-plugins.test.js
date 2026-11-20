// The Plugins dialog in the desktop app: a window started with plugins off has no address to load again without
// them, so the note says to open a new window.
import { afterEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import PluginsDialog from '@/components/PluginsDialog.vue';
import { usePluginStore } from '@/store/PluginStore';

let app, host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

test('started with plugins off, the desktop note says to open a new window', async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  usePluginStore().off = true;
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(PluginsDialog).use(pinia).use(i18n);
  app.mount(host);
  await expect.element(page.getByText('Plugins are off in this window. Switch one off or remove it here, then open a new window (File > New Window).')).toBeVisible();
});

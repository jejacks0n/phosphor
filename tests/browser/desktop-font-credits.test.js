// The desktop build's links to VileR's FONTS.TXT: the app's own files open nowhere outside it, so About and the Fonts
// page link the upstream copy on GitHub.
import { afterEach, expect, test } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import AboutPhosphor from '@/components/AboutPhosphor.vue';
import { licenseUrl } from '@/lib/fontLibrary';

const UPSTREAM = 'https://github.com/viler-int10h/vga-text-mode-fonts/blob/master/FONTS.TXT';
let app, host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

test('the credits file is the upstream FONTS.TXT', () => {
  expect(licenseUrl('viler/FONTS.TXT')).toBe(UPSTREAM);
});

test('About links the upstream FONTS.TXT', async () => {
  setActivePinia(createPinia());
  host = document.body.appendChild(document.createElement('div'));
  app = createApp(AboutPhosphor).use(i18n);
  app.mount(host);
  await nextTick();
  const link = [...document.querySelectorAll('a')].find((a) => a.textContent === 'FONTS.TXT');
  expect(link.href).toBe(UPSTREAM);
});

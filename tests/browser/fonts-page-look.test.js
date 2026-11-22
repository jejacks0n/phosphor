// The Fonts page with the app's own styles (global.css: every input's height, the color tokens): the search is a search
// field, with its clear button, and + Load stands as tall as it, top and bottom in line; the chosen font's actions are
// framed buttons.
import { afterEach, expect, test } from 'vitest';
import { createApp, nextTick } from 'vue';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import CharPaletteLayer from '@/components/CharPaletteLayer.vue';
import '@/assets/global.css';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

const mount = async () => {
  const { workspace } = await createTestApp();
  workspace.paletteLayerPage = 'fonts';
  host = document.body.appendChild(document.createElement('div'));
  app = createApp(CharPaletteLayer).use(i18n);
  app.mount(host);
  await nextTick();
};

test('the search is a search field, and + Load lines up with it', async () => {
  await mount();
  const search = host.querySelector('.top input:not([type="file"])');
  const load = [...host.querySelectorAll('.top button')].find((el) => el.textContent.trim() === '+ Load');
  expect(search.type).toBe('search');
  const [a, b] = [search, load].map((el) => el.getBoundingClientRect());
  expect([b.top, b.bottom]).toEqual([a.top, a.bottom]);
});

test("the chosen font's actions are framed buttons, not bare text", async () => {
  await mount();
  const actions = [...host.querySelectorAll('.edit-side .actions button')];
  expect(actions.length).toBeGreaterThan(0);
  for (const el of actions) {
    const style = getComputedStyle(el);
    expect(style.borderTopWidth).toBe('1px');
    expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  }
});

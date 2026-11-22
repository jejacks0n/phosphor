// Get from Lospec in the desktop app: the page's policy reaches nothing but rooms, so the palette comes through the main
// process (window.phosphorDesktop's lospecPalette, faked here), asked for by slug, and never through the page's fetch.
// The main process sees Lospec's 404, so a palette Lospec doesn't have says so, as the browser can't.
import { afterEach, expect, test, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { i18n } from '@/i18n';
import ColorLayer from '@/components/ColorLayer.vue';
import { resetDesktop, useFakeDesktop } from '@/social/desktop';
import { createTestApp } from '../support/app.js';
import '@/assets/global.css';

let app, host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
  resetDesktop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// The color layer opened on its Palettes page, over a blank canvas.
const mount = async () => {
  const { project, workspace, pinia } = await createTestApp();
  await project.setBlankCanvas({ cols: 20, rows: 10 });
  workspace.openColors('fg', 'palettes');
  host = document.body.appendChild(document.createElement('div'));
  app = createApp({ render: () => (workspace.colorBox ? h(ColorLayer) : null) }).use(pinia).use(i18n);
  app.mount(host);
  await nextTick();
};

const page = () => document.querySelector('.color-layer div.page.colors-palettes');
const favorites = () => {
  const names = [];
  let inside = false;
  for (const el of page().querySelector('div.list').children) {
    if (el.matches('div.group')) inside = el.querySelector('span.label').textContent.startsWith('Favorites');
    else if (inside && el.matches('div.row')) names.push(el.querySelector('div.name > span').textContent);
  }
  return names;
};
const favoritesLabel = () => [...page().querySelectorAll('div.group span.label')].map((el) => el.textContent).find((text) => text.startsWith('Favorites'));
const title = () => page().querySelector('div.edit-side div.head span.title').textContent;
const problem = () => page().querySelector('p.get-problem');
const get = async (typed) => {
  const form = page().querySelector('form.get'), field = form.querySelector('input.get-name');
  field.value = typed;
  field.dispatchEvent(new Event('input'));
  form.querySelector('button[type=submit]').click();
  await nextTick();
};
// A fetch that would answer, so a Get that fell through to it would show as a call.
const stubFetch = () => {
  const fetch = vi.fn(async () => new Response('{"name":"Fetched","colors":["000000"]}'));
  vi.stubGlobal('fetch', fetch);
  return fetch;
};

test('in the desktop app Get asks the main process and never the network', async () => {
  const fetch = stubFetch();
  const lospecPalette = vi.fn(async () => ({ text: JSON.stringify({ name: 'Lospec Five', author: 'Someone', colors: ['000000', '111111', '222222', '333333', 'FFFFFF'] }) }));
  useFakeDesktop({ lospecPalette });
  await mount();
  await get('https://lospec.com/palette-list/lospec-five');
  await vi.waitFor(() => expect(title()).toBe('Lospec Five'));
  expect(lospecPalette.mock.calls).toEqual([['lospec-five']]);
  expect(favorites()).toEqual(['Lospec Five']);
  expect(page().querySelector('div.edit-side span.meta').textContent).toBe('5 colors · by Someone');
  expect(fetch).not.toHaveBeenCalled();
});

test('in the desktop app a palette Lospec doesn\'t have says so, and Lospec out of reach says it couldn\'t get it', async () => {
  const fetch = stubFetch();
  const lospecPalette = vi.fn(async () => ({ failed: 'notFound' }));
  useFakeDesktop({ lospecPalette });
  await mount();
  await get('sweetie 17');
  await vi.waitFor(() => expect(problem()?.textContent).toBe('Lospec has no palette called sweetie-17.'));
  lospecPalette.mockResolvedValue({ failed: 'unreachable' });
  await get('sweetie 17');
  await vi.waitFor(() => expect(problem()?.textContent).toBe("Couldn't get sweetie-17 from Lospec. Check its name or link, or try again."));
  expect(favoritesLabel()).toBe('Favorites · 0');
  expect(fetch).not.toHaveBeenCalled();
});

// About's header has a CRT's glow behind it (CrtGlow.vue): a WebGL2 canvas from the tabs' line down past the GitHub link,
// across the dialog's width, drawing the theme's accent over the dialog's surface, every frame while About shows and
// none once it's gone.
import { afterEach, expect, test, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import AboutPhosphor from '@/components/AboutPhosphor.vue';
import '@/assets/global.css';

let app, host;
afterEach(() => {
  vi.restoreAllMocks();
  app?.unmount();
  host?.remove();
  app = host = null;
});

function mount() {
  const pinia = createPinia();
  setActivePinia(pinia);
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(AboutPhosphor).use(pinia).use(i18n);
  app.mount(host);
}
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

test('the glow runs from under the tabs past the header, the dialog\'s width, in the accent over the surface', async () => {
  mount();
  await nextTick();
  await frame();
  const dialog = document.querySelector('dialog[open]'), canvas = dialog.querySelector('header canvas.crt-glow');
  const box = canvas.getBoundingClientRect(), tabs = dialog.querySelector('.head').getBoundingClientRect();
  const header = dialog.querySelector('header').getBoundingClientRect(), inner = dialog.getBoundingClientRect();
  expect(Math.abs(box.top - tabs.bottom)).toBeLessThanOrEqual(1); // no band of plain surface under the tabs
  expect(box.bottom).toBeGreaterThan(header.bottom);
  expect(Math.round(box.left - inner.left)).toBe(dialog.clientLeft);
  expect(Math.round(box.width)).toBe(dialog.clientWidth);
  expect(canvas.getAttribute('aria-hidden')).toBe('true');

  // A frame's pixels, read straight after it's drawn: some lean to the accent's purple, not the gray surface.
  await frame();
  const gl = canvas.getContext('webgl2'), { width, height } = canvas;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let purple = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 2] - pixels[i + 1] > 40) purple++;
  expect(purple).toBeGreaterThan(width * height / 10);
});

test('it stops drawing when About goes', async () => {
  mount();
  await nextTick();
  await frame();
  const asked = vi.spyOn(window, 'requestAnimationFrame');
  await frame();
  expect(asked.mock.calls.length).toBeGreaterThan(1); // its next frame, and the test's own
  app.unmount();
  app = null;
  asked.mockClear();
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(asked).not.toHaveBeenCalled();
});

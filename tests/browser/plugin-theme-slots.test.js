// The colors a theme sets beyond the surfaces and text (plugins/manifest.js COLOR_SLOTS): the shadows, the toast, the
// guides and the Magic Wand's fill each take their slot's value from <html>, where a theme puts it.
import { afterEach, expect, test } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import { applyTheme } from '@/plugins/themes';
import { toast, closeToast } from '@/composables/useToast';
import AppToast from '@/components/AppToast.vue';
import GuideRulers from '@/components/GuideRulers.vue';
import WandOverlay from '@/components/WandOverlay.vue';
import '@/assets/global.css';

const html = document.documentElement;
let app = null, root = null;
afterEach(() => {
  closeToast();
  app?.unmount();
  root?.remove();
  app = root = null;
  html.removeAttribute('style');
  delete html.dataset.theme;
});
const themed = (colors) => applyTheme(html, { base: 'dark', colors });
const mount = async (component, props = {}) => {
  root ??= document.body.appendChild(Object.assign(document.createElement('div'), { style: 'position: fixed; left: 0; top: 0; width: 400px; height: 300px' }));
  app = createApp({ render: () => h(component, props) }).use(getActivePinia()).use(i18n);
  app.mount(root.appendChild(document.createElement('div')));
  await nextTick();
};

test('a button\'s shadow is the shadow slot\'s color, at the shadow\'s own strength', async () => {
  await createTestApp();
  const button = document.body.appendChild(document.createElement('button'));
  button.style.transition = 'none'; // a button eases its shadow: the color is read at once
  try {
    expect(getComputedStyle(button).boxShadow).toMatch(/srgb 0 0 0 \/ 0\.2/); // black, as it was
    themed({ shadow: '#ff0000' });
    expect(getComputedStyle(button).boxShadow).toMatch(/srgb 1 0 0 \/ 0\.2/);
  } finally {
    button.remove();
  }
});

// The two slots that were named for colors (white and black) are named for what they color.
test('words on the accent are the text-on-accent slot\'s color, and a tooltip\'s ground the tooltip slot\'s', async () => {
  await createTestApp();
  const count = document.body.appendChild(Object.assign(document.createElement('span'), { className: 'unread' }));
  const tip = document.body.appendChild(Object.assign(document.createElement('span'), { className: 'value-tooltip' }));
  try {
    expect([getComputedStyle(count).color, getComputedStyle(tip).backgroundColor]).toEqual(['rgb(255, 255, 255)', 'rgb(0, 0, 0)']);
    themed({ 'text-on-accent': '#102030', tooltip: '#f0e0d0' });
    expect([getComputedStyle(count).color, getComputedStyle(tip).backgroundColor]).toEqual(['rgb(16, 32, 48)', 'rgb(240, 224, 208)']);
  } finally {
    count.remove();
    tip.remove();
  }
});

test('the toast is the toast slots\' colors', async () => {
  await createTestApp();
  await mount(AppToast);
  toast('Saved.');
  await nextTick();
  const shown = () => getComputedStyle(document.querySelector('.app-toast'));
  expect([shown().backgroundColor, shown().color]).toEqual(['rgb(224, 176, 80)', 'rgb(0, 0, 0)']);
  themed({ toast: '#102030', 'toast-text': '#f0e0d0' });
  expect([shown().backgroundColor, shown().color]).toEqual(['rgb(16, 32, 48)', 'rgb(240, 224, 208)']);
});

test('a guide is the guide slot\'s color', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  workspace.rulers = true;
  root = document.body.appendChild(Object.assign(document.createElement('div'), { style: 'position: fixed; left: 0; top: 0; width: 400px; height: 300px; overflow: hidden' }));
  const display = root.appendChild(Object.assign(document.createElement('div'), { style: 'position: absolute; left: 50px; top: 40px; width: 200px; height: 200px' }));
  await mount(GuideRulers, reactive({ box: { left: '0px', top: '0px', width: '400px', height: '300px' }, root, display, unit: { x: 10, y: 10 }, coordsAt: () => ({ x: 0, y: 0 }), hover: null }));
  workspace.addGuide('v', 3);
  await nextTick();
  const line = () => getComputedStyle(root.querySelector('.guide.v'), '::after').backgroundColor;
  expect(line()).toBe('rgb(34, 227, 255)');
  themed({ guide: '#ff8800' });
  expect(line()).toBe('rgb(255, 136, 0)');
});

test('the Magic Wand\'s tint is the wand-fill slot\'s color, and a theme picked redraws it', async () => {
  const { workspace } = await createTestApp();
  root = document.body.appendChild(document.createElement('article'));
  Object.assign(root.style, { position: 'fixed', left: '0', top: '0', width: '80px', height: '80px', overflow: 'auto', background: '#000' });
  const display = root.appendChild(Object.assign(document.createElement('div'), { style: 'position: relative; width: 40px; height: 40px' }));
  const wand = { mask: new Uint8Array(16).fill(1), width: 4, height: 4 };
  await mount(WandOverlay, { wand, unit: { x: 10, y: 10 }, display, tint: true });
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const middle = () => {
    const canvas = root.querySelector('canvas'), dpr = window.devicePixelRatio;
    return [...canvas.getContext('2d').getImageData(Math.round(20 * dpr), Math.round(20 * dpr), 1, 1).data];
  };
  await frame();
  const [r, g, b, a] = middle();
  for (const [got, want] of [[r, 90], [g, 160], [b, 255]]) expect(Math.abs(got - want)).toBeLessThanOrEqual(2); // a see-through pixel read back
  expect(a).toBeGreaterThan(70);
  expect(a).toBeLessThan(84);
  themed({ 'wand-fill': '#ff0000ff' });
  workspace.theme = 'light'; // a theme picked: the overlay draws again
  await frame();
  expect(middle()).toEqual([255, 0, 0, 255]);
});

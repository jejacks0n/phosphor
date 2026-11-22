// ArrowIcon (the drawn arrows that stand where typed ones were: ◂ ▸ » ↗ →), and the buttons that were glyphs alone.
import { afterEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import ArrowIcon from '@/components/ArrowIcon.vue';
import ColorList from '@/components/ColorList.vue';
import SidePanel from '@/components/SidePanel.vue';
import { createTestApp } from '../support/app.js';
import '@/assets/global.css';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

async function mount(component, props = {}) {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(component, props) }).use(i18n);
  app.mount(host);
  await nextTick();
}

test('ArrowIcon draws each shape at its size, turned, hidden from screen readers', async () => {
  await mount(ArrowIcon, { shape: 'triangle', turn: 180, size: 16 });
  let svg = host.querySelector('svg.arrow-icon');
  expect(svg.getAttribute('aria-hidden')).toBe('true');
  expect(svg.getBoundingClientRect().width).toBe(16);
  expect(getComputedStyle(svg).rotate).toBe('180deg');
  expect([...svg.querySelectorAll('path')].map((p) => p.getAttribute('d'))).toEqual(['M5 2v12l8-6z']);
  app.unmount();
  host.remove();
  await mount(ArrowIcon, { shape: 'out', size: 12 });
  svg = host.querySelector('svg.arrow-icon');
  expect(svg.getAttribute('aria-hidden')).toBe('true');
  expect(svg.getBoundingClientRect().width).toBe(12);
  expect([...svg.querySelectorAll('path')].map((p) => p.getAttribute('d'))).toEqual(['M9 2.5h4.5V7M13.5 2.5l-6 6M12 10v3.5H2.5V4H6']);
});

test('the editor\'s move earlier and later, the Keys panel\'s previous and next and the side panel\'s fold are drawn, not typed', async () => {
  await mount(ColorList, { modelValue: '#000000 #ffffff', name: 'art' });
  for (const name of ['earlier', 'later']) {
    const button = host.querySelector(`button.${name}`);
    expect(button.querySelector('svg.arrow-icon')).not.toBeNull();
    expect(button.textContent.trim()).toBe('');
    expect(button.getAttribute('aria-label')).toBeTruthy();
  }
  app.unmount();
  host.remove();
  await page.viewport(1200, 800);
  try {
    await createTestApp();
    host = document.createElement('div');
    document.body.append(host);
    app = createApp({ render: () => h(SidePanel) }).use(getActivePinia()).use(i18n);
    app.mount(host);
    await nextTick();
    const fold = host.querySelector('button.panel');
    expect(fold.querySelector('svg.arrow-icon')).not.toBeNull();
    expect(fold.textContent.trim()).toBe('');
    expect(fold.getAttribute('aria-label')).toBeTruthy();
  } finally {
    await page.viewport(414, 896);
  }
});

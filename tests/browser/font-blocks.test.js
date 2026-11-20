// The Fonts page's Blocks row (FontBlocks) in the app's colors: a block the font is missing is outlined in the
// warning color, always.
import { afterEach, expect, test } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { i18n } from '@/i18n';
import '@/assets/global.css';
import FontBlocks from '@/components/FontBlocks.vue';
import { noLowerHalf } from '../support/blockFonts.js';

let app, host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

test('a missing block’s tile is outlined in the warning color', async () => {
  host = document.body.appendChild(document.createElement('div'));
  app = createApp({ render: () => h(FontBlocks, { font: noLowerHalf, family: 'monospace' }) }).use(i18n);
  app.mount(host);
  await nextTick();
  const tile = (name) => [...host.querySelectorAll('button.tile')].find((el) => el.querySelector('.name').textContent === name);
  const danger = getComputedStyle(host.querySelector('.note.warn')).color; // var(--danger)
  expect(getComputedStyle(tile('Lower')).borderTopColor).toBe(danger);
  expect(getComputedStyle(tile('Full')).borderTopColor).not.toBe(danger);
});

test('picked, a missing block\u2019s tile keeps its warning outline', async () => {
  host = document.body.appendChild(document.createElement('div'));
  app = createApp({ render: () => h(FontBlocks, { font: noLowerHalf, family: 'monospace', picked: 'lower' }) }).use(i18n);
  app.mount(host);
  await nextTick();
  const lower = [...host.querySelectorAll('button.tile')].find((el) => el.querySelector('.name').textContent === 'Lower');
  expect(lower.classList.contains('picked')).toBe(true);
  expect(getComputedStyle(lower).borderTopColor).toBe(getComputedStyle(host.querySelector('.note.warn')).color);
});

// Small buttons that opt out of the global button hover look (global.css: a lift, a shadow and a gray background):
// the help i stays where it is and only lights up, and a tool slot's flyout corner stays clear, only its triangle lit.
import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import HelpInfo from '@/components/HelpInfo.vue';
import EditToolbar from '@/components/EditToolbar.vue';
import '@/assets/global.css';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

function mount(component) {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(component).use(i18n);
  app.mount(host);
  return nextTick();
}
const settled = () => new Promise((resolve) => setTimeout(resolve, 300)); // past the 0.2 s transitions

test('the help i doesn\'t move or cast a shadow on hover; it lights up', async () => {
  await mount({ render: () => h(HelpInfo, { text: 'Some help.', name: 'Seed' }) });
  const button = host.querySelector('button.help-icon'), glyph = button.querySelector('.help-glyph');
  const before = button.getBoundingClientRect(), color = getComputedStyle(glyph).backgroundColor;
  await userEvent.hover(button);
  await settled();
  expect(button.getBoundingClientRect().toJSON()).toEqual(before.toJSON());
  expect(getComputedStyle(button).boxShadow).toBe('none');
  expect(getComputedStyle(glyph).backgroundColor).not.toBe(color);
});

test('a tool slot\'s flyout corner has no background on hover; its triangle lights up', async () => {
  const { workspace } = await createTestApp();
  workspace.editorTab = 'output';
  await mount(EditToolbar);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const corner = host.querySelector('.tool-slot .dropdown-trigger'), triangle = corner.querySelector('.slot-corner');
  const lit = getComputedStyle(triangle).borderBottomColor;
  await userEvent.hover(corner);
  await settled();
  expect(getComputedStyle(corner).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(getComputedStyle(corner).boxShadow).toBe('none');
  expect(getComputedStyle(triangle).borderBottomColor).not.toBe(lit);
});

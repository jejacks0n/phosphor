// Small buttons that opt out of the global button hover look (global.css: a lift, a shadow and a gray background):
// the help i stays where it is and only lights up, and a tool slot's flyout corner stays clear, only its triangle lit.
import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import HelpInfo from '@/components/HelpInfo.vue';
import EditToolbar from '@/components/EditToolbar.vue';
import FontFilters from '@/components/FontFilters.vue';
import CharPaletteLayer from '@/components/CharPaletteLayer.vue';
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
// Hovered, and the transitions that started run to their end. A hover is heard and a transition moves on frames, and a
// machine busy with other test files draws few: 300 ms could pass with none, the look still as it was before the hover
// (the two took 0.3 to 2.4 seconds, measured). So they're waited for, not timed.
const PATIENT = { timeout: 5000 };
async function hover(el) {
  await userEvent.hover(el);
  await expect.poll(() => el.matches(':hover'), PATIENT).toBe(true);
  await Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished));
}

test('the help i doesn\'t move or cast a shadow on hover; it lights up', async () => {
  await mount({ render: () => h(HelpInfo, { text: 'Some help.', name: 'Seed' }) });
  const button = host.querySelector('button.help-icon'), glyph = button.querySelector('.help-glyph');
  const before = button.getBoundingClientRect(), color = getComputedStyle(glyph).backgroundColor;
  await hover(button);
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
  await hover(corner);
  expect(getComputedStyle(corner).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(getComputedStyle(corner).boxShadow).toBe('none');
  expect(getComputedStyle(triangle).borderBottomColor).not.toBe(lit);
});

test("a font filter group's header doesn't move or cast a shadow on hover", async () => {
  await mount({ render: () => h(FontFilters, { groups: [{ group: 'shape', tags: [{ key: 'shape:8x8', label: '8×8' }] }], counts: new Map(), picked: [], closed: [] }) });
  const head = host.querySelector('button.group-head'), before = head.getBoundingClientRect();
  await hover(head);
  expect(head.getBoundingClientRect().toJSON()).toEqual(before.toJSON());
  expect(getComputedStyle(head).boxShadow).toBe('none');
  expect(head.querySelector('svg.chevron').getBoundingClientRect().width).toBeGreaterThanOrEqual(9); // an arrow you can see
});

test("the Fonts page's Blocks, Lines and Sets tabs and its « / » don't move or cast a shadow on hover", async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  project.setDrawingFont({ name: 'A', height: 8, bytes: new Uint8Array(2048).fill(1) });
  workspace.paletteLayerPage = 'fonts';
  await mount(CharPaletteLayer);
  await expect.poll(() => host.querySelectorAll('div.sections button[role="tab"]').length, PATIENT).toBe(3);
  await expect.poll(() => host.querySelector('.top button.filters-toggle'), { timeout: 15000 }).toBeTruthy(); // once the library's index is in
  for (const el of [[...host.querySelectorAll('div.sections button[role="tab"]')].find((b) => !b.classList.contains('on')), host.querySelector('.top button.filters-toggle')]) {
    const before = el.getBoundingClientRect();
    await hover(el);
    expect(el.getBoundingClientRect().toJSON()).toEqual(before.toJSON());
    expect(getComputedStyle(el).boxShadow).toBe('none');
    expect(getComputedStyle(el).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  }
});

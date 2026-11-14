// Toolbar slots (EditToolbar, tools/groups.js): a group's tools share one slot showing the one last chosen, with a
// corner that opens the rest; the ⋯ menu lists a hidden slot's tools one by one.
import { test, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, nextTick } from 'vue';
import { createTestApp, settle } from '../support/app.js';
import { i18n } from '@/i18n';
import EditToolbar from '@/components/EditToolbar.vue';
import { getTool, keyLabel } from '@/tools';

let mounted = null, host = null;
beforeAll(() => page.viewport(1200, 800)); // a wide screen; the flyout shows keys there, not on a phone
afterAll(() => page.viewport(414, 896));
afterEach(() => { mounted?.unmount(); host?.remove(); mounted = host = null; });

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

async function toolbar(tab = 'output', width = 1200) {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(app.project);
  app.workspace.editorTab = tab;
  host = document.createElement('div');
  host.style.width = `${width}px`;
  document.body.append(host);
  mounted = createApp(EditToolbar).use(i18n);
  mounted.mount(host);
  await frame();
  return app;
}
const slots = () => [...host.querySelectorAll('.tool-group > [data-slot]')].map((el) => el.dataset.slot);
const face = (slot) => host.querySelector(`[data-slot="${slot}"] [data-tool], button[data-slot="${slot}"]`);
const choices = () => [...host.querySelectorAll('.dropdown-content button.choice')];

test('ANSI shows a slot per tool, the grouped ones sharing theirs', async () => {
  await toolbar();
  expect(slots()).toEqual(['pencil', 'brush', 'eraser', 'fill', 'shapes', 'picker', 'select', 'navigate', 'text', 'flip']);
});

test('VECTOR groups Vector select and Node', async () => {
  const { project, workspace } = await toolbar();
  project.addLayer('vector', 'base');
  workspace.pickLayer('vector');
  await frame();
  expect(slots()[0]).toBe('vselect');
  expect(face('vselect').dataset.tool).toBe('vselect');
  workspace.setActiveTool('vnode');
  await nextTick();
  expect(face('vselect').dataset.tool).toBe('vnode');
});

test('a slot shows the tool last chosen, and keeps it with another tool in use', async () => {
  const { workspace } = await toolbar();
  expect(face('fill').dataset.tool).toBe('bucket');
  workspace.setActiveTool('gradient');
  await nextTick();
  expect(face('fill').dataset.tool).toBe('gradient');
  expect(face('fill').classList.contains('active')).toBe(true);
  workspace.setActiveTool('pencil');
  await nextTick();
  expect(face('fill').dataset.tool).toBe('gradient');
  expect(face('fill').classList.contains('active')).toBe(false);
  face('fill').click();
  expect(workspace.activeTool).toBe('gradient');
});

test('the corner opens the slot: each tool with its keys, and choosing one uses it', async () => {
  const { workspace } = await toolbar();
  host.querySelector('[data-slot="fill"] .dropdown-trigger').click();
  await frame(); // a click in the same millisecond the menu was made is one Vue's handlers ignore (its _vts guard); no person is that quick
  expect(choices().map((b) => [b.querySelector('.slot-name').textContent, b.querySelector('.slot-keys').textContent]))
    .toEqual([['Paint Bucket', 'G'], ['Gradient', keyLabel('Shift+G')]]);
  choices()[1].click();
  await nextTick();
  expect(workspace.activeTool).toBe('gradient');
  expect(choices()).toEqual([]);
});

test('on a phone the slot leaves the keys out', async () => {
  await page.viewport(414, 896);
  try {
    await toolbar('output', 414);
    host.querySelector('[data-slot="fill"] .dropdown-trigger').click();
    await nextTick();
    expect(choices().map((b) => b.textContent.trim())).toEqual(['Paint Bucket', 'Gradient']);
  } finally {
    await page.viewport(1200, 800);
  }
});

test('a right-click on the slot opens it too', async () => {
  await toolbar();
  face('select').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  await nextTick();
  expect(choices().map((b) => b.querySelector('.slot-name').textContent)).toEqual(['Select', 'Magic Wand']);
});

test('a narrow toolbar lists a hidden slot\'s tools one by one in the ⋯ menu', async () => {
  const { workspace } = await toolbar('output', 420);
  await frame();
  const more = host.querySelector('article.tools-menu:not(.tool-slot) .dropdown-trigger');
  expect(more).toBeTruthy();
  more.click();
  await nextTick();
  const names = choices().map((b) => b.textContent.trim());
  expect(names).toEqual(expect.arrayContaining([getTool('hand').title, 'Zoom']));
  choices().find((b) => b.textContent.trim() === 'Zoom').click();
  expect(workspace.activeTool).toBe('zoom');
});

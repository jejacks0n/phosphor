// The toolbar's options row (EditToolbar's second row): when its buttons don't fit, those at its end move into a ⋯
// menu after the last that fits, as the tool row's do, so nothing that can be pressed sits past the edge with no sign. The report
// (dex-10): at 1280 wide with both panels open, the Select row went past the view's edge and Deselect and All layers
// were out of sight, reachable only by Shift+wheel.
import { test, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp } from 'vue';
import { createTestApp, settle } from '../support/app.js';
import { i18n } from '@/i18n';
import EditToolbar from '@/components/EditToolbar.vue';

let mounted = null, host = null;
beforeAll(() => page.viewport(1280, 720));
afterAll(() => page.viewport(414, 896));
afterEach(() => { mounted?.unmount(); host?.remove(); mounted = host = null; });

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const frames = async () => { await frame(); await frame(); };

// The toolbar as wide as the view is at 1280 with both panels open (726 px), the Select tool picked with a selection.
async function selecting(width = 726) {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(app.project);
  app.workspace.editorTab = 'output';
  app.workspace.setActiveTool('select');
  app.workspace.selection = { c0: 1, r0: 1, c1: 5, r1: 3 };
  host = document.createElement('div');
  host.style.width = `${width}px`;
  document.body.append(host);
  mounted = createApp(EditToolbar).use(i18n);
  mounted.mount(host);
  await frames();
  return app;
}
const row = () => host.querySelector('div.secondary-row');
const more = () => row().querySelector('.options-more');
const name = (el) => (el.getAttribute('aria-label') || el.textContent).trim();
// What the row shows, by name, in order (folded buttons are out of the layout).
const shown = () => [...row().querySelectorAll('.tool-setting-group > button, .tool-setting-group > label')]
  .filter((el) => el.offsetParent).map(name);
const menuItems = () => [...document.querySelectorAll('.options-more .dropdown-content button.choice')];

test('at 1280 with both panels open, the Select row folds its end into ⋯ and nothing goes past the edge', async () => {
  const { workspace } = await selecting();
  expect(row().scrollWidth).toBeLessThanOrEqual(row().clientWidth);
  expect(more().offsetParent).not.toBe(null);
  expect(shown().slice(0, 2)).toEqual(['Set FG', 'Set BG']); // the recolor, which only this row offers, stays
  expect(shown()).not.toContain('Deselect');
  expect(shown()).not.toContain('All layers');

  more().querySelector('.dropdown-trigger').click();
  await frames();
  const names = menuItems().map((b) => b.textContent.trim());
  expect(names.slice(-2)).toEqual(['Deselect', 'All layers']); // in the row's order
  // The ⋯ follows what's left of the row, as the tool row's does, not pushed to its far end.
  const last = [...row().querySelectorAll('.tool-setting-group > button')].filter((el) => el.offsetParent).at(-1);
  expect(more().getBoundingClientRect().left - last.getBoundingClientRect().right).toBeLessThan(20);
  expect(new Set([...shown(), ...names]).size).toBe(shown().length + names.length); // each in one place

  menuItems().find((b) => b.textContent.trim() === 'Deselect').click();
  await frames();
  expect(workspace.selection).toBe(null);
});

test('a folded button keeps its disabled state and the tooltip that says why; a folded checkbox shows and toggles its check', async () => {
  const { project, workspace } = await selecting(390);
  project.typeAt(2, 2, 'A', { fg: '#ffffff', bg: '#000000' }); // characters in the selection: Rotate is off
  project.commitEdit();
  workspace.selection = { c0: 1, r0: 1, c1: 5, r1: 3 };
  await frames();
  expect(row().scrollWidth).toBeLessThanOrEqual(row().clientWidth);
  more().querySelector('.dropdown-trigger').click();
  await frames();
  const rotate = menuItems().find((b) => b.textContent.includes('Rotate'));
  expect(rotate.disabled).toBe(true);
  expect(rotate.title).toBe(i18n.global.t('toolbar.selection.rotateCharsDisabled'));

  const all = () => menuItems().find((b) => b.textContent.trim() === 'All layers');
  const opened = async () => { await userEvent.click(more().querySelector('.dropdown-trigger')); await frames(); };
  await userEvent.click(more().querySelector('.dropdown-trigger')); // shut
  workspace.selectAllLayers = false;
  await frames();
  await opened();
  expect(all().getAttribute('aria-checked')).toBe('false');
  expect(all().querySelector('svg')).toBe(null); // off: no check
  await userEvent.click(all());
  await frames();
  expect(workspace.selectAllLayers).toBe(true);
  await opened();
  expect(all().getAttribute('aria-checked')).toBe('true');
  expect(all().querySelector('svg')).not.toBe(null); // on: a check you can see
  await userEvent.click(all());
  await frames();
  expect(workspace.selectAllLayers).toBe(false);
});

test('with room for everything, nothing folds and there is no ⋯', async () => {
  await selecting(1400);
  expect(more().offsetParent).toBe(null);
  expect(shown()).toContain('Deselect');
  expect(shown()).toContain('All layers');
});

// The Hand's row has Mirror drawing, mirror mode's switch beside the rulers' own settings, checked while it's on; not in
// VECTOR, whose tools don't mirror.
test('the Hand\'s row switches mirror mode with Mirror drawing, not in VECTOR', async () => {
  const { workspace } = await selecting(1200);
  workspace.setActiveTool('hand');
  await frames();
  const box = () => [...row().querySelectorAll('label.checkbox-wrapper')].find((l) => name(l) === 'Mirror drawing')?.querySelector('input');
  box().click();
  expect(workspace.mirror).toBe(true);
  await frames();
  workspace.mirror = false; // Alt+M, say
  await frames();
  expect(box().checked).toBe(false);
  workspace.editorTab = 'vector';
  await frames();
  expect(box()).toBeUndefined();
});

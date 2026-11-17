// The status bar under the ANSI and VECTOR views (AnsiStatusBar.vue): it starts with the picked layer's name, so a folded
// side panel or a phone still says which layer you're on.
import { test, expect, afterEach } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n, setLocale } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import { rectShape } from '@/document/shapes.js';
import AnsiStatusBar from '@/components/AnsiStatusBar.vue';
import { shortcut } from '@/lib/keyLabels';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

async function mount() {
  const stores = await createTestApp();
  await stores.project.setBlankCanvas({ withLayer: true, cols: 20, rows: 10 });
  await settle(stores.project);
  stores.workspace.editorTab = 'output';
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(AnsiStatusBar).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  return stores;
}
const layer = () => host.querySelector('footer > :first-child');

test('it starts with the picked layer\'s name, which a pick and a rename update', async () => {
  const { project, workspace } = await mount();
  expect(layer().getAttribute('aria-label')).toBe('Selected layer: Layer 1');
  expect(layer().textContent).toBe('Layer 1');
  workspace.pickLayer('base');
  await nextTick();
  expect(layer().textContent).toBe('Base');
  expect(layer().getAttribute('aria-label')).toBe('Selected layer: Base');

  project.renameLayer('edit', 'Ink');
  workspace.pickLayer('edit');
  await nextTick();
  expect(layer().textContent).toBe('Ink');
  project.renameLayer('edit', '');   // a blank name puts the default back
  await nextTick();
  expect(layer().textContent).toBe('Layer 1');
});

test('picking the vector layer names it', async () => {
  const { project, workspace } = await mount();
  project.addShape(rectShape(0, 0, 4, 4, { fill: '#ff0000' }));
  workspace.pickLayer('vector');
  await nextTick();
  expect(layer().textContent).toBe('Vector 1');
});

test('in French the label is Calque sélectionné', async () => {
  const { workspace } = await mount();
  await setLocale('fr', { persist: false });
  await nextTick();
  expect(layer().getAttribute('aria-label')).toBe('Calque sélectionné : Calque 1');
  workspace.pickLayer('base');
  await nextTick();
  expect(layer().getAttribute('aria-label')).toBe('Calque sélectionné : Base');
  await setLocale('en', { persist: false });
});

test('with Shift held, Dodge (no Alt pick of its own) says Shift draws a straight line, as the Brush does', async () => {
  const { workspace } = await mount();
  workspace.setActiveTool('dodge');
  workspace.isShiftPressed = true;
  await nextTick();
  expect(host.querySelector('footer').textContent).toContain(i18n.global.t('status.straightLine'));
});

test('the buttons go zoom, Overwrite or Insert, Canvas or DOM, then Smooth', async () => {
  const { workspace } = await mount();
  workspace.setActiveTool('text');
  workspace.setAnsiZoom(0.5);
  await nextTick();
  expect([...host.querySelectorAll('.strip button')].map((b) => b.textContent.trim())).toEqual(['50%', 'Overwrite', 'DOM', 'Smooth']);
});

test('a long layer name is cut short with an ellipsis, the whole name its title', async () => {
  const { project, workspace } = await mount();
  const name = 'The layer of the cells I am fixing today';
  project.renameLayer('edit', name);
  workspace.pickLayer('edit');
  await nextTick();
  expect(layer().title).toBe(name);
  expect(layer().scrollWidth).toBeGreaterThan(layer().clientWidth);
  expect(getComputedStyle(layer()).textOverflow).toBe('ellipsis');
});

// dex-13: the Zoom tool's hint said only Space pan, so nothing said a click zooms or how to zoom out.
test('the Zoom tool says a click zooms in and Alt-click out; with Alt held, that it zooms out and a drag zooms smoothly', async () => {
  const { workspace } = await mount();
  workspace.setActiveTool('zoom');
  await nextTick();
  const hint = () => host.querySelector('.hint').textContent;
  expect(hint()).toBe(`Click zoom in · ${shortcut('alt')} Click zoom out · Space pan`);
  workspace.isAltPressed = true;
  await nextTick();
  expect(hint()).toBe('Zooming out · drag either way to zoom smoothly');
});

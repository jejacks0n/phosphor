// The status bar under the ANSI and VECTOR views (AnsiStatusBar.vue): it starts with the picked layer's name, so a folded
// side panel or a phone still says which layer you're on.
import { test, expect, afterEach } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n, setLocale } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import { rectShape } from '@/document/shapes.js';
import AnsiStatusBar from '@/components/AnsiStatusBar.vue';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

async function mount() {
  const stores = await createTestApp();
  await stores.project.setBlankCanvas({ cols: 20, rows: 10 });
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
  expect(layer().getAttribute('aria-label')).toBe('Picked layer: Layer 1');
  expect(layer().textContent).toBe('Layer 1');
  workspace.pickLayer('base');
  await nextTick();
  expect(layer().textContent).toBe('Base');
  expect(layer().getAttribute('aria-label')).toBe('Picked layer: Base');

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

test('in French the label is Calque choisi', async () => {
  const { workspace } = await mount();
  await setLocale('fr', { persist: false });
  await nextTick();
  expect(layer().getAttribute('aria-label')).toBe('Calque choisi : Calque 1');
  workspace.pickLayer('base');
  await nextTick();
  expect(layer().getAttribute('aria-label')).toBe('Calque choisi : Base');
  await setLocale('en', { persist: false });
});

test('with Shift held, Dodge (no Alt pick of its own) says Shift draws a straight line, as the Brush does', async () => {
  const { workspace } = await mount();
  workspace.setActiveTool('dodge');
  workspace.isShiftPressed = true;
  await nextTick();
  expect(host.querySelector('footer').textContent).toContain(i18n.global.t('status.straightLine'));
});

// A drawing whose font has no lower half can't show paint (stored as pixels, drawn as ▄): the paint tools turn off.
import { test, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { page } from 'vitest/browser';
import { createApp } from 'vue';
import { createTestApp, settle } from '../support/app.js';
import { i18n } from '@/i18n';
import EditToolbar from '@/components/EditToolbar.vue';
import { getTool } from '@/tools';
import { toastMessage, toastAction, closeToast } from '@/composables/useToast.js';
import { noLowerHalf, cp437Font } from '../support/blockFonts.js';

let mounted = null, host = null;
beforeAll(() => page.viewport(1200, 800));
afterAll(() => page.viewport(414, 896));
afterEach(() => { mounted?.unmount(); host?.remove(); mounted = host = null; closeToast(); });

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
async function drawing(font = noLowerHalf) {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  app.project.setDrawingFont({ ...font, name: 'Slab' });
  await settle(app.project);
  app.workspace.editorTab = 'output';
  return app;
}
async function mount() {
  host = document.createElement('div');
  host.style.width = '1200px';
  document.body.append(host);
  mounted = createApp(EditToolbar).use(i18n);
  mounted.mount(host);
  await frame();
}
const button = (id) => host.querySelector(`[data-tool="${id}"]`);
const choice = (id) => [...host.querySelectorAll('.dropdown-content button.choice')].find((b) => b.querySelector('.slot-name')?.textContent === getTool(id).title);

test('a font with no lower half turns the paint tools off, with the reason', async () => {
  const { project } = await drawing();
  expect(project.paintOff).toContain('no lower half');
  expect(project.paintOff).toContain('Slab');
  await mount();
  // Single-tool buttons and flyout faces: Bucket and Blur are the faces of their slots.
  for (const id of ['pencil', 'brush', 'bucket', 'shapes', 'blur']) {
    expect(button(id).hasAttribute('disabled'), id).toBe(true);
    expect(button(id).getAttribute('title'), id).toContain('no lower half');
  }
  for (const id of ['eraser', 'text', 'flip']) expect(button(id).hasAttribute('disabled'), id).toBe(false);
});

test('a flyout offers its tools off too', async () => {
  await drawing();
  await mount();
  host.querySelector('[data-slot="retouch"] .dropdown-trigger, [data-slot="retouch"] [aria-haspopup]')?.click();
  await frame();
  for (const id of ['blur', 'dodge', 'burn']) expect(choice(id).hasAttribute('disabled'), id).toBe(true);
});

test('a stroke begun with a paint tool already in hand is refused with the toast that sets up the font', async () => {
  const { project, workspace } = await drawing();
  const ctx = { project, workspace, view: 'output', unit: { x: 1, y: 1 } };
  for (const id of ['pencil', 'brush', 'bucket', 'shapes', 'gradient', 'blur', 'dodge', 'burn']) {
    closeToast();
    expect(getTool(id).begin(ctx, { x: 2, y: 2 }), id).toBe(false);
    expect(toastMessage.value, id).toBe('This drawing\u2019s font, Slab, has no lower half block, so it can\u2019t be painted in yet.');
    expect(toastAction.value?.label, id).toBe('Set up its blocks');
  }
  expect(project.editCells.size).toBe(0);
});

test('a picture converts with Best match while the font has no lower half', async () => {
  const { project } = await drawing();
  project.charChoice = 'shape';
  expect(project.processParams.charMode).toBe('best');
});

test('a layer with its own settings converts with Best match too while the font has no lower half', async () => {
  const { project } = await drawing();
  project.setLayerChars('edit', { charChoice: 'random', seed: 'its-own' });
  expect(project.layerParams.get('edit').charMode).toBe('best');
  project.setDrawingFont({ ...cp437Font, name: 'Ok' });
  expect(project.layerParams.get('edit').charMode).toBe('random');
});

test('giving the font a lower half turns paint back on', async () => {
  const { project } = await drawing();
  expect(project.paintOff).not.toBeNull();
  project.setDrawingFont({ ...noLowerHalf, name: 'Slab', blocks: [219, 254, 223, 221, 222, 176, 177, 178] });
  expect(project.paintOff).toBeNull();
  project.setDrawingFont(null);
  expect(project.paintOff).toBeNull();
  project.setDrawingFont({ ...cp437Font, name: 'Ok' });
  expect(project.paintOff).toBeNull();
});

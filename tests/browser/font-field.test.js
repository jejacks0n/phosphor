// The settings Font field: the dropdown and the size choose the font; Manage fonts ▸ opens the palette layer's Fonts
// page, where fonts are loaded, saved and removed.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import FontField from '@/components/FontField.vue';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

async function mount({ drawing = true, tab } = {}) {
  const { project, workspace } = await createTestApp();
  if (drawing) {
    await project.setBlankCanvas({ cols: 10, rows: 10 });
    project.setDrawingFont({ name: 'A', height: 8, bytes: new Uint8Array(2048).fill(1) });
  }
  if (tab) workspace.editorTab = tab;
  host = document.body.appendChild(document.createElement('div'));
  app = createApp({ render: () => h(FontField) }).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  return { project, workspace };
}
const labels = () => [...host.querySelectorAll('button')].map((b) => b.textContent.trim());
const manage = () => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Manage fonts ▸');

test('the Font field chooses; Manage fonts opens the Fonts page', async () => {
  const { workspace } = await mount({ tab: 'input' });
  expect(host.querySelector('select')).toBeTruthy();
  expect(host.querySelector('input[type="file"]')).toBeNull();
  for (const gone of ['Load font', 'Save .F08', 'Save PNG', 'Remove']) expect(labels()).not.toContain(gone);
  expect(manage().hasAttribute('data-palette-toggle')).toBe(true); // a click while it's open doesn't close it first
  manage().click();
  expect(workspace.paletteLayerPage).toBe('fonts');
  expect(workspace.paletteLayerOpen).toBe(true);
  expect(workspace.editorTab).toBe('input'); // the art was showing: it stays where it was
});

test('Manage fonts from SAUCE shows the art first', async () => {
  const { workspace } = await mount({ tab: 'sauce' });
  manage().click();
  expect(workspace.editorTab).toBe('output');
  expect(workspace.paletteLayerOpen).toBe(true);
});

test('Manage fonts waits for a drawing', async () => {
  const { workspace } = await mount({ drawing: false });
  expect(manage().disabled).toBe(true);
  expect(manage().title).toBe('Open or start a drawing to manage fonts');
  manage().click();
  expect(workspace.paletteLayerOpen).toBe(false);
});

test('a font that can\'t be chosen says why, and the dropdown goes back to the font in use', async () => {
  const { project, workspace } = await mount({ drawing: false });
  workspace.userFonts = [{ id: 'gone', name: 'Gone', kind: 'bitmap', height: 16 }]; // listed, but not kept in this browser
  await nextTick();
  const select = host.querySelector('select');
  select.value = 'gone';
  select.dispatchEvent(new Event('change'));
  await expect.poll(() => host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  expect(select.value).toBe('jetbrains');
  expect(project.drawingFont).toBeNull();
  // The next choice clears it.
  select.value = 'vga';
  select.dispatchEvent(new Event('change'));
  await expect.poll(() => host.querySelector('[role="alert"]')).toBeNull();
});

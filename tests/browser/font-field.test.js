// The settings Font field: the dropdown and the size choose the font; Manage fonts opens the palette layer's Fonts
// page, where fonts are loaded, saved and removed.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import { fontId } from '@/lib/BitmapFont';
import FontField from '@/components/FontField.vue';

// A stand-in linked font: the one whose bytes are all 1s, which the other tests' drawing font uses too.
const stub = new Uint8Array(2048).fill(7);
vi.mock('@/lib/linkedFonts', () => ({
  linkedFontOf: (id) => (id === globalThis.__linkedId ? { credit: 'FROGBLOCK font by Polyducks' } : null),
}));
// The font store's reads the field makes (the real ones), kept so a test can wait for them. Each test file has its own
// IndexedDB, but the files share one browser and one machine: with the others running, a read of an empty store can
// take seconds. So a test waits for the read itself, not for a deadline.
const reads = vi.hoisted(() => []);
vi.mock('@/lib/userFonts', async (original) => {
  const real = await original();
  return { ...real, storedBitmapFont: (id) => reads[reads.push(real.storedBitmapFont(id)) - 1] };
});

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
const manage = () => host.querySelector('button[aria-label="Manage fonts"]'); // it reads Manage

test('the Font field chooses; Manage fonts opens the Fonts page', async () => {
  const { workspace } = await mount({ tab: 'input' });
  expect(host.querySelector('select')).toBeTruthy();
  expect(host.querySelector('input[type="file"]')).toBeNull();
  for (const gone of ['Load font', 'Remove']) expect(labels()).not.toContain(gone);
  expect(manage().hasAttribute('data-palette-toggle')).toBe(true); // a click while it's open doesn't close it first
  workspace.settingsOpen = true; // a phone's settings drawer, where the field is
  manage().click();
  expect(workspace.settingsOpen).toBe(false); // shut, so the Fonts page shows whole
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

test('Manage fonts works before a drawing, on the start screen', async () => {
  const { workspace } = await mount({ drawing: false });
  const was = workspace.editorTab;
  expect(manage().disabled).toBe(false);
  manage().click();
  expect(workspace.paletteLayerOpen).toBe(true);
  expect(workspace.paletteLayerPage).toBe('fonts');
  expect(workspace.editorTab).toBe(was); // no art to show
});

test('a font that can\'t be chosen says why, and the dropdown goes back to the font in use', async () => {
  const { project, workspace } = await mount({ drawing: false });
  workspace.userFonts = [{ id: 'gone', name: 'Gone', kind: 'bitmap', height: 16 }]; // listed, but not kept in this browser
  await nextTick();
  const select = host.querySelector('select');
  select.value = 'gone';
  const asked = reads.length;
  select.dispatchEvent(new Event('change'));
  expect(reads).toHaveLength(asked + 1); // the field asked the store
  await Promise.allSettled(reads);
  await expect.poll(() => host.querySelector('[role="alert"]')?.textContent).toBe('That font isn\'t in this browser anymore. Load it again.');
  expect(select.value).toBe('jetbrains');
  expect(project.drawingFont).toBeNull();
  // The next choice clears it.
  select.value = 'vga';
  select.dispatchEvent(new Event('change'));
  await expect.poll(() => host.querySelector('[role="alert"]')).toBeNull();
});

test('a font chosen before a drawing is listed as the next drawing\'s', async () => {
  const { project } = await mount({ drawing: false });
  project.setDrawingFont({ name: 'A', height: 8, bytes: new Uint8Array(2048).fill(1) });
  await nextTick();
  expect([...host.querySelectorAll('optgroup')].map((g) => g.label)).toContain('Next drawing');
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  await nextTick();
  expect([...host.querySelectorAll('optgroup')].map((g) => g.label)).toContain('This drawing');
});

test('a linked font\'s credit shows under the Font field, and any other font shows none', async () => {
  const { project } = await mount();
  expect(host.querySelector('p.credit')).toBeNull();
  globalThis.__linkedId = fontId({ name: 'A', height: 8, bytes: stub });
  project.setDrawingFont({ name: 'A', height: 8, bytes: stub });
  await nextTick();
  expect(host.querySelector('p.credit').textContent).toBe('FROGBLOCK font by Polyducks');
  project.setDrawingFont({ name: 'A', height: 8, bytes: new Uint8Array(2048).fill(1) });
  await nextTick();
  expect(host.querySelector('p.credit')).toBeNull();
  globalThis.__linkedId = undefined;
});

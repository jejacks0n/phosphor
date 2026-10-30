import { test, expect } from './support.js';
import { openApp, store, settled, editAt, saveAs, imageInput } from './support.js';

test('save a project and load it back through the file input', async ({ page }) => {
  await openApp(page);
  await editAt(page, 3, 3);
  await page.keyboard.insertText('saved 漢');
  await settled(page);
  const before = await store(page, 'project', (p) => JSON.stringify(p.cells.map((c) => c.char + c.fg.hex + c.bg.hex)));

  const download = await saveAs(page, 'Save Project (.phosphor)');
  expect(download.suggestedFilename()).toMatch(/^gradient-\d{8}-\d{6}\.phosphor$/);
  const path = await download.path();

  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Start New Project' }).click();
  await expect(imageInput(page)).toBeAttached();
  expect(await store(page, 'project', (p) => p.image)).toBe(null);
  await imageInput(page).setInputFiles({ name: 'gradient.phosphor', mimeType: 'application/octet-stream', buffer: await (await import('node:fs/promises')).readFile(path) });
  await settled(page);
  expect(await store(page, 'project', (p) => JSON.stringify(p.cells.map((c) => c.char + c.fg.hex + c.bg.hex)))).toBe(before);
});

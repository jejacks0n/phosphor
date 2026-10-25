// Opening files over open work, upper-case project names, and two tabs open at once.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openApp, store, settled, editAt, fixture, imageInput } from './support.js';

// Drop a file on the workspace, as dragging one from the desktop does.
async function dropFile(page, path, name) {
  const bytes = [...await readFile(path)];
  await page.evaluate(([bytes, name]) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], name));
    const target = document.querySelector('article.drop-zone');
    for (const type of ['dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, [bytes, name]);
}

test('dropping a .phosphor over unsaved work asks first', async ({ page }) => {
  await openApp(page);
  await editAt(page, 3, 3);
  await page.keyboard.insertText('my work');
  await page.waitForTimeout(1300); // the typing run commits
  expect(await store(page, 'project', (p) => p.isDirty)).toBe(true);

  const asked = [];
  page.on('dialog', (d) => { asked.push(d.message()); d.dismiss(); });
  await dropFile(page, fixture('projects/live-main.phosphor'), 'live-main.phosphor');
  await page.waitForTimeout(1500);
  expect(asked.length).toBe(1);
  expect(await store(page, 'project', (p) => p.filename)).toBe('gradient'); // the work is still open
});

test('two tabs: changing a setting in one leaves the other tab\'s document alone', async ({ context }) => {
  const a = await context.newPage(), b = await context.newPage();
  await openApp(a);
  await openApp(b, 'images/gradient.png');
  const before = await store(b, 'project', (p) => ({ cols: p.cols, brightness: p.brightness, title: p.sauceTitle }));
  await store(a, 'project', (p) => { p.brightness = 250; p.cols = 30; p.sauceTitle = 'tab A'; });
  await a.waitForTimeout(500);
  expect(await store(b, 'project', (p) => ({ cols: p.cols, brightness: p.brightness, title: p.sauceTitle }))).toEqual(before);
});

test('a project named ART.PHOSPHOR (upper-case extension) opens', async ({ page }) => {
  await page.goto('/');
  const alerts = [];
  page.on('dialog', (d) => { alerts.push(d.message()); d.accept(); });
  await imageInput(page).setInputFiles({ name: 'ART.PHOSPHOR', mimeType: 'application/octet-stream', buffer: await readFile(fixture('projects/live-main.phosphor')) });
  await page.waitForTimeout(1500);
  expect(alerts).toEqual([]);
  await settled(page);
});

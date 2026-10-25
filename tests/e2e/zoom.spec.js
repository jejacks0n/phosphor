// Ctrl+wheel (and a trackpad pinch, which arrives as one) zooms the PIXEL view around the pointer.
import { test, expect } from '@playwright/test';
import { openApp, store, tab, settled } from './support.js';

const zoom = (page) => store(page, 'workspace', (w) => w.editZoom);

async function pixelView(page) {
  await openApp(page);
  await tab(page, 'PIXEL').click();
  await settled(page);
  return page.locator('article canvas').first();
}

async function ctrlWheel(page, deltaY) {
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, deltaY);
  await page.keyboard.up('Control');
}

test('Ctrl+wheel: a notch out undoes a notch in', async ({ page }) => {
  const box = await (await pixelView(page)).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  expect(await zoom(page)).toBe(5);
  await ctrlWheel(page, -100); // one mouse-wheel notch away from you: in
  const zoomedIn = await zoom(page);
  expect(zoomedIn).toBeGreaterThan(5);
  await ctrlWheel(page, 100);
  expect(await zoom(page)).toBeCloseTo(5, 6);
  await ctrlWheel(page, 100);
  expect(await zoom(page)).toBeCloseTo(25 / zoomedIn, 6); // out by as much again, not down to 1x
});

test('Ctrl+wheel zoom keeps the grid point under the pointer', async ({ page }) => {
  const canvas = await pixelView(page);
  const box = await canvas.boundingBox();
  const at = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.3 };
  await page.mouse.move(at.x, at.y);
  const gridAt = async () => {
    const b = await canvas.boundingBox();
    const z = await zoom(page);
    return { x: (at.x - b.x) / z, y: (at.y - b.y) / z };
  };
  const before = await gridAt();
  await page.keyboard.down('Control');
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -10);
  await page.keyboard.up('Control');
  await page.waitForTimeout(200);
  const after = await gridAt();
  expect(await zoom(page)).toBeGreaterThan(5);
  expect(Math.abs(after.x - before.x)).toBeLessThan(0.5);
  expect(Math.abs(after.y - before.y)).toBeLessThan(0.5);
});

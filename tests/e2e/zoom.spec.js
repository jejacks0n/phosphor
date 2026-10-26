// Ctrl+wheel (and a trackpad pinch, which arrives as one) zooms the PIXEL view around the pointer.
import { test, expect } from '@playwright/test';
import { openApp, store, tab, settled } from './support.js';

const zoom = (page) => store(page, 'workspace', (w) => w.editZoom);

async function pixelView(page) {
  await openApp(page);
  await tab(page, 'PIXEL').click();
  await settled(page);
  return page.locator('article .display').first();
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

test('at a fractional zoom the PIXEL view fills its canvas to the last pixel, with no see-through sliver at the grid\'s edge', async ({ page }) => {
  const canvas = await pixelView(page);
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const { cols, rows } = await store(page, 'project', (p) => ({ cols: p.cols, rows: p.rows }));
  // Zoom in a notch at a time until the grid isn't a whole number of pixels either way.
  for (let i = 0; i < 10; i++) {
    const z = await zoom(page);
    if ((cols * z) % 1 > 0.1 && (rows * z) % 1 > 0.1) break;
    await ctrlWheel(page, -100);
  }
  const z = await zoom(page);
  expect((cols * z) % 1).toBeGreaterThan(0.1);
  // The whole grid is in view, so the canvas's last column and row are the grid's edge.
  const edgeAlphas = () => page.locator('article .display canvas').evaluate((c) => {
    const ctx = c.getContext('2d');
    const column = ctx.getImageData(c.width - 1, 0, 1, c.height).data, row = ctx.getImageData(0, c.height - 1, c.width, 1).data;
    return Math.min(...[...column, ...row].filter((_, i) => i % 4 === 3));
  });
  await expect.poll(edgeAlphas).toBe(255);
});

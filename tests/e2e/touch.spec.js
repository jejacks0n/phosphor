// Touch: one finger draws with the active tool, after a short delay so a pinch can begin first; two
// fingers pinch-zoom and leave no mark.
import { test, expect } from '@playwright/test';
import { openApp, store, cellPoint, tab, settled } from './support.js';

test.use({ hasTouch: true });

// Touch points through the DevTools protocol (the touchscreen API only taps). Each call is sent at
// once, without waiting for the one before, so a pinch's second finger lands as quickly as a real one.
async function fingers(page) {
  const cdp = await page.context().newCDPSession(page);
  return (type, ...points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(({ x, y }, id) => ({ x, y, id })) });
}

const nudge = ({ x, y }, d) => ({ x: x + d, y: y + d });

test('a quick tap with the Pencil leaves a dot', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Pencil (1px)' }).click();
  const at = await cellPoint(page, 4, 4);
  await page.touchscreen.tap(at.x, at.y);
  await expect.poll(() => store(page, 'project', (p) => p.cellHasPaint(4, 4))).toBe(true);
});

test('a pinch with Shapes draws nothing', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Shapes' }).click();
  const a = await cellPoint(page, 6, 6), b = await cellPoint(page, 20, 10);
  const touch = await fingers(page);
  await Promise.all([touch('touchStart', a), touch('touchStart', a, b)]);
  await touch('touchMove', nudge(a, -20), nudge(b, 20));
  await touch('touchEnd');
  await page.waitForTimeout(300); // past the paint delay
  expect(await store(page, 'project', (p) => p.hasEdits)).toBe(false);
});

test('a second finger cancels a Shapes drag already under way', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Shapes' }).click();
  const a = await cellPoint(page, 6, 6), b = await cellPoint(page, 20, 10);
  const touch = await fingers(page);
  await touch('touchStart', a);
  await touch('touchMove', nudge(a, 30)); // far enough to start the drag at once
  expect(await store(page, 'workspace', (w) => !!w.shapeDrag)).toBe(true);
  await touch('touchStart', nudge(a, 30), b);
  await touch('touchMove', nudge(a, 10), nudge(b, 20));
  await touch('touchEnd');
  expect(await store(page, 'workspace', (w) => w.shapeDrag)).toBe(null);
  expect(await store(page, 'project', (p) => p.hasEdits)).toBe(false);
});

test('a second finger takes back a Pencil stroke already under way', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Pencil (1px)' }).click();
  const a = await cellPoint(page, 6, 6), b = await cellPoint(page, 20, 10);
  const touch = await fingers(page);
  await touch('touchStart', a);
  await touch('touchMove', nudge(a, 30)); // far enough to start the stroke at once
  await expect.poll(() => store(page, 'project', (p) => p.hasEdits)).toBe(true);
  await touch('touchStart', nudge(a, 30), b);
  await touch('touchMove', nudge(a, 10), nudge(b, 20));
  await touch('touchEnd');
  expect(await store(page, 'project', (p) => ({ edits: p.hasEdits, undo: p.canUndo }))).toEqual({ edits: false, undo: false });
});

test('PIXEL view: a pinch-zoom with the Paint Bucket zooms and fills nothing', async ({ page }) => {
  await openApp(page);
  await tab(page, 'PIXEL').click();
  await settled(page);
  await page.getByRole('button', { name: 'Paint Bucket (fill)' }).click();
  const box = await page.locator('article canvas').first().boundingBox();
  const a = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.4 }, b = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.6 };
  const touch = await fingers(page);
  await Promise.all([touch('touchStart', a), touch('touchStart', a, b)]);
  await touch('touchMove', nudge(a, -30), nudge(b, 30));
  await touch('touchEnd');
  await page.waitForTimeout(300); // past the paint delay
  expect(await store(page, 'workspace', (w) => w.editZoom)).toBeGreaterThan(5);
  expect(await store(page, 'project', (p) => p.hasEdits)).toBe(false);
});

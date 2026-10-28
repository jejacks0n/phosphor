// The ANSI view zooms out, down to 25% of its cell size: Ctrl+wheel (a trackpad pinch arrives as
// one), a pinch, or the Zoom tool's drag. Everything that maps the pointer to a cell follows the zoom.
// tests/fixtures/images/tall.png opens at 80 x 2400 (1200 lines): the view scrolls down it.
import { test, expect } from './support.js';
import { openApp, store, tab, settled, cellPoint, drag } from './support.js';

const scroller = (page) => page.locator('.ansi-editor > article');
const display = (page) => page.locator('.ansi-editor .display');
const zoom = (page) => store(page, 'workspace', (w) => w.ansiZoom);
const viewSize = (page) => store(page, 'workspace', (w) => w.ansiViewSize);
const frames = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const HALF = 100 * Math.log(2); // a Ctrl+wheel this far out halves the zoom

async function ctrlWheel(page, deltaY) {
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, deltaY);
  await page.keyboard.up('Control');
}

// The line (fractional) under a page point, measured inside the display's border.
async function lineAt(page, y) {
  const box = await display(page).boundingBox();
  const inner = await display(page).evaluate((el) => ({ top: el.clientTop, height: el.clientHeight }));
  const lines = await store(page, 'project', (p) => Math.ceil(p.rows / 2));
  return (y - box.y - inner.top) / (inner.height / lines);
}

// The line at the middle of the view.
async function middleLine(page) {
  const view = await scroller(page).boundingBox();
  return lineAt(page, view.y + view.height / 2);
}

// A cell's top-left on the page, measured from inside the display's border.
async function cellCorner(page, col, row) {
  const box = await display(page).boundingBox();
  const inner = await display(page).evaluate((el) => ({ left: el.clientLeft, top: el.clientTop, width: el.clientWidth, height: el.clientHeight }));
  const { cols, rows } = await store(page, 'project', (p) => ({ cols: p.cols, rows: Math.ceil(p.rows / 2) }));
  return { x: box.x + inner.left + col * (inner.width / cols), y: box.y + inner.top + row * (inner.height / rows) };
}

async function expectAt(page, selector, col, row) {
  const box = await page.locator(`.ansi-editor ${selector}`).boundingBox();
  const corner = await cellCorner(page, col, row);
  expect(Math.abs(box.x - corner.x)).toBeLessThan(0.5);
  expect(Math.abs(box.y - corner.y)).toBeLessThan(0.5);
}

// Zoomed out to 50% with the pointer on the art in the view, and the view settled.
async function halfZoom(page) {
  const view = await scroller(page).boundingBox();
  await page.mouse.move((await cellPoint(page, 10, 0)).x, view.y + view.height / 3);
  await ctrlWheel(page, HALF);
  expect(await zoom(page)).toBeCloseTo(0.5, 6);
  await frames(page);
}

test('Ctrl+wheel out shrinks the cells, keeps the cell under the pointer, and stops at 25%; in stops at 100%', async ({ page }) => {
  await openApp(page, 'images/tall.png');
  await scroller(page).evaluate((el) => { el.scrollTop = el.scrollHeight / 2; });
  const view = await scroller(page).boundingBox();
  const at = { x: (await cellPoint(page, 5, 0)).x, y: view.y + view.height * 0.3 };
  await page.mouse.move(at.x, at.y);
  await frames(page);
  const before = await lineAt(page, at.y);
  // The cell's height: the view's against how many whole cells it shows (the cells are whole device
  // pixels, so a zoom's cell is rounded).
  const viewHeight = await scroller(page).evaluate((el) => el.clientHeight);
  const cellHeight = async () => viewHeight / (await viewSize(page)).rows;
  const full = await cellHeight();

  await ctrlWheel(page, HALF);
  expect(await zoom(page)).toBeCloseTo(0.5, 6);
  await expect.poll(async () => await cellHeight() / full).toBeLessThan(0.56);
  expect(await cellHeight() / full).toBeGreaterThan(0.45);
  await expect.poll(async () => Math.abs(await lineAt(page, at.y) - before)).toBeLessThan(0.5);

  for (let i = 0; i < 5; i++) await ctrlWheel(page, 100);
  expect(await zoom(page)).toBe(0.25);
  await expect.poll(async () => await cellHeight() / full).toBeLessThan(0.33);
  expect(await cellHeight() / full).toBeGreaterThan(0.22);
  await expect.poll(async () => Math.abs(await lineAt(page, at.y) - before)).toBeLessThan(0.5);

  for (let i = 0; i < 5; i++) await ctrlWheel(page, -100);
  expect(await zoom(page)).toBe(1);
  await frames(page);
  const top = await scroller(page).evaluate((el) => el.scrollTop), size = await display(page).boundingBox();
  await ctrlWheel(page, -100); // at 100%, in changes nothing
  await frames(page);
  expect(await zoom(page)).toBe(1);
  expect(await scroller(page).evaluate((el) => el.scrollTop)).toBe(top);
  expect(await display(page).boundingBox()).toEqual(size);
});

for (const renderer of ['canvas', 'DOM']) {
  test(`at 50%, Paint, Select and the cell highlight land on the cell under the pointer (${renderer} view)`, async ({ page }) => {
    await openApp(page);
    if (renderer === 'DOM') {
      await page.getByRole('button', { name: 'DOM', exact: true }).click();
      await expect(page.locator('.ansi-editor pre.display')).toBeVisible();
    }
    const height = () => display(page).evaluate((el) => el.clientHeight); // the cells' height, all the lines
    await expect.poll(height).toBeGreaterThan(100); // the DOM view rendered
    const full = await height();
    await halfZoom(page);
    await expect.poll(async () => await height() / full).toBeLessThan(0.56);
    expect(await height() / full).toBeGreaterThan(0.45);

    await page.getByRole('button', { name: 'Edit Mode' }).click();
    const at = await cellPoint(page, 5, 5);
    await page.mouse.move(at.x, at.y);
    await expectAt(page, '.tool-preview', 5, 5);
    await page.mouse.click(at.x, at.y);
    await expectAt(page, '.text-cursor', 5, 5);
    await page.keyboard.press('Escape');

    const row = (r) => store(page, 'project', `(p) => p.cells.slice(${r} * p.cols, ${r} * p.cols + 20).map((c) => c.fg.hex + c.bg.hex)`);
    const before = await row(7);
    await page.getByRole('button', { name: 'Pencil (1px)' }).click();
    const paintAt = await cellPoint(page, 4, 7, 0);
    await page.mouse.click(paintAt.x, paintAt.y);
    const changed = (await row(7)).map((v, i) => v !== before[i]);
    expect(changed.flatMap((c, i) => (c ? [i] : []))).toEqual([4]);

    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await drag(page, await cellPoint(page, 3, 3), await cellPoint(page, 8, 6));
    expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 3, r0: 3, c1: 8, r1: 6 });
    await expectAt(page, '.marquee', 3, 3);
  });
}

test('a font-size change at 50% keeps the place and stays at 50%', async ({ page }) => {
  await openApp(page, 'images/tall.png');
  await halfZoom(page);
  await scroller(page).evaluate((el) => { el.scrollTop = el.scrollHeight / 2; });
  await frames(page);
  const line = await middleLine(page), box = await display(page).boundingBox();
  const size = page.getByLabel('Font size');
  await size.fill('32');
  await size.press('Enter');
  await expect.poll(async () => (await display(page).boundingBox()).height).toBeGreaterThan(1.5 * box.height); // about 32 / 17 as tall
  expect(await zoom(page)).toBeCloseTo(0.5, 6);
  await expect.poll(async () => Math.abs(await middleLine(page) - line)).toBeLessThan(1);
});

test('the status bar shows 50%, and pressing it goes back to 100%', async ({ page }) => {
  await openApp(page, 'images/tall.png');
  await expect(page.getByRole('button', { name: /^\d+%$/ })).toHaveCount(0); // at 100%, nothing to go back from
  await halfZoom(page);
  await scroller(page).evaluate((el) => { el.scrollTop = el.scrollHeight / 2; });
  await frames(page);
  const line = await middleLine(page);
  await page.getByRole('button', { name: '50%', exact: true }).click();
  expect(await zoom(page)).toBe(1);
  await expect(page.getByRole('button', { name: /^\d+%$/ })).toHaveCount(0);
  await expect.poll(async () => Math.abs(await middleLine(page) - line)).toBeLessThan(1); // the view keeps its middle
});

test('the zoom and the place survive going to PIXEL and back', async ({ page }) => {
  await openApp(page, 'images/tall.png');
  await halfZoom(page);
  await scroller(page).evaluate((el) => { el.scrollTop = 3000; });
  await frames(page);
  const origin = await store(page, 'workspace', (w) => w.ansiViewOrigin);
  expect(origin.row).toBeGreaterThan(0);

  await tab(page, 'PIXEL').click();
  await settled(page);
  await tab(page, 'ANSI').click();
  await settled(page);
  expect(await zoom(page)).toBeCloseTo(0.5, 6);
  await expect.poll(() => scroller(page).evaluate((el) => el.scrollTop)).toBe(3000);
  await expect.poll(() => store(page, 'workspace', (w) => w.ansiViewOrigin)).toEqual(origin);
});

test('Z picks Zoom on the ANSI view; a drag zooms', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('z');
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('zoom');
  const from = await cellPoint(page, 30, 5);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - 50, from.y, { steps: 5 }); // left: out, a hundredth a pixel
  await page.mouse.up();
  expect(await zoom(page)).toBeCloseTo(0.5, 1);
});

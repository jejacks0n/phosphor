// Dragging a selected block (or a new selection) to the edge of the ANSI view scrolls it, faster the
// further in or past the edge, and the block keeps moving with the content under the pointer.
import { test, expect } from './support.js';
import { openApp, store, cellPoint, drag } from './support.js';

const scroller = (page) => page.locator('.ansi-editor > article');
const scrollTop = (page) => scroller(page).evaluate((el) => el.scrollTop);

test('a block dragged to the bottom edge scrolls the view and keeps moving; the move is one undo step', async ({ page }) => {
  await openApp(page, 'images/tall.png'); // a narrow, tall grid: the view scrolls
  await scroller(page).evaluate((el) => { el.scrollTop = 0; });
  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 2, 2), await cellPoint(page, 4, 3));
  const from = await cellPoint(page, 3, 2), view = await scroller(page).boundingBox();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, view.y + view.height - 4, { steps: 8 });
  await page.waitForTimeout(600);
  expect(await scrollTop(page)).toBeGreaterThan(0);
  const below = await store(page, 'workspace', (w) => w.selection.r0);
  await expect.poll(() => store(page, 'workspace', (w) => w.selection.r0)).toBeGreaterThan(below); // still going, with the pointer still
  await page.mouse.up();
  const scrolled = await scrollTop(page);
  await page.waitForTimeout(200);
  expect(await scrollTop(page)).toBe(scrolled); // letting go stops it
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 2, r0: 2, c1: 4, r1: 3 });
});

// A drag's first step covers one 60 Hz frame, near the edge or far past it, so the two compare however
// slowly the frames come (on CI's software WebGL a scroll's frame can take longer than the whole drag).
// That later steps cover the time since the last is edge-scroll.test.js's.
test('further past the edge scrolls faster', async ({ page }) => {
  await openApp(page, 'images/tall.png');
  await page.keyboard.press('m');
  const view = await scroller(page).boundingBox();
  const at = await cellPoint(page, 3, 5);
  await scroller(page).evaluate((el) => { window.scrolls = []; el.addEventListener('scroll', () => window.scrolls.push(el.scrollTop)); });
  const firstStep = async (y) => {
    await scroller(page).evaluate((el) => { el.scrollTop = el.scrollHeight / 2; });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => { window.scrolls = []; done(); }))); // its scroll event, gone by
    const start = await scrollTop(page);
    await page.mouse.move(at.x, view.y + view.height / 2);
    await page.mouse.down(); // a new selection, dragged up to the top edge
    await page.mouse.move(at.x, y, { steps: 4 });
    await expect.poll(() => page.evaluate(() => window.scrolls.length)).toBeGreaterThan(0);
    await page.mouse.up();
    return start - await page.evaluate(() => window.scrolls[0]);
  };
  const near = await firstStep(view.y + 20), far = await firstStep(view.y - 60);
  expect(near).toBeGreaterThan(0);
  expect(far).toBeGreaterThan(near * 3);
});

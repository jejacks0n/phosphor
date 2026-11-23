// On a phone the settings drawer and the side panel (LAYERS, SOCIAL) open over the art, with a strip of it showing. A
// touch on that strip only shuts the drawer: no tool sees it, so nothing is painted (issue #277).
import { test, expect, openApp, store, cellPoint, drag } from './support.js';

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

// Real touch events, from the browser's input pipeline: a finger down at `from`, dragged to `to` in steps, and up.
async function swipe(page, from, to = from) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= (to === from ? 0 : 8); i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const untouched = (page) => store(page, 'project', (p) => [p.hasEdits, p.canUndo]);

async function pencilOnArt(page) {
  await openApp(page);
  await store(page, 'workspace', (w) => { w.outputActiveTool = 'pencil'; });
  expect(await untouched(page)).toEqual([false, false]);
}

// A drag (or a tap) on the art at screen x, along a row of it; it starts on the art, not on a drawer.
async function dragAt(page, x, { tap = false } = {}) {
  const { y } = await cellPoint(page, 0, 4);
  expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.edit-viewport'), [x, y])).toBe(true);
  await swipe(page, { x, y }, tap ? undefined : { x: x + 30, y: y + 20 });
}

async function openSettings(page) {
  await page.getByTitle('Toggle settings').click();
  await expect(page.locator('section.edit-workspace')).toHaveClass(/settings-open/);
  await page.waitForTimeout(300); // the art slides aside
}

test('a touch on the art with the settings drawer open shuts it and paints nothing; the next one paints', async ({ page }) => {
  await pencilOnArt(page);
  await openSettings(page);
  await dragAt(page, 320);
  await page.waitForTimeout(300); // as long as a held touch waits to start a stroke
  expect(await untouched(page)).toEqual([false, false]);
  expect(await store(page, 'workspace', (w) => w.settingsOpen)).toBe(false);

  await dragAt(page, 120); // the drawer shut, the same touch draws
  await expect.poll(() => untouched(page)).toEqual([true, true]);
});

test('a tap on the art with the settings drawer open shuts it and paints nothing', async ({ page }) => {
  await pencilOnArt(page);
  await openSettings(page);
  await dragAt(page, 320, { tap: true });
  await page.waitForTimeout(300);
  expect(await untouched(page)).toEqual([false, false]);
  expect(await store(page, 'workspace', (w) => w.settingsOpen)).toBe(false);
});

for (const tap of [false, true]) {
  test(`a ${tap ? 'tap' : 'swipe'} on the art beside the side panel shuts it and paints nothing`, async ({ page }) => {
    await pencilOnArt(page);
    await page.getByRole('button', { name: 'Expand panel' }).click();
    await expect(page.locator('.side-panel.overlay')).toBeVisible();
    const panel = await page.locator('.side-panel.overlay').boundingBox();
    expect(panel.x).toBeGreaterThan(20); // a strip of the art shows at the left
    const { y } = await cellPoint(page, 0, 4);
    await swipe(page, { x: 10, y }, tap ? undefined : { x: 10, y: y + 30 });
    await page.waitForTimeout(300);
    expect(await untouched(page)).toEqual([false, false]);
    expect(await store(page, 'workspace', (w) => w.sidePanelOpen)).toBe(false);
  });
}

test.describe('on a wide screen', () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1400, height: 900 } });

  test('the settings sit beside the art, and a stroke with them open paints', async ({ page }) => {
    await pencilOnArt(page);
    await store(page, 'workspace', (w) => { w.settingsOpen = true; });
    await drag(page, await cellPoint(page, 2, 4), await cellPoint(page, 10, 4));
    expect(await untouched(page)).toEqual([true, true]);
  });
});

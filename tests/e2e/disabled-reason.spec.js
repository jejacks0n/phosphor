import { test, expect } from './support.js';

// Phones show no tooltips, so a tap on a button that's off says why in a toast.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const BAKE_NOTHING = 'Nothing to bake: all sliders are at default values and there are no shapes on the image.';

// A blank canvas, the Actions menu open (on a phone Bake lives there): Bake is off with "nothing to bake".
async function openBake(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with a blank canvas' }).click();
  await page.getByRole('button', { name: 'Actions' }).click();
  const bake = page.getByRole('button', { name: 'Bake', exact: true });
  await expect(bake).toBeDisabled();
  const box = await bake.boundingBox();
  return { bake, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Real touch events, from the browser's input pipeline: a finger down at `from`, up at `to`.
async function finger(page, from, to = from) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  if (to !== from) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('a tap on a disabled button shows why it is off', async ({ page }) => {
  const { bake } = await openBake(page);
  await bake.tap({ force: true }); // a disabled button fails Playwright's actionability wait
  await expect(page.locator('.app-toast')).toHaveText(BAKE_NOTHING);
});

test('a swipe that starts over a disabled button shows no toast', async ({ page }) => {
  const { x, y } = await openBake(page);
  await finger(page, { x, y }, { x, y: y + 60 });
  await page.waitForTimeout(300);
  await expect(page.locator('.app-toast')).toHaveCount(0);
});

test('a tap on something laid over a disabled button shows no toast', async ({ page }) => {
  const { bake, x, y } = await openBake(page);
  await bake.evaluate((el) => { // laid inside the Actions menu: it is in the top layer, nothing outside goes over it
    const over = document.createElement('button');
    over.style.cssText = `position:absolute;z-index:99999;inset:0;width:auto;height:auto`; // all of the menu
    el.parentElement.append(over);
  });
  await finger(page, { x, y });
  await page.waitForTimeout(300);
  await expect(page.locator('.app-toast')).toHaveCount(0);
});

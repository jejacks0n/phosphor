import { test, expect, openApp, store } from './support.js';

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

test('a tap on a child of a disabled button, such as its icon, shows why it is off', async ({ page }) => {
  const { bake, x, y } = await openBake(page);
  await bake.evaluate((el) => { // a child that takes the touch, like an icon or a label
    const child = document.createElement('span');
    child.style.cssText = 'position:absolute;inset:0;pointer-events:auto';
    el.style.position = 'relative';
    el.append(child);
  });
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y).tagName, [x, y])).toBe('SPAN');
  await finger(page, { x, y });
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

// On a wide screen that also takes touch: a drawing whose font has no lower half (an 8×16 font of zero bytes has no
// blocks at all), loaded with the Fonts page's + Load.
// The hash of what autosave kept of this document's settings (its font among them), or null before it's written.
async function keptHash(page) {
  const id = await store(page, 'project', (p) => p.documentId);
  return page.evaluate((id) => new Promise((resolve, reject) => {
    const open = indexedDB.open('phosphor-autosave', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const get = open.result.transaction('documents').objectStore('documents').get(id);
      get.onsuccess = () => { open.result.close(); resolve(get.result?.restHash ?? null); };
    };
  }), id);
}

test.describe('a paint tool that\u2019s off', () => {
  test.use({ isMobile: false, viewport: { width: 1280, height: 800 } });

  test('a mouse click or a tap on it brings back the toast that sets up the font, and its button opens the font\u2019s blocks', async ({ page }) => {
    await openApp(page);
    const before = await keptHash(page);
    await page.getByRole('button', { name: 'Manage fonts ▸' }).click();
    const layer = page.locator('.palette-layer');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), layer.getByRole('button', { name: '+ Load' }).click()]);
    await chooser.setFiles({ name: 'Slab.F16', mimeType: 'application/octet-stream', buffer: Buffer.alloc(4096) });
    const toast = page.locator('.app-toast');
    await expect(toast).toContainText('This drawing\u2019s font, Slab, has no lower half block');
    await page.keyboard.press('Escape');
    await expect(layer).toHaveCount(0);
    await expect.poll(() => keptHash(page)).not.toBe(before); // written with its font
    await page.reload(); // and again once the drawing comes back
    await expect(toast).toContainText('This drawing\u2019s font, Slab, has no lower half block');
    await toast.click(); // closed
    await expect(toast).toHaveCount(0);
    const brush = page.locator('button[data-tool="brush"]');
    await expect(brush).toBeDisabled();
    await brush.click({ force: true }); // a disabled button fails Playwright's actionability wait
    await expect(toast).toContainText('has no lower half block');
    await expect(toast.getByRole('button', { name: 'Set up its blocks' })).toBeVisible();
    await toast.click();
    await expect(toast).toHaveCount(0);
    await brush.tap({ force: true });
    await expect(toast).toContainText('has no lower half block, so it can\u2019t be painted in yet'); // not the button's title
    await toast.getByRole('button', { name: 'Set up its blocks' }).click();
    await expect(toast).toHaveCount(0);
    await expect(layer.locator('.blocks button.tile', { hasText: 'Lower' })).toHaveAttribute('aria-pressed', 'true');
  });
});

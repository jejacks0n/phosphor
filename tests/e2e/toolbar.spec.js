// The toolbar's tools, in order, with a divider ('|') between groups: drawing, selecting, moving
// around, then the cell tools (ANSI view only).
import { test, expect, openApp, tab, settled } from './support.js';
import { fakeRoom, goLive } from './social-support.js';

const row = (page) => page.locator('.tool-group > *').evaluateAll((els) => els.map((el) => el.dataset.tool ?? '|'));

test('the Magic Wand and Select sit together, between the picker and the Hand, in both views', async ({ page }) => {
  await openApp(page);
  expect(await row(page)).toEqual(['pencil', 'brush', 'eraser', 'bucket', 'shapes', 'picker', '|', 'wand', 'select', '|', 'hand', 'zoom', '|', 'text', 'flip']);
  await tab(page, 'PIXEL').click();
  await settled(page);
  expect(await row(page)).toEqual(['pencil', 'brush', 'eraser', 'bucket', 'shapes', 'picker', '|', 'wand', 'select', '|', 'hand', 'zoom']);
});

// The overlay controls fold into their dropdown, and the Actions into theirs, when the toolbar is narrow,
// whatever narrows it: a narrow window, or the chat column beside the editor.
test('the toolbar folds by its own width, so the chat column folds it sooner', async ({ page }) => {
  const overlay = () => page.getByRole('slider', { name: 'ANSI Overlay' });
  const folded = () => page.locator('.overlay-menu');
  const actions = () => page.getByTitle('Actions');
  await page.setViewportSize({ width: 1328, height: 900 });
  await openApp(page);
  await tab(page, 'PIXEL').click();
  await expect(overlay()).toBeVisible();   // the toolbar is wide: everything's out
  await expect(folded()).toHaveCount(0);
  await expect(actions()).toBeHidden();
  await page.setViewportSize({ width: 1290, height: 900 });   // a toolbar of 1020px: the overlay folds
  await expect(folded()).toBeVisible();
  await page.setViewportSize({ width: 1328, height: 900 });
  await expect(overlay()).toBeVisible();

  await goLive(page, fakeRoom());   // hosting: the chat column takes 280px from the editor
  await expect(page.locator('aside.chat')).toBeVisible();
  await tab(page, 'PIXEL').click();
  await expect(folded()).toBeVisible();
  await expect(overlay()).toHaveCount(0);
  await expect(actions()).toBeHidden();   // still room for these

  await page.setViewportSize({ width: 1180, height: 900 });
  await expect(actions()).toBeVisible();
});

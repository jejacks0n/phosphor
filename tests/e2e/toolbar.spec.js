// The toolbar's slots, in order, with a divider ('|') between groups: drawing, selecting, moving
// around, then the cell tools (ANSI view only). A slot is a tool or a group of them (tools/groups.js).
import { test, expect, openApp, store, tab, settled } from './support.js';
import { fakeRoom, goLive } from './social-support.js';

const row = (page) => page.locator('.tool-group > *').evaluateAll((els) => els.map((el) => el.dataset.slot ?? '|'));

test('Select and the Magic Wand share a slot between the picker and the Hand and Zoom\'s, in both views', async ({ page }) => {
  await openApp(page);
  expect(await row(page)).toEqual(['pencil', 'brush', 'eraser', 'fill', 'shapes', 'picker', '|', 'select', '|', 'navigate', '|', 'text', 'flip']);
  await tab(page, 'PIXEL').click();
  await settled(page);
  expect(await row(page)).toEqual(['pencil', 'brush', 'eraser', 'fill', 'shapes', 'picker', '|', 'select', '|', 'navigate']);
});

// The overlay controls fold into their dropdown, and the Actions into theirs, when the toolbar is narrow,
// whatever narrows it: a narrow window, or the side panel open beside the editor.
test('the toolbar folds by its own width, so the side panel open folds it sooner', async ({ page }) => {
  const overlay = () => page.getByRole('slider', { name: 'ANSI Overlay' });
  const folded = () => page.locator('.overlay-menu');
  const actions = () => page.locator('.edit-toolbar').getByTitle('Actions');
  await page.setViewportSize({ width: 1358, height: 900 });
  await openApp(page);
  await store(page, 'workspace', (w) => { w.sidePanelFolded = true; });
  await tab(page, 'PIXEL').click();
  await expect(page.locator('.side-panel')).toBeHidden();   // folded away entirely
  await expect(overlay()).toBeVisible();   // the toolbar is wide: everything's out
  await expect(folded()).toHaveCount(0);
  await expect(actions()).toBeHidden();
  await page.setViewportSize({ width: 1290, height: 900 });   // a toolbar of about 1000px: the overlay folds
  await expect(folded()).toBeVisible();
  await page.setViewportSize({ width: 1358, height: 900 });
  await expect(overlay()).toBeVisible();

  await goLive(page, fakeRoom());   // hosting: the side panel opens on the chat, 280px from the editor
  await expect(page.locator('aside.chat')).toBeVisible();
  await tab(page, 'PIXEL').click();
  await expect(folded()).toBeVisible();
  await expect(overlay()).toHaveCount(0);
  await expect(actions()).toBeHidden();   // still room for these

  await page.setViewportSize({ width: 1180, height: 900 });
  await expect(actions()).toBeVisible();
});

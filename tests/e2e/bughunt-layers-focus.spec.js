// Bug hunt: keyboard focus around LAYERS. Each test here fails because of a bug.
import { test, expect, openApp, store } from './support.js';

test('deleting a layer from its ⋯ menu with the keyboard leaves focus in the layers list', async ({ page }) => {
  await openApp(page);
  const panel = page.locator('.side-panel'), open = page.getByRole('button', { name: 'Open the panel' });
  if (await open.isVisible()) await open.click();
  await panel.getByRole('tab', { name: 'Layers' }).click();
  await panel.getByRole('button', { name: '+ Layer' }).click();
  expect(await store(page, 'project', (p) => p.layers.map((l) => l.id))).toEqual(['base', 'edit', 'L1']);
  const menu = panel.getByRole('button', { name: 'Layer 2 options' });
  await menu.focus();
  await page.keyboard.press('Enter');
  await panel.getByRole('button', { name: 'Delete', exact: true }).focus();
  await page.keyboard.press('Enter');
  expect(await store(page, 'project', (p) => p.layers.map((l) => l.id))).toEqual(['base', 'edit']);
  // The row is gone: a keyboard user shouldn't be dropped at the top of the page.
  const where = await page.evaluate(() => ({ tag: document.activeElement?.tagName, inList: !!document.activeElement?.closest('.layers-list') }));
  expect(where.inList, `focus is on <${where.tag}>`).toBe(true);
});

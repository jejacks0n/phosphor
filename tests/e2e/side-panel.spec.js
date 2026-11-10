// The side panel's left edge, dragged with the mouse: it widens and narrows the panel as far as its bounds, the
// canvas gives and takes the room, and the width stays across a reload.
import { test, expect, openApp } from './support.js';

test('dragging the side panel\'s edge resizes it within its bounds, the editor takes what\'s left, and the width stays after a reload', async ({ page }) => {
  await openApp(page);
  const panel = page.locator('.side-panel'), editor = page.locator('section.edit-workspace');
  await expect(panel).toHaveCSS('width', '280px');
  const before = (await editor.boundingBox()).width;

  const drag = async (by) => {
    const edge = await page.getByRole('separator', { name: 'Panel width' }).boundingBox();
    const x = edge.x + edge.width / 2, y = edge.y + 200;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + by / 2, y);
    await page.mouse.move(x + by, y);
    await page.mouse.up();
  };
  await drag(-100);
  await expect(panel).toHaveCSS('width', '380px');
  await expect.poll(async () => (await editor.boundingBox()).width).toBe(before - 100);
  await drag(-400);
  await expect(panel).toHaveCSS('width', '480px');   // the widest
  await drag(600);
  await expect(panel).toHaveCSS('width', '240px');   // the narrowest
  await drag(-60);
  await expect(panel).toHaveCSS('width', '300px');

  await page.reload();
  await expect(panel).toHaveCSS('width', '300px');
  await page.getByRole('button', { name: 'Fold the panel' }).click();
  await expect(panel).toBeHidden();   // folded, it takes no room
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open the panel' })).toBeVisible();
  await expect(panel).toBeHidden();   // and folded stays folded
});

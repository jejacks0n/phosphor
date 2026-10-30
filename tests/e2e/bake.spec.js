import { test, expect } from './support.js';
import { openApp, store, settled } from './support.js';

const cellsOf = (page) => store(page, 'project', (p) => JSON.stringify(p.cells));

async function raiseContrast(page) {
  const contrast = page.getByRole('group', { name: /Adjustments/ }).getByRole('slider').nth(1);
  await contrast.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(() => store(page, 'project', (p) => p.contrast)).toBeGreaterThan(100);
  await settled(page);
}

test('Bake from the toolbar: the sliders go back to neutral and the picture stays as it was', async ({ page }) => {
  await openApp(page);
  const bake = page.getByTitle(/^Bake:/);
  await expect(bake).toBeDisabled();
  await raiseContrast(page);
  const cells = await cellsOf(page);

  await bake.click(); // full color: no question to ask
  await expect.poll(() => store(page, 'project', (p) => p.contrast)).toBe(100);
  await settled(page);
  expect(await cellsOf(page)).toBe(cells);
  await expect(bake).toBeDisabled();
});

test('Bake under CGA asks first: Keep full color is the default, Lock changes nothing on the canvas', async ({ page }) => {
  await openApp(page);
  await page.getByRole('combobox', { name: 'Color Palette' }).selectOption('cga');
  await raiseContrast(page);
  const cells = await cellsOf(page);
  const dialog = page.getByRole('dialog', { name: 'Bake with the CGA palette' });

  await page.getByTitle(/^Bake:/).click();
  await expect(dialog.getByRole('button', { name: /^Keep full color/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await store(page, 'project', (p) => p.contrast)).toBeGreaterThan(100); // nothing baked

  await page.getByTitle(/^Bake:/).click();
  await dialog.getByRole('button', { name: /^Lock to the CGA palette/ }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => store(page, 'project', (p) => p.contrast)).toBe(100);
  await settled(page);
  expect(await cellsOf(page)).toBe(cells);
});

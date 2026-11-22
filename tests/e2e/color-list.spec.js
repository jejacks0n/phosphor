import { readFile } from 'node:fs/promises';
import { test, expect, openApp, store, settled } from './support.js';

// The Custom color list's editor in the settings column, where only the whole page can go wrong: a real drag, a file
// chosen and a download, and a phone's drawer, its finger and its width.

const LIST = '#ff0000 #00ff00 #0000ff';

async function customList(page, list = LIST) {
  await page.getByRole('combobox', { name: 'Color palette' }).selectOption('palette');
  const field = page.getByRole('textbox', { name: 'Palette colors' });
  await field.fill(list);
  await field.press('Enter');
  await expect.poll(() => store(page, 'project', (p) => p.palette)).toBe(list);
  await settled(page);
}

const swatches = (page) => page.locator('.color-list button.swatch');
// Every color the cells show is one of the list's.
const cellColors = (page) => store(page, 'project', (p) => [...new Set(p.cells.flatMap((c) => [c.fg.hex, c.bg.hex]))].sort());

test('a swatch dragged with the mouse onto another moves there, and the picture recolors', async ({ page }) => {
  await openApp(page);
  await customList(page);
  await swatches(page).nth(0).dragTo(swatches(page).nth(2));
  await expect.poll(() => store(page, 'project', (p) => p.palette)).toBe('#00ff00 #0000ff #ff0000');
  await settled(page);
  for (const hex of await cellColors(page)) expect(LIST.split(' ')).toContain(hex);
});

test('Import takes a .hex file and Put back restores the list; Export downloads it', async ({ page }) => {
  await openApp(page);
  await customList(page);
  await page.locator('.color-list input.hex-file').setInputFiles({ name: 'two.hex', mimeType: 'text/plain', buffer: Buffer.from('1a1c2c\r\n5d275d\r\n') });
  await expect.poll(() => store(page, 'project', (p) => p.palette)).toBe('#1a1c2c #5d275d');
  await page.getByRole('button', { name: 'Put back' }).click();
  await expect.poll(() => store(page, 'project', (p) => p.palette)).toBe(LIST);

  const name = await store(page, 'project', (p) => p.filename);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.color-list button.export').click()]);
  expect(download.suggestedFilename()).toBe(`${name}.hex`);
  expect(await readFile(await download.path(), 'utf8')).toBe('ff0000\n00ff00\n0000ff\n');
});

test('the swatches are one Tab stop, and the arrows walk them, with the art in the page beside them', async ({ page }) => {
  await openApp(page);
  await customList(page);
  await page.getByRole('textbox', { name: 'Palette colors' }).focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+Tab'); // past the chip and + to the picked swatch
  await expect(swatches(page).nth(0)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(swatches(page).nth(1)).toBeFocused();
  await expect(swatches(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('End');
  await expect(swatches(page).nth(2)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(swatches(page).nth(1)).not.toBeFocused(); // the others aren't stops
  expect(await store(page, 'project', (p) => p.palette)).toBe(LIST);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('on a phone the editor fits the drawer, its swatches aren\'t draggable, and ◂ ▸ reorder', async ({ page }) => {
    await openApp(page);
    const drawer = page.getByRole('button', { name: 'Toggle settings' });
    await drawer.tap();
    await customList(page);

    const panel = page.locator('aside.control-panel');
    expect(await panel.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0); // nothing runs off to the side
    for (const swatch of await swatches(page).all()) expect(await swatch.getAttribute('draggable')).not.toBe('true');
    await expect(page.getByRole('textbox', { name: 'Palette colors' })).toHaveValue('#ff0000');
    // Under a finger: ◂ ▸ a fingertip wide, on a line under the color with Remove, the whole hex showing over them; and
    // the small links (Remove, Import, Export, Browse) take a press a little above and below their words.
    const box = (selector) => page.locator(selector).boundingBox();
    const [field, earlier, later] = [await box('.color-list #palette'), await box('.color-list button.earlier'), await box('.color-list button.later')];
    expect([earlier.width, later.width].every((width) => width >= 44)).toBe(true);
    expect(earlier.y).toBeGreaterThanOrEqual(field.y + field.height);
    expect(await page.locator('.color-list #palette').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    for (const link of ['.color-list button.remove', '.color-list button.import', '.color-list button.export', 'aside.control-panel button.browse']) {
      expect((await box(link)).height, link).toBeGreaterThanOrEqual(28);
    }
    expect(await panel.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);

    await page.locator('.color-list button.later').tap();
    await expect.poll(() => store(page, 'project', (p) => p.palette)).toBe('#00ff00 #ff0000 #0000ff');
    await expect(swatches(page).nth(1)).toHaveAttribute('aria-pressed', 'true'); // the picked color went with it
    await page.locator('.color-list button.earlier').tap();
    await expect.poll(() => store(page, 'project', (p) => p.palette)).toBe(LIST);
  });
});

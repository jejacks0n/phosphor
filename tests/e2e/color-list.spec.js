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

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('on a phone the editor fits the drawer, its swatches aren\'t draggable, and ◂ ▸ reorder', async ({ page }) => {
    await openApp(page);
    const drawer = page.getByRole('button', { name: 'Toggle settings' });
    await drawer.tap();
    await customList(page);
    await drawer.tap(); // shut, so the color box's link is what opens it
    await expect.poll(() => store(page, 'workspace', (w) => w.settingsOpen)).toBe(false);

    await page.getByRole('button', { name: 'Foreground color' }).tap();
    await page.getByRole('button', { name: 'Edit colors ▸' }).tap();
    await expect(page.getByRole('dialog', { name: 'Color picker' })).toHaveCount(0);
    await expect.poll(() => store(page, 'workspace', (w) => w.settingsOpen)).toBe(true);
    await expect(page.locator('.color-list button.swatch[aria-pressed=true]')).toBeFocused();

    const panel = page.locator('aside.control-panel');
    expect(await panel.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0); // nothing runs off to the side
    for (const swatch of await swatches(page).all()) expect(await swatch.getAttribute('draggable')).not.toBe('true');
    await expect(page.getByRole('textbox', { name: 'Palette colors' })).toHaveValue('#ff0000');

    await page.locator('.color-list button.later').tap();
    await expect.poll(() => store(page, 'project', (p) => p.palette)).toBe('#00ff00 #ff0000 #0000ff');
    await expect(swatches(page).nth(1)).toHaveAttribute('aria-pressed', 'true'); // the picked color went with it
    await page.locator('.color-list button.earlier').tap();
    await expect.poll(() => store(page, 'project', (p) => p.palette)).toBe(LIST);
  });
});

import { readFile } from 'node:fs/promises';
import { test, expect, openApp, store, settled } from './support.js';

// The Custom color list's editor, This drawing's details on the color layer's Palettes page, where only the whole page
// can go wrong: a real drag, a file chosen and a download, and a phone's window, its finger and its width.

const LIST = '#ff0000 #00ff00 #0000ff';

// The Custom color list chosen, the layer opened on Palettes (it opens on This drawing, the editor), and a list typed into
// its hex field. On a phone the settings drawer is open for the choice and shuts as the layer opens.
const field = (page) => page.locator('.color-layer').getByRole('textbox', { name: 'Hex of the picked color' });
async function customList(page, list = LIST) {
  await page.getByRole('combobox', { name: 'Color palette' }).selectOption('palette');
  await page.getByRole('button', { name: 'Manage color palettes' }).click();
  await field(page).fill(list);
  await field(page).press('Enter');
  await expect.poll(() => store(page, 'project', (p) => p.palette)).toBe(list);
  await settled(page);
}

const swatches = (page) => page.locator('.color-list button.swatch');
// Every color the cells show is one of the list's.
const cellColors = (page) => store(page, 'project', (p) => [...new Set(p.cells.flatMap((c) => [c.fg.hex, c.bg.hex]))].sort());

test('a swatch dragged with the mouse onto another shows a placeholder there, moves there, and the picture recolors', async ({ page }) => {
  await openApp(page);
  await customList(page);
  const from = await swatches(page).nth(0).boundingBox(), to = await swatches(page).nth(2).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  const placeholder = page.locator('.color-list div.swatch.placeholder');
  await expect(placeholder).toHaveCount(1);
  await expect(page.locator('.color-list div.swatch').nth(2)).toHaveClass(/placeholder/); // the swatch dragged, where it'd land
  await page.mouse.up();
  await expect(placeholder).toHaveCount(0);
  await expect.poll(() => store(page, 'project', (p) => p.palette)).toBe('#00ff00 #0000ff #ff0000');
  await settled(page);
  for (const hex of await cellColors(page)) expect(LIST.split(' ')).toContain(hex);
});

test('a swatch dragged to the bottom of many scrolls them, and lands where the placeholder is', async ({ page }) => {
  const many = Array.from({ length: 120 }, (_, i) => `#${(i * 2).toString(16).padStart(2, '0')}4080`);
  await openApp(page);
  await customList(page, many.join(' '));
  const box = page.locator('.color-list div.swatches');
  const r = await box.boundingBox(), from = await swatches(page).nth(0).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, r.y + r.height - 4, { steps: 8 });
  await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeGreaterThan(200);
  await page.mouse.move(from.x + from.width / 2 + 1, r.y + r.height / 2); // up into the middle, where it holds still
  const at = await box.evaluate((el) => [...el.querySelectorAll('div.swatch')].findIndex((cell) => cell.classList.contains('placeholder')));
  expect(at).toBeGreaterThan(10);
  await page.mouse.up();
  await expect.poll(async () => (await store(page, 'project', (p) => p.palette)).split(' ').indexOf(many[0])).toBe(at);
});

test('Import takes a .hex file and Put back restores the list; Export downloads it', async ({ page }) => {
  await openApp(page);
  await customList(page);
  await page.locator('.color-list input.hex-file').setInputFiles({ name: 'two.hex', mimeType: 'text/plain', buffer: Buffer.from('1a1c2c\r\n5d275d\r\n') });
  await expect.poll(() => store(page, 'project', (p) => p.palette)).toBe('#1a1c2c #5d275d');
  await page.getByRole('button', { name: 'Put back' }).click();
  await expect.poll(() => store(page, 'project', (p) => p.palette)).toBe(LIST);

  const name = await store(page, 'project', (p) => p.filename);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.color-list .actions button.export').click()]);
  expect(download.suggestedFilename()).toBe(`${name}.hex`);
  expect(await readFile(await download.path(), 'utf8')).toBe('ff0000\n00ff00\n0000ff\n');
});

test('the swatches are one Tab stop, and the arrows walk them, with the art in the page beside them', async ({ page }) => {
  await openApp(page);
  await customList(page);
  await field(page).focus();
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
  test('on a phone the editor fits the window, its swatches aren\'t draggable, and ◂ ▸ reorder', async ({ page }) => {
    await openApp(page);
    const drawer = page.getByRole('button', { name: 'Toggle settings' });
    await drawer.tap();
    const palettes = await page.locator('aside.control-panel button.palettes').boundingBox();
    expect(palettes.height).toBeGreaterThanOrEqual(28);
    await customList(page);

    const panel = page.locator('.color-layer');
    await panel.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {})))); // the layer's own opening is done, so nothing is measured mid-motion
    expect(await panel.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0); // nothing runs off to the side
    for (const swatch of await swatches(page).all()) expect(await swatch.getAttribute('draggable')).not.toBe('true');
    await expect(field(page)).toHaveValue('#ff0000');
    // Under a finger: ◂ ▸ a fingertip wide, on a line under the color with Remove, the whole hex showing over them; and
    // the small links (Remove, Import, Export, and Palettes in the drawer) take a press a little above and below their words.
    const box = (selector) => page.locator(selector).boundingBox();
    const [hexBox, earlier, later] = [await box('.color-list #palette'), await box('.color-list button.earlier'), await box('.color-list button.later')];
    expect([earlier.width, later.width].every((width) => width >= 44)).toBe(true);
    expect(earlier.y).toBeGreaterThanOrEqual(hexBox.y + hexBox.height);
    expect(await page.locator('.color-list #palette').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    for (const link of ['.color-list button.remove', '.color-list .actions button.import', '.color-list .actions button.export']) {
      expect((await box(link)).height, link).toBeGreaterThanOrEqual(link.includes('.actions') ? 32 : 28);
    }
    expect(await panel.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);

    await page.locator('.color-list button.later').tap();
    await expect.poll(() => store(page, 'project', (p) => p.palette)).toBe('#00ff00 #ff0000 #0000ff');
    await expect(swatches(page).nth(1)).toHaveAttribute('aria-pressed', 'true'); // the picked color went with it
    await page.locator('.color-list button.earlier').tap();
    await expect.poll(() => store(page, 'project', (p) => p.palette)).toBe(LIST);
  });
});

import { test, expect } from './support.js';
import { openApp, store, fixture, tab, editAt, settled, screenPixels } from './support.js';

// The grid's CSS width (the canvas view's sizer): 2px borders on each side of its cells.
const canvasWidth = (page) => page.locator('.ansi-editor div.display').evaluate((c) => c.getBoundingClientRect().width);

// The palette layer, opened on its Fonts page by the Font field's Manage fonts.
const fontsPage = async (page) => {
  await page.getByRole('button', { name: 'Manage fonts ▸' }).click();
  return page.locator('.palette-layer');
};

// Load a font with the Fonts page's + Load button.
async function loadFont(page, path) {
  const layer = await fontsPage(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), layer.getByRole('button', { name: '+ Load' }).click()]);
  await chooser.setFiles(path);
}

test('the Font field sets the font the art is drawn in, in both views, at its size, and keeps them', async ({ page }) => {
  await openApp(page);
  const cols = await store(page, 'project', (p) => p.cols);
  const font = page.getByLabel('Font', { exact: true }), size = page.getByLabel('Font size');
  await expect(font).toHaveValue('jetbrains');
  await expect(size).toHaveValue('17');
  await font.selectOption({ label: 'IBM VGA' });
  await expect(size).toHaveValue('16');
  // The Characters field shows its characters in it too, as they'll be drawn.
  await expect(page.getByRole('textbox', { name: 'Characters' })).toHaveCSS('font-family', /^"IBM VGA 8x16"/);
  await expect.poll(() => canvasWidth(page)).toBeCloseTo(cols * 8 + 4, 0); // 8x16 cells
  await size.fill('32');
  await size.press('Enter');
  await expect.poll(() => canvasWidth(page)).toBeCloseTo(cols * 16 + 4, 0); // twice that
  await page.getByRole('button', { name: 'DOM', exact: true }).click();
  const pre = page.locator('.ansi-editor pre.display');
  await expect(pre).toHaveCSS('font-family', /IBM VGA 8x16/);
  await expect(pre).toHaveCSS('line-height', '32px');
  // Still chosen, at that size, when the app opens again.
  await openApp(page);
  await expect(page.getByLabel('Font', { exact: true })).toHaveValue('vga');
  await expect(page.getByLabel('Font size')).toHaveValue('32');
});

test('a monospaced font from your computer is used and kept; a proportional one is refused', async ({ page }) => {
  await openApp(page);
  const cols = await store(page, 'project', (p) => p.cols);
  await loadFont(page, fixture('fonts/proportional.ttf'));
  await expect(page.getByRole('alert')).toHaveText(/^“proportional” isn't monospaced \(“i” is 4\.0px wide, while “W” is 14\.4px\)\./);
  await expect(page.getByLabel('Font', { exact: true })).toHaveValue('jetbrains');
  // tests/fixtures/fonts/tall.ttf: every glyph 0.6em wide, 1.2em tall; a loaded font starts at 16px.
  await loadFont(page, fixture('fonts/tall.ttf'));
  await expect(page.getByRole('alert')).toHaveCount(0);
  const font = page.getByLabel('Font', { exact: true });
  await expect(font.locator('option:checked')).toHaveText('tall');
  await expect.poll(() => canvasWidth(page)).toBeCloseTo(cols * 10 + 4, 0); // 0.6 × 16 = 9.6, to whole pixels
  await openApp(page);
  await expect(page.getByLabel('Font', { exact: true }).locator('option:checked')).toHaveText('tall');
  // Removed on the Fonts page: back to the default.
  await (await fontsPage(page)).getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByLabel('Font', { exact: true })).toHaveValue('jetbrains');
  await expect(page.getByLabel('Font', { exact: true }).locator('option', { hasText: 'tall' })).toHaveCount(0);
});

test('Manage fonts opens the Fonts page with any tool, and Escape gives the keys back', async ({ page }) => {
  await openApp(page);
  await tab(page, 'PIXEL').click();
  await page.keyboard.press('h');
  await expect.poll(() => store(page, 'workspace', (w) => w.activeTool)).toBe('hand');
  const layer = await fontsPage(page);
  await expect(layer.getByRole('button', { name: '+ Load' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage fonts ▸' })).toBeVisible(); // a second click leaves it open
  await page.getByRole('button', { name: 'Manage fonts ▸' }).click();
  await expect(layer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(layer).toHaveCount(0);
  await page.keyboard.press('b');
  await expect.poll(() => store(page, 'workspace', (w) => w.activeTool)).toBe('brush');
});

test('a bitmap font loaded on the start screen stays through a reload, is the blank canvas\'s font, and the art is drawn in it', async ({ page }) => {
  await page.goto('/');
  // An 8×16 font whose only lit glyph is A, every pixel of it.
  const bytes = new Uint8Array(256 * 16);
  bytes.fill(0xff, 65 * 16, 66 * 16);
  const layer = await fontsPage(page);
  await expect(layer).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), layer.getByRole('button', { name: '+ Load' }).click()]);
  await chooser.setFiles({ name: 'Solid A.F16', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
  await expect(page.getByLabel('Font', { exact: true }).locator('option:checked')).toHaveText('Solid A');
  await page.keyboard.press('Escape');
  await expect(layer).toHaveCount(0);
  await page.reload(); // a reload keeps the font picked
  await expect(page.getByLabel('Font', { exact: true }).locator('option:checked')).toHaveText('Solid A');
  await page.getByRole('button', { name: 'Start with a blank canvas' }).click();
  await settled(page);
  await expect(page.getByLabel('Font', { exact: true }).locator('option:checked')).toHaveText('Solid A');
  const cols = await store(page, 'project', (p) => p.cols);
  await expect.poll(() => canvasWidth(page)).toBeCloseTo(cols * 8 + 4, 0); // 8×16 cells
  // A typed A is a solid cell: drawn in the font's glyph, not a letter's. (The second one: the caret's mark is on the first.)
  await editAt(page, 1, 1);
  await page.keyboard.insertText('AA');
  await page.keyboard.press('Escape');
  const box = await page.locator('.ansi-editor div.display').boundingBox();
  await expect.poll(async () => {
    const data = await screenPixels(page, { x: box.x + 2 + 2 * 8 + 1, y: box.y + 2 + 16 + 2, width: 6, height: 12 }); // inside its edges
    return data.filter((v, i) => i % 4 === 0 && v > 128).length;
  }).toBe(6 * 12);
});

// Each toggle's tooltip says what's on now and what a click does (the renderer's button is named for the other one).
test('the status bar\'s Smooth button turns anti-aliasing off and on, in both views, and keeps it; its and DOM/Canvas\'s tooltips say what\'s on and what a click does', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('button', { name: 'DOM', exact: true })).toHaveAttribute('title', 'Rendered on canvas. Click to switch to DOM text rendering (experimental).');
  const smooth = page.getByRole('button', { name: 'Smooth' });
  await expect(smooth).toHaveAttribute('aria-pressed', 'true'); // on by default
  await expect(smooth).toHaveAttribute('title', 'Smooth text is on (anti-aliased characters). Click for sharp pixel edges.');
  await smooth.click();
  await expect(smooth).toHaveAttribute('aria-pressed', 'false');
  await expect(smooth).toHaveAttribute('title', 'Smooth text is off (sharp pixel edges). Click for anti-aliased characters.');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--display-font-smoothing').trim())).toBe('none');
  await page.getByRole('button', { name: 'DOM', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Canvas', exact: true })).toHaveAttribute('title', 'Rendered as DOM text (experimental). Click to switch to canvas rendering.');
  await expect(page.locator('.ansi-editor pre.display')).toHaveCSS('-webkit-font-smoothing', 'none');
  await openApp(page);
  await expect(page.getByRole('button', { name: 'Smooth' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Smooth' }).click();
  await expect(page.locator('.ansi-editor pre.display')).toHaveCSS('-webkit-font-smoothing', 'antialiased');
});

test('the canvas follows the Smooth button: white text on black has gray edges when smooth, none when sharp', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with a blank canvas' }).click();
  await tab(page, 'ANSI').click();
  await settled(page);
  await editAt(page, 1, 1);
  await page.keyboard.insertText('Rag@&%3sw');
  await page.keyboard.press('Escape');
  // Gray pixels (neither black nor white) in the typed cells: col 1 on, row 1 (inside its 2px border).
  const box = await page.locator('.ansi-editor div.display').boundingBox();
  const { cols, rows } = await store(page, 'project', (p) => ({ cols: p.cols, rows: Math.ceil(p.rows / 2) }));
  const cw = (box.width - 4) / cols, ch = (box.height - 4) / rows;
  const grays = async () => {
    const data = await screenPixels(page, { x: box.x + 2 + cw, y: box.y + 2 + ch, width: cw * 9, height: ch });
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 16 && data[i] < 240 && data[i] === data[i + 1]) n++;
    return n;
  };
  expect(await grays()).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Smooth', exact: true }).click();
  await expect.poll(grays).toBe(0);
});

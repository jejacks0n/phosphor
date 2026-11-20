// Plugins through the whole page: a manifest installed with the real file chooser, its theme there before the app's
// script runs after a reload, the plugins=off address, a kept copy of a theme that's damaged, and Outlines (the example
// solver) installed from its folder and its zip, drawing, kept over a reload, and missed by a browser without it.
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test, expect, openApp, pickLayer, settled, autosaved, store, saveAs, imageInput, otherBrowser } from './support.js';

const MANIFEST = fileURLToPath(new URL('../fixtures/plugins/midnight/phosphor-plugin.json', import.meta.url));
const OUTLINES = fileURLToPath(new URL('../fixtures/plugins/outlines', import.meta.url));
const OUTLINES_ZIP = fileURLToPath(new URL('../fixtures/plugins/outlines.zip', import.meta.url));
const MIDNIGHT = 'plugin:jane.midnight/midnight';
const theme = (page) => page.locator('html').getAttribute('data-theme');
const background = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const pluginThemes = (page) => page.getByRole('combobox', { name: 'Plugin themes' });
const dialog = (page) => page.getByRole('dialog');

async function installMidnight(page) {
  await page.getByRole('button', { name: 'Plugins', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await dialog(page).getByRole('button', { name: 'Install from a file…' }).click();
  await (await chooser).setFiles(MANIFEST);
  await expect(dialog(page).getByRole('heading', { name: 'Install Midnight 1.0.0?' })).toBeVisible();
  await dialog(page).getByRole('button', { name: /^Install Adds 1 theme/ }).click();
  await expect(dialog(page).getByRole('switch', { name: 'Midnight' })).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Close' }).click();
}

test('a plugin installed from a file gives a theme that is there before the app starts after a reload', async ({ page }) => {
  await page.goto('/');
  await installMidnight(page);
  await pluginThemes(page).selectOption({ label: 'Midnight' });
  expect(await theme(page)).toBe('dark');
  await expect.poll(() => background(page)).toBe('rgb(16, 22, 43)');

  await page.route('**/assets/*.js', (route) => route.abort());   // the app never starts: only index.html's script runs
  await page.reload();
  expect(await theme(page)).toBe('dark');
  expect(await background(page)).toBe('rgb(16, 22, 43)');
  await expect(page.getByRole('radiogroup', { name: 'Theme' })).toHaveCount(0);

  await page.unroute('**/assets/*.js');
  await page.reload();
  await expect(pluginThemes(page)).toHaveValue(MIDNIGHT);
});

test('plugins=off loads without the theme, keeps the choice, and the dialog can still remove the plugin', async ({ page }) => {
  await page.goto('/');
  await installMidnight(page);
  await pluginThemes(page).selectOption({ label: 'Midnight' });
  await expect.poll(() => background(page)).toBe('rgb(16, 22, 43)');

  await page.goto('/?plugins=off');
  await expect(page.getByRole('button', { name: 'Plugins', exact: true })).toBeVisible();
  expect(await background(page)).toBe('rgb(26, 26, 26)');
  expect(await page.evaluate(() => localStorage.getItem('phosphor.theme'))).toBe(MIDNIGHT);

  await page.getByRole('button', { name: 'Plugins', exact: true }).click();
  await expect(dialog(page).getByText(/Plugins are off for this visit/)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Remove Midnight' }).click();
  await dialog(page).getByRole('button', { name: /^Remove/ }).click();
  await expect(dialog(page).getByText('No plugins yet.')).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Dark' })).toBeChecked();
  await expect(pluginThemes(page)).toHaveCount(0);
});

test('a damaged kept copy loads as Dark', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error));
  await context.addInitScript(() => {
    localStorage.setItem('phosphor.theme', 'plugin:x.y/z');
    localStorage.setItem('phosphor.themeColors', '{nope');
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Plugins', exact: true })).toBeVisible();
  expect(await theme(page)).toBe('dark');
  expect(await background(page)).toBe('rgb(26, 26, 26)');
  expect(errors).toEqual([]);
});

// Outlines through the dialog: a folder through the hidden folder input (no folder picker: Playwright can't answer the
// browser's own), a zip through the file input. The warning is there before Install.
async function installOutlines(page, { from, replaces = false }) {
  await page.getByRole('button', { name: 'Plugins', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await dialog(page).getByRole('button', { name: from === 'folder' ? 'Install from a folder…' : 'Install from a file…' }).click();
  await (await chooser).setFiles(from === 'folder' ? OUTLINES : OUTLINES_ZIP);
  const title = replaces ? 'Replace Outlines 1.0.0 with 1.0.0?' : 'Install Outlines 1.0.0?';
  await expect(dialog(page).getByRole('heading', { name: title })).toBeVisible();
  await expect(dialog(page).getByText('This plugin runs code in Phosphor. Install it only if you trust where it came from.')).toBeVisible();
  await dialog(page).getByRole('button', { name: replaces ? /^Replace Adds a script/ : /^Install Adds a script/ }).click();
  await expect(dialog(page).getByRole('switch', { name: 'Outlines' })).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Close' }).click();
}
const noFolderPicker = (context) => context.addInitScript(() => {
  Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, writable: true, configurable: true });
});
const charChoice = (page) => page.locator('aside.control-panel #charChoice');
// The characters down the middle column of square.png, a black square on white: its top and bottom edges cross it.
const middleColumn = (page) => store(page, 'project', (p) => p.cells.filter((c, i) => i % p.cols === p.cols >> 1).map((c) => c.char).join(''));

test('Outlines installed from its folder and from its zip draws outlines, and a reload keeps them', async ({ page, context }) => {
  await noFolderPicker(context);
  await openApp(page, 'images/square.png');
  await pickLayer(page, 'Base'); // the picture's characters are its layer's
  expect(await middleColumn(page)).not.toContain('-');

  await installOutlines(page, { from: 'folder' });
  await charChoice(page).selectOption({ label: 'Outlines' });
  await expect.poll(() => middleColumn(page)).toContain('-');

  await installOutlines(page, { from: 'zip', replaces: true });
  await settled(page);
  await expect.poll(() => middleColumn(page)).toContain('-');

  await autosaved(page, { changed: true });
  await page.reload();
  await settled(page);
  await expect.poll(() => middleColumn(page)).toContain('-');
  await pickLayer(page, 'Base');
  await expect(charChoice(page).locator('option:checked')).toHaveText('Outlines');
});

test('a drawing on Outlines opened without the plugin shows By shape and says so', async ({ page, browser }) => {
  await openApp(page, 'images/square.png');
  await pickLayer(page, 'Base');
  await installOutlines(page, { from: 'zip' });
  await charChoice(page).selectOption({ label: 'Outlines' });
  await expect.poll(() => middleColumn(page)).toContain('-');
  const file = await readFile(await (await saveAs(page, 'Save project (.phosphor)')).path());
  await charChoice(page).selectOption('shape');
  await expect.poll(() => middleColumn(page)).not.toContain('-');
  await settled(page);
  const byShape = await middleColumn(page);

  const other = await (await otherBrowser(browser)).newPage();
  await other.goto('/');
  await imageInput(other).setInputFiles({ name: 'square.phosphor', mimeType: 'application/octet-stream', buffer: file });
  await settled(other);
  await pickLayer(other, 'Base');
  await expect(other.locator('aside.control-panel').getByText("outlines isn't installed. Showing By shape.")).toBeVisible();
  await expect(charChoice(other).locator('option:checked')).toHaveText('outlines (not here)');
  expect(await middleColumn(other)).toBe(byShape);
  await other.context().close();
});

// Plugins through the whole page: a manifest installed with the real file chooser, its theme there before the app's
// script runs after a reload, the plugins=off address, and a kept copy of a theme that's damaged.
import { fileURLToPath } from 'node:url';
import { test, expect } from './support.js';

const MANIFEST = fileURLToPath(new URL('../fixtures/plugins/midnight/phosphor-plugin.json', import.meta.url));
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

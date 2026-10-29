// The theme picker at the right of the tab bar: Dark (the default), Light, or System (which follows the computer),
// shown as a moon, a sun and a computer display.
import { test, expect } from './support.js';

const picker = (page) => page.getByRole('radiogroup', { name: 'Theme' });
const theme = (page) => page.locator('html').getAttribute('data-theme');
const background = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('Dark to begin with, even on a light computer; System follows the computer; the pick is kept', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(picker(page).getByRole('radio', { name: 'Dark' })).toBeChecked();
  expect(await theme(page)).toBe('dark');
  expect(await background(page)).toBe('rgb(26, 26, 26)');

  await picker(page).getByRole('radio', { name: 'System' }).click();
  expect(await theme(page)).toBe('light');
  expect(await background(page)).toBe('rgb(240, 240, 240)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => theme(page)).toBe('dark');

  await picker(page).getByRole('radio', { name: 'Light' }).click();
  await expect(picker(page).getByRole('radio', { name: 'Light' })).toBeChecked();
  expect(await theme(page)).toBe('light');
  expect(await background(page)).toBe('rgb(240, 240, 240)');

  await page.reload();   // kept, and set before the app starts
  expect(await theme(page)).toBe('light');
  await expect(picker(page).getByRole('radio', { name: 'Light' })).toBeChecked();

  await page.emulateMedia({ colorScheme: 'light' });
  await picker(page).getByRole('radio', { name: 'Dark' }).click();
  expect(await theme(page)).toBe('dark');
  expect(await background(page)).toBe('rgb(26, 26, 26)');
});

test('each choice is an icon, named for screen readers and on hover', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Dark', 'Light', 'System']) {
    const choice = picker(page).locator('label', { has: page.getByRole('radio', { name }) });
    await expect(choice).toHaveAttribute('title', name);
    await expect(choice).toHaveText('');
    expect(await choice.locator('svg').boundingBox()).toMatchObject({ width: 15, height: 15 });
  }
});

test('the picker is one stop for Tab, and the arrow keys move the choice', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await picker(page).getByRole('radio', { name: 'System' }).click();
  await page.keyboard.press('ArrowLeft');
  await expect(picker(page).getByRole('radio', { name: 'Light' })).toBeChecked();
  await expect(picker(page).getByRole('radio', { name: 'Light' })).toBeFocused();
  expect(await theme(page)).toBe('light');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');   // wraps to the first
  await expect(picker(page).getByRole('radio', { name: 'Dark' })).toBeChecked();
});

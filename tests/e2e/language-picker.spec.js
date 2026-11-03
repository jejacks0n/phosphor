// The language picker in the footer: switching to French updates the UI and document locale,
// persists to localStorage, and restores on reload.
import { test, expect, openApp } from './support.js';

test('switching language to French updates the UI and persists across reload', async ({ page }) => {
  await openApp(page);

  // Initial state is English
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const langSelect = page.getByRole('combobox', { name: 'Language' });
  await expect(langSelect).toBeVisible();
  await expect(langSelect).toHaveValue('en');

  // The picker sits above the About link, not beside it
  const picker = await langSelect.boundingBox();
  const about = await page.getByRole('button', { name: 'About Phosphor' }).boundingBox();
  expect(picker.y + picker.height).toBeLessThanOrEqual(about.y);

  // Select French
  await langSelect.selectOption('fr');

  // Document language and title update
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page).toHaveTitle(/Phosphor — Éditeur d'art ANSI & ASCII moderne/);

  // UI labels update
  await expect(page.getByRole('button', { name: 'Crayon' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gomme' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pot de peinture' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'À propos de Phosphor' })).toBeVisible();

  // Reload keeps French from localStorage
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('combobox', { name: 'Langue' })).toHaveValue('fr');
  await expect(page.getByRole('button', { name: 'À propos de Phosphor' })).toBeVisible();

  // Switch back to English
  await page.getByRole('combobox', { name: 'Langue' }).selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'About Phosphor' })).toBeVisible();
});

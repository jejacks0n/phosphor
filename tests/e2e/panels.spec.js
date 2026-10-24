import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { openApp, store, settled, fixture } from './support.js';

// The smaller pieces of the interface: About, the help tooltips, the dropdown menus, dropping a
// file, and starting a new project.
test('About opens from the footer, says which build it is, and closes', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Read About Phosphor' }).click();
  await expect(page.locator('.modal-backdrop')).toBeVisible();
  await expect(page.locator('p.version')).toHaveText(/^v\d+\.\d+\.\d+/);
  // The build it is: the commit (GitHub Actions' when deploying; "-dirty" with uncommitted changes)
  // and the day it was built, in About and in the page's <meta name="phosphor-build">.
  const sha = process.env.GITHUB_SHA?.slice(0, 7) ?? execSync('git rev-parse --short=7 HEAD').toString().trim();
  await expect(page.locator('p.build')).toHaveText(new RegExp(`^build ${sha}(-dirty)? · \\d{4}-\\d{2}-\\d{2}$`));
  const meta = await page.locator('meta[name="phosphor-build"]').getAttribute('content');
  expect(meta).toMatch(new RegExp(`^v\\d+\\.\\d+\\.\\d+ ${sha}(-dirty)? \\d{4}-\\d{2}-\\d{2}$`));
  await page.getByTitle('Close').click();
  await expect(page.locator('.modal-backdrop')).toBeHidden();
});

test('a help tooltip shows on hover, on screen, and hides', async ({ page }) => {
  await openApp(page);
  const help = page.locator('div.help-info').first();
  await help.hover();
  const tip = page.locator('div.help-tooltip');
  await expect(tip).toBeVisible();
  const box = await tip.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  await page.mouse.move(700, 400);
  await expect(tip).toBeHidden();
});

test('the Actions menu (narrow screens) opens, and closes on Escape and outside clicks', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await openApp(page);
  const trigger = page.getByTitle('Actions');
  await trigger.click();
  const menu = page.locator('.dropdown-content');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await trigger.click();
  await page.mouse.click(700, 500);
  await expect(menu).toBeHidden();
});

test('dropping an image onto the editor loads it', async ({ page }) => {
  await openApp(page);
  const bytes = [...await readFile(fixture('images/tall.png'))];
  await page.locator('.drop-zone').evaluate((el, data) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(data)], 'tall.png', { type: 'image/png' }));
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, bytes);
  await expect.poll(() => store(page, 'project', (p) => p.filename)).toBe('tall');
  await settled(page);
});

test('Start New Project asks when there are changes, then clears the document', async ({ page }) => {
  await openApp(page);
  await page.getByRole('combobox', { name: 'Color Palette' }).selectOption('cga'); // a change
  const asked = [];
  page.on('dialog', (d) => { asked.push(d.message()); d.accept(); });
  await page.getByRole('button', { name: 'Start New Project' }).click();
  expect(asked[0]).toMatch(/unsaved changes/);
  expect(await store(page, 'project', (p) => p.image)).toBe(null);
  await expect(page.getByRole('tab', { name: 'PIXEL' })).toHaveAttribute('aria-selected', 'true');
});

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { openApp, store, settled, fixture, cellPoint } from './support.js';

// The smaller pieces of the interface: About, the help tooltips, the dropdown menus, the status
// bar, dropping a file, and starting a new project.
test('About opens from the footer, says which build it is, and closes', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Read About Phosphor' }).click();
  await expect(page.locator('.modal-backdrop')).toBeVisible();
  // The build it is: major.minor with the day it was built as the third number, and the commit
  // (GitHub Actions' when deploying; "-dirty" with uncommitted changes), in About and in the page's
  // <meta name="phosphor-build">.
  const day = (ago) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10).replaceAll('-', '');
  const today = `(${day(0)}|${day(1)})`; // built moments ago: today, or yesterday across midnight UTC
  const sha = process.env.GITHUB_SHA?.slice(0, 7) ?? execSync('git rev-parse --short=7 HEAD').toString().trim();
  await expect(page.locator('p.version')).toHaveText(new RegExp(`^v\\d+\\.\\d+\\.${today}$`));
  await expect(page.locator('p.build')).toHaveText(new RegExp(`^build ${sha}(-dirty)?$`));
  const meta = await page.locator('meta[name="phosphor-build"]').getAttribute('content');
  expect(meta).toMatch(new RegExp(`^v\\d+\\.\\d+\\.${today} ${sha}(-dirty)?$`));
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

test('the status bar scrolls sideways when it doesn\'t fit, and nothing in it is cut short', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  await openApp(page);
  await page.keyboard.press('t'); // Edit Mode, with its cursor's cell: the most there is to show
  const at = await cellPoint(page, 40, 10); // the middle: the narrow view shows only part of the art
  await page.mouse.click(at.x, at.y);
  const bar = page.locator('footer.ansi-status');
  await expect(bar).toContainText('Col 41 Row 11');
  expect(await bar.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true); // it doesn't fit
  expect(await bar.evaluate((el) => [...el.children].every((c) => c.scrollWidth <= c.clientWidth))).toBe(true); // nothing squeezed
  await bar.hover();
  await page.mouse.wheel(200, 0);
  await expect.poll(() => bar.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
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

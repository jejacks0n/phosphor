// Select and the Magic Wand go with you between the PIXEL and ANSI tabs: leave one with either in
// hand and the other tab takes it. Every other tool stays with its own tab.
import { test, expect } from '@playwright/test';
import { openApp, store, tab, settled } from './support.js';

const tool = (page) => store(page, 'workspace', (w) => w.activeTool);
async function go(page, name) {
  await tab(page, name).click();
  await settled(page);
}

test('leaving a tab with Select or the Magic Wand brings it to the other tab; other tools stay put', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('b'); // ANSI: the Brush
  await go(page, 'PIXEL');
  await page.keyboard.press('e'); // PIXEL: the Eraser
  await go(page, 'ANSI');
  expect(await tool(page)).toBe('brush');

  await page.keyboard.press('m');
  await go(page, 'PIXEL');
  expect(await tool(page)).toBe('select');
  await page.keyboard.press('w');
  await go(page, 'ANSI');
  expect(await tool(page)).toBe('wand');

  await page.keyboard.press('b'); // choosing another tool here doesn't touch the PIXEL tab's
  await go(page, 'PIXEL');
  expect(await tool(page)).toBe('wand');
});

test('by way of SAUCE: the tab you last edited in is the one you left', async ({ page }) => {
  await openApp(page);
  await go(page, 'PIXEL');
  await page.keyboard.press('m');
  await go(page, 'SAUCE');
  await go(page, 'ANSI');
  expect(await tool(page)).toBe('select');

  await page.keyboard.press('b');
  await go(page, 'SAUCE');
  await go(page, 'ANSI'); // back where you were: PIXEL's Select stays there
  expect(await tool(page)).toBe('brush');
});

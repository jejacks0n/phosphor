import { test, expect } from './support.js';
import { fakeRoom, goLive, watcherPage, joinFromCard } from './social-support.js';
import { openApp, tab, store, cellPoint, drag } from './support.js';

const editorTabs = (page) => page.locator('.tab-list');

test('with nothing open no tab is selected; whatever opens lands on ANSI, and New project goes back', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Or start with a blank canvas' })).toBeVisible();
  for (const name of ['PIXEL', 'ANSI', 'SAUCE']) await expect(tab(page, name)).toBeDisabled();
  await expect(editorTabs(page).getByRole('tab', { selected: true })).toHaveCount(0);
  await expect(editorTabs(page).locator('[tabindex="0"]')).toHaveCount(0); // no tab to choose, so no Tab stop
  await expect(page.locator('.tab-list .indicator')).toHaveCSS('opacity', '0');
  expect(new URL(page.url()).hash).toBe('#/');

  await page.getByRole('button', { name: 'Or start with a blank canvas' }).click();
  await expect(tab(page, 'ANSI')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'PIXEL')).toBeEnabled();
  await expect(page.locator('.tab-list .indicator')).toHaveCSS('opacity', '1');
  await expect.poll(() => new URL(page.url()).hash).toBe('#/ansi');

  await page.getByRole('button', { name: 'New project' }).click(); // nothing drawn: no question
  await expect(page.getByRole('button', { name: 'Or start with a blank canvas' })).toBeVisible();
  await expect(editorTabs(page).getByRole('tab', { selected: true })).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).hash).toBe('#/');
});

// A watcher of a room with no art of their own: ROOM is the only tab with something to show.
test('a tab chosen from ROOM with nothing open keeps focus in the tab list, though it dims', async ({ page: host, context }) => {
  const room = fakeRoom();
  await goLive(host, room);
  const page = await watcherPage(context, room);
  await page.goto('/');
  await joinFromCard(page);
  await tab(page, 'ROOM').click();
  await expect(tab(page, 'PIXEL')).toBeEnabled(); // the way back to the start screen
  await tab(page, 'ROOM').focus();
  await page.keyboard.press('ArrowRight'); // wraps to PIXEL: the start screen, where PIXEL is dimmed
  await expect(page.getByRole('button', { name: 'Or start with a blank canvas' })).toBeVisible();
  await expect(tab(page, 'PIXEL')).toBeDisabled();
  await expect(tab(page, 'ROOM')).toBeFocused(); // the tab list's one stop, not the page

  await tab(page, 'ROOM').click();
  await tab(page, 'ANSI').click();
  await expect(tab(page, 'ROOM')).toBeFocused();
});

test('the editor tabs are a tablist: Tab reaches the selected one, arrows move and select', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tablist', { name: 'Workspace views' })).toBeVisible();
  await expect(tab(page, 'ANSI')).toBeDisabled(); // no image yet

  await openApp(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await drag(page, await cellPoint(page, 2, 2), await cellPoint(page, 5, 5));
  const selection = await store(page, 'workspace', (w) => w.selection);
  expect(selection).toEqual({ c0: 2, r0: 2, c1: 5, r1: 5 }); // room to nudge, if an arrow got through

  await tab(page, 'PIXEL').focus(); // the order: PIXEL, ANSI, SAUCE (VECTOR takes their place when the vector layer is picked)
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'ANSI')).toBeFocused();
  await expect(tab(page, 'ANSI')).toHaveAttribute('aria-selected', 'true');
  expect(await store(page, 'workspace', (w) => w.editorTab)).toBe('output');
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'SAUCE')).toBeFocused();
  await expect(tab(page, 'SAUCE')).toHaveAttribute('aria-selected', 'true');
  expect(await store(page, 'workspace', (w) => w.editorTab)).toBe('sauce');
  await page.keyboard.press('ArrowRight'); // wraps
  await expect(tab(page, 'PIXEL')).toBeFocused();
  await page.keyboard.press('End');
  await expect(tab(page, 'SAUCE')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tab(page, 'ANSI')).toHaveAttribute('aria-selected', 'true');
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual(selection); // the arrows stayed with the tabs
  await expect(tab(page, 'PIXEL')).toHaveAttribute('tabindex', '-1');

  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(tab(page, 'ANSI')).toBeFocused(); // the selected tab is the one Tab stop
});

import { test, expect } from './support.js';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { openApp, store, settled, fixture, cellPoint } from './support.js';

// The smaller pieces of the interface: About, the help tooltips, the dropdown menus, the status
// bar, dropping a file, and starting a new project.
test('About opens from the footer, says which build it is, and closes', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'About Phosphor' }).click();
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
  await expect(page.getByRole('listitem').filter({ hasText: 'cmang' }).getByRole('link', { name: 'Durdraw' })).toHaveAttribute('href', 'https://github.com/cmang/durdraw');
  // The icons are credited as their license asks.
  await expect(page.getByRole('link', { name: 'Font Awesome Free' })).toHaveAttribute('href', 'https://fontawesome.com');
  await expect(page.getByRole('listitem').filter({ hasText: 'Font Awesome Free' }).getByRole('link', { name: 'CC BY 4.0' }))
    .toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
  await page.getByTitle('Close').click();
  await expect(page.locator('.modal-backdrop')).toBeHidden();
});

// The page itself never scrolls: nothing hangs below the window (the panel's footer, the language picker in it, scrolls
// inside the panel). A page that could scroll moves the whole app when anything scrolls into view, and that scroll
// closes an open menu.
test('nothing hangs below the window, so the page has nothing to scroll', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('combobox', { name: 'Language' })).toBeAttached();
  expect(await page.evaluate(() => [document.body.scrollHeight, document.body.scrollWidth])).toEqual([900, 1400]);
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

// Safari hovers what a slider's drag crosses (an (i), another thumb, Colorize's color box) and never lets go of it, so
// while a slider is held nothing else answers the pointer; the held slider still drags, and all is back on release.
test('while a slider is held, nothing else on the page answers the pointer, until it\'s let go', async ({ page }) => {
  await openApp(page);
  const adjustments = page.getByRole('group', { name: /Adjustments/ });
  const slider = adjustments.getByRole('slider', { name: 'Brightness' });
  const others = [adjustments.locator('button.help-icon').first(), adjustments.getByRole('slider', { name: 'Contrast' }), adjustments.locator('input[type=color]').first()];
  const answers = (el) => el.evaluate((e) => getComputedStyle(e).pointerEvents !== 'none');
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  const before = await slider.inputValue();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
  for (const el of others) expect(await answers(el)).toBe(false);
  expect(await answers(slider)).toBe(true);
  await page.mouse.up();
  expect(await slider.inputValue()).not.toBe(before);
  for (const el of others) expect(await answers(el)).toBe(true);
});

test('the Actions menu (narrow screens) opens, and closes on Escape and outside clicks; it stays when something beside it scrolls, and closes when what holds it scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await openApp(page);
  await store(page, 'workspace', (w) => { w.sidePanelFolded = true; });   // the Actions button is for a narrow view, not one the panel narrows
  const trigger = page.getByTitle('Actions');
  await trigger.click();
  const menu = page.locator('.dropdown-content');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await trigger.click();
  await page.mouse.click(700, 500);
  await expect(menu).toBeHidden();

  await trigger.click();
  await expect(menu).toBeVisible();
  const scrollFrom = (selector) => page.evaluate((s) => {
    const from = s ? document.querySelector(s) : document;
    from.dispatchEvent(new Event('scroll'));
  }, selector);
  await page.evaluate(() => {
    const beside = document.createElement('div');
    beside.id = 'beside';
    document.body.append(beside);
  });
  await scrollFrom('#beside');
  await expect(menu).toBeVisible();
  await scrollFrom('.dropdown');
  await expect(menu).toBeVisible();   // a scroll from inside it, as the menu's own list does
  await scrollFrom(null);
  await expect(menu).toBeHidden();
});

test('the status bar scrolls sideways when it doesn\'t fit, and nothing in it is cut short', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  await openApp(page);
  await store(page, 'workspace', (w) => { w.sidePanelFolded = true; });   // the side panel would take the room the art needs
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
  await page.getByRole('dialog').getByRole('button', { name: /Open instead/ }).click(); // a picture over a drawing asks first
  await expect.poll(() => store(page, 'project', (p) => p.filename)).toBe('tall');
  await settled(page);
});

test('New project asks when there are changes, then clears the document', async ({ page }) => {
  await openApp(page);
  await page.getByRole('combobox', { name: 'Color palette' }).selectOption('cga'); // a change
  const asked = [];
  page.on('dialog', (d) => { asked.push(d.message()); d.accept(); });
  await page.getByRole('button', { name: 'New project' }).click();
  expect(asked[0]).toMatch(/unsaved changes/);
  expect(await store(page, 'project', (p) => p.image)).toBe(null);
  await expect(page.locator('.tab-list').getByRole('tab', { selected: true })).toHaveCount(0); // the start screen, no tab
});

test('the tool options row is the same height for every tool, its options on one line', async ({ page }) => {
  await openApp(page);
  const row = page.locator('.toolbar-row.secondary-row');
  const measure = () => row.evaluate((el) => {
    const r = el.getBoundingClientRect(), first = el.querySelector('.tool-setting-group > *').getBoundingClientRect();
    return { height: Math.round(r.height), middle: Math.round(first.top + first.height / 2 - r.top) };
  });
  const seen = {};
  for (const tool of ['Pencil', 'Brush', 'Paint Bucket', 'Shapes', 'Eraser']) {
    await page.getByRole('button', { name: tool }).click();
    seen[tool] = await measure();
  }
  const [first] = Object.values(seen);
  for (const [tool, got] of Object.entries(seen)) {
    expect(got.height, tool).toBe(first.height);
    expect(Math.abs(got.middle - first.middle), tool).toBeLessThanOrEqual(1);
  }
});

test('over the status bar the pointer is the ordinary arrow, whatever the tool hides it for over the canvas', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  for (const tool of ['brush', 'eraser', 'char', 'flip']) {
    await page.evaluate((id) => document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia._s.get('workspace').setActiveTool(id), tool);
    await expect.poll(() => page.locator('footer.ansi-status').evaluate((el) => getComputedStyle(el).cursor), { message: tool }).toBe('default');
  }
});

test.describe('help on a touch screen', () => {
  test.use({ hasTouch: true });

  test('a tap on an i shows its tip, and another tap elsewhere hides it', async ({ page }) => {
    await openApp(page);
    await page.locator('button.help-icon').first().tap();
    const tip = page.locator('div.help-tooltip');
    await expect(tip).toBeVisible();
    expect((await tip.boundingBox()).x).toBeGreaterThanOrEqual(0);
    await page.touchscreen.tap(700, 400);
    await expect(tip).toBeHidden();
  });
});

test('Tab reaches a help i, Enter opens its tip and Escape closes it', async ({ page }) => {
  await openApp(page);
  const help = page.locator('button.help-icon').first();
  await expect(help).toHaveAccessibleName(/^Help: /);
  for (let i = 0; i < 40 && !(await help.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(help).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('div.help-tooltip')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('div.help-tooltip')).toBeHidden();
});

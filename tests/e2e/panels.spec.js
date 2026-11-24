import { test, expect } from './support.js';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { openApp, store, settled, fixture } from './support.js';

// The smaller pieces of the interface: About, the help tooltips, the dropdown menus, the status
// bar, dropping a file, and starting a new project.
test('About opens from the logo, says which build it is and who brings it, and closes', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('footer').getByRole('button', { name: 'About Phosphor' })).toHaveCount(0); // the logo is the way in
  await page.getByRole('button', { name: 'About Phosphor' }).click();
  await expect(page.locator('dialog.modal-dialog.reading')).toBeVisible();
  // The build it is: major.minor with the day it was built as the third number (and -beta or -alpha after it while
  // package.json's version is one), and the commit (GitHub Actions' when deploying; "-dirty" with uncommitted changes),
  // in About and in the page's <meta name="phosphor-build">.
  const day = (ago) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10).replaceAll('-', '');
  const today = `(${day(0)}|${day(1)})(-(alpha|beta)(\\.\\d+)?)?`; // built moments ago: today, or yesterday across midnight UTC
  const sha = process.env.GITHUB_SHA?.slice(0, 7) ?? execSync('git rev-parse --short=7 HEAD').toString().trim();
  await expect(page.locator('p.version')).toHaveText(new RegExp(`^v\\d+\\.\\d+\\.${today}$`));
  await expect(page.locator('p.build')).toHaveText(new RegExp(`^build ${sha}(-dirty)?$`));
  const meta = await page.locator('meta[name="phosphor-build"]').getAttribute('content');
  expect(meta).toMatch(new RegExp(`^v\\d+\\.\\d+\\.${today} ${sha}(-dirty)?$`));
  await expect(page.locator('dialog.modal-dialog.reading').getByText('Brought to you by ishifishi.work and euphio.org')).toBeVisible();
  await expect(page.getByRole('link', { name: 'euphio.org' })).toHaveAttribute('href', 'https://euphio.org');
  await expect(page.getByRole('listitem').filter({ hasText: 'cmang' }).getByRole('link', { name: 'Durdraw' })).toHaveAttribute('href', 'https://github.com/cmang/durdraw');
  // Switched to Licenses: the icons credited as their license asks, and the build's packages, as the build found them,
  // each opening to its license.
  await page.locator('dialog.modal-dialog.reading').getByRole('tab', { name: 'Licenses' }).click();
  const licenses = page.getByRole('region', { name: 'Licenses' });
  await expect(licenses.getByRole('link', { name: 'Font Awesome Free' })).toHaveAttribute('href', 'https://fontawesome.com');
  await expect(licenses.getByRole('listitem').filter({ hasText: 'Font Awesome Free' }).getByRole('link', { name: 'CC BY 4.0' }))
    .toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
  const vue = licenses.getByRole('listitem').filter({ has: page.locator('summary', { hasText: /^vue \d/ }) });
  await expect(vue.locator('summary')).toHaveText(/^vue \d+\.\d+\.\d+ \(MIT\)$/);
  await vue.locator('summary').click();
  await expect(vue.locator('pre')).toContainText('Permission is hereby granted');
  await page.getByTitle('Close').click();
  await expect(page.locator('dialog.modal-dialog.reading')).toBeHidden();
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

test('on a phone the status bar wraps its readout a group at a time, nothing cut, the hex codes give way to the buttons, and a wheel scrolls what is still past the edge', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.keyboard.press('t'); // Edit Mode, with its cursor's cell: the most there is to show
  await store(page, 'workspace', (w) => { w.textCursor = { col: 15, row: 19 }; });
  const bar = page.locator('footer.ansi-status');
  // The bar's ui-monospace and Menlo aren't on Linux, whose fallback is narrower and wraps it so the buttons fit:
  // the font the app ships, as wide as Menlo, wraps it the same everywhere.
  await bar.evaluate((el) => { el.style.fontFamily = '"JetBrains Mono", monospace'; });
  await page.evaluate(() => document.fonts.load('11px "JetBrains Mono"'));
  await expect(bar).toContainText('Col 16 Row 20');
  await expect(bar).toContainText('BG');
  const layout = () => bar.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const groups = [...el.children].filter((c) => !c.classList.contains('strip'));
    return {
      height: Math.round(box.height),
      lines: new Set(groups.map((c) => Math.round(c.getBoundingClientRect().top))).size,
      whole: groups.every((c) => c.scrollWidth <= c.clientWidth && c.getBoundingClientRect().right <= box.right),
    };
  });
  const before = await layout();
  expect(before.lines).toBeGreaterThan(1);
  expect(before.whole).toBe(true);
  expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true); // the bar itself doesn't scroll

  const strip = bar.locator('.strip');
  await expect(bar).toHaveClass(/tight/); // no room for the FG and BG hex codes: they give way, each on its swatch's hover
  expect(await strip.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true); // and the buttons are whole

  await store(page, 'workspace', (w) => { w.textCursor = { col: 0, row: 0 }; }); // fewer digits: the bar doesn't change
  await expect(bar).toContainText('Col 1 Row 1');
  expect(await layout()).toEqual(before);

  await store(page, 'workspace', (w) => w.setAnsiZoom(0.5)); // a zoom button too, on a small phone: more than fits
  await page.setViewportSize({ width: 320, height: 640 });
  await expect.poll(() => strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await expect(strip).toHaveClass(/more/); // faded at its edge
  await strip.hover();
  await page.mouse.wheel(0, 400); // a plain mouse wheel, no Shift
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(strip).not.toHaveClass(/more/); // at its end
});

test('dropping an image onto the editor loads it', async ({ page }) => {
  await openApp(page);
  const bytes = [...await readFile(fixture('images/tall.png'))];
  await page.locator('.drop-zone').evaluate((el, data) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(data)], 'tall.png', { type: 'image/png' }));
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, bytes);
  await page.getByRole('dialog').getByRole('button', { name: /Open as new project/ }).click(); // a picture over a drawing asks first
  await expect.poll(() => store(page, 'project', (p) => p.filename)).toBe('tall');
  await settled(page);
});

// The question answered by keys: Down and Up move between its choices and Cancel, and Enter presses the one with focus.
// On the start screen they move between its buttons, and go no further: no tab is chosen.
test('New project asks when there are changes, then clears the document; Up and Down move between the question\'s choices, and the start screen\'s buttons', async ({ page }) => {
  await openApp(page);
  await page.getByRole('combobox', { name: 'Color palette' }).selectOption('cga'); // a change
  await page.getByRole('button', { name: 'New project' }).click();
  const question = page.getByRole('dialog', { name: 'Start a new project?' });
  await expect(question.getByRole('button', { name: /Save project first/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(question.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(question.getByRole('button', { name: /Start without saving/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => store(page, 'project', (p) => p.image)).toBe(null);
  const noTab = () => expect(page.locator('.tab-list').getByRole('tab', { selected: true })).toHaveCount(0); // the start screen, no tab
  await noTab();

  const open = page.getByRole('button', { name: /^Resume / }); // the drawing just left, under Pick up where you left off
  await expect(open).toBeEnabled(); // the list comes a moment after the start screen: a Down before it has nowhere to go
  await page.getByRole('button', { name: 'Choose a file' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Start with a blank canvas' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(open).toBeFocused();
  await noTab();
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

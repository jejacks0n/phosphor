// Plugins through the whole page: a manifest installed with the real file chooser, its theme there before the app's
// script runs after a reload, the plugins=off address, a kept copy of a theme that's damaged, Outlines (the example
// solver) installed from its folder and its zip, drawing, kept over a reload, and missed by a browser without it, and
// the examples of a brush, a shape and a filter (Smear, Superformula, Aberration) installed from the Marketplace and used.
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test, expect, openApp, pickLayer, settled, autosaved, store, saveAs, imageInput, otherBrowser, tab, drag, screenPixels } from './support.js';

const MANIFEST = fileURLToPath(new URL('../../plugins/midnight/phosphor-plugin.json', import.meta.url));
const OUTLINES = fileURLToPath(new URL('../../plugins/outlines', import.meta.url));
const OUTLINES_ZIP = fileURLToPath(new URL('../fixtures/plugins/outlines.zip', import.meta.url));
const MIDNIGHT = 'plugin:phosphor.midnight/midnight';
const theme = (page) => page.locator('html').getAttribute('data-theme');
const background = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const pluginThemes = (page) => page.getByRole('combobox', { name: 'Plugin themes' });
const dialog = (page) => page.getByRole('dialog');
const installedTab = (page) => dialog(page).getByRole('tab', { name: /^Installed/ }).click(); // the file buttons live there

async function installMidnight(page) {
  await page.getByRole('button', { name: 'Plugins', exact: true }).click();
  await installedTab(page);
  const chooser = page.waitForEvent('filechooser');
  await dialog(page).getByRole('button', { name: 'Install from a file…' }).click();
  await (await chooser).setFiles(MANIFEST);
  await expect(dialog(page).getByRole('heading', { name: 'Install Midnight 1.2.0?' })).toBeVisible();
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
  await installedTab(page);
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
  await installedTab(page);
  const chooser = page.waitForEvent('filechooser');
  await dialog(page).getByRole('button', { name: from === 'folder' ? 'Install from a folder…' : 'Install from a file…' }).click();
  await (await chooser).setFiles(from === 'folder' ? OUTLINES : OUTLINES_ZIP);
  const title = replaces ? 'Replace Outlines 1.0.2 with 1.0.2?' : 'Install Outlines 1.0.2?';
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
  const file = await readFile(await (await saveAs(page, 'Save project (.pho)')).path());
  await charChoice(page).selectOption('shape');
  await expect.poll(() => middleColumn(page)).not.toContain('-');
  await settled(page);
  const byShape = await middleColumn(page);

  const other = await (await otherBrowser(browser)).newPage();
  await other.goto('/');
  await imageInput(other).setInputFiles({ name: 'square.pho', mimeType: 'image/png', buffer: file });
  await settled(other);
  await pickLayer(other, 'Base');
  await expect(other.locator('aside.control-panel').getByText("Outlines isn't installed. Showing By shape.")).toBeVisible(); // its name kept with the drawing
  await expect(charChoice(other).locator('option:checked')).toHaveText('Outlines (not here)');
  expect(await middleColumn(other)).toBe(byShape);
  await other.context().close();
});

// The marketplace: the list at /plugins.json and a listed plugin's files from raw GitHub, both answered here.
const FIXTURES = new URL('../fixtures/', import.meta.url);
const LIST = JSON.parse(await readFile(new URL('plugin-list.json', FIXTURES), 'utf8'));
const OUTLINES_MANIFEST = await readFile(new URL('../../plugins/outlines/phosphor-plugin.json', import.meta.url), 'utf8');
const RAW = 'https://raw.githubusercontent.com/';
const SHA = '0123456789abcdef0123456789abcdef01234567';
const FILES = {
  [`jejacks0n/phosphor/${SHA}/plugins/outlines/phosphor-plugin.json`]: OUTLINES_MANIFEST,
  [`jejacks0n/phosphor/${SHA}/plugins/outlines/outlines.js`]: await readFile(new URL('../../plugins/outlines/outlines.js', import.meta.url), 'utf8'),
  [`jejacks0n/phosphor/${SHA}/plugins/midnight/phosphor-plugin.json`]: await readFile(MANIFEST, 'utf8'),
  [`kim/phosphor-fog/${SHA}/phosphor-plugin.json`]: await readFile(new URL('plugins/fog/phosphor-plugin.json', FIXTURES), 'utf8'),
};
// The three examples of a brush, a shape and a filter, each its folder's manifest and script, as the list has them.
for (const [folder, script] of [['smear', 'smear.js'], ['superformula', 'superformula.js'], ['aberration', 'aberration.js']]) {
  for (const file of ['phosphor-plugin.json', script]) {
    FILES[`jejacks0n/phosphor/${SHA}/plugins/${folder}/${file}`] = await readFile(new URL(`../../plugins/${folder}/${file}`, import.meta.url), 'utf8');
  }
}
async function routeMarket(page, list = () => LIST, files = FILES) {
  await page.route('**/plugins.json', (route) => route.fulfill({ json: list() }));
  await page.route(`${RAW}**`, (route) => {
    const body = files[route.request().url().slice(RAW.length)];
    return body === undefined ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ body, contentType: 'text/plain' });
  });
}
const openPlugins = (page) => page.getByRole('button', { name: 'Plugins', exact: true }).click();

test('Outlines is found in the Marketplace, installed as Official and draws', async ({ page }) => {
  await routeMarket(page);
  await openApp(page, 'images/square.png');
  await pickLayer(page, 'Base');
  await openPlugins(page);
  await expect(dialog(page).getByRole('tab', { name: 'Marketplace' })).toHaveAttribute('aria-selected', 'true');
  await dialog(page).getByPlaceholder('Search plugins').fill('out');
  await expect(dialog(page).getByRole('link', { name: 'Midnight' })).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Install', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Install Outlines 1.0.2?' })).toBeVisible();
  await expect(page.getByText('Official', { exact: true })).toBeVisible(); // the question says where it comes from
  await dialog(page).getByRole('button', { name: /^Install Adds a script/ }).click();
  await installedTab(page);
  await expect(dialog(page).getByRole('switch', { name: 'Outlines' })).toBeVisible();
  await expect(dialog(page).locator('span.badge', { hasText: 'Official' })).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await charChoice(page).selectOption({ label: 'Outlines' });
  await expect.poll(() => middleColumn(page)).toContain('-');
});

test('after a reload the dialog opens on Installed, and a higher listed version shows Update', async ({ page }) => {
  await routeMarket(page);
  await page.goto('/');
  await openPlugins(page);
  await dialog(page).getByPlaceholder('Search plugins').fill('midnight');
  await dialog(page).getByRole('button', { name: 'Install', exact: true }).click();
  await dialog(page).getByRole('button', { name: /^Install Adds 1 theme/ }).click();
  await installedTab(page);
  await expect(dialog(page).getByRole('switch', { name: 'Midnight' })).toBeVisible();

  const manifest = JSON.stringify({ ...JSON.parse(await readFile(MANIFEST, 'utf8')), version: '1.3.0' }, null, 2) + '\n';
  const newer = JSON.parse(JSON.stringify(LIST));
  const entry = newer.plugins.find((p) => p.manifest.id === 'phosphor.midnight');
  entry.manifest.version = '1.3.0';
  entry.manifestHash = createHash('sha256').update(manifest).digest('hex');
  await page.unroute('**/plugins.json');
  await page.unroute(`${RAW}**`);
  await routeMarket(page, () => newer, { ...FILES, [`jejacks0n/phosphor/${SHA}/plugins/midnight/phosphor-plugin.json`]: manifest });

  await page.reload();
  await openPlugins(page);
  await expect(dialog(page).getByRole('tab', { name: /^Installed/ })).toHaveAttribute('aria-selected', 'true');
  await dialog(page).getByRole('button', { name: 'Update Midnight' }).click();
  await expect(dialog(page).getByRole('heading', { name: 'Replace Midnight 1.2.0 with 1.3.0?' })).toBeVisible();
});

test('on a phone the Plugins dialog fills the window and × closes it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routeMarket(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle settings' }).click();
  await openPlugins(page);
  const box = await dialog(page).boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await expect(dialog(page)).toHaveCount(0);
});

// The autosave record's editedAt for the open document (0 before its first write): when the write that's there began,
// which is before it reads the drawing, so a write that began after a change holds it.
const editedAt = (page) => store(page, 'project', (p) => p.documentId).then((id) => page.evaluate((id) => new Promise((resolve, reject) => {
  const open = indexedDB.open('phosphor-autosave', 1);
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const get = db.transaction('documents').objectStore('documents').get(id);
    get.onsuccess = () => { db.close(); resolve(get.result?.editedAt ?? 0); };
  };
}), id));

test('Smear, Superformula and Aberration install from the Marketplace: Smear paints, Superformula draws, and Aberration is kept over a reload', async ({ page }) => {
  await routeMarket(page);
  await openApp(page, 'images/square.png'); // a black square on white: hard edges for Smear to drag across
  await openPlugins(page);
  for (const name of ['Smear', 'Superformula', 'Aberration']) {
    await dialog(page).getByPlaceholder('Search plugins').fill(name.toLowerCase());
    await dialog(page).getByRole('button', { name: 'Install', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Install ${name} ${{ Smear: '1.0.4', Superformula: '1.0.3', Aberration: '1.0.0' }[name]}?` })).toBeVisible();
    await dialog(page).getByRole('button', { name: /^Install Adds a script/ }).click();
    await expect(dialog(page).getByRole('button', { name: 'Installed', exact: true })).toBeVisible();
  }
  await dialog(page).getByRole('button', { name: 'Close' }).click();

  // Smear, by its key, on PIXEL: a drag across the square's edges smudges what shows under it.
  await tab(page, 'PIXEL').click();
  await page.keyboard.press('j');
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('plugin:phosphor.smear/smear');
  const box = await page.locator('.pixel-display').boundingBox();
  const strip = { x: Math.floor(box.x), y: Math.floor(box.y + box.height / 2) - 4, width: Math.floor(box.width), height: 8 };
  const offCanvas = () => page.mouse.move(box.x + box.width / 2, box.y + box.height + 40); // no brush circle in the strip
  await offCanvas();
  const before = await screenPixels(page, strip);
  await drag(page, { x: box.x + box.width * 0.05, y: box.y + box.height / 2 }, { x: box.x + box.width * 0.95, y: box.y + box.height / 2 });
  await offCanvas();
  await settled(page);
  await expect.poll(async () => (await screenPixels(page, strip)).some((v, i) => v !== before[i])).toBe(true);
  expect(await store(page, 'project', (p) => p.canUndo)).toBe(true);

  // Superformula, in the Shape tool's row on VECTOR: one drag, one path of its 120 corners.
  await pickLayer(page); // Vector 1, added: the tabs go to VECTOR
  await page.keyboard.press('u');
  await page.getByRole('button', { name: 'Superformula (Superformula)', exact: true }).click();
  const display = await page.locator('.ansi-editor .display').boundingBox();
  await drag(page, { x: display.x + display.width * 0.3, y: display.y + display.height * 0.3 }, { x: display.x + display.width * 0.7, y: display.y + display.height * 0.7 });
  expect(await store(page, 'project', (p) => [...p.shapes.values()].map((shape) => shape.points.length))).toEqual([120]);

  // Aberration's group, with the base picked: Distance to 3, written by autosave, and there again after a reload.
  await pickLayer(page, 'Base');
  const group = page.locator('aside.control-panel fieldset.plugin-filter').filter({ hasText: 'Aberration' });
  await expect(group.locator('legend')).toContainText('Plugin');
  const distance = group.getByLabel('Distance', { exact: true });
  await distance.focus();
  for (let i = 0; i < 3; i++) await distance.press('ArrowRight');
  await expect.poll(() => store(page, 'project', (p) => p.filterOptions))
    .toEqual({ 'plugin:phosphor.aberration/aberration': { name: 'Aberration', values: { distance: 3 } } });
  const changed = await page.evaluate(() => Date.now()); // the Distance change is in: a write that begins from now holds it
  await expect.poll(() => editedAt(page)).toBeGreaterThanOrEqual(changed);

  await page.reload();
  await settled(page);
  await pickLayer(page, 'Base');
  await expect(group.locator('legend')).toContainText('Aberration');
  await expect(group.getByLabel('Distance', { exact: true })).toHaveValue('3');
  expect(await store(page, 'project', (p) => p.processParams.pluginFilters.map(({ ref }) => ref))).toEqual(['plugin:phosphor.aberration/aberration']);
});

import { test, expect } from './support.js';
import { readFile } from 'node:fs/promises';
import { openApp, store, settled, editAt, saveAs } from './support.js';
import { AnsiFile } from '../../src/lib/AnsiFile.js';
import { readSauce } from '../support/sauce.js';
import { replay, terminalGrid } from '../support/terminal.js';

// The art before SAUCE's end-of-file marker.
const art = (bytes) => bytes.subarray(0, bytes.indexOf(0x1a));

for (const ext of ['ans', 'utf8ans']) {
  test(`export .${ext}: the download is the store's cells, byte for byte`, async ({ page }) => {
    await openApp(page);
    await editAt(page, 2, 2);
    await page.keyboard.insertText(ext === 'ans' ? 'Hé ░▒▓' : 'Hé 漢字 👍🏽');
    await settled(page);
    const { cols, rows, cells, quantize } = await store(page, 'project', (p) => ({ cols: p.cols, rows: Math.ceil(p.rows / 2), cells: p.cells, quantize: p.quantize }));

    // The default characters and the typed ones are all CP437: nothing to replace.
    await page.getByRole('button', { name: `Export .${ext}` }).click();
    await expect(page.getByRole('dialog').getByRole('list', { name: 'Replacements' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    const download = await saveAs(page, `Export .${ext}`);
    expect(download.suggestedFilename()).toMatch(new RegExp(`^gradient-\\d{8}-\\d{6}\\.${ext}$`));
    const bytes = new Uint8Array(await readFile(await download.path()));
    const expected = new Uint8Array(await new AnsiFile(cols, rows, cells).toBlob({ utf8: ext === 'utf8ans', colorMode: quantize }).arrayBuffer());
    expect(Buffer.from(art(bytes)).equals(Buffer.from(art(expected)))).toBe(true);
    const sauce = readSauce(bytes);
    expect([sauce.width, sauce.height]).toEqual([cols, rows]);
    if (ext === 'utf8ans') expect(terminalGrid(bytes, cols)[2].slice(2, 10)).toEqual(['H', 'é', ' ', '漢', '', '字', '', ' ']);
  });
}

test('comments stop at what a SAUCE record holds, so a room\'s artists can always take them', async ({ page }) => {
  await openApp(page);
  await page.getByRole('tab', { name: /sauce/i }).click();
  await page.locator('#sauce-comments').click();
  await page.keyboard.insertText('x'.repeat(255 * 65 + 10));
  expect((await page.locator('#sauce-comments').inputValue()).length).toBe(255 * 65);
});

test('the animated export appears with frames, warns above 80x25 and downloads an .ans', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('button', { name: 'Export animated .ans' })).toHaveCount(0);
  await page.getByRole('switch', { name: 'Animate' }).check();
  const bar = page.getByRole('toolbar', { name: 'Animation' });
  await bar.getByRole('button', { name: '+ Frame' }).click();
  await page.getByRole('button', { name: /^Wipe/ }).click();

  await page.getByRole('button', { name: 'Export animated .ans' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Timing is lost');
  await expect(dialog).toContainText('rows past the terminal');
  await page.keyboard.press('Escape');

  const download = await saveAs(page, 'Export animated .ans');
  expect(download.suggestedFilename()).toMatch(/\.ans$/);
  const bytes = new Uint8Array(await readFile(await download.path()));
  const sauce = readSauce(bytes);
  expect(sauce.fileType).toBe(2);
  const { cols, rows } = await store(page, 'project', (p) => ({ cols: p.cols, rows: Math.ceil(p.rows / 2) }));
  expect([sauce.width, sauce.height]).toEqual([cols, rows]);
  expect(replay(bytes, cols, rows, { utf8: false }).clears).toBe(1);
});

test('at 80x25 or smaller the export says nothing about rows past the terminal', async ({ page }) => {
  await openApp(page);
  await page.getByRole('switch', { name: 'Animate' }).check();
  await page.getByRole('toolbar', { name: 'Animation' }).getByRole('button', { name: '+ Frame' }).click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.evaluate(() => {
    const p = document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia._s.get('project');
    p.cols = 80;
    p.rows = 50;
  });
  await page.getByRole('button', { name: 'Export animated .ans' }).click();
  await expect(page.getByRole('dialog')).not.toContainText('rows past the terminal');
});

test('a character on a frame not showing is listed before an animated .ans is written', async ({ page }) => {
  await openApp(page);
  await page.getByRole('switch', { name: 'Animate' }).check();
  await page.getByRole('toolbar', { name: 'Animation' }).getByRole('button', { name: '+ Frame' }).click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await editAt(page, 2, 2);
  await page.keyboard.insertText('漢');
  await page.getByRole('slider', { name: 'Frame' }).fill('0');
  await page.getByRole('button', { name: 'Export animated .ans' }).click();
  await expect(page.getByRole('dialog').getByRole('list', { name: 'Replacements' })).toContainText('漢');
});

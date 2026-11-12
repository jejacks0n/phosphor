import { readFile } from 'node:fs/promises';
import { test, expect, openApp, store, settled, editAt } from './support.js';
import { AnsiFile } from '../../src/lib/AnsiFile.js';
import { readSauce } from '../support/sauce.js';
import { replay, terminalGrid } from '../support/terminal.js';

// The art before SAUCE's end-of-file marker.
const art = (bytes) => bytes.subarray(0, bytes.indexOf(0x1a));

// Open the Export modal and select a format by its display name in the left list.
async function openExportModal(page, formatName) {
  await page.getByRole('button', { name: 'Export…' }).click();
  const modal = page.getByRole('dialog');
  if (formatName) await modal.getByRole('button', { name: new RegExp(`^${formatName}`) }).click();
  return modal;
}

test('export .ans, then .utf8ans: each download is the store\'s cells, byte for byte', async ({ page }) => {
  await openApp(page);
  for (const ext of ['ans', 'utf8ans']) {
    await editAt(page, 2, 2);
    await page.keyboard.insertText(ext === 'ans' ? 'Hé ░▒▓' : 'Hé 漢字 👍🏽');
    await page.keyboard.press('Escape');
    await settled(page);
    const { cols, rows, cells, quantize } = await store(page, 'project', (p) => ({ cols: p.cols, rows: Math.ceil(p.rows / 2), cells: p.cells, quantize: p.quantize }));

    // The default characters and the typed ones are all CP437: nothing to replace.
    const formatName = ext === 'utf8ans' ? 'UTF-8 ANS' : 'ANS';
    const modal = await openExportModal(page, ext === 'utf8ans' ? 'UTF-8 ANS' : null);
    await expect(modal.getByRole('list', { name: 'Replacements' })).toHaveCount(0);
    const [download] = await Promise.all([page.waitForEvent('download'), modal.getByRole('button', { name: new RegExp(`^Export ${formatName}`) }).click()]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`^gradient-\\d{8}-\\d{6}\\.${ext}$`));
    const bytes = new Uint8Array(await readFile(await download.path()));
    const expected = new Uint8Array(await new AnsiFile(cols, rows, cells).toBlob({ utf8: ext === 'utf8ans', colorMode: quantize }).arrayBuffer());
    expect(Buffer.from(art(bytes)).equals(Buffer.from(art(expected)))).toBe(true);
    const sauce = readSauce(bytes);
    expect([sauce.width, sauce.height]).toEqual([cols, rows]);
    if (ext === 'utf8ans') expect(terminalGrid(bytes, cols)[2].slice(2, 10)).toEqual(['H', 'é', ' ', '漢', '', '字', '', ' ']);
  }
});

test('comments stop at what a SAUCE record holds, so a room\'s artists can always take them', async ({ page }) => {
  await openApp(page);
  await page.getByRole('tab', { name: /sauce/i }).click();
  await page.locator('#sauce-comments').click();
  await expect(page.locator('#sauce-comments')).toHaveAttribute('maxlength', String(255 * 65));
  await page.keyboard.insertText('x'.repeat(10));
  await expect(page.locator('#sauce-comments')).toHaveValue('x'.repeat(10)); // the field takes typing
});

test('the animated export warns above 80x25 and downloads an .ans', async ({ page }) => {
  await openApp(page);
  await page.getByRole('switch', { name: 'Animate' }).check();
  const bar = page.getByRole('toolbar', { name: 'Animation' });
  await bar.getByRole('button', { name: 'Add frame' }).click();
  await page.getByRole('button', { name: /^Wipe/ }).click();

  const modal = await openExportModal(page, 'Animated ANS');
  await expect(modal).toContainText('baud rate');
  await expect(modal).toContainText('clipped during playback');

  const [download] = await Promise.all([page.waitForEvent('download'), modal.getByRole('button', { name: /^Export Animated ANS/ }).click()]);
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
  await page.getByRole('toolbar', { name: 'Animation' }).getByRole('button', { name: 'Add frame' }).click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.evaluate(() => {
    const p = document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia._s.get('project');
    p.cols = 80;
    p.rows = 50;
  });
  const modal = await openExportModal(page, 'Animated ANS');
  await expect(modal).not.toContainText('clipped during playback');
  await page.keyboard.press('Escape');
});

test('an animated .utf8ans keeps every character, warns above 80x25, and lists nothing to replace; an animated .ans lists a character on a frame not showing', async ({ page }) => {
  await openApp(page);
  await page.getByRole('switch', { name: 'Animate' }).check();
  await page.getByRole('toolbar', { name: 'Animation' }).getByRole('button', { name: 'Add frame' }).click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await editAt(page, 2, 2);
  await page.keyboard.insertText('漢');
  await settled(page);

  const modal = await openExportModal(page, 'Animated UTF-8 ANS');
  await expect(modal).toContainText('clipped during playback');
  await expect(modal.getByRole('list', { name: 'Replacements' })).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent('download'), modal.getByRole('button', { name: /^Export Animated UTF-8 ANS/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.utf8ans$/);
  const bytes = new Uint8Array(await readFile(await download.path()));
  expect(readSauce(bytes).fileType).toBe(2);
  const { cols, rows } = await store(page, 'project', (p) => ({ cols: p.cols, rows: Math.ceil(p.rows / 2) }));
  const played = replay(bytes, cols, rows, { utf8: true });
  expect(played.clears).toBe(1);
  expect(played.grid[2 * cols + 2].char).toBe('漢');

  await page.getByRole('slider', { name: 'Frame' }).fill('0');
  const modal2 = await openExportModal(page, 'Animated ANS');
  await expect(modal2.getByRole('list', { name: 'Replacements' })).toContainText('漢');
});

test('a .cast download holds a frame per event at its time, and a .gif download is a GIF', async ({ page }) => {
  await openApp(page);
  await page.getByRole('switch', { name: 'Animate' }).check();
  const bar = page.getByRole('toolbar', { name: 'Animation' });
  await bar.getByRole('button', { name: 'Add frame' }).click();
  await page.getByRole('button', { name: /^Wipe/ }).click();
  await bar.getByRole('spinbutton', { name: 'Hold' }).fill('2');
  await bar.getByRole('spinbutton', { name: 'Hold' }).blur();

  const modal = await openExportModal(page, 'Cast');
  const [download] = await Promise.all([page.waitForEvent('download'), modal.getByRole('button', { name: /^Export Cast/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.cast$/);
  const lines = (await readFile(await download.path(), 'utf8')).trimEnd().split('\n').map((line) => JSON.parse(line));
  const { cols, rows } = await store(page, 'project', (p) => ({ cols: p.cols, rows: Math.ceil(p.rows / 2) }));
  expect(lines[0]).toMatchObject({ version: 2, width: cols, height: rows });
  expect(lines.slice(1).map(([t]) => t)).toEqual([0, 0.125, 2.125]);

  const modal2 = await openExportModal(page, 'GIF');
  const [gif] = await Promise.all([page.waitForEvent('download'), modal2.getByRole('button', { name: /^Export GIF/ }).click()]);
  expect(gif.suggestedFilename()).toMatch(/\.gif$/);
  const bytes = await readFile(await gif.path());
  expect(bytes.subarray(0, 6).toString()).toBe('GIF89a');
  expect(bytes.at(-1)).toBe(0x3b);
});


// A PNG's width, height and color type, from its IHDR.
const pngHeader = (bytes) => ({ signature: [...bytes.subarray(0, 8)], width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] });
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test('Export .png: the modal shows a smooth/hard toggle when smooth text is on; each download is a PNG of the grid', async ({ page }) => {
  await openApp(page);
  const modal = await openExportModal(page, 'PNG');
  await expect(modal).toContainText('Text rendering');
  await modal.getByRole('button', { name: /^Smooth/ }).click();
  const [smooth] = await Promise.all([page.waitForEvent('download'), modal.getByRole('button', { name: /^Export PNG/ }).click()]);
  expect(smooth.suggestedFilename()).toMatch(/^gradient-\d{8}-\d{6}\.png$/);
  const smoothHeader = pngHeader(await readFile(await smooth.path()));
  expect(smoothHeader.signature).toEqual(PNG_SIGNATURE);

  await page.getByRole('button', { name: 'Smooth', exact: true }).click(); // the status bar's: turn smooth text off
  const modal2 = await openExportModal(page, 'PNG');
  await expect(modal2).not.toContainText('Text rendering'); // no toggle when smooth text is off
  const [hard] = await Promise.all([page.waitForEvent('download'), modal2.getByRole('button', { name: /^Export PNG/ }).click()]);
  const hardHeader = pngHeader(await readFile(await hard.path()));
  expect(hardHeader.signature).toEqual(PNG_SIGNATURE);
  expect([hardHeader.width, hardHeader.height]).toEqual([smoothHeader.width, smoothHeader.height]);
  const { cols, rows } = await store(page, 'project', (p) => ({ cols: p.cols, rows: Math.ceil(p.rows / 2) }));
  expect(hardHeader.width % cols).toBe(0); // a whole number of font pixels a cell
  expect(hardHeader.height % rows).toBe(0);
});

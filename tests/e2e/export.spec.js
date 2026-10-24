import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openApp, store, settled, editAt, saveAs } from './support.js';
import { AnsiFile } from '../../src/lib/AnsiFile.js';
import { readSauce } from '../support/sauce.js';
import { terminalGrid } from '../support/terminal.js';

// The art before SAUCE's end-of-file marker.
const art = (bytes) => bytes.subarray(0, bytes.indexOf(0x1a));

for (const ext of ['ans', 'utf8ans']) {
  test(`export .${ext}: the download is the store's cells, byte for byte`, async ({ page }) => {
    await openApp(page);
    await editAt(page, 2, 2);
    await page.keyboard.insertText(ext === 'ans' ? 'Hé ░▒▓' : 'Hé 漢字 👍🏽');
    await settled(page);
    const { cols, rows, cells, quantize } = await store(page, 'project', (p) => ({ cols: p.cols, rows: Math.ceil(p.rows / 2), cells: p.cells, quantize: p.quantize }));

    // The default characters include ▁▂▃▅, which CP437 lacks: the .ans dialog lists what they become.
    await page.getByRole('button', { name: `Export .${ext}` }).click();
    const replacements = page.getByRole('dialog').getByRole('list', { name: 'Replacements' });
    if (ext === 'ans') await expect(replacements.getByRole('listitem').filter({ hasText: '▅' })).toHaveText(/▅\s*→\s*▄\s*\d+ cells?/);
    else await expect(replacements).toHaveCount(0);
    await page.keyboard.press('Escape');
    const download = await saveAs(page, `Export .${ext}`);
    expect(download.suggestedFilename()).toBe(`gradient.${ext}`);
    const bytes = new Uint8Array(await readFile(await download.path()));
    const expected = new Uint8Array(await new AnsiFile(cols, rows, cells).toBlob({ utf8: ext === 'utf8ans', colorMode: quantize }).arrayBuffer());
    expect(Buffer.from(art(bytes)).equals(Buffer.from(art(expected)))).toBe(true);
    const sauce = readSauce(bytes);
    expect([sauce.width, sauce.height]).toEqual([cols, rows]);
    if (ext === 'utf8ans') expect(terminalGrid(bytes, cols)[2].slice(2, 10)).toEqual(['H', 'é', ' ', '漢', '', '字', '', ' ']);
  });
}

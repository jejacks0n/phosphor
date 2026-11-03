import { readFileSync } from 'node:fs';
import { test, expect } from './support.js';
import { openApp, store, cellPoint, drag, chars, editAt, fixture } from './support.js';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function select(page, c0, r0, c1, r1) {
  await drag(page, await cellPoint(page, c0, r0), await cellPoint(page, c1, r1));
  await expect.poll(() => store(page, 'workspace', (w) => w.selection)).toEqual({ c0, r0, c1, r1 });
}

test('copy and paste a block, then paste text copied elsewhere', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.keyboard.type('Copy me');
  await page.getByRole('button', { name: 'Select', exact: true }).click();

  await select(page, 2, 2, 8, 3);
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`Copy me\n${await chars(page, 3, 2, 8)}`);

  await select(page, 20, 10, 21, 11);
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => chars(page, 10, 20, 26)).toBe('Copy me');
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 20, r0: 10, c1: 26, r1: 11 });

  await page.evaluate(() => navigator.clipboard.writeText('from elsewhere'));
  await select(page, 10, 20, 11, 21);
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => chars(page, 20, 10, 23)).toBe('from elsewhere');
});

// Whole rows' colors, cols c0..c1: what a block pasted from elsewhere must show.
const colors = (page, row, c0, c1) => store(page, 'project', `(p) => p.cells.slice(${row} * p.cols + ${c0}, ${row} * p.cols + ${c1} + 1).map((c) => c.fg.hex + c.bg.hex)`);

test('with nothing copied in this tab, the Paste button says to use the shortcut', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await select(page, 2, 2, 4, 3);
  const paste = page.getByRole('button', { name: /^Nothing copied in this tab\. To paste from another tab or app, use (⌘V|Ctrl\+V)$/ });
  await expect(paste).toBeDisabled();
  await page.keyboard.press('ControlOrMeta+c');
  await expect(page.getByRole('button', { name: 'Paste what you copied in Phosphor, at the selection' })).toBeEnabled();
});

test('a block copied in one tab pastes into another with its colors', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.evaluate(() => { document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia._s.get('workspace').editFgColor = '#ff3300'; });
  await page.keyboard.type('Red ink');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await select(page, 2, 2, 8, 3);
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Red ink');
  const copied = [await colors(page, 2, 2, 8), await colors(page, 3, 2, 8)];
  expect(copied[0][0]).toMatch(/^#ff3300/);

  const other = await page.context().newPage();
  await openApp(other);
  await other.getByRole('button', { name: 'Select', exact: true }).click();
  await select(other, 20, 10, 21, 11);
  await other.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => chars(other, 10, 20, 26)).toBe('Red ink');
  expect([await colors(other, 10, 20, 26), await colors(other, 11, 20, 26)]).toEqual(copied);
  expect(await store(other, 'workspace', (w) => w.selection)).toEqual({ c0: 20, r0: 10, c1: 26, r1: 11 });
});

for (const [name, lime] of [['moebius-16-colors', false], ['moebius-24-bit', true]]) {
  test(`a block copied in Moebius pastes with its colors (${name})`, async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await select(page, 5, 5, 6, 6);
    const html = readFileSync(fixture(`clipboard/${name}.html`), 'utf8');
    await page.evaluate((html) => navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob(['123456\r\n123456'], { type: 'text/plain' }),
    })]), html);
    await page.keyboard.press('ControlOrMeta+v');
    await expect.poll(() => chars(page, 5, 5, 10)).toBe('123456');
    expect(await chars(page, 6, 5, 10)).toBe('123456');
    const row = await colors(page, 5, 5, 10);
    expect(row.slice(0, 2)).toEqual(['#ff5555#000000', '#ff5555#aa0000']);
    expect(row[4]).toBe(lime ? '#87ff5f#000000' : '#5555ff#000000');
  });
}

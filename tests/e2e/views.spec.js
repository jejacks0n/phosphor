import { test, expect } from '@playwright/test';
import { openApp, store, editAt } from './support.js';

test('Canvas and DOM views: the DOM view\'s text is the cells\' characters', async ({ page }) => {
  await openApp(page);
  await editAt(page, 1, 1);
  await page.keyboard.insertText('漢字 ok');
  // The button names the view it switches to.
  await page.getByRole('button', { name: 'DOM', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Canvas', exact: true })).toBeVisible();
  await expect(page.locator('.ansi-editor pre.display')).toBeVisible();
  await expect(page.locator('.ansi-editor .display canvas')).toHaveCount(0);

  const expected = await store(page, 'project', (p) => Array.from({ length: Math.ceil(p.rows / 2) }, (_, r) => p.cells.slice(r * p.cols, (r + 1) * p.cols).filter((c) => c.wide !== 'trail').map((c) => c.char).join('')));
  await expect.poll(() => page.locator('.ansi-editor pre.display > span').allTextContents()).toEqual(expected);
  expect(expected[1].slice(1, 6)).toBe('漢字 ok'); // col 0 is the picture's

  await page.getByRole('button', { name: 'Canvas', exact: true }).click();
  await expect(page.locator('.ansi-editor .display canvas')).toBeVisible();
});

test('the DOM view keeps every character in its column, as a terminal does, even ones drawing wider', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.keyboard.insertText('a﷽bcdef漢g');   // ﷽ gets one column and draws about eleven; 漢 two
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('  a.bcdef..g'); // the same columns, plain
  await page.getByRole('button', { name: 'DOM', exact: true }).click();
  await expect(page.locator('.ansi-editor pre.display')).toBeVisible();
  // Each letter's left edge, row by row: the same column, the same place.
  const xs = await page.evaluate(() => {
    const rows = document.querySelectorAll('.ansi-editor pre.display > span');
    const leftOf = (row, letter) => {
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.data.indexOf(letter);
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + 1);
        return range.getBoundingClientRect().left;
      }
      return null;
    };
    return ['b', 'f', 'g'].map((letter) => [leftOf(rows[2], letter), leftOf(rows[3], letter)]);
  });
  for (const [withWide, plain] of xs) expect(Math.abs(withWide - plain)).toBeLessThan(0.5);
});

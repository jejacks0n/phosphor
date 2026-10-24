import { test, expect } from '@playwright/test';
import { openApp, store, cellPoint, drag, settled } from './support.js';

// Moving a selection with the mouse floats it until it's deselected: letting go and dragging again
// doesn't stamp it where it paused.
const row = (page, r) => store(page, 'project', `(p) => p.cells.slice(${r} * p.cols, ${r} * p.cols + 20).map((c) => c.char + c.fg.hex + c.bg.hex)`);

async function selectAndDragTwice(page) {
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await drag(page, await cellPoint(page, 2, 3), await cellPoint(page, 4, 4)); // a 3 x 2 block
  await drag(page, await cellPoint(page, 3, 3), await cellPoint(page, 6, 3)); // move it 3 right, let go
  await drag(page, await cellPoint(page, 6, 3), await cellPoint(page, 9, 3)); // and 3 more
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 8, r0: 3, c1: 10, r1: 4 });
  await settled(page); // the redraw after the second drag
}

test('two drags in a row: where it paused comes back', async ({ page }) => {
  await openApp(page);
  const before = await row(page, 3);
  await selectAndDragTwice(page);
  const after = await row(page, 3);
  expect(after.slice(5, 8)).toEqual(before.slice(5, 8)); // where it was let go the first time
  const colors = (cells) => cells.map((c) => c.slice(1)); // a picture cell's character comes from its position
  expect(colors(after.slice(8, 11))).toEqual(colors(before.slice(2, 5))); // the block, where it rests

  await page.keyboard.press('ControlOrMeta+z'); // the whole move is one step
  await settled(page);
  expect(await row(page, 3)).toEqual(before);
});

test('Escape leaves it where it is: a new drag of the same cells starts a new move', async ({ page }) => {
  await openApp(page);
  await selectAndDragTwice(page);
  await page.keyboard.press('Escape');
  const stamped = await row(page, 3);
  await drag(page, await cellPoint(page, 8, 3), await cellPoint(page, 10, 4)); // reselect it
  await drag(page, await cellPoint(page, 9, 3), await cellPoint(page, 13, 3)); // move it on
  await page.keyboard.press('ControlOrMeta+z'); // undoes only the new move
  await settled(page);
  expect(await row(page, 3)).toEqual(stamped);
});

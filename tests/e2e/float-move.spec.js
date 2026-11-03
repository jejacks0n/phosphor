import { test, expect } from './support.js';
import { openApp, store, cellPoint, drag, settled, editAt, chars } from './support.js';

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

test('the block follows the pointer while it is dragged, and the drag is one undo step', async ({ page }) => {
  await openApp(page);
  await editAt(page, 4, 4);
  await page.keyboard.type('AB');
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 4, 4), await cellPoint(page, 5, 4));
  const from = await cellPoint(page, 4, 4), mid = await cellPoint(page, 4, 7), to = await cellPoint(page, 9, 7);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y, { steps: 4 });
  await expect.poll(() => chars(page, 7, 4, 5)).toBe('AB'); // still dragging
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await expect.poll(() => chars(page, 7, 9, 10)).toBe('AB');
  expect(await chars(page, 7, 4, 5)).not.toBe('AB');
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => chars(page, 4, 4, 5)).toBe('AB');
});

// A paste and the drags after it are two undo steps, and undo or redo leaves the block floating.
test('a pasted block dragged away: undo puts it back where it was pasted, redo where it was dragged, and it still drags', async ({ page }) => {
  await openApp(page);
  await editAt(page, 4, 4);
  await page.keyboard.type('AB');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const select = async (c0, r0, c1, r1) => {
    await drag(page, await cellPoint(page, c0, r0), await cellPoint(page, c1, r1));
    await expect.poll(() => store(page, 'workspace', (w) => w.selection)).toEqual({ c0, r0, c1, r1 });
  };
  await select(4, 4, 5, 4);
  await page.keyboard.press('ControlOrMeta+c');
  await select(10, 8, 11, 8);
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => chars(page, 8, 10, 11)).toBe('AB');
  const under = await chars(page, 10, 10, 11);

  await drag(page, await cellPoint(page, 10, 8), await cellPoint(page, 10, 10));
  await expect.poll(() => chars(page, 10, 10, 11)).toBe('AB');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => chars(page, 8, 10, 11)).toBe('AB');
  expect(await chars(page, 10, 10, 11)).toBe(under);
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 10, r0: 8, c1: 11, r1: 8 });

  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => chars(page, 10, 10, 11)).toBe('AB');
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 10, r0: 10, c1: 11, r1: 10 });
  await drag(page, await cellPoint(page, 10, 10), await cellPoint(page, 13, 10)); // still floating
  await expect.poll(() => chars(page, 10, 13, 14)).toBe('AB');
  expect(await chars(page, 8, 10, 11)).not.toBe('AB');
});

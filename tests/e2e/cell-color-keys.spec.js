import { test, expect } from './support.js';
import { openApp, store, chars, editAt, cellPoint } from './support.js';

// The cell's colors by key on the page: Option+X (Alt+X, by its code) in Edit Mode flips the cursor's cell without typing
// Option's ≈, and Alt+U with a drawing tool takes the colors of the cell a real pointer is over, nothing once it leaves.
const workspace = (page, fn) => store(page, 'workspace', fn);
const cellColors = (page, col, row) => store(page, 'project', `(p) => { const c = p.cells[${row} * p.cols + ${col}]; return [c.fg.hex, c.bg.hex]; }`);

test('in Edit Mode Option+X flips the cursor\'s cell and types no ≈', async ({ page }) => {
  await openApp(page);
  await editAt(page, 4, 2);
  const [fg, bg] = await cellColors(page, 4, 2);
  expect(fg).not.toBe(bg);
  const before = await chars(page, 2, 0, 10);
  await page.evaluate(() => addEventListener('keydown', (e) => { // after the app's own
    if (e.code === 'KeyX') window.flipTaken = e.defaultPrevented;
  }));
  // A key that carries the Mac's Option character as its text, as a real Option+X does: typed unless it's taken.
  const cdp = await page.context().newCDPSession(page);
  const key = { modifiers: 1, key: '≈', code: 'KeyX', windowsVirtualKeyCode: 88 };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '≈', ...key });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
  expect(await page.evaluate(() => window.flipTaken)).toBe(true);
  await expect.poll(() => cellColors(page, 4, 2)).toEqual([bg, fg]);
  expect(await chars(page, 2, 0, 10)).toBe(before);
  expect(await workspace(page, (w) => w.textCursor)).toEqual({ col: 4, row: 2 });
});

test('with the Pencil, Alt+U takes the colors of the cell under the pointer, and nothing once it leaves the art', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Pencil' }).click();
  const under = await store(page, 'project', (p) => p.underlyingAt(30, 5));
  const at = await cellPoint(page, 30, 5);
  await page.mouse.move(at.x, at.y);
  await page.keyboard.press('Alt+KeyU');
  expect(await workspace(page, (w) => [w.editFgColor, w.editBgColor])).toEqual([under.fg, under.bg]);
  await workspace(page, (w) => { w.setColor('fg', '#123456'); });
  const box = await page.locator('.ansi-editor .display').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y - 60); // off the art, over the toolbar
  await page.keyboard.press('Alt+KeyU');
  expect(await workspace(page, (w) => w.editFgColor)).toBe('#123456');
});

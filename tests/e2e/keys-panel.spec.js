import { test, expect, openApp, store, tab, autosaved } from './support.js';

const animateSwitch = (page) => page.getByRole('switch', { name: 'Animate' });
const bar = (page) => page.getByRole('toolbar', { name: 'Animation' });
const addFrame = async (page, kind) => {
  await bar(page).getByRole('button', { name: 'Add frame' }).click();
  await page.getByRole('button', { name: new RegExp(`^${kind}`) }).click();
};
const scrubTo = (page, i) => bar(page).getByRole('slider', { name: 'Frame' }).fill(String(i));
const shown = (page) => bar(page).getByTestId('frame-indicator');
const panel = (page) => page.getByRole('region', { name: 'Keys' });
const keysButton = (page) => bar(page).getByRole('button', { name: 'Keys', exact: true });
const row = (page, part) => panel(page).locator(`[data-part="${part}"]`);
const diamond = (page, part, at) => row(page, part).locator(`button.key[data-at="${at}"]`);
const keyFrames = (page, part) => row(page, part).locator('button.key').evaluateAll((keys) => keys.map((k) => Number(k.dataset.at)));
const selected = (page) => panel(page).locator('button.key[aria-pressed="true"]');
const menuItem = (page, name) => page.locator('.dropdown-content').getByRole('button', { name, exact: true });
const y = (page, key, at) => store(page, 'project', `(p) => p.resolvedOf(${at}).get('${key}').cell.m[5]`);

// A ball on frame 1 of 7 Blank frames, moved down 24 on frame 7 and selected; more (frame to y) moves it on other
// frames too. Frame 4 shows.
async function ball(page, more = {}) {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await animateSwitch(page).check();
  const key = await store(page, 'project', (p) => p.addShape({ z: 0, closed: true, fill: '#ff0000', stroke: null, width: 1, m: [1, 0, 0, 1, 0, 0],
    points: [[2, 2, 0, 0, 0, 0, 0], [6, 2, 0, 0, 0, 0, 0], [6, 6, 0, 0, 0, 0, 0], [2, 6, 0, 0, 0, 0, 0]] }));
  for (let i = 0; i < 6; i++) await addFrame(page, 'Blank');
  for (const [at, to] of Object.entries({ 6: 24, ...more })) {
    await store(page, 'project', `(p) => { p.showFrame(${at}); p.updateShapes([['${key}', { ...p.shapes.get('${key}'), m: [1, 0, 0, 1, 0, ${to}] }]]); p.noteFrame(); }`);
  }
  await scrubTo(page, 3);
  await store(page, 'workspace', `(w) => { w.vectorSelected = ['${key}']; }`);
  return key;
}

test('the Keys button opens and folds the panel, and it stays as left across a reload', async ({ page }) => {
  await ball(page);
  await expect(panel(page)).toBeVisible();
  await expect(keysButton(page)).toHaveAttribute('aria-pressed', 'true');
  const box = await panel(page).boundingBox(), barBox = await bar(page).boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(barBox.y + 1); // just above the bar
  await keysButton(page).click();
  await expect(panel(page)).toBeHidden();
  await expect(keysButton(page)).toHaveAttribute('aria-pressed', 'false');
  await keysButton(page).click();
  await expect(panel(page)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Fold the keys away' }).click();
  await expect(panel(page)).toBeHidden();
  await autosaved(page);
  await page.reload();
  await expect(page.locator('.ansi-editor .display')).toBeVisible();
  await animateSwitch(page).check();
  await expect(keysButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(panel(page)).toBeHidden();
  await tab(page, 'ANSI').click();
  await expect(keysButton(page)).toHaveCount(0); // VECTOR's
});

test('only the parts that change are rows; + Add key offers the others and keys one on the frame showing', async ({ page }) => {
  const key = await ball(page);
  await expect(panel(page).locator('[data-part]')).toHaveCount(1);
  expect(await keyFrames(page, 'transform')).toEqual([0, 6]);
  await panel(page).locator('.add-key .dropdown-trigger').click();
  await expect(page.locator('.dropdown-content button')).toHaveText(['Outline', 'Fill', 'Stroke', 'Width', 'Style', 'Stack']);
  await menuItem(page, 'Fill').click();
  await expect(panel(page).locator('[data-part]')).toHaveCount(2);
  expect(await keyFrames(page, 'fill')).toEqual([0, 3]);
  expect(await store(page, 'project', `(p) => [...p.frames[3].parts.get('${key}')]`)).toEqual(['fill']);
});

test('clicking a diamond selects it and shows its frame; Shift-click adds one; empty lane deselects', async ({ page }) => {
  await ball(page);
  await diamond(page, 'transform', 6).click();
  await expect(diamond(page, 'transform', 6)).toHaveAttribute('aria-pressed', 'true');
  await expect(shown(page)).toHaveText('7 / 7');
  await diamond(page, 'transform', 0).click({ modifiers: ['Shift'] });
  await expect(selected(page)).toHaveCount(2);
  await diamond(page, 'transform', 0).click({ modifiers: ['Shift'] });
  await expect(selected(page)).toHaveCount(1);
  await diamond(page, 'transform', 0).click();
  await expect(selected(page)).toHaveCount(1);
  await expect(diamond(page, 'transform', 0)).toHaveAttribute('aria-pressed', 'true');
  await expect(shown(page)).toHaveText('1 / 7');
  const lane = row(page, 'transform').locator('.lane'), box = await lane.boundingBox();
  await lane.click({ position: { x: box.width / 2, y: 2 } });
  await expect(selected(page)).toHaveCount(0);
});

test('clicking a frame number selects every key on that frame', async ({ page }) => {
  const key = await ball(page);
  await store(page, 'project', `(p) => { p.addKey('${key}', 'transform'); p.addKey('${key}', 'fill'); }`);
  await panel(page).locator('button.frame[data-at="3"]').click();
  await expect(selected(page)).toHaveCount(2);
  await expect(diamond(page, 'transform', 3)).toHaveAttribute('aria-pressed', 'true');
  await expect(diamond(page, 'fill', 3)).toHaveAttribute('aria-pressed', 'true');
  await expect(diamond(page, 'transform', 0)).toHaveAttribute('aria-pressed', 'false');
});

test('easing from the top line eases the tween leaving the selected key; undo undoes it', async ({ page }) => {
  const key = await ball(page);
  const easing = panel(page).locator('.easing .dropdown-trigger');
  await expect(easing).toBeDisabled(); // nothing selected
  await diamond(page, 'transform', 6).click();
  await expect(easing).toBeDisabled(); // a last key: no tween leaves it
  await diamond(page, 'transform', 0).click();
  await expect(easing).toBeEnabled();
  await expect(easing).toHaveText('No tween');
  await easing.click();
  await menuItem(page, 'Ease in').click();
  await expect.poll(() => y(page, key, 3)).toBe(3);
  await expect(easing).toHaveText('Ease in');
  await expect(row(page, 'transform').locator('.tween')).toHaveCount(1);
  await expect(bar(page).locator('.scrubber-marks .tween')).toHaveCount(5);
  await expect(bar(page).locator('.scrubber-marks .band')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(bar(page).locator('.scrubber-marks .band')).toHaveCount(0);
  await expect.poll(() => y(page, key, 3)).toBe(0);
});

test('motion is off unless a Transform key is selected; By whole cells snaps the move, one undo step', async ({ page }) => {
  const key = await ball(page);
  await store(page, 'project', `(p) => p.addKey('${key}', 'fill')`);
  const motion = panel(page).locator('.motion .dropdown-trigger');
  await diamond(page, 'fill', 0).click();
  await expect(motion).toBeDisabled();
  await diamond(page, 'transform', 0).click();
  await expect(motion).toBeDisabled(); // no tween yet to move
  await panel(page).locator('.easing .dropdown-trigger').click();
  await menuItem(page, 'Ease in').click();
  await expect.poll(() => y(page, key, 3)).toBe(3); // half a cell down
  await expect(motion).toBeEnabled();
  await expect(motion).toHaveText('Smoothly');
  await motion.click();
  await menuItem(page, 'By whole cells').click();
  await expect.poll(() => y(page, key, 3)).toBe(4); // a whole cell
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => y(page, key, 3)).toBe(3);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => y(page, key, 3)).toBe(4);
  await expect(motion).toHaveText('By whole cells');
});

test('Delete, with focus in the panel, deletes the selected keys; the first key stays', async ({ page }) => {
  const key = await ball(page, { 3: 6 });
  expect(await keyFrames(page, 'transform')).toEqual([0, 3, 6]);
  await diamond(page, 'transform', 3).click();
  await page.keyboard.press('Delete');
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 6]);
  await diamond(page, 'transform', 0).click();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  expect(await keyFrames(page, 'transform')).toEqual([0, 6]);
  expect(await store(page, 'project', `(p) => p.shapes.has('${key}')`)).toBe(true); // the shape's still there
  await diamond(page, 'transform', 6).click();
  await panel(page).getByRole('button', { name: 'Delete keys' }).click();
  await expect(panel(page).locator('[data-part]')).toHaveCount(0); // it holds still now: no part changes
});

test("a row's ◇ keys the part on the frame showing; its lit ◆ deletes it", async ({ page }) => {
  await ball(page);
  const here = row(page, 'transform').getByRole('button', { name: 'Transform: key on this frame' });
  await expect(here).toHaveAttribute('aria-pressed', 'false');
  await expect(here).toHaveText('◇');
  await here.click();
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 3, 6]);
  await expect(here).toHaveAttribute('aria-pressed', 'true');
  await expect(here).toHaveText('◆');
  await here.click();
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 6]);
  await scrubTo(page, 0);
  await expect(here).toBeDisabled(); // the first key stays
});

test('◀ and ▶ step to the part\'s previous and next key', async ({ page }) => {
  await ball(page);
  const transform = row(page, 'transform');
  await transform.getByRole('button', { name: 'Transform: next key' }).click();
  await expect(shown(page)).toHaveText('7 / 7');
  await expect(transform.getByRole('button', { name: 'Transform: next key' })).toBeDisabled();
  await transform.getByRole('button', { name: 'Transform: previous key' }).click();
  await expect(shown(page)).toHaveText('1 / 7');
  await expect(transform.getByRole('button', { name: 'Transform: previous key' })).toBeDisabled();
});

test('undo after a delete leaves no stale key selected', async ({ page }) => {
  await ball(page);
  await row(page, 'transform').getByRole('button', { name: 'Transform: key on this frame' }).click(); // a key on frame 4
  await diamond(page, 'transform', 3).click();
  await page.keyboard.press('Delete');
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 6]);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 3, 6]);
  await diamond(page, 'transform', 3).click();
  await expect(selected(page)).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z'); // the key's add undone: it's gone, and so is its selection
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 6]);
  expect(await store(page, 'workspace', (w) => w.selectedKeys)).toEqual([]);
  await expect(panel(page).getByRole('button', { name: 'Delete keys' })).toBeDisabled();
});

test('with no shape selected the panel says so in one line', async ({ page }) => {
  await ball(page);
  await store(page, 'workspace', (w) => { w.vectorSelected = []; });
  await expect(panel(page)).toContainText('Select a shape to see its keys.');
  await expect(panel(page).locator('[data-part]')).toHaveCount(0);
});

test("there's no Tween button on the bar", async ({ page }) => {
  await ball(page);
  await expect(bar(page).getByRole('button', { name: /^Tween/ })).toHaveCount(0);
  await expect(keysButton(page)).toBeVisible();
});

test('a frame added, deleted or moved leaves no key selected, so Delete takes none the selection slid onto', async ({ page }) => {
  await ball(page, { 3: 6, 4: 12 });
  expect(await keyFrames(page, 'transform')).toEqual([0, 3, 4, 6]);
  await diamond(page, 'transform', 3).click();
  await scrubTo(page, 1);
  await bar(page).getByRole('button', { name: 'Frame actions' }).click();
  await page.getByRole('button', { name: 'Delete frame' }).click();
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 2, 3, 5]);
  await expect(selected(page)).toHaveCount(0); // not frame 4's key, now on the index frame 4 had
  await panel(page).focus();
  await page.keyboard.press('Delete');
  expect(await keyFrames(page, 'transform')).toEqual([0, 2, 3, 5]);
});

test('Escape closes the easing menu and nothing else: the shape stays selected, and undo undoes the easing', async ({ page }) => {
  const key = await ball(page);
  await diamond(page, 'transform', 0).click();
  const easing = panel(page).locator('.easing .dropdown-trigger');
  await easing.click();
  await expect(page.locator('.dropdown-content')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.dropdown-content')).toHaveCount(0);
  expect(await store(page, 'workspace', (w) => w.vectorSelected)).toEqual([key]);
  await expect(panel(page).locator('[data-part]')).toHaveCount(1);
  await expect(diamond(page, 'transform', 0)).toHaveAttribute('aria-pressed', 'true');
  await easing.click();
  await menuItem(page, 'Ease in').click();
  await expect.poll(() => y(page, key, 3)).toBe(3);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => y(page, key, 3)).toBe(0);
  await expect(easing).toHaveText('No tween');
});

test('typing X keys Transform on the frame showing; undo takes it back', async ({ page }) => {
  const key = await ball(page);
  expect(await keyFrames(page, 'transform')).toEqual([0, 6]);
  const field = row(page, 'transform').getByLabel(/^X:/);
  await field.fill('10');
  await field.press('Enter');
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 3, 6]);
  expect(await store(page, 'project', `(p) => p.shapes.get('${key}').m[4]`)).toBe(6); // the middle was 4
  await expect(field).toHaveValue('10');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 6]);
  await expect(field).toHaveValue('4');
});

test('a Fill chip opens the color box', async ({ page }) => {
  const key = await ball(page);
  await store(page, 'project', `(p) => p.addKey('${key}', 'fill')`);
  await row(page, 'fill').getByRole('button', { name: /^Fill color/ }).click();
  expect(await store(page, 'workspace', (w) => w.colorBox)).toBe('fg');
});

test('the Style row shows the cap and join of a shape with the default ones', async ({ page }) => {
  const key = await ball(page);
  await store(page, 'project', `(p) => p.addKey('${key}', 'style')`);
  await expect(row(page, 'style')).toContainText('Round cap · Round join');
});

test('retyping the value shown keys nothing and is no undo step', async ({ page }) => {
  await ball(page);
  const before = await store(page, 'project', (p) => p.historyVersion);
  const field = row(page, 'transform').getByLabel(/^X:/);
  await expect(field).toHaveValue('4');
  await field.fill('4');
  await field.press('Enter');
  expect(await keyFrames(page, 'transform')).toEqual([0, 6]);
  expect(await store(page, 'project', (p) => p.historyVersion)).toBe(before);
});

test('typing Width or W on an in-between frame keys only that part there', async ({ page }) => {
  const key = await ball(page);
  await store(page, 'project', `(p) => { p.showFrame(6); p.updateShapes([['${key}', { ...p.shapes.get('${key}'), width: 3 }]]); p.noteFrame(); p.showFrame(3); }`);
  const parts = () => store(page, 'project', `(p) => [...p.frames[3].parts?.get('${key}') ?? []]`);
  expect(await parts()).toEqual([]);
  const width = row(page, 'width').getByLabel(/^Stroke width/);
  await width.fill('5');
  await width.press('Enter');
  await expect.poll(parts).toEqual(['width']);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(parts).toEqual([]);
  const wide = row(page, 'transform').getByLabel(/^Width, as/);
  await wide.fill('150');
  await wide.press('Enter');
  await expect.poll(parts).toEqual(['transform']);
});

// Drags what's at locator along the lanes by frames (the mouse); with escape, Escape is pressed before letting go.
// during runs while the pointer's still down.
async function dragBy(page, locator, frames, { escape = false, during } = {}) {
  const [a, b] = await Promise.all([0, 1].map((n) => panel(page).locator('button.frame').nth(n).boundingBox())); // two frames side by side
  const box = await locator.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + frames * (b.x - a.x), y, { steps: 6 });
  await during?.();
  if (escape) await page.keyboard.press('Escape');
  await page.mouse.up();
}
const version = (page) => store(page, 'project', (p) => p.historyVersion);
const shows = (page, key, frames) => store(page, 'project', `(p) => ${JSON.stringify(frames)}.map((i) => !!p.resolvedOf(i).get('${key}')?.cell)`);

test('dragging a diamond moves the key; the tween stretches; one undo puts it back', async ({ page }) => {
  const key = await ball(page, { 3: 12 });
  await store(page, 'project', `(p) => p.setKeyEasing('${key}', [{ part: 'transform', at: 0 }], 'linear')`);
  expect(await y(page, key, 2)).toBe(8);
  const before = await version(page);
  await dragBy(page, diamond(page, 'transform', 3), 1, { during: () => expect.poll(() => y(page, key, 4)).toBe(12) }); // the canvas follows
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 4, 6]);
  await expect(diamond(page, 'transform', 4)).toHaveAttribute('aria-pressed', 'true');
  expect(await y(page, key, 2)).toBe(6); // 0 to 12 over four frames now
  expect(await version(page)).toBe(before + 1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 3, 6]);
  expect(await y(page, key, 2)).toBe(8);
});

test('dragging several selected keys keeps their spacing', async ({ page }) => {
  await ball(page, { 2: 6, 3: 12 });
  await diamond(page, 'transform', 2).click();
  await diamond(page, 'transform', 3).click({ modifiers: ['Shift'] });
  await dragBy(page, diamond(page, 'transform', 3), 2);
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 4, 5, 6]);
  await expect(selected(page)).toHaveCount(2);
  await expect(diamond(page, 'transform', 4)).toHaveAttribute('aria-pressed', 'true');
});

test('dragging a frame number drags every key on that frame', async ({ page }) => {
  const key = await ball(page);
  await store(page, 'project', `(p) => { p.addKey('${key}', 'transform'); p.addKey('${key}', 'fill'); }`);
  await dragBy(page, panel(page).locator('button.frame[data-at="3"]'), 1);
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 4, 6]);
  expect(await keyFrames(page, 'fill')).toEqual([0, 4]);
  await expect(selected(page)).toHaveCount(2);
});

test("dragging the first diamond moves when the shape appears; the frames it left don't show it", async ({ page }) => {
  const key = await ball(page);
  await diamond(page, 'transform', 0).click(); // frame 1 shows, which the shape is about to leave
  await dragBy(page, diamond(page, 'transform', 0), 2);
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([2, 6]);
  expect(await shows(page, key, [0, 1, 2])).toEqual([false, false, true]);
  expect(await store(page, 'workspace', (w) => w.vectorSelected)).toEqual([key]); // still selected, on the frame it begins
  await expect(shown(page)).toHaveText('3 / 7');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 6]);
  expect(await shows(page, key, [0, 1, 2])).toEqual([true, true, true]);
});

test("a Duplicate's diamonds don't drag", async ({ page }) => {
  await ball(page);
  await addFrame(page, 'Duplicate');
  const fixed = row(page, 'transform').locator('button.key.fixed');
  await expect(fixed).toHaveCount(1);
  const at = Number(await fixed.getAttribute('data-at')), frames = await keyFrames(page, 'transform'), before = await version(page);
  await dragBy(page, fixed, 1);
  await dragBy(page, row(page, 'transform').locator('button.key.fixed'), -1);
  expect(await keyFrames(page, 'transform')).toEqual(frames);
  await expect(row(page, 'transform').locator('button.key.fixed')).toHaveAttribute('data-at', String(at));
  expect(await version(page)).toBe(before);
});

test('Escape during a drag puts the keys back and leaves no undo step', async ({ page }) => {
  const key = await ball(page, { 3: 12 });
  const before = await version(page);
  await dragBy(page, diamond(page, 'transform', 3), 2, { escape: true });
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 3, 6]);
  expect(await version(page)).toBe(before);
  expect(await y(page, key, 3)).toBe(12);
  expect(await store(page, 'workspace', (w) => w.vectorSelected)).toEqual([key]); // the Escape was the drag's
  await expect(diamond(page, 'transform', 3)).toHaveAttribute('aria-pressed', 'true');
});

test('keys pressed during a drag do nothing; after the drop one undo goes back to before it', async ({ page }) => {
  const key = await ball(page, { 3: 12 });
  const before = await version(page);
  await dragBy(page, diamond(page, 'transform', 3), 1, { during: async () => {
    await page.keyboard.press('ControlOrMeta+z');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Backspace');
  } });
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 4, 6]);
  expect(await store(page, 'workspace', (w) => w.vectorSelected)).toEqual([key]);
  expect(await version(page)).toBe(before + 1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 3, 6]);
  expect(await y(page, key, 3)).toBe(12);
});

test('a press whose pointerup never comes leaves the panel usable', async ({ page }) => {
  await ball(page, { 3: 12 });
  const before = await version(page);
  // The pointerup lost (a Ctrl-click's menu, a window switch) on the way to the panel.
  const lose = () => page.evaluate(() => window.addEventListener('pointerup', (event) => event.stopImmediatePropagation(), { capture: true, once: true }));
  await lose(); // during a drag: the browser taking the pointer back puts the keys back
  await dragBy(page, diamond(page, 'transform', 3), 1);
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 3, 6]);
  await lose(); // before a drag: the next move, with no button down, lets go
  const box = await diamond(page, 'transform', 3).boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  await page.mouse.move(x + 30, y);
  expect(await version(page)).toBe(before);
  await dragBy(page, diamond(page, 'transform', 3), 2);
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 5, 6]);
  // The window losing focus during a drag puts the keys back.
  await dragBy(page, diamond(page, 'transform', 5), -1, { during: () => page.evaluate(() => window.dispatchEvent(new Event('blur'))) });
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 5, 6]);
  expect(await version(page)).toBe(before + 1);
  await dragBy(page, diamond(page, 'transform', 5), -1);
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 4, 6]);
});

test('while playing, the rows are those of the frame the playhead shows', async ({ page }) => {
  const key = await ball(page);
  await scrubTo(page, 6);
  await addFrame(page, 'Wipe'); // frame 8, without the ball
  await scrubTo(page, 3);
  await store(page, 'workspace', `(w) => { w.vectorSelected = ['${key}']; }`);
  await expect(panel(page).locator('[data-part]')).toHaveCount(1);
  await store(page, 'workspace', (w) => { w.playFrame = 7; w.playing = true; });
  await expect(panel(page).locator('button.frame.now')).toHaveAttribute('data-at', '7');
  await expect(panel(page).locator('[data-part]')).toHaveCount(0);
  await store(page, 'workspace', (w) => { w.playFrame = 2; });
  await expect(panel(page).locator('[data-part]')).toHaveCount(1);
});

// The ball, on 200 frames; frame 1 shows.
async function long(page) {
  const key = await ball(page);
  await store(page, 'project', (p) => { p.showFrame(6); while (p.frames.length < 200) p.addFrame('blank'); });
  await scrubTo(page, 0);
  return key;
}
const band = (page) => bar(page).locator('.scrubber-marks .view');
const framesInView = (page) => panel(page).locator('.ruler button.frame').evaluateAll((frames) => frames.map((f) => Number(f.dataset.at)));
const spacing = async (page) => {
  const [a, b] = await Promise.all([0, 1].map((n) => panel(page).locator('.ruler button.frame').nth(n).boundingBox()));
  return b.x - a.x;
};
async function playheadInView(page) {
  const head = await panel(page).locator('.playhead').boundingBox(), lane = await row(page, 'transform').locator('.lane').boundingBox();
  expect(head.x).toBeGreaterThanOrEqual(lane.x);
  expect(head.x + head.width).toBeLessThanOrEqual(lane.x + lane.width);
}

test('with 200 frames the lanes scroll and the scrubber shows the band; stepping keeps the playhead in view', async ({ page }) => {
  await long(page);
  await expect(band(page)).toBeVisible();
  const frames = await framesInView(page);
  expect(frames[0]).toBe(0);
  expect(frames.length).toBeLessThan(100);
  await expect.poll(() => spacing(page)).toBeCloseTo(14, 0);
  const range = await bar(page).getByRole('slider', { name: 'Frame' }).boundingBox(), start = await band(page).boundingBox();
  expect(start.x).toBeLessThan(range.x + 10);
  expect(start.width).toBeLessThan(range.width / 2);
  await playheadInView(page);
  // Wheel scrolls.
  const lane = await row(page, 'transform').locator('.lane').boundingBox();
  await page.mouse.move(lane.x + 50, lane.y + 5);
  await page.mouse.wheel(0, 140);
  await expect.poll(async () => (await framesInView(page))[0]).toBeGreaterThan(5);
  // Stepping past the last frame in view brings it into view.
  const last = (await framesInView(page)).at(-1);
  await scrubTo(page, last);
  await bar(page).getByRole('button', { name: 'Next frame' }).click();
  await expect(shown(page)).toHaveText(`${last + 2} / 200`);
  await expect(panel(page).locator('button.frame.now')).toHaveAttribute('data-at', String(last + 1));
  await playheadInView(page);
  await scrubTo(page, 150);
  await expect(panel(page).locator('button.frame.now')).toHaveAttribute('data-at', '150');
  await playheadInView(page);
  expect((await band(page).boundingBox()).x).toBeGreaterThan(range.x + range.width / 2);
});

test('Ctrl-wheel zooms; the zoom stays across a reload', async ({ page }) => {
  await long(page);
  const lane = await row(page, 'transform').locator('.lane').boundingBox();
  await page.mouse.move(lane.x + 100, lane.y + 5);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(() => store(page, 'workspace', (w) => w.keysZoom)).toBeCloseTo(17.5);
  await expect.poll(() => spacing(page)).toBeCloseTo(17.5, 0);
  await panel(page).getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => spacing(page)).toBeCloseTo(21.9, 0);
  await panel(page).getByRole('button', { name: 'Zoom out' }).click();
  await long(page); // the app opened again
  await expect.poll(() => spacing(page)).toBeCloseTo(17.5, 0);
});

test('dragging the band scrolls the lanes; keys there drag a frame at a time', async ({ page }) => {
  const key = await long(page);
  const range = await bar(page).getByRole('slider', { name: 'Frame' }).boundingBox(), start = await band(page).boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + range.width / 2, start.y + start.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await band(page).boundingBox()).x - (start.x + range.width / 2))).toBeLessThan(8);
  const frames = await framesInView(page), at = frames[5];
  expect(at).toBeGreaterThan(90);
  await store(page, 'project', `(p) => { p.showFrame(${at}); p.addKey('${key}', 'transform'); }`);
  await dragBy(page, diamond(page, 'transform', at), 2);
  await expect.poll(() => keyFrames(page, 'transform')).toEqual([at + 2]); // the diamonds in view
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });

  test('a finger drags a diamond', async ({ page }) => {
    await ball(page, { 3: 12 });
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, ...points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(({ x, y }, id) => ({ x, y, id })) });
    const [a, b] = await Promise.all([0, 1].map((at) => panel(page).locator(`button.frame[data-at="${at}"]`).boundingBox()));
    const box = await diamond(page, 'transform', 3).boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    await touch('touchStart', { x, y });
    for (let i = 1; i <= 6; i++) await touch('touchMove', { x: x + (i / 6) * 2 * (b.x - a.x), y });
    await touch('touchEnd');
    await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 5, 6]);
  });

  test('a second finger pressed during a drag is ignored; one undo puts the keys back', async ({ page }) => {
    await ball(page, { 3: 12 });
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, ...points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(({ x, y }, id) => ({ x, y, id })) });
    const [a, b] = await Promise.all([0, 1].map((at) => panel(page).locator(`button.frame[data-at="${at}"]`).boundingBox()));
    const step = b.x - a.x, center = async (locator) => {
      const box = await locator.boundingBox();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const one = await center(diamond(page, 'transform', 3)), two = await center(panel(page).locator('button.frame[data-at="0"]'));
    await touch('touchStart', one);
    for (let i = 1; i <= 3; i++) await touch('touchMove', { x: one.x + (i / 3) * step, y: one.y });
    await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 4, 6]);
    const moved = { x: one.x + step, y: one.y };
    await touch('touchStart', moved, two);
    for (let i = 1; i <= 3; i++) await touch('touchMove', moved, { x: two.x + (i / 3) * step, y: two.y });
    await touch('touchEnd');
    await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 4, 6]);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => keyFrames(page, 'transform')).toEqual([0, 3, 6]);
  });
});

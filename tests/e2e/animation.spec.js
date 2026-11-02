import { test, expect, openApp, store, tab, chars, cellPoint, settled } from './support.js';

const animateSwitch = (page) => page.getByRole('switch', { name: 'Animate' });
const bar = (page) => page.getByRole('toolbar', { name: 'Animation' });
const addFrame = async (page, kind) => {
  await bar(page).getByRole('button', { name: '+ Frame' }).click();
  await page.getByRole('button', { name: new RegExp(`^${kind}`) }).click();
};
const scrubTo = (page, i) => bar(page).getByRole('slider', { name: 'Frame' }).fill(String(i));
const shown = (page) => bar(page).getByTestId('frame-indicator');

// Edit Mode, typing one character at a cell; the tool stays up for the next.
async function type(page, col, row, char) {
  if (await store(page, 'workspace', (w) => w.activeTool !== 'text')) await page.getByRole('button', { name: 'Edit Mode' }).click();
  const at = await cellPoint(page, col, row);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => document.activeElement?.dataset?.textInput !== undefined);
  await page.keyboard.press(char);
  await page.keyboard.press('Escape');
  await expect.poll(() => chars(page, row, col, col)).toBe(char);
}

test('turning Animate on shows the bar under the canvas; off hides it and keeps the frames', async ({ page }) => {
  await openApp(page);
  await expect(bar(page)).toBeHidden();
  await animateSwitch(page).check();
  await expect(bar(page)).toBeVisible();
  const box = await bar(page).boundingBox(), canvas = await page.locator('.edit-viewport').boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(canvas.y + canvas.height - 1);
  await addFrame(page, 'Blank');
  await expect(shown(page)).toHaveText('2 / 2');
  await animateSwitch(page).uncheck();
  await expect(bar(page)).toBeHidden();
  expect(await store(page, 'project', (p) => [p.frames.length, p.frame])).toEqual([2, 1]);
});

test('Animate works from any tab', async ({ page }) => {
  await openApp(page);
  await tab(page, 'SAUCE').click();
  await animateSwitch(page).check();
  await expect(bar(page)).toBeHidden();
  await tab(page, 'ANSI').click();
  await expect(bar(page)).toBeVisible();
});

test('draw, + Frame Blank, draw, scrub back and forward: the canvas follows', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  await type(page, 2, 2, 'A');
  await addFrame(page, 'Blank');
  await type(page, 4, 2, 'B');
  expect(await chars(page, 2, 2, 2)).toBe('A'); // it carries
  await scrubTo(page, 0);
  await expect(shown(page)).toHaveText('1 / 2');
  await expect.poll(() => chars(page, 2, 4, 4)).not.toBe('B');
  expect(await chars(page, 2, 2, 2)).toBe('A');
  await scrubTo(page, 1);
  await expect.poll(() => chars(page, 2, 4, 4)).toBe('B');
});

test('+ Frame Wipe shows a clean canvas; Duplicate shows it solid', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  await type(page, 2, 2, 'A');
  await addFrame(page, 'Duplicate');
  await settled(page);
  expect(await chars(page, 2, 2, 2)).toBe('A');
  await expect(page.locator('.scrubber-marks .duplicate')).toHaveCount(1);
  await addFrame(page, 'Wipe');
  await expect.poll(() => chars(page, 2, 2, 2)).not.toBe('A');
  await expect(page.locator('.scrubber-marks .wipe')).toHaveCount(1);
});

test('a frame drawn on gets a tall mark at once', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  await addFrame(page, 'Blank');
  await expect(page.locator('.scrubber-marks .drawn')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pencil (1px)' }).click();
  const at = await cellPoint(page, 3, 3);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('.scrubber-marks .drawn')).toHaveCount(1);
});

test('Play runs and Pause stops, and the indicator moves', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  await addFrame(page, 'Blank');
  await addFrame(page, 'Blank');
  const seen = new Set();
  await bar(page).getByRole('button', { name: 'Play' }).click();
  await expect.poll(async () => { seen.add(await shown(page).textContent()); return seen.size; }).toBe(3);
  await bar(page).getByRole('button', { name: 'Pause' }).click();
  await expect(bar(page).getByRole('button', { name: 'Play' })).toBeVisible();
  const at = await shown(page).textContent();
  await page.waitForTimeout(300);
  expect(await shown(page).textContent()).toBe(at);
  expect(await store(page, 'project', (p) => `${p.frame + 1} / ${p.frames.length}`)).toBe(at);
});

test('drawing while playing pauses, on the frame showing, and keeps the edit', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  await addFrame(page, 'Blank');
  await page.getByRole('button', { name: 'Pencil (1px)' }).click();
  await bar(page).getByRole('button', { name: 'Play' }).click();
  await expect(bar(page).getByRole('button', { name: 'Pause' })).toBeVisible();
  const before = await store(page, 'project', (p) => p.frames.map((f) => f.changes.size));
  expect(before).toEqual([0, 0]);
  const at = await cellPoint(page, 3, 3);
  await page.mouse.click(at.x, at.y);
  await expect(bar(page).getByRole('button', { name: 'Play' })).toBeVisible();
  await expect.poll(() => store(page, 'project', (p) => p.hasEdits)).toBe(true);
  expect(await store(page, 'workspace', (w) => w.playing)).toBe(false);
});

test('a key while playing pauses; the keys play, pause and step', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  await addFrame(page, 'Blank');
  await addFrame(page, 'Blank');
  await page.locator('.edit-viewport').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('l');
  await expect.poll(() => store(page, 'workspace', (w) => w.playing)).toBe(true);
  await page.keyboard.press('l');
  await expect.poll(() => store(page, 'workspace', (w) => w.playing)).toBe(false);
  await scrubTo(page, 0);
  await page.locator('.edit-viewport').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('.');
  await expect(shown(page)).toHaveText('2 / 3');
  await page.keyboard.press(',');
  await expect(shown(page)).toHaveText('1 / 3');
  await page.keyboard.press(',');
  await expect(shown(page)).toHaveText('3 / 3');
  await page.keyboard.press('l');
  await expect.poll(() => store(page, 'workspace', (w) => w.playing)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => store(page, 'workspace', (w) => w.playing)).toBe(false);
});

test('Enter on the focused Play button plays rather than pausing and playing', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  await addFrame(page, 'Blank');
  await bar(page).getByRole('button', { name: 'Play' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => store(page, 'workspace', (w) => w.playing)).toBe(true);
  await bar(page).getByRole('button', { name: 'Pause' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  expect(await store(page, 'workspace', (w) => w.playing)).toBe(false);
});

test('the keys type in Edit Mode rather than stepping', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  await addFrame(page, 'Blank');
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  const at = await cellPoint(page, 1, 1);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => document.activeElement?.dataset?.textInput !== undefined);
  await page.keyboard.press(',');
  await expect.poll(() => chars(page, 1, 1, 1)).toBe(',');
  await expect(shown(page)).toHaveText('2 / 2');
});

test('FPS and Hold set the timing', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  await bar(page).getByRole('spinbutton', { name: 'Frames per second' }).fill('12');
  await bar(page).getByRole('spinbutton', { name: 'Hold' }).fill('0.5');
  await bar(page).getByRole('spinbutton', { name: 'Hold' }).blur();
  expect(await store(page, 'project', (p) => [p.fps, p.frames[0].hold])).toEqual([12, 0.5]);
});

test('Ghost toggles', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  const ghost = bar(page).getByRole('button', { name: 'Ghost' });
  await expect(ghost).toHaveAttribute('aria-pressed', 'true');
  await ghost.click();
  await expect(ghost).toHaveAttribute('aria-pressed', 'false');
  expect(await store(page, 'workspace', (w) => w.ghost)).toBe(false);
});

test('Delete frame is off with one frame', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  await bar(page).getByRole('button', { name: 'Frame actions' }).click();
  await expect(page.getByRole('button', { name: 'Delete frame' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await addFrame(page, 'Blank');
  await bar(page).getByRole('button', { name: 'Frame actions' }).click();
  await page.getByRole('button', { name: 'Delete frame' }).click();
  await expect(shown(page)).toHaveText('1 / 1');
});

test('Move earlier and later reorder the frames', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  await addFrame(page, 'Wipe');
  await expect(shown(page)).toHaveText('2 / 2');
  await bar(page).getByRole('button', { name: 'Frame actions' }).click();
  await expect(page.getByRole('button', { name: 'Move later' })).toBeDisabled();
  await page.getByRole('button', { name: 'Move earlier' }).click();
  await expect(shown(page)).toHaveText('1 / 2');
});

test('the menus open above the bar, on screen', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  await bar(page).getByRole('button', { name: '+ Frame' }).click();
  const box = await page.getByRole('button', { name: /^Wipe/ }).boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height);
});

test('the bar is hidden on SOCIAL and SAUCE', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  for (const name of ['SAUCE', 'SOCIAL']) {
    await tab(page, name).click();
    await expect(bar(page)).toBeHidden();
  }
  await tab(page, 'PIXEL').click();
  await expect(bar(page)).toBeVisible();
  await tab(page, 'ANSI').click();
  await expect(bar(page)).toBeVisible();
});

test('the switch is off with a reason above the limit', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const p = document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia._s.get('project');
    p.cols = 300;
    p.rows = 400;
  });
  await expect(animateSwitch(page)).toBeDisabled();
  await expect(page.locator('label.animate')).toHaveAttribute('title', /too large/i);
});

test('on a narrow screen the bar wraps and stays on screen', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await openApp(page);
  await animateSwitch(page).check();
  const box = await bar(page).boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(600);
  expect(box.y + box.height).toBeLessThanOrEqual(800);
  const add = await bar(page).getByRole('button', { name: '+ Frame' }).boundingBox();
  expect(add.x + add.width).toBeLessThanOrEqual(600);
});

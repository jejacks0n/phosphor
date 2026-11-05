import { readFile } from 'node:fs/promises';
import { test, expect, openApp, imageInput, saveAs, store, tab, chars, cellPoint, settled, autosaved } from './support.js';

const animateSwitch = (page) => page.getByRole('switch', { name: 'Animate' });
const bar = (page) => page.getByRole('toolbar', { name: 'Animation' });
const addFrame = async (page, kind) => {
  await bar(page).getByRole('button', { name: 'Add frame' }).click();
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

test('draw, Add frame Blank, draw, scrub back and forward: the canvas follows', async ({ page }) => {
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

test('Add frame Wipe shows a clean canvas; Duplicate shows it solid', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Pencil' }).click();
  const at = await cellPoint(page, 3, 3);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('.scrubber-marks .drawn')).toHaveCount(1);
});

// Where the scrubber's handle is drawn, from a screenshot (its pink is nowhere else on the bar): its middle, across.
async function handleMiddle(page) {
  const slider = bar(page).getByRole('slider', { name: 'Frame' });
  const box = await slider.boundingBox();
  const shot = (await page.screenshot({ clip: { x: box.x - 20, y: box.y, width: box.width + 40, height: box.height } })).toString('base64');
  const [from, to] = await page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: image.width, height: image.height });
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, image.width, image.height);
    let left = Infinity, right = -Infinity;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (Math.abs(data[i] - 0xe8) < 40 && data[i + 1] < 60 && Math.abs(data[i + 2] - 0xfc) < 40) { left = Math.min(left, x); right = Math.max(right, x); }
      }
    }
    return [left, right];
  }, shot);
  const scale = (await page.evaluate(() => devicePixelRatio));
  return box.x - 20 + (from + to + 1) / 2 / scale;
}
const markMiddle = async (page, i) => {
  const box = await page.locator('.scrubber-marks span').nth(i).boundingBox();
  return box.x + box.width / 2;
};

test('the first and last frame marks sit centered under the scrubber’s handle', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  for (let i = 0; i < 4; i++) await addFrame(page, 'Blank');
  for (const [width, height] of [[1400, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(0, 0);
    for (const i of [0, 4]) {
      await scrubTo(page, i);
      await page.locator('body').click({ position: { x: 1, y: 1 } }); // the handle unfocused, in its own color
      await expect.poll(async () => Math.abs(await handleMiddle(page) - await markMiddle(page, i)), { message: `frame ${i + 1} at ${width}` }).toBeLessThan(1);
    }
  }
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
  await page.getByRole('button', { name: 'Pencil' }).click();
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
  await expect(ghost).toHaveClass(/\bactive\b/); // lit as a toolbar button is
  await expect(ghost.locator('svg')).toBeVisible(); // a ghost, not a word
  await ghost.click();
  await expect(ghost).toHaveAttribute('aria-pressed', 'false');
  await expect(ghost).not.toHaveClass(/\bactive\b/);
  await expect(ghost).toBeEnabled();
  expect(await store(page, 'workspace', (w) => w.ghost)).toBe(false);
});

test('Add frame is a frame of film with a plus, and opens the three kinds', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  const add = bar(page).getByRole('button', { name: 'Add frame' });
  await expect(add.locator('svg')).toBeVisible();
  await expect(add).toHaveText('');
  await add.click();
  for (const kind of ['Blank', 'Duplicate', 'Wipe']) await expect(page.getByRole('button', { name: new RegExp(`^${kind}`) })).toBeVisible();
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
  await bar(page).getByRole('button', { name: 'Add frame' }).click();
  const box = await page.getByRole('button', { name: /^Wipe/ }).boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height);
});

test('on a phone the menus stay on screen side to side too', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  for (const [width, height] of [[390, 844], [320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height });
    for (const [name, item] of [['Add frame', /^Duplicate/], ['Frame actions', 'Move earlier']]) {
      await expect.poll(async () => (await bar(page).getByRole('button', { name }).boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(0);
      await bar(page).getByRole('button', { name }).click();
      const menu = await page.locator('.dropdown-content').boundingBox();
      expect(menu.x, `${name} at ${width}`).toBeGreaterThanOrEqual(0);
      expect(menu.x + menu.width, `${name} at ${width}`).toBeLessThanOrEqual(width);
      await expect(page.getByRole('button', { name: item })).toBeVisible();
      await page.keyboard.press('Escape');
    }
  }
});

test('the Tween menu eases a selected shape between its key frames, and the bar shows the tween', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await animateSwitch(page).check();
  const key = await store(page, 'project', (p) => p.addShape({ z: 0, closed: true, fill: '#ff0000', stroke: null, width: 1, m: [1, 0, 0, 1, 0, 0],
    points: [[2, 2, 0, 0, 0, 0, 0], [6, 2, 0, 0, 0, 0, 0], [6, 6, 0, 0, 0, 0, 0], [2, 6, 0, 0, 0, 0, 0]] }));
  for (let i = 0; i < 6; i++) await addFrame(page, 'Blank');
  await store(page, 'project', `(p) => p.updateShapes([['${key}', { ...p.shapes.get('${key}'), m: [1, 0, 0, 1, 0, 24] }]])`);
  await store(page, 'workspace', `(w) => { w.vectorSelected = []; }`);
  await scrubTo(page, 3);
  const tween = bar(page).getByRole('button', { name: 'Tween' });
  await expect(tween).toBeDisabled(); // nothing selected
  await store(page, 'workspace', `(w) => { w.vectorSelected = ['${key}']; }`);
  await expect(tween).toBeEnabled();
  const scrubberWidth = async () => (await bar(page).getByRole('slider', { name: 'Frame' }).boundingBox()).width;
  const width = await scrubberWidth();
  await tween.click();
  await expect(page.locator('.dropdown-content')).toContainText('Frames 1 to 7');
  await page.getByRole('button', { name: 'Ease in', exact: true }).click();
  await expect.poll(() => store(page, 'project', `(p) => p.shapes.get('${key}').m[5]`)).toBe(3);
  expect(await scrubberWidth()).toBe(width); // the button's as wide whatever easing it names
  await expect(bar(page).locator('.scrubber-marks .tween')).toHaveCount(5);
  await expect(bar(page).locator('.scrubber-marks .band')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(bar(page).locator('.scrubber-marks .band')).toHaveCount(0);
  await expect.poll(() => store(page, 'project', `(p) => p.shapes.get('${key}').m[5]`)).toBe(0);
});

test('the Tween menu can make every tween move by whole cells', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await animateSwitch(page).check();
  const key = await store(page, 'project', (p) => p.addShape({ z: 0, closed: true, fill: '#ff0000', stroke: null, width: 1, m: [1, 0, 0, 1, 0, 0],
    points: [[2, 2, 0, 0, 0, 0, 0], [6, 2, 0, 0, 0, 0, 0], [6, 6, 0, 0, 0, 0, 0], [2, 6, 0, 0, 0, 0, 0]] }));
  for (let i = 0; i < 6; i++) await addFrame(page, 'Blank');
  await store(page, 'project', `(p) => p.updateShapes([['${key}', { ...p.shapes.get('${key}'), m: [1, 0, 0, 1, 0, 24] }]])`);
  await scrubTo(page, 3);
  await store(page, 'workspace', `(w) => { w.vectorSelected = ['${key}']; }`);
  const tween = bar(page).getByRole('button', { name: 'Tween' });
  await tween.click();
  await page.getByRole('button', { name: 'Ease in', exact: true }).click();
  await expect.poll(() => store(page, 'project', `(p) => p.shapes.get('${key}').m[5]`)).toBe(3); // half a cell down
  await tween.click();
  await expect(page.getByRole('button', { name: 'Smoothly' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'By whole cells' }).click();
  await expect.poll(() => store(page, 'project', `(p) => p.shapes.get('${key}').m[5] % 2`)).toBe(0); // a whole cell
  await tween.click();
  await expect(page.getByRole('button', { name: 'By whole cells' })).toHaveAttribute('aria-pressed', 'true');
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
  await expect(animateSwitch(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('label.animate')).toHaveAttribute('title', /too large/i);
  // A tap says why, as a phone has no hover for the title. (A click where it is: Playwright won't click what's
  // marked disabled, which is what the switch says it is.)
  const box = await page.locator('label.animate').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.app-toast')).toHaveText(/60,000 cells.*up to 40,000.*Dimensions/);
  await page.locator('.app-toast').click(); // a click closes it
  await expect(page.locator('.app-toast')).toBeHidden();
  await expect(animateSwitch(page)).not.toBeChecked();
  expect(await store(page, 'project', (p) => p.animate)).toBe(false);
});

test('on a narrow screen the bar wraps and stays on screen', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await openApp(page);
  await animateSwitch(page).check();
  const box = await bar(page).boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(600);
  expect(box.y + box.height).toBeLessThanOrEqual(800);
  const add = await bar(page).getByRole('button', { name: 'Add frame' }).boundingBox();
  expect(add.x + add.width).toBeLessThanOrEqual(600);
});

// Where play, the scrubber, the fps box and the ghost's slider are.
async function barLayout(page) {
  await openApp(page);
  await animateSwitch(page).check();
  await addFrame(page, 'Blank');
  const box = (locator) => locator.boundingBox();
  return {
    play: await box(bar(page).getByRole('button', { name: 'Play' })),
    scrubber: await box(bar(page).getByRole('slider', { name: 'Frame' })),
    fps: await box(bar(page).getByRole('spinbutton', { name: 'Frames per second' })),
    strength: await box(bar(page).getByRole('slider', { name: 'Ghost strength' })),
  };
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("on a phone, play and the steps start the bar's second line, and the ghost's slider is narrow", async ({ page }) => {
    const { play, scrubber, fps, strength } = await barLayout(page);
    expect(play.y).toBeGreaterThan(scrubber.y + scrubber.height);
    expect(play.x).toBeLessThan(fps.x);
    expect(strength.width).toBeLessThanOrEqual(80);
  });
});

test('on a wide screen the bar is one line, play first', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { play, scrubber } = await barLayout(page);
  expect(Math.abs((play.y + play.height / 2) - (scrubber.y + scrubber.height / 2))).toBeLessThan(8);
  expect(play.x).toBeLessThan(scrubber.x);
});

// The open document's record: when it was last edited, and the frame it's on.
const written = (page) => page.evaluate(async () => {
  const pinia = document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia;
  const id = pinia._s.get('project').documentId;
  const db = await new Promise((resolve, reject) => {
    const open = indexedDB.open('phosphor-autosave', 1);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  const record = await new Promise((resolve) => { db.transaction('documents').objectStore('documents').get(id).onsuccess = (e) => resolve(e.target.result); });
  db.close();
  if (!record) return null;
  const rest = await new Blob([record.rest]).arrayBuffer(), length = new DataView(rest).getUint32(8, true);
  const json = JSON.parse(new TextDecoder().decode(rest.slice(20, 20 + length)));
  return { editedAt: record.editedAt, frame: json.frame, cells: json.frames?.[json.frame]?.changes.map(([key]) => key) };
});

test('a reload brings the animation back on the same frame, including text typed a moment ago', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  await type(page, 2, 2, 'A');
  await addFrame(page, 'Blank');
  await type(page, 4, 2, 'B');
  await addFrame(page, 'Blank');
  await scrubTo(page, 1);
  await expect(shown(page)).toHaveText('2 / 3');
  const at = await cellPoint(page, 6, 2);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => document.activeElement?.dataset?.textInput !== undefined);
  await page.keyboard.press('C');
  await expect.poll(async () => (await written(page))?.cells).toContain('6,2'); // a write, whether or not the run has ended
  await page.reload();
  await expect(page.locator('.ansi-editor .display')).toBeVisible();
  await settled(page);
  await expect(shown(page)).toHaveText('2 / 3');
  await expect(animateSwitch(page)).toBeChecked();
  await expect.poll(() => chars(page, 2, 2, 2)).toBe('A');
  expect(await chars(page, 2, 4, 4)).toBe('B');
  expect(await chars(page, 2, 6, 6)).toBe('C');
  await scrubTo(page, 0);
  await expect.poll(() => chars(page, 2, 4, 4)).not.toBe('B');
});

test('scrubbing alone isn’t an edit for autosave, though the frame is kept', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  await addFrame(page, 'Blank');
  await expect.poll(async () => (await written(page))?.frame).toBe(1);
  const { editedAt } = await written(page);
  const version = await store(page, 'project', (p) => p.editVersion);
  await scrubTo(page, 0);
  await expect.poll(async () => (await written(page))?.frame, { timeout: 5000 }).toBe(0);
  expect((await written(page)).editedAt).toBe(editedAt);
  expect(await store(page, 'project', (p) => p.editVersion)).toBe(version);
});

test('saving a project and opening it brings the frames back', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  await type(page, 2, 2, 'A');
  await addFrame(page, 'Wipe');
  const download = await saveAs(page, 'Save project (.phosphor)');
  const buffer = await readFile(await download.path());
  await page.evaluate(() => sessionStorage.removeItem('phosphor-autosave-document'));
  await page.goto('/');
  await imageInput(page).setInputFiles({ name: 'movie.phosphor', mimeType: 'application/octet-stream', buffer });
  await expect(shown(page)).toHaveText('2 / 2');
  await scrubTo(page, 0);
  await expect.poll(() => chars(page, 2, 2, 2)).toBe('A');
});

test('a Version restored brings its frames back', async ({ page }) => {
  await page.clock.install();
  await openApp(page);
  await autosaved(page);   // the opening write, which makes no Version: edits before it would go with it
  await animateSwitch(page).check();
  await type(page, 2, 2, 'A');
  await addFrame(page, 'Blank');
  await page.clock.fastForward('00:02');
  const versions = page.getByRole('dialog', { name: 'Versions' }).getByRole('listitem');
  const count = async () => {
    const id = await store(page, 'project', (p) => p.documentId);
    return page.evaluate((id) => new Promise((resolve, reject) => {
      const open = indexedDB.open('phosphor-autosave', 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const count = open.result.transaction('versions').objectStore('versions').index('documentId').count(id);
        count.onsuccess = () => { open.result.close(); resolve(count.result); };
      };
    }), id);
  };
  await expect.poll(count).toBe(1);
  await page.clock.fastForward('06:00');
  await addFrame(page, 'Blank');
  await page.clock.fastForward('00:02');
  await expect.poll(count).toBe(2);
  await page.getByRole('button', { name: 'Versions', exact: true }).click();
  await versions.nth(1).getByRole('button', { name: 'Restore' }).click();
  await expect(shown(page)).toHaveText('2 / 2');
  await scrubTo(page, 0);
  await expect.poll(() => chars(page, 2, 2, 2)).toBe('A');
});

test('a canvas grown past the limit offers no Add frame, and Animate can still be turned off', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  await page.evaluate(() => {
    const p = document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia._s.get('project');
    p.cols = 300;
    p.rows = 400;
  });
  await expect(bar(page).getByRole('button', { name: 'Add frame' })).toBeDisabled();
  await expect(bar(page)).toContainText('too large');
  await animateSwitch(page).uncheck();
  await expect(bar(page)).toBeHidden();
  await expect(animateSwitch(page)).toHaveAttribute('aria-disabled', 'true'); // off, and saying why when tried
});

test('the Ghost slider sets the strength, and it’s remembered', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  const slider = bar(page).getByRole('slider', { name: 'Ghost strength' });
  await expect(slider).toHaveValue('35');
  await slider.fill('70');
  expect(await store(page, 'workspace', (w) => w.ghostStrength)).toBe(70);
  await bar(page).getByRole('button', { name: 'Ghost' }).click();
  await expect(slider).toBeDisabled();
  await bar(page).getByRole('button', { name: 'Ghost' }).click();
  await autosaved(page);
  await page.reload();
  await expect(page.locator('.ansi-editor .display')).toBeVisible();
  await animateSwitch(page).check();
  await expect(bar(page).getByRole('slider', { name: 'Ghost strength' })).toHaveValue('70');
});

test('on a narrow screen the bar holds two tidy lines, and every control stays on screen', async ({ page }) => {
  await openApp(page);
  await animateSwitch(page).check();
  const lines = async () => bar(page).evaluate((el) => {
    const controls = [...el.querySelectorAll('button, input, output')].filter((c) => c.getBoundingClientRect().width);
    const boxes = controls.map((c) => c.getBoundingClientRect());
    const rows = [];
    for (const { top, bottom } of boxes) {
      const row = rows.find((r) => top < r.bottom && bottom > r.top);
      if (!row) rows.push({ top, bottom });
    }
    return { rows: rows.length, inside: boxes.every(({ left, right }) => left >= 0 && right <= innerWidth), smallest: Math.min(...boxes.map((b) => b.width)) };
  });
  const switchInside = async () => {
    const box = await page.locator('label.animate').boundingBox();
    return box.x >= 0 && box.x + box.width <= page.viewportSize().width;
  };
  for (const [width, height, rows] of [[390, 844, 2], [375, 667, 2], [360, 640, 2], [932, 430, 1], [844, 390, 2], [750, 340, 1], [667, 375, 1], [568, 320, 2], [1400, 900, 1]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(lines, { message: `${width} wide` }).toEqual({ rows, inside: true, smallest: expect.any(Number) });
    expect((await lines()).smallest).toBeGreaterThanOrEqual(20);
    expect((await bar(page).getByRole('button', { name: 'Add frame' }).boundingBox()).height, `Add frame at ${width}`).toBeLessThan(30);
    // Adding and arranging frames sit right after the scrubber, on its line.
    const scrubber = await bar(page).getByRole('slider', { name: 'Frame' }).boundingBox();
    for (const name of ['Add frame', 'Frame actions']) {
      const box = await bar(page).getByRole('button', { name }).boundingBox();
      expect(box.x, `${name} at ${width}`).toBeGreaterThan(scrubber.x + scrubber.width);
      expect(Math.abs(box.y + box.height / 2 - (scrubber.y + scrubber.height / 2)), `${name} at ${width}`).toBeLessThan(14);
    }
    await expect.poll(switchInside, { message: `the switch at ${width}` }).toBe(true); // the layout may still be sliding
  }
  await page.setViewportSize({ width: 320, height: 568 }); // the narrowest phone: more lines, but nothing lost
  await expect.poll(async () => (await lines()).inside).toBe(true);
  await expect.poll(switchInside).toBe(true);
});

import { test, expect } from './support.js';
import { openApp, store, tab, cellPoint, screenPixel, settled } from './support.js';

// The ANSI view draws only the cells in view, plus a margin, so a long piece is drawn sharp to its
// end. tests/fixtures/images/tall.png opens at 80 x 2400 (1200 lines).
const scroller = (page) => page.locator('.ansi-editor > article');
const sizer = (page) => page.locator('.ansi-editor div.display');
const hex = ([r, g, b]) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
const bgOf = (page, col, row) => store(page, 'project', `(p) => p.cells[${row} * p.cols + ${col}].bg.hex.toLowerCase()`);
const linesOf = (page) => store(page, 'project', (p) => Math.floor(p.rows / 2));
const scrollTo = (page, top) => scroller(page).evaluate((el, top) => { el.scrollTop = top === 'end' ? el.scrollHeight : top; }, top);

// Both halves of a cell, with the Pencil.
async function paintCell(page, col, row) {
  for (const half of [0, 1]) {
    const at = await cellPoint(page, col, row, half);
    await page.mouse.click(at.x, at.y);
  }
}

// Every painted frame (a task after its frame) until stopRecording: how much of the PIXEL view's
// viewport its canvas covers, and the scroll.
const recordFrames = (page) => page.evaluate(() => {
  window.__frames = [];
  window.__framesDone = false;
  const frame = () => setTimeout(() => {
    const el = document.querySelector('article[tabindex="0"]'), canvas = el?.querySelector('.display canvas');
    if (canvas) {
      const rect = canvas.getBoundingClientRect(), top = el.getBoundingClientRect().top + el.clientTop, bottom = top + el.clientHeight;
      window.__frames.push({ scrollTop: el.scrollTop, covered: Math.max(0, Math.min(rect.bottom, bottom) - Math.max(rect.top, top)), view: el.clientHeight });
    }
    if (!window.__framesDone) requestAnimationFrame(frame);
  });
  requestAnimationFrame(frame);
});
const stopRecording = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
  window.__framesDone = true;
  done(window.__frames);
}))));

// What the screen shows at a cell's center: a frame after a scroll, the redraw lands.
const shown = (page, col, row) => expect.poll(async () => {
  const at = await cellPoint(page, col, row);
  return hex(await screenPixel(page, at.x, at.y));
});

test('the ANSI view draws the end of a long piece, and what scrolling brings back', async ({ page }) => {
  await openApp(page, 'images/tall.png');
  await page.keyboard.press('p');
  await paintCell(page, 10, 2);
  await scrollTo(page, 'end');
  const lines = await linesOf(page), last = lines - 5;
  await paintCell(page, 10, last);
  await shown(page, 10, last).toBe(await bgOf(page, 10, last));

  await scrollTo(page, 0); // no edit: the scroll alone draws what comes back into view
  await shown(page, 10, 2).toBe(await bgOf(page, 10, 2));

  // The canvas covers the view and its margins, not the whole piece.
  const view = await scroller(page).boundingBox();
  const box = await sizer(page).boundingBox();
  const lineHeight = (box.height - 4) / lines; // inside its 2px borders
  const canvas = await page.locator('.ansi-editor .display canvas').boundingBox();
  expect(canvas.height).toBeLessThan(view.height + 2 * 160 + 2 * lineHeight);
});

test('a font-size change halfway down a long piece keeps the place, and draws it', async ({ page }) => {
  await openApp(page, 'images/tall.png');
  await page.keyboard.press('p');
  const before = await scroller(page).evaluate((el) => {
    el.scrollTop = el.scrollHeight / 2;
    return { ratio: el.scrollTop / el.scrollHeight };
  });
  // A cell a quarter of the way down the view, painted: it's still in view after the change.
  const view = await scroller(page).boundingBox();
  const box = await sizer(page).boundingBox();
  const row = Math.floor((view.y + view.height / 4 - box.y - 2) / ((box.height - 4) / await linesOf(page)));
  await paintCell(page, 10, row);

  // Every scroll position from here on: the browser resets it to 0 if the sizer ever collapses.
  // And every frame, once painted (a task after its frame): how much of the view the canvas covers.
  await scroller(page).evaluate((el) => {
    window.__scrollTops = [];
    el.addEventListener('scroll', () => window.__scrollTops.push(el.scrollTop));
    window.__frames = [];
    const frame = () => setTimeout(() => {
      const canvas = el.querySelector('.display canvas').getBoundingClientRect();
      const top = el.getBoundingClientRect().top + el.clientTop, bottom = top + el.clientHeight;
      window.__frames.push({ scrollTop: el.scrollTop, covered: Math.max(0, Math.min(canvas.bottom, bottom) - Math.max(canvas.top, top)), view: el.clientHeight });
      if (!window.__framesDone) requestAnimationFrame(frame);
    });
    requestAnimationFrame(frame);
  });
  await page.waitForFunction(() => window.__frames.length >= 2); // frames from before the change too
  const size = page.getByLabel('Font size');
  await size.fill('32');
  await size.press('Enter');
  await expect.poll(async () => (await sizer(page).boundingBox()).height).toBeGreaterThan(1.5 * box.height); // about 32 / 17 as tall
  expect(await page.evaluate(() => window.__scrollTops.filter((top) => top === 0))).toEqual([]);
  // No frame shows the sizer's empty surface where the art should be.
  const frames = await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__framesDone = true;
    done(window.__frames);
  }))));
  expect(frames.filter((f) => f.covered < f.view)).toEqual([]);
  const after = await scroller(page).evaluate((el) => el.scrollTop / el.scrollHeight);
  expect(Math.abs(after - before.ratio)).toBeLessThan(0.02);
  await shown(page, 10, row).toBe(await bgOf(page, 10, row));
});

test('the PIXEL view at 16x draws the end of a long picture with a canvas the size of the view', async ({ page }) => {
  await openApp(page, 'images/tall.png');
  await tab(page, 'PIXEL').click();
  const view = page.locator('article[tabindex="0"]'); // the viewport
  const viewBox = await view.boundingBox();
  await page.mouse.move(viewBox.x + viewBox.width / 2, viewBox.y + viewBox.height / 2);
  await page.keyboard.down('Control');
  while (await store(page, 'workspace', (w) => w.editZoom) < 16) await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  // The zoom's own redraws land first (a frame for the layout, one for its redraw), so only the
  // scroll can move the window to the end.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));
  await view.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  });

  // The canvas covers the view and its margins, not the whole grid at 16x.
  const canvasArea = () => view.locator('canvas').evaluate((c) => c.width * c.height);
  const { width, height } = await view.evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight }));
  await expect.poll(canvasArea).toBeLessThan((width + 2 * 160 + 32) * (height + 2 * 160 + 32));

  // The canvas is where the view is: the scroll moved the window. (The picture ends in a stripe the
  // color of the surface behind the canvas, so the pixel below can't tell.)
  await expect.poll(() => view.evaluate((el) => {
    const canvas = el.querySelector('canvas').getBoundingClientRect(), top = el.getBoundingClientRect().top + el.clientTop;
    return canvas.top <= top && canvas.bottom >= top + el.clientHeight;
  })).toBe(true);

  // A grid pixel near the end, on screen, is the output canvas's pixel. Given longer than the usual
  // poll: software raster paints the sizer's dashed outline, 38400px long, in about half a second a
  // frame, and a screenshot waits for a frame, so with the other tests running beside this one a
  // single screenshot can take over 5s.
  const rows = await store(page, 'project', (p) => p.rows);
  const expected = await store(page, 'project', `(p) => Array.from(p.renderer.outputCanvas.getContext('2d').getImageData(20, ${rows - 3}, 1, 1).data.slice(0, 3))`);
  await expect.poll(async () => {
    const box = await view.locator('.display').boundingBox();
    return screenPixel(page, box.x + 20.5 * 16, box.y + (rows - 3 + 0.5) * 16);
  }, { timeout: 15_000 }).toEqual(expected);
});

test('returning to the PIXEL tab with a remembered scroll never paints a frame without the art', async ({ page }) => {
  await openApp(page, 'images/tall.png');
  await tab(page, 'PIXEL').click();
  const view = page.locator('article[tabindex="0"]');
  const viewBox = await view.boundingBox();
  await page.mouse.move(viewBox.x + viewBox.width / 2, viewBox.y + viewBox.height / 2);
  await page.keyboard.down('Control');
  while (await store(page, 'workspace', (w) => w.editZoom) < 16) await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));
  await view.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect.poll(() => view.evaluate((el) => {
    const canvas = el.querySelector('canvas').getBoundingClientRect(), top = el.getBoundingClientRect().top + el.clientTop;
    return canvas.top <= top && canvas.bottom >= top + el.clientHeight;
  })).toBe(true);

  // Every frame from the other tab on, while the PIXEL view is mounted.
  await tab(page, 'ANSI').click();
  await recordFrames(page);
  await tab(page, 'PIXEL').click();
  await page.waitForFunction(() => window.__frames.some((f) => f.scrollTop > 0)); // the restore landed
  const frames = await stopRecording(page);
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.filter((f) => f.covered < f.view)).toEqual([]);
});

test('a zoom step scales the PIXEL view\'s canvas at once, before its redraw, so no frame shows it out of line', async ({ page }) => {
  await openApp(page);
  await tab(page, 'PIXEL').click();
  await settled(page);
  const zoom = await store(page, 'workspace', (w) => w.editZoom);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done))))); // the mount's own redraws done
  // A frame's first callback (queued before the zoom, so before the view's redraw): how the canvas
  // stands then, as a frame painted before the redraw would show it.
  const ratio = await page.evaluate((zoom) => new Promise((done) => {
    const canvas = document.querySelector('article[tabindex="0"] .display canvas');
    requestAnimationFrame(() => done(canvas.getBoundingClientRect().width / canvas.width));
    document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia._s.get('workspace').setEditZoom(zoom * 1.6);
  }), zoom);
  expect(ratio).toBeCloseTo(1.6, 1); // the backing is still the old zoom's; its CSS size is the new one's
});

test('with All cells on, the PIXEL view\'s overlay follows a stroke and its undo, as a whole repaint of it shows', async ({ page }) => {
  await openApp(page, 'images/tall.png');
  await tab(page, 'PIXEL').click();
  await store(page, 'workspace', (w) => { w.ansiOverlayAll = true; w.ansiOverlay = 100; });
  const view = await page.locator('article[tabindex="0"]').boundingBox();
  const at = { x: Math.floor(view.x + view.width / 2) + 0.5, y: Math.floor(view.y + view.height / 2) + 0.5 }; // a grid pixel mid-view
  await page.keyboard.press('p');
  await page.mouse.click(at.x, at.y);
  // The same pixel after the overlay is painted whole (All cells off and on again).
  const repainted = async () => {
    await store(page, 'workspace', (w) => { w.ansiOverlayAll = false; });
    await store(page, 'workspace', (w) => { w.ansiOverlayAll = true; });
    return screenPixel(page, at.x, at.y);
  };
  const painted = await screenPixel(page, at.x, at.y);
  await expect.poll(() => screenPixel(page, at.x, at.y)).toEqual(painted);
  expect(await repainted()).toEqual(painted);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => screenPixel(page, at.x, at.y)).not.toEqual(painted);
  const undone = await screenPixel(page, at.x, at.y);
  expect(await repainted()).toEqual(undone);
});

test('a new grid size in the PIXEL view re-centers it, and no frame shows the canvas where the old scroll had it', async ({ page }) => {
  await openApp(page, 'images/tall.png');
  await tab(page, 'PIXEL').click();
  const view = page.locator('article[tabindex="0"]');
  const viewBox = await view.boundingBox();
  await page.mouse.move(viewBox.x + viewBox.width / 2, viewBox.y + viewBox.height / 2);
  await page.keyboard.down('Control');
  while (await store(page, 'workspace', (w) => w.editZoom) < 16) await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await view.evaluate((el) => { el.scrollTop = el.scrollHeight / 4; }); // well away from where re-centering lands
  await expect.poll(() => view.evaluate((el) => {
    const canvas = el.querySelector('canvas').getBoundingClientRect(), top = el.getBoundingClientRect().top + el.clientTop;
    return canvas.top <= top && canvas.bottom >= top + el.clientHeight;
  })).toBe(true);

  await recordFrames(page);
  const before = await view.evaluate((el) => el.scrollTop);
  await page.getByLabel('Dimensions').fill('40'); // a new size: the output's size changes and the view re-centers
  await page.waitForFunction((before) => window.__frames.some((f) => Math.abs(f.scrollTop - before) > 100), before);
  const frames = await stopRecording(page);
  expect(frames.filter((f) => f.covered < f.view)).toEqual([]);
});

test('the PIXEL view shows an edit cell where it is after the grid changes size', async ({ page }) => {
  await openApp(page);
  await store(page, 'project', (p) => { p.typeAt(5, 5, ' ', { fg: '#ff00ff', bg: '#ff00ff' }); p.commitEdit(); }); // both halves magenta
  await tab(page, 'PIXEL').click(); // its overlay drawn, then the grid changes under it
  await settled(page);
  await page.getByLabel('Dimensions').fill('100'); // a canvas resize: with an edit, the grid gains columns
  await expect.poll(() => store(page, 'project', (p) => p.cols)).toBe(100);
  await settled(page);
  const zoom = await store(page, 'workspace', (w) => w.editZoom);
  await expect.poll(async () => { // the view re-centers on the new size a frame or two later: measured each time
    const box = await page.locator('article[tabindex="0"] .display').boundingBox();
    return screenPixel(page, box.x + 5.5 * zoom, box.y + 10.5 * zoom);
  }).toEqual([255, 0, 255]); // its top half, grid pixel (5, 10)
});

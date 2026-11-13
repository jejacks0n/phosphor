// The character rulers and guides: only the Hand (or Space held) drags a guide out of a ruler, moves it, or puts it
// back onto one; a guide stays on its character however the view scrolls or zooms; a drawing's guides and zero come
// back after a reload and with its saved file.
import { readFile } from 'node:fs/promises';
import { test, expect } from './support.js';
import { openApp, store, settled, cellPoint, drag, saveAs, autosaved, imageInput, zeroState } from './support.js';

const ws = (page, read) => store(page, 'workspace', read);
const guides = (page) => ws(page, (w) => w.guides);
const scroller = (page) => page.locator('.ansi-editor > article');
const rulersBox = (page) => page.getByRole('checkbox', { name: 'Rulers' });
const clearGuides = (page) => page.getByRole('button', { name: 'Clear guides' });

// The page x of the edge pos characters from the art's left, measured inside the display's border (cellPoint's cells
// take in the border, which puts its edges a pixel or two off).
async function edgeX(page, pos) {
  const display = page.locator('.ansi-editor .display');
  const { x } = await display.boundingBox();
  const inner = await display.evaluate((el) => ({ left: el.clientLeft, width: el.clientWidth }));
  return x + inner.left + pos * inner.width / await store(page, 'project', (p) => p.cols);
}
// The middle of a vertical guide's line on the page.
async function guideLine(page, index = 0) {
  const box = await page.locator(`.guide.v[data-index="${index}"]`).boundingBox();
  return { x: box.x + 5.5, y: box.y + box.height / 2 };
}
const middle = async (locator) => {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

// The Hand with the rulers on, and a guide dragged out of the left ruler to pos.
async function handWithRulers(page) {
  await page.keyboard.press('h');
  await rulersBox(page).check();
  await expect(page.locator('.guide-rulers.hand')).toBeVisible();
}
async function guideAt(page, pos) {
  const ruler = page.locator('.ruler.left');
  const from = await middle(ruler);
  const row = await cellPoint(page, 0, 10);
  await drag(page, from, { x: await edgeX(page, pos), y: row.y });
}

test('with the Hand, a guide drags out of the left ruler, moves, and goes back onto it', async ({ page }) => {
  await openApp(page);
  await handWithRulers(page);
  await guideAt(page, 10);
  expect(await guides(page)).toEqual([{ axis: 'v', pos: 10 }]);

  const cell = await cellPoint(page, 19, 10);
  await drag(page, await guideLine(page), cell);
  expect(await guides(page)).toEqual([{ axis: 'v', pos: 19.5 }]);

  await drag(page, await guideLine(page), await middle(page.locator('.ruler.top')));
  expect(await guides(page)).toEqual([]);
  await expect(page.locator('.guide')).toHaveCount(0);
});

test('with the Pencil, the ruler does nothing; holding Space moves a guide', async ({ page }) => {
  await openApp(page);
  await handWithRulers(page);
  await guideAt(page, 10);
  await page.keyboard.press('p');
  expect(await ws(page, (w) => w.activeTool)).toBe('pencil');
  await expect(page.locator('.guide-rulers.hand')).toHaveCount(0);
  await guideAt(page, 20);
  expect(await guides(page)).toEqual([{ axis: 'v', pos: 10 }]);

  const from = await guideLine(page);
  await page.mouse.move(from.x, from.y);   // over the view, so Space pans rather than pressing a button
  await page.keyboard.down('Space');
  await expect(page.locator('.guide-rulers.hand')).toBeVisible();
  await drag(page, from, { x: await edgeX(page, 15), y: from.y });
  await page.keyboard.up('Space');
  expect(await guides(page)).toEqual([{ axis: 'v', pos: 15 }]);
  expect(await ws(page, (w) => w.activeTool)).toBe('pencil');
});

test('a guide stays on its character when the view scrolls and zooms', async ({ page }) => {
  await openApp(page);
  await handWithRulers(page);
  await guideAt(page, 10);
  const onEdge = async () => Math.abs((await guideLine(page)).x - 0.5 - await edgeX(page, 10));   // the line's left
  const view = scroller(page);
  const before = await view.evaluate((el) => el.scrollTop);
  await view.evaluate((el) => { el.scrollTop -= 37; });
  expect(await view.evaluate((el) => el.scrollTop)).not.toBe(before);
  await expect.poll(onEdge).toBeLessThanOrEqual(1);

  const at = await cellPoint(page, 20, 10);
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  expect(await ws(page, (w) => w.ansiZoom)).toBeGreaterThan(1);
  await view.evaluate((el) => { el.scrollLeft += 37; });
  expect(await view.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(onEdge).toBeLessThanOrEqual(1);
});

test('guides come back after a reload, and with the saved file', async ({ page }) => {
  await openApp(page);
  await handWithRulers(page);
  await guideAt(page, 10);
  // Zero moved with the corner, to the middle of the character at column 5, row 3.
  await drag(page, await middle(page.locator('.ruler-corner')), await cellPoint(page, 5, 3));
  const kept = { guides: [{ axis: 'v', pos: 10 }], zero: { x: 5.5, y: 3.5 } };
  const shown = (page) => ws(page, (w) => ({ guides: w.guides, zero: w.rulerZero }));
  expect(await shown(page)).toEqual(kept);

  await autosaved(page);
  await page.reload();
  await settled(page);
  expect(await shown(page)).toEqual(kept);
  await expect(page.locator('.guide.v')).toHaveCount(1);

  const path = await (await saveAs(page, 'Save project (.phosphor)')).path();
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(zeroState(page)).toBeAttached();
  expect(await shown(page)).toEqual({ guides: [], zero: { x: 0, y: 0 } });
  await imageInput(page).setInputFiles({ name: 'gradient.phosphor', mimeType: 'application/octet-stream', buffer: await readFile(path) });
  await settled(page);
  expect(await shown(page)).toEqual(kept);
});

test('Rulers off hides the guides; Clear guides empties them', async ({ page }) => {
  await openApp(page);
  await handWithRulers(page);
  await guideAt(page, 10);
  await expect(page.locator('.guide')).toHaveCount(1);
  await rulersBox(page).uncheck();
  await expect(page.locator('.guide')).toHaveCount(0);
  await rulersBox(page).check();
  await expect(page.locator('.guide')).toHaveCount(1);
  await expect(clearGuides(page)).toBeEnabled();
  await clearGuides(page).click();
  await expect(page.locator('.guide')).toHaveCount(0);
  expect(await guides(page)).toEqual([]);
  await expect(clearGuides(page)).toBeDisabled();
});

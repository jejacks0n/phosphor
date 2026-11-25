import { test, expect } from './support.js';
import { openApp, store, cellPoint, drag, pickLayer } from './support.js';

const mergeButton = (page) => page.getByRole('button', { name: /^Merge .+ down into the layer below it/ });
const dialog = (page) => page.getByRole('dialog', { name: 'Merge down' });
const hasEdits = (page) => store(page, 'project', (p) => p.hasEdits);

async function drawLine(page, row) {
  await page.getByRole('button', { name: 'Pencil' }).click();
  await drag(page, await cellPoint(page, 4, row, 0), await cellPoint(page, 14, row, 0));
}

test('the merge dialog: centered, canceled three ways, keys kept inside, each choice merges', async ({ page }) => {
  await openApp(page);
  await drawLine(page, 5);

  await mergeButton(page).click();
  const box = await page.locator('.modal-dialog').boundingBox();
  const viewport = page.viewportSize();
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2);
  await expect(dialog(page).getByRole('button', { name: /^Keep crisp cells/ })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await mergeButton(page).click();
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toBeHidden();
  await mergeButton(page).click();
  await page.mouse.click(5, 5); // the backdrop
  await expect(dialog(page)).toBeHidden();
  expect(await hasEdits(page)).toBe(true);

  await mergeButton(page).click();
  const cells = await store(page, 'project', (p) => JSON.stringify(p.cells));
  await page.keyboard.press('Backspace');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(dialog(page)).toBeVisible();
  expect(await store(page, 'project', (p) => JSON.stringify(p.cells))).toBe(cells);

  await dialog(page).getByRole('button', { name: /^Keep crisp cells/ }).click();
  await expect(dialog(page)).toBeHidden();
  await expect.poll(() => hasEdits(page)).toBe(false); // on the next frame, under the busy note

  await page.getByRole('button', { name: 'Add layer' }).click(); // the merged layer went: a new one to draw on, picked
  await drawLine(page, 10);
  await mergeButton(page).click();
  await dialog(page).getByRole('button', { name: /^Blend into source image/ }).click();
  await expect.poll(() => hasEdits(page)).toBe(false);
});

test('a vector layer on the base asks how to merge too, and each choice merges its shapes in one undo step', async ({ page }) => {
  await openApp(page);
  await pickLayer(page, 'Base'); // so Add vector layer puts the vector layer directly on the base
  await pickLayer(page);
  const shapes = () => store(page, 'project', (p) => p.shapes.size), layers = () => store(page, 'project', (p) => p.layers.map((layer) => layer.kind).join());
  const state = () => store(page, 'project', (p) => ({ ownPixels: p.baseLayer.hasPaint, workingCopy: p.imageIsWorkingCopy }));
  await store(page, 'project', `(p) => p.addShape({ z: 0, closed: true, fill: '#ff0000', stroke: null, width: 1, m: [1, 0, 0, 1, 0, 0],
    points: [[10, 10, 0, 0, 0, 0, 0], [30, 10, 0, 0, 0, 0, 0], [30, 30, 0, 0, 0, 0, 0], [10, 30, 0, 0, 0, 0, 0]] })`);
  await page.keyboard.press('Escape'); // nothing selected: the whole layer
  const stack = await layers(), before = await state();
  for (const [choice, after] of [['Keep crisp cells', { ownPixels: true, workingCopy: before.workingCopy }], ['Blend into source image', { ownPixels: false, workingCopy: true }]]) {
    await mergeButton(page).click();
    await expect(dialog(page)).toContainText('Choose how to merge Vector 1 into Base:');
    await dialog(page).getByRole('button', { name: new RegExp(`^${choice}`) }).click();
    await expect(dialog(page)).toBeHidden();
    await expect.poll(shapes).toBe(0);
    await expect.poll(layers).toBe(stack.replace(',vector', '')); // the layer left the stack, none in its place
    expect(await state()).toEqual(after); // pressed into the base's own pixels, or part of the picture
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(shapes).toBe(1);
    expect(await layers()).toBe(stack);
    expect(await state()).toEqual(before);
    await pickLayer(page); // Vector 1 again, for the next
  }
});

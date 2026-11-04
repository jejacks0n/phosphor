// SVG files: from the start screen they open on VECTOR as shapes; dropped over a drawing they're added there,
// or opened in its place. What couldn't come in is said, and a broken file changes nothing.
import { readFileSync } from 'node:fs';
import { test, expect, imageInput, store, tab, settled, openApp, fixture } from './support.js';

const rose = readFileSync(fixture('svg/rose-mark.svg'));
const shapeCount = (page) => store(page, 'project', (p) => p.shapes.size);
const toast = (page) => page.locator('.app-toast');
const question = (page) => page.getByRole('dialog');

async function dropOn(page, selector, bytes, name) {
  await page.evaluate(([selector, bytes, name]) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([new Uint8Array(bytes)], name, { type: 'image/svg+xml' }));
    const target = document.querySelector(selector), box = target.getBoundingClientRect();
    for (const type of ['dragenter', 'dragover', 'drop']) {
      target.dispatchEvent(new DragEvent(type, { dataTransfer, bubbles: true, cancelable: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 }));
    }
  }, [selector, [...bytes], name]);
}

test('an SVG from the start screen opens on VECTOR as shapes', async ({ page }) => {
  await page.goto('/');
  await imageInput(page).setInputFiles(fixture('svg/rose-mark.svg'));
  await expect(tab(page, 'VECTOR')).toHaveAttribute('aria-selected', 'true');
  await settled(page);
  expect(await shapeCount(page)).toBe(6);
  expect(await store(page, 'workspace', (w) => w.vectorSelected.length)).toBe(6);
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('vselect');
  expect(await store(page, 'project', (p) => p.filename)).toBe('rose-mark');
});

test('an SVG dropped on the start screen opens it too', async ({ page }) => {
  await page.goto('/');
  await dropOn(page, 'article.drop-zone', rose, 'rose.svg');
  await expect(tab(page, 'VECTOR')).toHaveAttribute('aria-selected', 'true');
  expect(await shapeCount(page)).toBe(6);
});

test('an SVG dropped over a drawing asks Add or Open, and Add puts its shapes in', async ({ page }) => {
  await openApp(page);
  const cols = await store(page, 'project', (p) => p.cols);
  await dropOn(page, '.ansi-editor .display', rose, 'rose.svg');
  await expect(question(page)).toContainText('Add rose.svg?');
  await expect(question(page)).toContainText('As shapes on VECTOR');
  await question(page).getByRole('button', { name: /Add to this drawing/ }).click();
  await expect(question(page)).toBeHidden();
  await expect(tab(page, 'VECTOR')).toHaveAttribute('aria-selected', 'true');
  expect(await shapeCount(page)).toBe(6);
  expect(await store(page, 'project', (p) => p.cols)).toBe(cols); // the drawing stays
  await page.keyboard.press('ControlOrMeta+z');
  expect(await shapeCount(page)).toBe(0); // one step

  // Open instead: in place of this drawing.
  await dropOn(page, '.ansi-editor .display', rose, 'rose.svg');
  page.once('dialog', (dialog) => dialog.accept()); // the drawing has changes
  await question(page).getByRole('button', { name: /Open instead/ }).click();
  await expect(tab(page, 'VECTOR')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => store(page, 'project', (p) => p.filename)).toBe('rose');
  expect(await shapeCount(page)).toBe(6);
  expect(await store(page, 'project', (p) => p.canUndo)).toBe(true); // the shapes, one step on the new canvas
});

test('an SVG with text says what was left out and how to bring it', async ({ page }) => {
  await page.goto('/');
  const text = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 20"><rect width="50" height="20" fill="red"/><text y="15">Hi</text></svg>';
  await imageInput(page).setInputFiles({ name: 'words.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(text) });
  await expect(tab(page, 'VECTOR')).toHaveAttribute('aria-selected', 'true');
  await expect(toast(page)).toHaveText(/Left out: text\. .*convert it to curves/);
  expect(await shapeCount(page)).toBe(1);
});

test('a broken SVG says so and changes nothing', async ({ page }) => {
  await page.goto('/');
  await imageInput(page).setInputFiles({ name: 'broken.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect') });
  await expect(toast(page)).toHaveText(/Couldn't read this file as an SVG/);
  await expect(imageInput(page)).toBeAttached(); // still the start screen
  expect(await store(page, 'project', (p) => !!p.image)).toBe(false);

  await openApp(page);
  await settled(page);
  const before = await store(page, 'project', (p) => p.cells.map((c) => c.char).join(''));
  await dropOn(page, '.ansi-editor .display', Buffer.from('not svg at all'), 'broken.svg');
  await question(page).getByRole('button', { name: /Add to this drawing/ }).click();
  await expect(toast(page)).toHaveText(/Couldn't read this file as an SVG/);
  expect(await shapeCount(page)).toBe(0);
  expect(await store(page, 'project', (p) => p.cells.map((c) => c.char).join(''))).toBe(before);
  await expect(tab(page, 'ANSI')).toHaveAttribute('aria-selected', 'true');
});

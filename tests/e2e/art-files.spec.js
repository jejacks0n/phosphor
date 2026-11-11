// Opening .ans, .utf8ans, .asc and .txt files from the start screen: the file picker and the drop zone, each
// asking whether to edit the art or draw on top of it; and dropping one on an open drawing, to add it there or
// open it instead.
import { test, expect } from './support.js';
import { imageInput, chars, store, tab, settled, openApp, cellPoint, editAt, fixture } from './support.js';
import { Sauce } from '../../src/lib/Sauce.js';
import { readFile } from 'node:fs/promises';

// Two rows: "Hi" in red, then "there".
const boat = Buffer.from('\x1b[31mHi\x1b[0m\r\nthere', 'latin1');

const question = (page) => page.getByRole('dialog');
const editCount = (page) => store(page, 'project', (p) => p.editCells.size);

test('the file picker asks, then Draw on top of it opens a .ans on the ANSI tab as the base layer, named for the file', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Drop an image, .* or ANSI file here/)).toBeVisible();
  await imageInput(page).setInputFiles({ name: 'boat.ans', mimeType: 'application/octet-stream', buffer: boat });
  await expect(question(page)).toContainText('Open boat.ans?');
  await expect(question(page)).toContainText('Edit its art, or draw on top of it.');
  await question(page).getByRole('button', { name: /Draw on top of it/ }).click();
  await expect(tab(page, 'ANSI')).toHaveAttribute('aria-selected', 'true');
  await settled(page);
  expect(await chars(page, 0, 0, 1)).toBe('Hi');
  expect(await chars(page, 1, 0, 4)).toBe('there');
  expect(await store(page, 'project', (p) => p.filename)).toBe('boat');
  expect(await editCount(page)).toBe(0);
});

test('a .ans dropped on the start screen asks; Cancel leaves the start screen, and Edit it opens it on the edit layer', async ({ page }) => {
  await page.goto('/');
  const drop = () => page.evaluate((bytes) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], 'dropped.ans'));
    document.querySelector('article.drop-zone').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, [...boat]);
  await drop();
  await question(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(question(page)).toBeHidden();
  await expect(page.getByText(/Drop an image, .* or ANSI file here/)).toBeVisible();
  expect(await store(page, 'project', (p) => !!p.image)).toBe(false);

  await drop();
  await question(page).getByRole('button', { name: /Edit it/ }).click();
  await expect(tab(page, 'ANSI')).toHaveAttribute('aria-selected', 'true');
  await settled(page);
  expect(await chars(page, 0, 0, 1)).toBe('Hi');
  expect(await store(page, 'project', (p) => p.filename)).toBe('dropped');
  expect(await editCount(page)).toBeGreaterThan(0);
  expect(await store(page, 'project', (p) => p.editCellAt(0, 0)?.char)).toBe('H');
});

// A 3 x 2 .ans: ABC over DEF, 3 wide by its SAUCE, titled Tiny.
const tiny = [...new Sauce({ cols: 3, rows: 2 }, { title: 'Tiny' }).appendTo(Buffer.from('ABCDEF', 'latin1'))];

// Drop a file on the element at a selector, at a page point (or its middle), as dragging one from the desktop does.
async function dropOn(page, selector, bytes, name, at = null, type = '') {
  await page.evaluate(([selector, bytes, name, at, type]) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([new Uint8Array(bytes)], name, { type }));
    const target = document.querySelector(selector), box = target.getBoundingClientRect();
    const point = at ?? { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    for (const type of ['dragenter', 'dragover', 'drop']) {
      target.dispatchEvent(new DragEvent(type, { dataTransfer, bubbles: true, cancelable: true, clientX: point.x, clientY: point.y }));
    }
  }, [selector, bytes, name, at, type]);
}

const frames = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

test('a .ans dropped on the drawing can be added where it lands, as one undo step', async ({ page }) => {
  await openApp(page);
  const before = await store(page, 'project', (p) => ({ cells: p.cells.map((c) => c.char), title: p.sauceTitle, quantize: p.quantize, filename: p.filename }));
  await dropOn(page, '.ansi-editor .display', tiny, 'tiny.ans', await cellPoint(page, 10, 4));
  await expect(question(page)).toContainText('Add tiny.ans?');
  await expect(question(page)).toContainText('Add it to this drawing, or open it in place of this one.');
  await expect(question(page)).toContainText('It lands where you dropped it, on Layer 1,');
  await expect(page.locator('article.drop-zone')).not.toHaveClass(/dragging/); // the drop ended its highlight
  await question(page).getByRole('button', { name: /Add to this drawing/ }).click();
  await expect(question(page)).toBeHidden();
  await expect.poll(() => chars(page, 4, 10, 12)).toBe('ABC'); // once the file is read
  await settled(page);
  expect(await chars(page, 5, 10, 12)).toBe('DEF');
  expect(await store(page, 'workspace', (w) => ({ tool: w.activeTool, selection: w.selection }))).toEqual({ tool: 'select', selection: { c0: 10, r0: 4, c1: 12, r1: 5 } });
  expect(await store(page, 'project', (p) => ({ title: p.sauceTitle, quantize: p.quantize, filename: p.filename }))).toEqual({ title: before.title, quantize: before.quantize, filename: before.filename });

  await page.keyboard.press('ControlOrMeta+z');
  await settled(page);
  expect(await store(page, 'project', (p) => p.cells.map((c) => c.char))).toEqual(before.cells);
});

test('Open to edit opens the dropped file on the edit layer, after asking about unsaved work', async ({ page }) => {
  await openApp(page);
  await editAt(page, 3, 3);
  await page.keyboard.insertText('my work');
  await page.waitForTimeout(1300); // the typing run commits
  await dropOn(page, '.ansi-editor .display', tiny, 'tiny.ans', await cellPoint(page, 10, 4));
  const asked = [];
  page.once('dialog', (d) => { asked.push(d.message()); d.accept(); });
  await expect(question(page).getByRole('button', { name: /Open to draw on top/ })).toBeVisible();
  await question(page).getByRole('button', { name: /Open to edit/ }).click();
  await expect.poll(() => store(page, 'project', (p) => p.filename)).toBe('tiny');
  expect(asked).toEqual(['You have unsaved changes. Open tiny.ans anyway?']);
  await settled(page);
  expect(await store(page, 'project', (p) => ({ cols: p.cols, title: p.sauceTitle }))).toEqual({ cols: 3, title: 'Tiny' });
  expect(await chars(page, 0, 0, 2)).toBe('ABC');
  expect(await editCount(page)).toBe(6);
});

test('dropped beside the drawing, an added file lands at the top-left of the view', async ({ page }) => {
  await openApp(page, 'images/tall.png');
  await frames(page); // the view has its place
  await page.locator('.ansi-editor > article').evaluate((el) => { el.scrollTop = 3000; });
  await frames(page);
  const { col, row } = await store(page, 'workspace', (w) => w.ansiViewOrigin);
  expect(row).toBeGreaterThan(0);
  await dropOn(page, 'article.drop-zone', tiny, 'tiny.ans', { x: 1, y: 1 });
  await expect(question(page)).toContainText('It lands at the top-left of the view, on Layer 1,');
  await question(page).getByRole('button', { name: /Add to this drawing/ }).click();
  await expect.poll(() => chars(page, row, col, col + 2)).toBe('ABC'); // once the file is read
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: col, r0: row, c1: col + 2, r1: row + 1 });
});

test('dropped on the SAUCE tab, an added file lands in the art view last shown, and that view comes back', async ({ page }) => {
  await openApp(page);
  const { col, row } = await store(page, 'workspace', (w) => w.ansiViewOrigin);
  await tab(page, 'SAUCE').click();
  await dropOn(page, 'article.drop-zone', tiny, 'tiny.ans');
  await question(page).getByRole('button', { name: /Add to this drawing/ }).click();
  await expect(tab(page, 'ANSI')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => chars(page, row, col, col + 2)).toBe('ABC');
  expect(await store(page, 'workspace', (w) => ({ tool: w.activeTool, selection: w.selection }))).toEqual({ tool: 'select', selection: { c0: col, r0: row, c1: col + 2, r1: row + 1 } });
});

test('added while an animation plays, the file lands on the frame showing, paused there', async ({ page }) => {
  await openApp(page);
  await page.getByRole('switch', { name: 'Animate' }).check();
  const bar = page.getByRole('toolbar', { name: 'Animation' });
  await bar.getByRole('button', { name: 'Add frame' }).click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  // Start on frame 0, which holds briefly, then sit on frame 1 for a minute: playback has moved off the frame being edited.
  await store(page, 'project', (p) => { p.setHold(0, 0.2); p.setHold(1, 60); p.showFrame(0); });
  await bar.getByRole('button', { name: 'Play' }).click();
  await expect(bar.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(() => store(page, 'workspace', (w) => w.playFrame)).toBe(1);
  expect(await store(page, 'project', (p) => p.frame)).toBe(0);
  await dropOn(page, '.ansi-editor .display', tiny, 'tiny.ans', await cellPoint(page, 10, 4));
  await question(page).getByRole('button', { name: /Add to this drawing/ }).click();
  await expect(bar.getByRole('button', { name: 'Play' })).toBeVisible(); // paused
  await expect.poll(() => chars(page, 4, 10, 12)).toBe('ABC');
  expect(await store(page, 'project', (p) => p.frame)).toBe(1); // the frame that was showing took it
  await expect(bar.getByTestId('frame-indicator')).toHaveText('2 / 2');
  expect(await store(page, 'workspace', (w) => w.playing)).toBe(false);
});

test('with others drawing, the question offers no opening; Cancel leaves the drawing as it was', async ({ page }) => {
  await openApp(page);
  await store(page, 'drawing', (d) => d.$patch({ artists: ['someone'], connected: ['someone'] }));
  expect(await store(page, 'drawing', (d) => d.offWithOthers)).toBeTruthy();
  const before = await store(page, 'project', (p) => ({ cells: p.cells.map((c) => c.char), filename: p.filename, version: p.history.version }));
  await dropOn(page, '.ansi-editor .display', tiny, 'tiny.ans', await cellPoint(page, 10, 4));
  await expect(question(page).getByRole('button', { name: /Add to this drawing/ })).toBeVisible();
  await expect(question(page).getByRole('button', { name: /^Open/ })).toHaveCount(0);
  await expect(question(page)).toContainText('Add it to this drawing.');
  await expect(question(page)).not.toContainText('open it in place');
  await question(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(question(page)).toBeHidden();
  expect(await store(page, 'project', (p) => ({ cells: p.cells.map((c) => c.char), filename: p.filename, version: p.history.version }))).toEqual(before);
  expect(await store(page, 'workspace', (w) => w.artDrop)).toBe(null);
});

test('a picture dropped on a drawing asks: Add puts it on the layer picked as paint, one undo step; Open instead opens it', async ({ page }) => {
  await openApp(page);
  const filename = await store(page, 'project', (p) => p.filename);
  const photo = [...await readFile(fixture('images/photo.jpg'))];
  await dropOn(page, 'article.drop-zone', photo, 'photo.jpg', null, 'image/jpeg');
  await expect(question(page)).toContainText('Add photo.jpg?');
  await expect(question(page)).toContainText('Add it to Layer 1 as paint, fitted to the canvas.');
  await question(page).getByRole('button', { name: /Add to this drawing/ }).click();
  await expect(question(page)).toBeHidden();
  await expect.poll(() => store(page, 'project', (p) => p.paintOf('edit')?.hasPaint ?? false)).toBe(true);
  expect(await store(page, 'project', (p) => p.filename)).toBe(filename);
  await page.keyboard.press('ControlOrMeta+z');
  await settled(page);
  expect(await store(page, 'project', (p) => p.paintOf('edit')?.hasPaint ?? false)).toBe(false);

  page.once('dialog', (dialog) => dialog.accept()); // unsaved work
  await dropOn(page, 'article.drop-zone', photo, 'photo.jpg', null, 'image/jpeg');
  await question(page).getByRole('button', { name: /Open instead/ }).click();
  await expect.poll(() => store(page, 'project', (p) => p.filename)).toBe('photo');
});

test('choosing the same file again after Cancel asks again', async ({ page }) => {
  await page.goto('/');
  const choose = async () => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.desktop', { hasText: 'Choose a file' }).click()]);
    await chooser.setFiles({ name: 'long.ans', mimeType: 'application/octet-stream', buffer: boat });
  };
  await choose();
  await expect(question(page)).toContainText('Open long.ans?');
  await question(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(question(page)).toBeHidden();
  await choose();
  await expect(question(page)).toContainText('Open long.ans?');
});

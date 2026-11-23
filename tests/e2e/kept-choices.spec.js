// The colors, the tool on each tab and the tools' options come back with the page (store/kept.js), each tab its own.
import { test, expect, openApp, editAt, settled, store, chars, tab, cellPoint } from './support.js';

const tools = (page) => store(page, 'workspace', (w) => ({ input: w.inputActiveTool, output: w.outputActiveTool }));
const documentId = (page) => store(page, 'project', (p) => p.documentId);

// Whether autosave has written the open document, so a reload brings it back.
const writtenDocument = (page, id) => page.evaluate((id) => new Promise((resolve, reject) => {
  const open = indexedDB.open('phosphor-autosave', 1);
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const get = db.transaction('documents').objectStore('documents').get(id);
    get.onsuccess = () => { db.close(); resolve(!!get.result); };
  };
}), id);

async function reload(page) {
  const id = await documentId(page);
  await expect.poll(() => writtenDocument(page, id)).toBe(true);
  await page.reload();
  await expect(page.locator('.ansi-editor .display')).toBeVisible();
  await settled(page);
}

async function go(page, name) {
  await tab(page, name).click();
  await settled(page);
}

test('a reload on ANSI brings back each tab\'s own tool, the colors and an option', async ({ page }) => {
  await openApp(page);
  await go(page, 'PIXEL');
  await page.keyboard.press('m'); // PIXEL: Select, which ANSI takes on the way
  await go(page, 'ANSI');
  await page.keyboard.press('p'); // ANSI: the Pencil
  await store(page, 'workspace', (w) => { w.setColor('fg', '#3366cc'); w.wandTolerance = 42; });
  expect(await tools(page)).toEqual({ input: 'select', output: 'pencil' });

  await reload(page);
  expect(await tools(page)).toEqual({ input: 'select', output: 'pencil' }); // landing on ANSI isn't leaving PIXEL
  expect(await store(page, 'workspace', (w) => [w.editFgColor, w.wandTolerance])).toEqual(['#3366cc', 42]);
  await go(page, 'PIXEL');
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('select');
});

test('Edit Mode kept on ANSI types where it\'s clicked after a reload', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.keyboard.insertText('a');
  await page.keyboard.press('Escape');

  await reload(page);
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('text');
  const at = await cellPoint(page, 5, 4);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => document.activeElement?.dataset?.textInput !== undefined);
  await page.keyboard.insertText('z');
  await expect.poll(() => chars(page, 4, 5, 5)).toBe('z');
});

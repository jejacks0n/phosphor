import { test, expect, openApp, editAt, saveAs, settled, store } from './support.js';

// Whether leaving would ask right now: beforeunload's answer, without leaving.
const leavingAsks = (page) => page.evaluate(() => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
});

// How many documents the browser holds.
const written = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const open = indexedDB.open('phosphor-autosave', 1);
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const count = db.transaction('documents').objectStore('documents').count();
    count.onsuccess = () => { db.close(); resolve(count.result); };
  };
}));

test('never saved to a file: leaving asks; saved once and written: it does not', async ({ page }) => {
  const dialogs = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.type());
    return dialog.dismiss();
  });

  await openApp(page);
  await editAt(page, 3, 3);
  await page.keyboard.insertText('unsaved');
  await settled(page);
  await expect.poll(() => store(page, 'project', (p) => !!p._stroke)).toBe(false);
  await expect.poll(() => written(page)).toBe(1);
  await page.waitForTimeout(1500); // written, however long it takes: it still asks
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => dialogs).toEqual(['beforeunload']);
  expect(page.isClosed()).toBe(false);

  await saveAs(page, 'Save Project (.phosphor)');
  await editAt(page, 3, 4);
  await page.keyboard.insertText('and more');
  await expect.poll(() => store(page, 'project', (p) => p.isDirty && !p._stroke)).toBe(true);
  await expect.poll(() => leavingAsks(page)).toBe(false);

  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(dialogs).toEqual(['beforeunload']);
});

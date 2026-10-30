import { test, expect, openApp, editAt, saveAs, settled, store, chars, imageInput, tab, cellPoint, fixture } from './support.js';

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

// The record of the document open in this page, without its bytes; null until it's written.
async function record(page) {
  const id = await store(page, 'project', (p) => p.documentId);
  return page.evaluate((id) => new Promise((resolve, reject) => {
    const open = indexedDB.open('phosphor-autosave', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const get = db.transaction('documents').objectStore('documents').get(id);
      get.onsuccess = () => {
        db.close();
        resolve(get.result ? { ...get.result, rest: null } : null);
      };
    };
  }), id);
}

// Types at a cell in a document that has had its opening write, and waits for the text to be written.
async function typeAndWrite(page, col, row, text) {
  await expect.poll(() => record(page)).not.toBe(null);
  const { editedAt } = await record(page);
  await editAt(page, col, row);
  await page.keyboard.insertText(text);
  await expect.poll(async () => (await record(page)).editedAt).not.toBe(editedAt);
}

// A restored document's page, ready to read.
async function restored(page) {
  await expect(page.locator('.ansi-editor .display')).toBeVisible();
  await settled(page);
}

const undoButton = (page) => page.getByRole('button', { name: /^Undo/ });
const recentList = (page) => page.getByRole('list', { name: 'Continue where you left off' });

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

test('a refresh brings back your work', async ({ page }) => {
  await openApp(page);
  await typeAndWrite(page, 3, 3, 'kept');
  await settled(page);
  expect(await chars(page, 3, 3, 6)).toBe('kept');
  const before = await store(page, 'project', (p) => JSON.stringify(p.cells));

  await page.reload();
  await restored(page);
  expect(await store(page, 'project', (p) => JSON.stringify(p.cells))).toBe(before);
  await expect(undoButton(page)).toBeDisabled();
  await expect(imageInput(page)).toHaveCount(0);
});

test('a new tab offers recent work and opens it; a tab open on it is marked and disabled', async ({ page, context }) => {
  await openApp(page);
  await typeAndWrite(page, 3, 3, 'kept');

  const other = await context.newPage();
  await other.goto('/');
  await expect(imageInput(other)).toBeAttached();
  const row = recentList(other).getByRole('listitem');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('gradient');
  await expect(row.getByRole('button')).toBeDisabled();
  await expect(row.getByRole('button')).toHaveText('Open in another tab');

  await page.close();
  await other.reload();
  await expect(row.getByRole('button')).toBeEnabled();
  await row.getByRole('button').click();
  await restored(other);
  expect(await chars(other, 3, 3, 6)).toBe('kept');
  await expect(undoButton(other)).toBeDisabled();
});

test('a duplicated tab is its own copy', async ({ page, context }) => {
  await openApp(page);
  await typeAndWrite(page, 3, 3, 'orig');
  const original = await store(page, 'project', (p) => p.documentId);

  const [copy] = await Promise.all([context.waitForEvent('page'), page.evaluate(() => { window.open('/'); })]);
  await restored(copy);
  expect(await chars(copy, 3, 3, 6)).toBe('orig');
  const copied = await store(copy, 'project', (p) => p.documentId);
  expect(copied).not.toBe(original);

  await typeAndWrite(copy, 3, 4, 'copy');
  await typeAndWrite(page, 3, 5, 'mine');

  await page.reload();
  await restored(page);
  await copy.reload();
  await restored(copy);
  expect(await store(page, 'project', (p) => p.documentId)).toBe(original);
  expect(await store(copy, 'project', (p) => p.documentId)).toBe(copied);
  expect(await chars(page, 5, 3, 6)).toBe('mine');
  expect(await chars(page, 4, 3, 6)).not.toBe('copy');
  expect(await chars(copy, 4, 3, 6)).toBe('copy');
  expect(await chars(copy, 5, 3, 6)).not.toBe('mine');
});

test('an unreadable record opens the zero state', async ({ page }) => {
  await openApp(page);
  await expect.poll(() => record(page)).not.toBe(null);
  const id = await store(page, 'project', (p) => p.documentId);
  await page.evaluate((id) => new Promise((resolve, reject) => {
    const open = indexedDB.open('phosphor-autosave', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('documents', 'readwrite');
      const documents = tx.objectStore('documents');
      const get = documents.get(id);
      get.onsuccess = () => documents.put({ ...get.result, rest: new TextEncoder().encode('junk').buffer });
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }), id);

  await page.reload();
  await expect(imageInput(page)).toBeAttached();
  expect(await store(page, 'project', (p) => p.image)).toBe(null);
  expect(await page.evaluate(() => sessionStorage.getItem('phosphor-autosave-document'))).toBe(null);
});

test('Start New Project keeps the old work in the list, and a refresh stays at the zero state', async ({ page }) => {
  await openApp(page);
  await typeAndWrite(page, 3, 3, 'kept');
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Start New Project' }).click();
  await expect(imageInput(page)).toBeAttached();
  const button = recentList(page).getByRole('listitem').getByRole('button');
  await expect(recentList(page)).toContainText('gradient');
  await expect(button).toBeEnabled();

  await page.reload();
  await expect(imageInput(page)).toBeAttached();
  expect(await store(page, 'project', (p) => p.image)).toBe(null);
  await expect(recentList(page)).toContainText('gradient');
  await expect(button).toBeEnabled();
});

const versionsButton = (page) => page.getByRole('button', { name: 'Versions', exact: true });
const versionsDialog = (page) => page.getByRole('dialog', { name: 'Versions' });
const versionRows = (page) => versionsDialog(page).getByRole('listitem');

// How many versions of the open document the browser holds.
async function versionCount(page) {
  const id = await store(page, 'project', (p) => p.documentId);
  return page.evaluate((id) => new Promise((resolve, reject) => {
    const open = indexedDB.open('phosphor-autosave', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const count = db.transaction('versions').objectStore('versions').index('documentId').count(id);
      count.onsuccess = () => { db.close(); resolve(count.result); };
    };
  }), id);
}

// Types more at a cell of a document already in Edit Mode, and waits for it to be written.
async function typeMore(page, col, row, text) {
  const { editedAt } = await record(page);
  const at = await cellPoint(page, col, row);
  await page.mouse.click(at.x, at.y);
  await page.keyboard.insertText(text);
  await expect.poll(async () => (await record(page)).editedAt).not.toBe(editedAt);
}

// A document with a version after the first edit, and a second one made past 5 minutes later.
// Returns the cells as they were at the first.
async function twoVersions(page) {
  await page.clock.install();
  await openApp(page);
  await typeAndWrite(page, 3, 3, 'first');
  await settled(page);
  const first = await store(page, 'project', (p) => JSON.stringify(p.cells));
  await expect.poll(() => versionCount(page)).toBe(1);
  await page.clock.fastForward('06:00');
  await typeMore(page, 3, 5, 'second');
  await expect.poll(() => versionCount(page)).toBe(2);
  return first;
}

test('a version appears after 5 minutes of changes, and Restore brings it back', async ({ page }) => {
  const first = await twoVersions(page);
  await versionsButton(page).click();
  await expect(versionRows(page)).toHaveCount(2);
  await versionRows(page).nth(1).getByRole('button', { name: 'Restore' }).click();
  await expect(versionsDialog(page)).toHaveCount(0);
  await settled(page);
  expect(await store(page, 'project', (p) => JSON.stringify(p.cells))).toBe(first);
  await expect(undoButton(page)).toBeDisabled();
});

test('restoring keeps what you had as Before restoring', async ({ page }) => {
  const first = await twoVersions(page);
  const second = await store(page, 'project', (p) => JSON.stringify(p.cells));
  await versionsButton(page).click();
  await versionRows(page).nth(1).getByRole('button', { name: 'Restore' }).click();
  await expect(versionsDialog(page)).toHaveCount(0);
  await settled(page);
  expect(await store(page, 'project', (p) => JSON.stringify(p.cells))).toBe(first);

  await versionsButton(page).click();
  const kept = versionRows(page).filter({ hasText: 'Before restoring' });
  await expect(kept).toHaveCount(1);
  await kept.getByRole('button', { name: 'Restore' }).click();
  await expect(versionsDialog(page)).toHaveCount(0);
  await settled(page);
  expect(await store(page, 'project', (p) => JSON.stringify(p.cells))).toBe(second);
  expect(await chars(page, 5, 3, 8)).toBe('second');
});

test('no versions says so, and the button waits for an image', async ({ page }) => {
  await page.goto('/');
  await expect(imageInput(page)).toBeAttached();
  await expect(versionsButton(page)).toBeDisabled();

  await imageInput(page).setInputFiles(fixture('images/gradient.png'));
  await tab(page, 'ANSI').click();
  await settled(page);
  await versionsButton(page).click();
  await expect(versionsDialog(page)).toContainText('No versions yet');
  await expect(versionRows(page)).toHaveCount(0);
});

test('the dialog focuses, and Escape closes it without changing anything', async ({ page }) => {
  const first = await twoVersions(page);
  const second = await store(page, 'project', (p) => JSON.stringify(p.cells));
  expect(second).not.toBe(first);
  await versionsButton(page).click();
  await expect(versionRows(page)).toHaveCount(2);
  await expect(versionsDialog(page).locator(':focus')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(versionsDialog(page)).toHaveCount(0);
  expect(await store(page, 'project', (p) => JSON.stringify(p.cells))).toBe(second);
  expect(await versionCount(page)).toBe(2);
});

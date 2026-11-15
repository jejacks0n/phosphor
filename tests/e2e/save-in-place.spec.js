// Saving over a project's file where the browser has File System Access (Chromium). Playwright can't answer the
// browser's own pickers, so they're stand-ins giving files in the origin's private file system, and the permission
// the browser asks for before writing is answered here (and counted): not yet given on each page, as after a reload.
import { readFileSync } from 'node:fs';
import { test, expect, fixture, store, settled, editAt, zeroState } from './support.js';

const PROJECT = readFileSync(fixture('projects/charmode.phosphor')).toString('base64');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const file = async (name) => (await navigator.storage.getDirectory()).getFileHandle(name, { create: true });
    window.asked = { open: 0, save: 0, permission: 0 };
    window.showOpenFilePicker = async () => { window.asked.open++; return [await file('opened.phosphor')]; };
    window.showSaveFilePicker = async ({ suggestedName }) => { window.asked.save++; return file(`as-${suggestedName}`); };
    let allowed = false;
    FileSystemHandle.prototype.queryPermission = async () => (allowed ? 'granted' : 'prompt');
    FileSystemHandle.prototype.requestPermission = async () => { window.asked.permission++; allowed = true; return 'granted'; };
  });
});

const asked = (page) => page.evaluate(() => window.asked);
const fileBytes = (page, name) => page.evaluate(async (name) => {
  const handle = await (await navigator.storage.getDirectory()).getFileHandle(name);
  return Array.from(new Uint8Array(await (await handle.getFile()).arrayBuffer()));
}, name);
const save = (page) => page.getByRole('button', { name: 'Save project (.phosphor)' }).click();
const saved = (page) => expect.poll(() => store(page, 'project', (p) => !p.isDirty)).toBe(true);

test('a project opened with Cmd/Ctrl+O saves back over its file, asking once a page; Save As asks where', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async (base64) => {
    const writable = await (await (await navigator.storage.getDirectory()).getFileHandle('opened.phosphor', { create: true })).createWritable();
    await writable.write(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
    await writable.close();
  }, PROJECT);
  await expect(zeroState(page)).toBeVisible();
  await page.keyboard.press('ControlOrMeta+o');
  await expect.poll(() => store(page, 'project', (p) => p.filename)).toBe('opened');
  await settled(page);
  const original = await fileBytes(page, 'opened.phosphor');

  await editAt(page, 1, 1);
  await page.keyboard.insertText('in place');
  await settled(page);
  await save(page);
  await saved(page);
  await expect(page.locator('dialog')).toHaveCount(0); // no save dialog
  expect(await asked(page)).toEqual({ open: 1, save: 0, permission: 1 });
  const first = await fileBytes(page, 'opened.phosphor');
  expect(first).not.toEqual(original);
  expect(first.slice(0, 2)).toEqual([0x1f, 0x8b]); // a project file, gzipped as Save project writes it

  await page.keyboard.insertText('!');
  await settled(page);
  await save(page);
  await saved(page);
  expect((await asked(page)).permission).toBe(1); // given for this page
  expect(await fileBytes(page, 'opened.phosphor')).not.toEqual(first);

  // A reload keeps the file it's saved to; the browser asks again before the first save.
  await page.reload();
  await expect.poll(() => store(page, 'project', (p) => p.filename)).toBe('opened');
  await settled(page);
  await editAt(page, 2, 2);
  await page.keyboard.insertText('back');
  await settled(page);
  const before = await fileBytes(page, 'opened.phosphor');
  await save(page);
  await saved(page);
  expect(await asked(page)).toEqual({ open: 0, save: 0, permission: 1 });
  expect(await fileBytes(page, 'opened.phosphor')).not.toEqual(before);

  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+Shift+s');
  await expect.poll(() => store(page, 'project', (p) => p.filename)).toBe('as-opened');
  expect((await asked(page)).save).toBe(1);
});

test('a project the installed app is launched with (a file double-clicked) opens and saves back over its file', async ({ page }) => {
  // Chromium's own launchQueue, read-only, stood in for: a page opened by a launch, its consumer called here.
  await page.addInitScript(() => Object.defineProperty(window, 'launchQueue', { value: { setConsumer: (take) => { window.launch = take; } } }));
  await page.goto('/');
  await expect(zeroState(page)).toBeVisible();
  await page.evaluate(async (base64) => {
    const handle = await (await navigator.storage.getDirectory()).getFileHandle('launched.phosphor', { create: true });
    const writable = await handle.createWritable();
    await writable.write(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
    await writable.close();
    await window.launch({ files: [handle] });
  }, PROJECT);
  await expect.poll(() => store(page, 'project', (p) => p.filename)).toBe('launched');
  await settled(page);
  const original = await fileBytes(page, 'launched.phosphor');
  await editAt(page, 1, 1);
  await page.keyboard.insertText('launched');
  await settled(page);
  await save(page);
  await saved(page);
  expect(await asked(page)).toEqual({ open: 0, save: 0, permission: 1 });
  expect(await fileBytes(page, 'launched.phosphor')).not.toEqual(original);
});

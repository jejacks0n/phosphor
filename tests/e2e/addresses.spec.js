// The address, and the browser's Back, Forward and reload.
import { test, expect, openApp, tab, store, imageInput, fixture } from './support.js';
import { fakeServer } from './social-support.js';

const selected = (page, label) => expect(tab(page, label)).toHaveAttribute('aria-selected', 'true');
const hash = (page, path) => expect.poll(() => new URL(page.url()).hash).toBe(`#${path}`);

// history.length as each page load found it, to compare with what it is now.
const noteHistoryAtLoad = (page) => page.addInitScript(() => { window.historyAtLoad = history.length; });
const stepsSinceLoad = (page) => page.evaluate(() => history.length - window.historyAtLoad);

// The document written to the browser, so a reload can bring it back.
const written = (page) => expect.poll(async () => {
  const id = await store(page, 'project', (p) => p.documentId);
  return page.evaluate((id) => new Promise((resolve, reject) => {
    const open = indexedDB.open('phosphor-autosave', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const get = db.transaction('documents').objectStore('documents').get(id);
      get.onsuccess = () => { db.close(); resolve(!!get.result); };
    };
  }), id);
}).toBe(true);

test('Back and Forward walk the tabs, inside Phosphor', async ({ page }) => {
  await openApp(page);
  await hash(page, '/ansi');
  await tab(page, 'SAUCE').click();
  await hash(page, '/sauce');
  await tab(page, 'SOCIAL').click();
  await hash(page, '/social');

  await page.goBack();
  await selected(page, 'SAUCE');
  await hash(page, '/sauce');
  await page.goBack();
  await selected(page, 'ANSI');
  await hash(page, '/ansi');
  await page.goForward();
  await selected(page, 'SAUCE');
  await hash(page, '/sauce');
  expect(await store(page, 'project', (p) => !!p.image)).toBe(true);   // the same page all along
});

for (const [label, path] of [['PIXEL', '/pixel'], ['ANSI', '/ansi'], ['SAUCE', '/sauce'], ['SOCIAL', '/social']]) {
  test(`reloading on ${label} stays on it, with the autosaved document back`, async ({ page }) => {
    await openApp(page);
    await tab(page, label).click();
    await hash(page, path);
    await written(page);

    await page.reload();
    await expect.poll(() => store(page, 'project', (p) => !!p.image)).toBe(true);
    await selected(page, label);
    await hash(page, path);
  });
}

test('reloading on a SOCIAL page stays on it', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/');
  await tab(page, 'SOCIAL').click();
  await page.locator('.people-tab [data-page="lobby"]').getByRole('complementary').getByRole('button', { name: 'Sign in', exact: true }).click();
  await hash(page, '/social/sign-in');

  await page.reload();
  await selected(page, 'SOCIAL');
  await expect(page.locator('.people-tab [data-page="sign-in"]')).toBeVisible();
  await hash(page, '/social/sign-in');
});

test('a load at / with an autosaved document still opens on ANSI, with no extra step', async ({ page }) => {
  await noteHistoryAtLoad(page);
  await openApp(page);
  await written(page);

  // A full load at /, keeping the tab's document: what a reload would be without an address.
  await page.goto('/');
  await expect.poll(() => store(page, 'project', (p) => !!p.image)).toBe(true);
  await selected(page, 'ANSI');
  await hash(page, '/ansi');
  expect(await stepsSinceLoad(page)).toBe(0);
});

test('reloading /ansi with nothing saved lands on PIXEL with no extra step', async ({ page }) => {
  await noteHistoryAtLoad(page);
  await page.goto('/#/ansi');
  await selected(page, 'PIXEL');
  await hash(page, '/pixel');
  await expect(imageInput(page)).toBeAttached();   // the start screen
  expect(await stepsSinceLoad(page)).toBe(0);
});

test('/ landing is the default tab and no step of its own', async ({ page }) => {
  await noteHistoryAtLoad(page);
  await page.goto('/');
  await selected(page, 'PIXEL');
  await hash(page, '/pixel');
  expect(await stepsSinceLoad(page)).toBe(0);
});

test('opening a file is a step', async ({ page }) => {
  await page.goto('/');
  await hash(page, '/pixel');
  await imageInput(page).setInputFiles(fixture('images/gradient.png'));
  await selected(page, 'ANSI');
  await hash(page, '/ansi');

  await page.goBack();
  await selected(page, 'PIXEL');
  await hash(page, '/pixel');
});

test('a phone at #/social is on the art tab', async ({ page }) => {
  await noteHistoryAtLoad(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/#/social');
  await selected(page, 'PIXEL');
  await hash(page, '/pixel');
  expect(await stepsSinceLoad(page)).toBe(0);
});

// The address, and the browser's Back, Forward and reload.
import { test, expect, openApp, tab, store, imageInput, fixture, startScreen, autosaved } from './support.js';
import { fakeServer, member, shown, openLobby } from './social-support.js';

const selected = (page, label) => expect(tab(page, label)).toHaveAttribute('aria-selected', 'true');
const hash = (page, path) => expect.poll(() => new URL(page.url()).hash).toBe(`#${path}`);

// history.length as each page load found it, to compare with what it is now.
const noteHistoryAtLoad = (page) => page.addInitScript(() => { window.historyAtLoad = history.length; });
const stepsSinceLoad = (page) => page.evaluate(() => history.length - window.historyAtLoad);

test('Back and Forward walk the tabs, inside Phosphor; the lobby opening is no step', async ({ page }) => {
  await fakeServer(page);
  await openApp(page);
  await hash(page, '/ansi');
  await tab(page, 'SAUCE').click();
  await hash(page, '/sauce');
  await tab(page, 'PIXEL').click();
  await hash(page, '/pixel');
  await openLobby(page);
  await expect(shown(page, 'lobby')).toBeVisible();
  await hash(page, '/pixel');

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

// ANSI and SAUCE land by the same rule as PIXEL.
test('reloading on PIXEL stays on it, with the autosaved document back', async ({ page }) => {
  await openApp(page);
  await tab(page, 'PIXEL').click();
  await hash(page, '/pixel');
  await autosaved(page);

  await page.reload();
  await expect.poll(() => store(page, 'project', (p) => !!p.image)).toBe(true);
  await selected(page, 'PIXEL');
  await hash(page, '/pixel');
});

// /social is no place of its own any more: an old link or bookmark to it opens the lobby in the side panel.
test('a load at /social opens the lobby over the autosaved document, at its tab\'s address, with no extra step', async ({ page }) => {
  await fakeServer(page);
  await noteHistoryAtLoad(page);
  await openApp(page);
  await autosaved(page);

  await page.goto('about:blank');
  await page.goto('/#/social');
  await expect.poll(() => store(page, 'project', (p) => !!p.image)).toBe(true);
  await expect(shown(page, 'lobby')).toBeVisible();
  await selected(page, 'ANSI');
  await hash(page, '/ansi');
  expect(await stepsSinceLoad(page)).toBe(0);
});

test('reloading on a SOCIAL page stays on it', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/');
  await openLobby(page);
  await shown(page, 'lobby').getByRole('button', { name: 'Sign in to socialize' }).click();
  await hash(page, '/social/sign-in');

  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
  await expect(shown(page, 'sign-in')).toBeVisible();
  await hash(page, '/social/sign-in');
});

test('a load at / with an autosaved document still opens on ANSI, with no extra step', async ({ page }) => {
  await noteHistoryAtLoad(page);
  await openApp(page);
  await autosaved(page);

  // A full load at /, keeping the tab's document: what a reload would be without an address.
  await page.goto('/');
  await expect.poll(() => store(page, 'project', (p) => !!p.image)).toBe(true);
  await selected(page, 'ANSI');
  await hash(page, '/ansi');
  expect(await stepsSinceLoad(page)).toBe(0);
});

test('reloading /ansi with nothing saved lands on the start screen at / with no extra step', async ({ page }) => {
  await noteHistoryAtLoad(page);
  await page.goto('/#/ansi');
  await startScreen(page);
  await hash(page, '/');
  expect(await stepsSinceLoad(page)).toBe(0);
});

test('/ with nothing open is the start screen, and no step of its own', async ({ page }) => {
  await noteHistoryAtLoad(page);
  await page.goto('/');
  await startScreen(page);
  await hash(page, '/');
  expect(await stepsSinceLoad(page)).toBe(0);
});

test('opening a file goes from the start screen to ANSI, in place of it: the start screen is no step', async ({ page }) => {
  await noteHistoryAtLoad(page);
  await page.goto('/');
  await hash(page, '/');
  await imageInput(page).setInputFiles(fixture('images/gradient.png'));
  await selected(page, 'ANSI');
  await hash(page, '/ansi');
  expect(await stepsSinceLoad(page)).toBe(0);

  await tab(page, 'PIXEL').click();   // tabs are steps again, with something open
  await hash(page, '/pixel');
  await page.goBack();
  await selected(page, 'ANSI');
});

test('an address for a SOCIAL page you can\'t be on lands on the nearest one, with no extra step', async ({ page }) => {
  await fakeServer(page);
  await noteHistoryAtLoad(page);
  await page.goto('/#/social/account');
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
  await expect(shown(page, 'sign-in')).toBeVisible();
  await hash(page, '/social/sign-in');
  expect(await stepsSinceLoad(page)).toBe(0);
});

test('reloading on Account while signed in stays on it', async ({ page }) => {
  await fakeServer(page, { me: member() });
  await page.goto('/#/social/account');
  await expect(shown(page, 'account')).toBeVisible();
  await page.reload();
  await expect(shown(page, 'account')).toBeVisible();
  await hash(page, '/social/account');
});

test('the reset address holds no token', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/?reset=abc');
  await expect(shown(page, 'reset')).toBeVisible();
  await hash(page, '/social/reset');
  expect(page.url()).not.toContain('abc');

  await page.reload();   // the token is gone with it, so the page can't be shown: nothing open, the start screen
  await expect(shown(page, 'reset')).toHaveCount(0);
  await startScreen(page);
  await hash(page, '/');
});

// The returns from the server's links, on a fresh load: the lobby, or the page they open over the start screen,
// and an address with none of them. Back from connecting a provider, Account opens while you're still loading,
// without a crash.
for (const [query, me, name, path, more = ''] of [
  ['verified=1', null, 'lobby', '/'],
  ['social=error', null, 'lobby', '/'],
  ['social=signed-in', member(), 'lobby', '/'],
  ['social=linked', member({ providers: ['credential', 'discord'] }), 'account', '/social/account', ', its ways to sign in there'],
]) {
  test(`a fresh load at ?${query} is on ${path}${more}, with no extra step and no error`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await fakeServer(page, { me });
    await noteHistoryAtLoad(page);
    await page.goto(`/?${query}`);
    await expect(shown(page, name)).toBeVisible();
    if (name === 'account') await expect(shown(page, name).getByRole('button', { name: 'Disconnect Discord' })).toBeVisible();
    await hash(page, path);
    expect(new URL(page.url()).search).toBe('');
    expect(await stepsSinceLoad(page)).toBe(0);
    expect(errors).toEqual([]);
  });
}

// Back from where a form took you: the form's entry is the drawing now (the lobby beside it is no step), so it's
// the one press that shows no change, and no form comes back to land on.
async function backToTheDrawing(page) {
  await hash(page, '/ansi');
  await page.goBack();
  await hash(page, '/ansi');
  await selected(page, 'ANSI');
  await expect(page.locator('.people-forms')).toHaveCount(0);
  expect(await store(page, 'project', (p) => !!p.image)).toBe(true);   // the same page all along
}

async function drawingThenSignIn(page, button = 'Sign in to socialize') {
  await openApp(page);
  await openLobby(page);
  await shown(page, 'lobby').getByRole('button', { name: button, exact: true }).click();
}

async function submitSignIn(page) {
  const form = shown(page, 'sign-in');
  await form.getByLabel('Email or username').fill('fan@example.com');
  await form.getByLabel('Password').fill('correct horse battery');
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('signing in leaves one dead Back, onto the drawing', async ({ page }) => {
  await fakeServer(page);
  await drawingThenSignIn(page);
  await submitSignIn(page);
  await expect(shown(page, 'lobby').locator('.you')).toContainText('ansi-fan');
  await backToTheDrawing(page);
});

test('signing in with a code leaves one dead Back, onto the drawing', async ({ page }) => {
  await fakeServer(page, { twoFactor: true });
  await drawingThenSignIn(page);
  await submitSignIn(page);
  const form = shown(page, 'two-factor');
  await form.getByLabel('Code from your authenticator app').fill('123456');
  await form.getByRole('button', { name: 'Verify' }).click();
  await expect(shown(page, 'lobby').locator('.you')).toContainText('ansi-fan');
  await backToTheDrawing(page);
});

test('creating an account leaves one dead Back, onto the drawing', async ({ page }) => {
  await fakeServer(page);
  await drawingThenSignIn(page, 'Create one');
  const form = shown(page, 'create');
  await form.getByLabel('Username').fill('pixel_wren');
  await form.getByLabel('Email').fill('wren@example.com');
  await form.getByLabel('Password').fill('a long new password');
  await form.getByRole('checkbox').first().check();
  await form.getByRole('button', { name: 'Create account' }).click();
  await expect(shown(page, 'lobby').locator('.you')).not.toContainText('guest');
  await backToTheDrawing(page);
});

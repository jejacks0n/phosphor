// The Account page: your username, the ways to sign in, who you blocked, and deleting the account.
import { test, expect, tab, store } from './support.js';
import { fakeServer, member } from './social-support.js';

const social = (page) => page.locator('.social-tab');
const shown = (page, name) => social(page).locator(`[data-page="${name}"]`);

async function openAccount(page) {
  await page.goto('/');
  if (await store(page, 'workspace', (w) => w.editorTab) !== 'social') await tab(page, 'SOCIAL').click();
  await shown(page, 'lobby').getByRole('button', { name: 'Account' }).click();
  return shown(page, 'account');
}

test('rename: Change opens a field, Save sends it, and the lobby shows the new name', async ({ page }) => {
  const server = await fakeServer(page, { me: member() });
  const account = await openAccount(page);
  await expect(account.getByText('Once every 30 days. Your color comes from your username.')).toBeVisible();
  await account.getByRole('button', { name: 'Change', exact: true }).click();
  await account.getByRole('textbox', { name: 'Username' }).fill('pixel-pal');
  await account.getByRole('button', { name: 'Save' }).click();
  await expect(account.getByRole('button', { name: 'Change', exact: true })).toBeVisible();
  await expect(account.locator('.username')).toHaveText('pixel-pal');
  expect(server.sent('PATCH', '/api/me/username').map((r) => r.body)).toEqual([{ username: 'pixel-pal' }]);
  await account.getByRole('button', { name: '‹ Back to the lobby' }).click();
  await expect(shown(page, 'lobby').locator('.you')).toContainText('pixel-pal');
});

test('a rename too soon shows when you can change it again', async ({ page }) => {
  await fakeServer(page, {
    me: member(),
    'PATCH /api/me/username': () => [429, { code: 'TOO_SOON', until: Date.UTC(2031, 10, 15, 12) }],
  });
  const account = await openAccount(page);
  await account.getByRole('button', { name: 'Change', exact: true }).click();
  await account.getByRole('textbox', { name: 'Username' }).fill('pixel-pal');
  await account.getByRole('button', { name: 'Save' }).click();
  await expect(account.getByRole('alert')).toHaveText('You can change your username again on November 15');
});

test('while the 30 days run, Change is disabled and says when it opens', async ({ page }) => {
  await fakeServer(page, { me: member({ usernameChangeableAt: Date.UTC(2031, 10, 15, 12) }) });
  const account = await openAccount(page);
  const change = account.getByRole('button', { name: 'Change', exact: true });
  await expect(change).toBeDisabled();
  await expect(change).toHaveAccessibleDescription('You can change your username again on November 15');
});

test('ways to sign in: Connect goes to the provider; the only way in cannot be disconnected', async ({ page }) => {
  const server = await fakeServer(page, { me: member({ providers: ['discord'] }) });
  await page.route('https://github.example/**', (route) => route.fulfill({ contentType: 'text/html', body: 'GitHub' }));
  const account = await openAccount(page);
  await expect(account.getByText('Not connected')).toHaveCount(1);
  const disconnect = account.getByRole('button', { name: 'Disconnect' });
  await expect(disconnect).toBeDisabled();
  await expect(disconnect).toHaveAccessibleDescription('You need at least one way to sign in');
  await account.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.waitForURL('https://github.example/link');
  expect(server.sent('POST', '/api/auth/link-social')[0].body.provider).toBe('github');
});

test('Disconnect unlinks the provider and the row says not connected', async ({ page }) => {
  const server = await fakeServer(page, { me: member({ providers: ['credential', 'discord'] }) });
  const account = await openAccount(page);
  await account.getByRole('button', { name: 'Disconnect' }).click();
  await expect(account.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
  await expect(account.getByText('Not connected')).toHaveCount(2);
  expect(server.sent('POST', '/api/auth/unlink-account')[0].body).toEqual({ accountId: 'a_1' });
});

test('a disconnect that needs a recent sign-in sends you to Sign in with its words', async ({ page }) => {
  await fakeServer(page, {
    me: member({ providers: ['credential', 'discord'] }),
    'POST /api/auth/unlink-account': () => [401, { code: 'SESSION_EXPIRED' }],
  });
  const account = await openAccount(page);
  await account.getByRole('button', { name: 'Disconnect' }).click();
  await expect(shown(page, 'sign-in')).toBeVisible();
  await expect(social(page).getByRole('status')).toContainText('Sign in again to change how you sign in');
});

test('Send a reset link asks for one for your email', async ({ page }) => {
  const server = await fakeServer(page, { me: member() });
  const account = await openAccount(page);
  await expect(account.getByText('fan@example.com')).toBeVisible();
  await account.getByRole('button', { name: 'Send a reset link' }).click();
  await expect(social(page).getByRole('status')).toContainText('If that email has an account, a link is on its way');
  expect(server.sent('POST', '/api/auth/request-password-reset')[0].body).toEqual({ email: 'fan@example.com' });
});

test('Unblock removes the row; with nobody blocked it says so', async ({ page }) => {
  const server = await fakeServer(page, { me: member(), blocked: [{ username: 'noisy-nick', since: 1 }, { username: 'rude-ray', since: 2 }] });
  const account = await openAccount(page);
  await expect(account.getByText('noisy-nick')).toBeVisible();
  await account.getByRole('button', { name: 'Unblock noisy-nick' }).click();
  await expect(account.getByText('noisy-nick')).toHaveCount(0);
  expect(server.sent('DELETE', '/api/blocks/noisy-nick')).toHaveLength(1);
  await account.getByRole('button', { name: 'Unblock rude-ray' }).click();
  await expect(account.getByText('Nobody blocked')).toBeVisible();
});

test('delete with a password: back in the lobby as a guest, told the account is deleted', async ({ page }) => {
  const server = await fakeServer(page, { me: member() });
  const account = await openAccount(page);
  await account.getByRole('button', { name: 'Delete account' }).click();
  await account.getByLabel('Password').fill('correct horse battery');
  await account.getByRole('button', { name: 'Delete for good' }).click();
  await expect(shown(page, 'lobby')).toBeVisible();
  await expect(social(page).getByRole('status')).toContainText('Your account is deleted');
  await expect(shown(page, 'lobby').locator('.you .tag')).toHaveText('guest');
  expect(server.sent('POST', '/api/auth/delete-user')[0].body).toEqual({ password: 'correct horse battery' });
});

test('delete without a password asks for a recent sign-in; Cancel closes the panel; a wrong password stays under it', async ({ page }) => {
  await fakeServer(page, {
    me: member(),
    'POST /api/auth/delete-user': () => [400, { code: 'INVALID_PASSWORD' }],
  });
  const account = await openAccount(page);
  await account.getByRole('button', { name: 'Delete account' }).click();
  await account.getByLabel('Password').fill('wrong');
  await account.getByRole('button', { name: 'Delete for good' }).click();
  await expect(account.getByRole('alert')).toHaveText('That password doesn\'t match');
  await account.getByRole('button', { name: 'Cancel' }).click();
  await expect(account.getByLabel('Password')).toHaveCount(0);
});

test('an account without a password says deleting needs a recent sign-in', async ({ page }) => {
  const server = await fakeServer(page, { me: member({ providers: ['github'] }) });
  const account = await openAccount(page);
  await account.getByRole('button', { name: 'Delete account' }).click();
  await expect(account.getByText('Deleting needs a sign-in in the last 5 minutes')).toBeVisible();
  await account.getByRole('button', { name: 'Delete for good' }).click();
  await expect(shown(page, 'lobby')).toBeVisible();
  expect(server.sent('POST', '/api/auth/delete-user')[0].body).toEqual({});
});

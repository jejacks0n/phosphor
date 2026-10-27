// Signing in, creating an account, a forgotten password, a new one from the emailed link, and picking a
// username after a first Discord or GitHub sign-in.
import { test, expect, tab, store } from './support.js';
import { fakeServer, member } from './social-support.js';

const social = (page) => page.locator('.social-tab');
const shown = (page, name) => social(page).locator(`[data-page="${name}"]`);
const notice = (page) => social(page).getByRole('status');
const TERMS = 'I\'m 13 or older and agree to the Terms and Privacy Policy';

async function open(page, url = '/') {
  await page.goto(url);
  if (await store(page, 'workspace', (w) => w.editorTab) !== 'social') await tab(page, 'SOCIAL').click();
}

async function openSignIn(page) {
  await open(page);
  await shown(page, 'lobby').getByRole('button', { name: 'Sign in', exact: true }).click();
  return shown(page, 'sign-in');
}

async function openCreate(page) {
  await open(page);
  await shown(page, 'lobby').getByRole('button', { name: 'Create one' }).click();
  return shown(page, 'create');
}

test('sign in by email or by username, each at its own endpoint; back in the lobby as the member', async ({ page }) => {
  const server = await fakeServer(page);
  let form = await openSignIn(page);
  await expect(form.getByRole('button', { name: '‹ Back to the lobby' })).toBeVisible();
  await form.getByLabel('Email or username').fill('fan@example.com');
  await form.getByLabel('Password').fill('correct horse battery');
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(shown(page, 'lobby')).toBeVisible();
  await expect(shown(page, 'lobby').locator('.you')).toContainText('ansi-fan');
  expect(server.sent('POST', '/api/auth/sign-in/email').map((r) => r.body)).toEqual([{ email: 'fan@example.com', password: 'correct horse battery' }]);

  server.me = null;
  await page.reload();
  form = await openSignIn(page);
  await form.getByLabel('Email or username').fill('ansi-fan');
  await form.getByLabel('Password').fill('correct horse battery');
  await form.getByLabel('Password').press('Enter');
  await expect(shown(page, 'lobby')).toBeVisible();
  expect(server.sent('POST', '/api/auth/sign-in/username').map((r) => r.body)).toEqual([{ username: 'ansi-fan', password: 'correct horse battery' }]);
});

test('a wrong password shows the server\'s words under the form; the login stays, the password is cleared', async ({ page }) => {
  await fakeServer(page, { 'POST /api/auth/sign-in/email': () => [401, { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }] });
  const form = await openSignIn(page);
  await form.getByLabel('Email or username').fill('fan@example.com');
  await form.getByLabel('Password').fill('wrong one');
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(form.getByRole('alert')).toHaveText('That email or username and password don\'t match');
  await expect(notice(page)).toHaveCount(0); // under the form, not at the top as well
  await expect(form.getByLabel('Email or username')).toHaveValue('fan@example.com');
  await expect(form.getByLabel('Password')).toHaveValue('');
});

test('Continue with Discord goes to the URL the server returns', async ({ page }) => {
  const server = await fakeServer(page);
  await page.route('https://discord.example/**', (route) => route.fulfill({ contentType: 'text/html', body: 'Discord' }));
  const form = await openSignIn(page);
  await form.getByRole('button', { name: 'Continue with Discord' }).click();
  await page.waitForURL('https://discord.example/authorize');
  expect(server.sent('POST', '/api/auth/sign-in/social')[0].body.provider).toBe('discord');
});

test('the sign-in page links to creating an account, a forgotten password and the lobby', async ({ page }) => {
  await fakeServer(page);
  const form = await openSignIn(page);
  await form.getByRole('button', { name: 'Create one' }).click();
  await expect(shown(page, 'create')).toBeVisible();
  await shown(page, 'create').getByRole('button', { name: 'Sign in', exact: true }).click();
  await shown(page, 'sign-in').getByRole('button', { name: 'Forgot your password?' }).click();
  await expect(shown(page, 'forgot')).toBeVisible();
  await shown(page, 'forgot').getByRole('button', { name: '‹ Back to the lobby' }).click();
  await expect(shown(page, 'lobby')).toBeVisible();
});

test('the Terms and the Privacy Policy the forms link to are pages of their own', async ({ page }) => {
  for (const [path, heading] of [['/terms.html', 'Terms'], ['/privacy.html', 'Privacy Policy']]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.getByRole('link', { name: '‹ phosphor' })).toHaveAttribute('href', '/');
  }
});

test('create an account: disabled until the terms are agreed to; success is the lobby, asked to confirm the email', async ({ page }) => {
  const server = await fakeServer(page);
  const form = await openCreate(page);
  await expect(form.getByText('How everyone sees you. Letters, numbers, - and _.')).toBeVisible();
  await expect(form.getByText('At least 10 characters, not a known leaked one.')).toBeVisible();
  await expect(form.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms.html');
  await expect(form.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy.html');
  await form.getByLabel('Username').fill('pixel_wren');
  await form.getByLabel('Email').fill('wren@example.com');
  await form.getByLabel('Password').fill('a long new password');
  const create = form.getByRole('button', { name: 'Create account' });
  await expect(create).toBeDisabled();
  await form.getByRole('checkbox', { name: TERMS }).check();
  await expect(create).toBeEnabled();
  await create.click();

  await expect(shown(page, 'lobby')).toBeVisible();
  await expect(notice(page)).toContainText('Check your email to confirm your address');
  expect(server.sent('POST', '/api/auth/sign-up/email')[0].body).toMatchObject({
    username: 'pixel_wren', email: 'wren@example.com', password: 'a long new password', termsAccepted: true,
  });
});

test('a reserved or guest-shaped username is flagged as you type, and never sent', async ({ page }) => {
  const server = await fakeServer(page);
  const form = await openCreate(page);
  const username = form.getByLabel('Username');
  await username.fill('ad'); // too short, but not nagged about yet
  await expect(form.getByText('Usernames are 3 to 24 characters')).toHaveCount(0);
  await username.blur();
  await expect(form.getByText('Usernames are 3 to 24 characters')).toBeVisible();

  await form.getByLabel('Email').fill('wren@example.com');
  await form.getByLabel('Password').fill('a long new password');
  await form.getByRole('checkbox', { name: TERMS }).check();
  const create = form.getByRole('button', { name: 'Create account' });
  for (const name of ['admin', 'quiet-amber-fox']) {
    await username.fill(name);
    await expect(form.getByText('That name is reserved', { exact: false })).toBeVisible();
    await expect(create).toBeDisabled();
  }
  await username.fill('pixel.wren');
  await expect(form.getByText('Use only letters, numbers, underscores and hyphens')).toBeVisible();
  await username.fill('pixel-wren');
  await expect(form.getByText('That name is reserved', { exact: false })).toHaveCount(0);
  await expect(create).toBeEnabled();
  expect(server.sent('POST', '/api/auth/sign-up/email')).toHaveLength(0);
});

test('TAKEN and PASSWORD_BREACHED show their words under the form, and keep what was typed', async ({ page }) => {
  const server = await fakeServer(page, { 'POST /api/auth/sign-up/email': () => [409, { code: 'TAKEN' }] });
  const form = await openCreate(page);
  await form.getByLabel('Username').fill('pixel_wren');
  await form.getByLabel('Email').fill('wren@example.com');
  await form.getByLabel('Password').fill('password123');
  await form.getByRole('checkbox', { name: TERMS }).check();
  await form.getByRole('button', { name: 'Create account' }).click();
  await expect(form.getByRole('alert')).toHaveText('That username is taken');
  await expect(form.getByLabel('Username')).toHaveValue('pixel_wren');

  server.route('POST /api/auth/sign-up/email', () => [400, { code: 'PASSWORD_BREACHED' }]);
  await form.getByLabel('Username').fill('pixel_wren2');
  await form.getByRole('button', { name: 'Create account' }).click();
  await expect(form.getByRole('alert')).toHaveText('That password has appeared in a data breach. Choose another');
  await expect(form.getByLabel('Password')).toHaveValue('password123');
  await expect(shown(page, 'create')).toBeVisible();
});

test('after a first Discord sign-in, pick a username (from the provider\'s name) and agree to the terms', async ({ page }) => {
  const server = await fakeServer(page, { me: member({ username: null, name: 'Pixel Wren!', needsOnboarding: true, providers: ['discord'] }) });
  await open(page, '/?social=signed-in');
  const form = shown(page, 'onboarding');
  await expect(form.getByRole('heading', { name: 'Pick your username' })).toBeVisible();
  const username = form.getByLabel('Username');
  await expect(username).toHaveValue('pixel-wren');
  const go = form.getByRole('button', { name: 'Continue' });
  await expect(go).toBeDisabled();
  await form.getByRole('checkbox', { name: TERMS }).check();
  await username.fill('guest');
  await expect(form.getByText('That name is reserved', { exact: false })).toBeVisible();
  await expect(go).toBeDisabled();
  await username.fill('wren');
  await go.click();

  await expect(shown(page, 'lobby')).toBeVisible();
  await expect(shown(page, 'lobby').locator('.you')).toContainText('wren');
  expect(server.sent('POST', '/api/me/onboarding').map((r) => r.body)).toEqual([{ username: 'wren', termsAccepted: true }]);
});

test('onboarding offers no way back half signed in: Cancel and sign out lands on the lobby as a guest', async ({ page }) => {
  const server = await fakeServer(page, { me: member({ username: null, name: 'Quiet Amber Fox', needsOnboarding: true, providers: ['github'] }) });
  await open(page, '/?social=signed-in');
  const form = shown(page, 'onboarding');
  await expect(form.getByLabel('Username')).toHaveValue('quiet'); // the provider's name is guest-shaped
  await expect(form.getByRole('button', { name: /Back to the lobby/ })).toHaveCount(0);
  await form.getByRole('button', { name: 'Cancel and sign out' }).click();
  await expect(shown(page, 'lobby')).toBeVisible();
  await expect(shown(page, 'lobby').locator('.you .tag')).toHaveText('guest');
  expect(server.sent('POST', '/api/auth/sign-out')).toHaveLength(1);
});

test('a forgotten password: the same notice whatever the email', async ({ page }) => {
  const server = await fakeServer(page);
  const form = await openSignIn(page);
  await form.getByRole('button', { name: 'Forgot your password?' }).click();
  const forgot = shown(page, 'forgot');
  for (const email of ['fan@example.com', 'nobody@example.com']) {
    await forgot.getByLabel('Email').fill(email);
    await forgot.getByRole('button', { name: 'Send link' }).click();
    await expect(notice(page)).toContainText('If that email has an account, a link is on its way');
    await notice(page).getByRole('button', { name: 'Dismiss' }).click();
  }
  expect(server.sent('POST', '/api/auth/request-password-reset').map((r) => r.body.email)).toEqual(['fan@example.com', 'nobody@example.com']);
});

test('the emailed link (/?reset=tok) sets a new password and lands on Sign in with its notice', async ({ page }) => {
  const server = await fakeServer(page);
  await open(page, '/?reset=tok');
  const reset = shown(page, 'reset');
  await reset.getByLabel('New password').fill('a brand new password');
  await reset.getByRole('button', { name: 'Set password' }).click();
  await expect(shown(page, 'sign-in')).toBeVisible();
  await expect(notice(page)).toContainText('Your password is changed. Sign in with it');
  expect(server.sent('POST', '/api/auth/reset-password').map((r) => r.body)).toEqual([{ newPassword: 'a brand new password', token: 'tok' }]);
});

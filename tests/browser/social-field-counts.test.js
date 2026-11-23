// Create an account (CreateAccountPage.vue): each field counts what's typed against the most the API takes, as SAUCE's
// fields do, and stops there; the count describes the field without becoming part of its name. The same fields on Set a
// new password (ResetPasswordPage.vue) and the Account page (AccountPage.vue) count and stop the same way.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { page, userEvent } from 'vitest/browser';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import { EMAIL_MAX, PASSWORD_MAX, USERNAME_MAX } from '@/social/names';
import { member } from '../support/socialServer.js';
import { useSocialStore } from '@/store/SocialStore';
import CreateAccountPage from '@/components/social/CreateAccountPage.vue';
import ResetPasswordPage from '@/components/social/ResetPasswordPage.vue';
import AccountPage from '@/components/social/AccountPage.vue';

vi.mock('@/social/turnstile', () => ({ turnstileSiteKey: 'site-key', mountTurnstile: vi.fn(() => new Promise(() => {})) }));

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
});

async function mountPage(page, setUp = () => {}) {
  await createTestApp();
  setUp(useSocialStore());
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(page).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
}

async function mount() {
  await mountPage(CreateAccountPage);
  const fields = [...host.querySelectorAll('input:not([type=checkbox])')];
  return { username: fields[0], email: fields[1], password: fields[2] };
}

const countOf = (input) => document.getElementById(input.getAttribute('aria-describedby').split(' ')[0]);

test('each field shows n / most as it is typed in, and stops at the most', async () => {
  const { username, email, password } = await mount();
  for (const [input, most] of [[username, USERNAME_MAX], [email, EMAIL_MAX], [password, PASSWORD_MAX]]) {
    expect(countOf(input).textContent.trim()).toBe(`0 / ${most}`);
    expect(countOf(input).getAttribute('aria-label')).toBe(`0 of ${most} characters`);
  }

  username.focus();
  await userEvent.keyboard('pixel_wren');
  expect(countOf(username).textContent.trim()).toBe(`10 / ${USERNAME_MAX}`);
  expect(countOf(username).classList.contains('full')).toBe(false);
  await userEvent.keyboard('_'.repeat(USERNAME_MAX));   // past the most: the field stops there
  expect(username.value).toHaveLength(USERNAME_MAX);
  expect(countOf(username).textContent.trim()).toBe(`${USERNAME_MAX} / ${USERNAME_MAX}`);
  expect(countOf(username).classList.contains('full')).toBe(true);

  password.focus();
  await userEvent.keyboard('x'.repeat(PASSWORD_MAX + 3));
  expect(password.value).toHaveLength(PASSWORD_MAX);
  expect(countOf(password).textContent.trim()).toBe(`${PASSWORD_MAX} / ${PASSWORD_MAX}`);
  expect(password.getAttribute('minlength')).toBe('10');   // the minimum stays in the help line under it
  expect(password.getAttribute('aria-describedby')).toContain('create-password-help');

  email.focus();
  await userEvent.keyboard('wren@example.com');
  expect(countOf(email).textContent.trim()).toBe(`16 / ${EMAIL_MAX}`);
  expect(email.maxLength).toBe(EMAIL_MAX);
});

test('the count stays out of each field\'s name', async () => {
  await mount();
  for (const name of ['Username', 'Email', 'Password']) await expect.element(page.getByLabelText(name, { exact: true })).toBeInTheDocument();
});

test('Set a new password counts and stops at the most', async () => {
  await mountPage(ResetPasswordPage);
  const password = host.querySelector('input[type=password]');
  password.focus();
  await userEvent.keyboard('x'.repeat(PASSWORD_MAX + 2));
  expect(password.value).toHaveLength(PASSWORD_MAX);
  expect(countOf(password).textContent.trim()).toBe(`${PASSWORD_MAX} / ${PASSWORD_MAX}`);
  expect(password.getAttribute('aria-describedby')).toContain('reset-password-help');
});

test('the Account page\'s new email and new password count and stop at the most, and the confirmation stops there too', async () => {
  await mountPage(AccountPage, (social) => { social.me = member(); });
  const button = (name) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === name);

  button('Change email').click();
  await nextTick();
  const email = host.querySelector('input[type=email]');
  email.focus();
  await userEvent.keyboard('wren@example.com');
  expect(countOf(email).textContent.trim()).toBe(`16 / ${EMAIL_MAX}`);
  expect(email.maxLength).toBe(EMAIL_MAX);

  button('Change password').click();
  await nextTick();
  const [, next, again] = host.querySelectorAll('input[type=password]');
  next.focus();
  await userEvent.keyboard('x'.repeat(PASSWORD_MAX + 2));
  expect(next.value).toHaveLength(PASSWORD_MAX);
  expect(countOf(next).textContent.trim()).toBe(`${PASSWORD_MAX} / ${PASSWORD_MAX}`);
  expect(again.maxLength).toBe(PASSWORD_MAX);
});

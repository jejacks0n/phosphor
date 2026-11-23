// Create an account (CreateAccountPage.vue): each field counts what's typed against the most the API takes, as SAUCE's
// fields do; the username and email stop there, and a password past it is kept whole, said beside the field and not
// sent. The count describes the field without becoming part of its name. The same fields on Set a new password
// (ResetPasswordPage.vue) and the Account page (AccountPage.vue) count the same way.
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
const longOf = (input) => document.getElementById(input.getAttribute('aria-describedby').split(' ').at(-1));
const TOO_LONG = `Passwords can be up to ${PASSWORD_MAX} characters.`;
async function paste(input, text) {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}
const submitOf = (input) => input.form.querySelector('button[type=submit]');

// A password past the most: kept whole, its count in the warning color, the words beside it, the form not sent; at the
// most again, all of that goes.
async function expectTooLong(password, sent) {
  await paste(password, 'x'.repeat(PASSWORD_MAX + 1));
  expect(password.value).toHaveLength(PASSWORD_MAX + 1);
  expect(password.maxLength).toBe(-1);
  expect(countOf(password).textContent.trim()).toBe(`${PASSWORD_MAX + 1} / ${PASSWORD_MAX}`);
  expect(countOf(password).classList.contains('full')).toBe(true);
  expect(longOf(password)?.textContent).toBe(TOO_LONG);
  expect(password.getAttribute('aria-invalid')).toBe('true');
  expect(submitOf(password).disabled).toBe(true);
  password.form.requestSubmit();
  await nextTick();
  expect(sent).not.toHaveBeenCalled();

  await paste(password, 'x'.repeat(PASSWORD_MAX));
  expect(countOf(password).classList.contains('full')).toBe(false);   // at the most is fine
  expect(longOf(password)).toBe(null);
  expect(submitOf(password).disabled).toBe(false);
}

test('each field shows n / most as it is typed in; the username and email stop at the most', async () => {
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
  await userEvent.keyboard('correct horse');
  expect(countOf(password).textContent.trim()).toBe(`13 / ${PASSWORD_MAX}`);
  expect(password.getAttribute('minlength')).toBe('10');   // the minimum stays in the help line under it
  expect(password.getAttribute('aria-describedby')).toContain('create-password-help');

  email.focus();
  await userEvent.keyboard('wren@example.com');
  expect(countOf(email).textContent.trim()).toBe(`16 / ${EMAIL_MAX}`);
  expect(email.maxLength).toBe(EMAIL_MAX);
});

test('a password pasted past the most is kept whole, said beside the field, and not sent', async () => {
  let social;
  await mountPage(CreateAccountPage, (s) => { social = s; s.signUp = vi.fn(async () => true); });
  const [username, email, password] = host.querySelectorAll('input:not([type=checkbox])');
  await paste(username, 'pixel_wren');
  await paste(email, 'wren@example.com');
  host.querySelector('input[type=checkbox]').click();
  await nextTick();
  await expectTooLong(password, social.signUp);
});

test('the count stays out of each field\'s name', async () => {
  await mount();
  for (const name of ['Username', 'Email', 'Password']) await expect.element(page.getByLabelText(name, { exact: true })).toBeInTheDocument();
});

test('Set a new password keeps a password past the most whole, says so, and doesn\'t send it', async () => {
  let social;
  await mountPage(ResetPasswordPage, (s) => { social = s; s.resetPassword = vi.fn(async () => true); });
  const password = host.querySelector('input[type=password]');
  expect(password.getAttribute('aria-describedby')).toContain('reset-password-help');
  await expectTooLong(password, social.resetPassword);
});

test('the Account page\'s new email stops at the most; its new password past the most is kept, said, and not sent', async () => {
  let social;
  await mountPage(AccountPage, (s) => { social = s; s.me = member(); s.changePassword = vi.fn(async () => true); });
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
  const [current, next, again] = host.querySelectorAll('input[type=password]');
  await paste(current, 'violet-lantern-harbor-42');
  await paste(again, 'x'.repeat(PASSWORD_MAX + 1));
  expect(again.value).toHaveLength(PASSWORD_MAX + 1);   // the confirmation isn't cut either
  await expectTooLong(next, social.changePassword);
});

// The lobby's "Confirm your email" (ConfirmEmail.vue): no Turnstile check until Resend asks for one, the
// mail goes when the check answers, and the widget is gone after.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { createTestApp } from '../support/app.js';
import { useSocialStore } from '@/store/SocialStore';
import { mountTurnstile } from '@/social/turnstile';
import ConfirmEmail from '@/components/social/ConfirmEmail.vue';

vi.mock('@/social/turnstile', () => ({ turnstileSiteKey: 'site-key', mountTurnstile: vi.fn() }));

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.clearAllMocks();
});

async function mount() {
  await createTestApp();
  const social = useSocialStore();
  social.resendConfirmation = vi.fn(async () => true);
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(ConfirmEmail).use(getActivePinia());
  app.mount(host);
  await nextTick();
  return { social, resend: host.querySelector('button') };
}

test('no check until Resend; then one that fits the sidebar, and the mail goes with its token', async () => {
  const remove = vi.fn();
  mountTurnstile.mockResolvedValue(Object.assign(() => null, { remove }));
  const { social, resend } = await mount();
  expect(mountTurnstile).not.toHaveBeenCalled();
  resend.click();
  await vi.waitFor(() => expect(mountTurnstile).toHaveBeenCalledTimes(1));
  const [el, action, options] = mountTurnstile.mock.calls[0];
  expect(el).toBe(host.querySelector('.turnstile'));
  expect(action).toBe('verify');
  expect(options).toMatchObject({ appearance: 'interaction-only', size: 'compact' });
  await nextTick();
  expect(resend.disabled).toBe(true);   // the check is already running
  expect(social.resendConfirmation).not.toHaveBeenCalled();
  options.callback('tok');
  expect(social.resendConfirmation).toHaveBeenCalledWith('tok');
  expect(remove).toHaveBeenCalled();
  await nextTick();
  expect(resend.disabled).toBe(false);
});

test('a check that fails, or never loads, still asks: the server says what it thinks of no token', async () => {
  const remove = vi.fn();
  mountTurnstile.mockResolvedValue(Object.assign(() => null, { remove }));
  const { social, resend } = await mount();
  resend.click();
  await vi.waitFor(() => expect(mountTurnstile).toHaveBeenCalledTimes(1));
  mountTurnstile.mock.calls[0][2]['error-callback']();
  expect(social.resendConfirmation).toHaveBeenCalledWith(null);
  expect(remove).toHaveBeenCalled();

  social.resendConfirmation.mockClear();
  mountTurnstile.mockRejectedValue(new Error('Turnstile did not load'));
  await nextTick();
  resend.click();
  await vi.waitFor(() => expect(social.resendConfirmation).toHaveBeenCalledWith(null));
});

test('leaving the page takes a running check with it', async () => {
  const remove = vi.fn();
  mountTurnstile.mockResolvedValue(Object.assign(() => null, { remove }));
  const { resend } = await mount();
  resend.click();
  await vi.waitFor(() => expect(mountTurnstile).toHaveBeenCalledTimes(1));
  await nextTick();
  app.unmount();
  app = null;
  expect(remove).toHaveBeenCalled();
});

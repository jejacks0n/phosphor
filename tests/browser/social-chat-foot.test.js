// The chat panel's foot (ChatFoot.vue) says what you can do from who you are, and nothing while the
// pass is being swapped (a rename, a renewal, signing in) and who you are isn't known.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { createTestApp } from '../support/app.js';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { mutedWords, dayAndTime } from '@/social/chat';
import ChatFoot from '@/components/social/ChatFoot.vue';

let app = null, host = null;
afterEach(() => {
  vi.useRealTimers();
  app?.unmount();
  host?.remove();
});

const claims = (fields) => ({ sub: 'u_1', name: 'wren', guest: false, verified: true, key: 'k', exp: 0, ...fields });

async function mount() {
  await createTestApp();
  useRoomStore().role = 'watch';
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(ChatFoot).use(getActivePinia());
  app.mount(host);
  await nextTick();
  return useSocialStore();
}
const foot = () => host.querySelector('footer').textContent.trim();

test('the foot offers the box, sign-in or the email, by who you are, and nothing while that is unknown', async () => {
  const social = await mount();
  social.me = { name: 'wren' };   // signed in, with the pass being swapped
  social.claims = null;
  await nextTick();
  expect(host.querySelector('textarea')).toBe(null);
  expect(host.querySelector('button')).toBe(null);
  expect(foot()).toBe('');

  social.claims = claims({});
  await nextTick();
  expect(host.querySelector('textarea')).not.toBe(null);

  social.claims = claims({ verified: false });
  await nextTick();
  expect(foot()).toBe('Confirm your email to chat');

  social.claims = claims({ guest: true, verified: false });
  await nextTick();
  expect(foot()).toBe('Sign in to chat');

  social.claims = null;   // swapped again
  social.me = null;       // even as someone not signed in
  await nextTick();
  expect(foot()).toBe('');
});

test('a muted person sees until when in place of the box, with the date for a mute that ends another day', async () => {
  const social = await mount();
  const hour = Date.now() + 3_600_000, month = Date.now() + 30 * 86_400_000;
  social.claims = claims({ mutedUntil: hour });
  await nextTick();
  expect(host.querySelector('textarea')).toBe(null);
  expect(foot()).toBe(mutedWords(hour));
  expect(host.querySelector('p.muted').getAttribute('role')).toBe('status');

  social.claims = claims({ mutedUntil: month });
  await nextTick();
  expect(foot()).toBe(mutedWords(month));
  expect(foot()).toContain(dayAndTime.format(month));
});

test('when the mute ends the box is back within a minute, with what was typed', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  const social = await mount();
  social.claims = claims({});
  await nextTick();
  const typed = host.querySelector('textarea');
  typed.value = 'half a thought';
  typed.dispatchEvent(new Event('input'));
  social.claims = claims({ mutedUntil: Date.now() + 30_000 });
  await nextTick();
  expect(host.querySelector('textarea')).toBe(null);

  vi.advanceTimersByTime(60_000);
  await nextTick();
  expect(host.querySelector('textarea').value).toBe('half a thought');
  expect(host.querySelector('p.muted')).toBe(null);
});

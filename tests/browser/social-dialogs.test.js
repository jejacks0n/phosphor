// SOCIAL's layer over everything (SocialDialogs.vue): its first question once something of SOCIAL is wanted, a page
// in a box named by its heading, where Escape goes from each, and a room's link asking whether to join. Opening the
// lobby and a page from the address is tests/browser/address.test.js; the flows with a real page, tests/e2e.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import { CONSENT_KEY } from '@/social/consent';
import { member } from '../support/socialServer.js';
import { useSocialStore } from '@/store/SocialStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useRoomStore } from '@/store/RoomStore';
import SocialDialogs from '@/components/social/SocialDialogs.vue';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
});

async function mount({ consented = true } = {}) {
  await createTestApp();
  if (!consented) localStorage.removeItem(CONSENT_KEY);
  const social = useSocialStore();
  if (!consented) social.consentVersion = 0;
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(SocialDialogs).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  return { social, workspace: useWorkspaceStore() };
}
const dialog = () => document.querySelector('dialog');
const escape = async () => {
  dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextTick();
};

test('the question waits until something of SOCIAL is wanted: the lobby showing, a page, or a link', async () => {
  const { social, workspace } = await mount({ consented: false });
  expect(dialog()).toBe(null);   // LAYERS, nothing asked for

  workspace.showSocial();
  await nextTick();
  expect(dialog().getAttribute('aria-labelledby')).toBe('modal-dialog-title');
  expect(dialog().textContent).toContain('Before you use Social rooms');

  social.declineConsent();
  await nextTick();
  expect([dialog(), workspace.sidePanelTab]).toEqual([null, 'layers']);

  social.page = 'sign-in';
  await nextTick();
  expect(dialog().textContent).toContain('Before you use Social rooms');   // not the page, until it's answered
  social.declineConsent();
  social._roomLink = 'abcdefghij';
  await nextTick();
  expect(dialog().textContent).toContain('Before you use Social rooms');
});

test('a page shows in a box named by its heading once you\'re known; Escape goes back from each', async () => {
  const { social } = await mount();
  social.page = 'sign-in';
  await nextTick();
  expect(dialog()).toBe(null);   // who you are isn't known yet
  social.supported = true;
  await nextTick();
  expect(dialog().getAttribute('aria-label')).toBe('Sign in');
  expect(dialog().querySelector('[data-page="sign-in"] h2').textContent).toBe('Sign in');
  await nextTick();
  expect(document.activeElement).toBe(dialog().querySelector('input[autocomplete=username]'));   // focus starts in its first field

  social.notice = 'That password is wrong.';
  await nextTick();
  expect(dialog().querySelector('p.notice').textContent).toContain('That password is wrong.');   // the page's words, on the page
  await escape();
  expect([social.page, dialog()]).toEqual(['lobby', null]);

  social.page = 'two-factor';
  await nextTick();
  await escape();
  expect(social.page).toBe('sign-in');   // the code's Cancel

  social.page = 'onboarding';
  await nextTick();
  await escape();
  expect(social.page).toBe('onboarding');   // no way out but its Cancel and sign out

  social.me = null;
  social.page = 'account';
  await nextTick();
  expect(dialog()).toBe(null);   // Account is for someone signed in
});

test('a page\'s close button (×) goes where Escape does; the name page, with nowhere to go, has none, and a room\'s link closes as Not now', async () => {
  const { social } = await mount();
  social.supported = true;
  const close = () => dialog()?.querySelector('button.close');
  social.page = 'start-room';
  await nextTick();
  expect(close().getAttribute('aria-label')).toBe('Close');
  close().click();
  await nextTick();
  expect([social.page, dialog()]).toEqual(['lobby', null]);

  social.page = 'two-factor';
  await nextTick();
  close().click();
  await nextTick();
  expect(social.page).toBe('sign-in');

  social.page = 'onboarding';
  await nextTick();
  expect(close()).toBe(null);

  social.page = 'lobby';
  social.roomInvite = 'abcdefghij';
  await nextTick();
  close().click();
  await nextTick();
  expect([social.roomInvite, dialog()]).toEqual([null, null]);
});

test('Set up your room is the wide box only with a lobby card beside its settings: a link-only room\'s is the narrow one', async () => {
  const { social } = await mount();
  social.supported = true;
  const room = useRoomStore();
  room.startDraft.isPublic = true;
  social.page = 'start-room';
  await nextTick();
  expect(dialog().classList.contains('wide')).toBe(true);
  room.startDraft.isPublic = false;
  await nextTick();
  expect(dialog().classList.contains('wide')).toBe(false);
  expect(dialog().classList.contains('long')).toBe(true);
});

test('Blocked opens from Account\'s link, lists who you blocked with Unblock, and closes back to Account', async () => {
  const { social } = await mount();
  Object.assign(social, { supported: true, me: member() });
  const load = vi.spyOn(social, 'loadBlocked').mockImplementation(async () => { social.blocked = [{ id: 'u_9', username: 'noisy-nick', since: 1 }]; });
  const unblock = vi.spyOn(social, 'unblock').mockResolvedValue(true);
  social.page = 'account';
  await nextTick();
  [...dialog().querySelectorAll('button')].find((b) => b.textContent === 'See who you blocked').click();
  await nextTick();
  await nextTick();
  expect([social.page, dialog().getAttribute('aria-label')]).toEqual(['blocked', 'Blocked']);
  expect(load).toHaveBeenCalledOnce();
  dialog().querySelector('button[aria-label="Unblock noisy-nick"]').click();
  expect(unblock).toHaveBeenCalledWith('noisy-nick');
  social.blocked = [];
  await nextTick();
  expect(dialog().textContent).toContain('Nobody blocked');
  dialog().querySelector('button.close').click();
  await nextTick();
  expect(social.page).toBe('account');
});

test('a room\'s link asks whether to join, over everything', async () => {
  const { social } = await mount();
  social.roomInvite = 'abcdefghij';
  await nextTick();
  expect(dialog().textContent).toContain('Join this room?');
  [...dialog().querySelectorAll('button')].find((b) => b.textContent === 'Not now').click();
  await nextTick();
  expect([social.roomInvite, dialog()]).toEqual([null, null]);
});

test('answered, the question gives focus back to what asked', async () => {
  const { social, workspace } = await mount({ consented: false });
  const asker = document.createElement('button');   // the Lobby tab
  host.append(asker);
  asker.focus();
  workspace.showSocial();
  await nextTick();
  expect(dialog().contains(document.activeElement)).toBe(true);

  social.declineConsent();
  await nextTick();
  await nextTick();
  expect(document.activeElement).toBe(asker);
});

test('Sign in\'s × is on its heading\'s line, and Forgot your password? at the right of No account?', async () => {
  const { social } = await mount();
  social.supported = true;
  social.page = 'sign-in';
  await nextTick();
  const mid = (r) => (r.top + r.bottom) / 2;
  const range = document.createRange();
  range.selectNodeContents(dialog().querySelector('h2'));
  const h2 = range.getBoundingClientRect(), close = dialog().querySelector('button.close').getBoundingClientRect();
  expect(Math.abs(mid(h2) - mid(close))).toBeLessThan(1.5);
  expect(close.left).toBeGreaterThan(h2.right);
  expect(h2.top).toBeGreaterThan(dialog().querySelector('div.body').getBoundingClientRect().top); // not under the body's edge
  const forgot = [...dialog().querySelectorAll('button')].find((b) => b.textContent === 'Forgot your password?').getBoundingClientRect();
  const create = [...dialog().querySelectorAll('button')].find((b) => b.textContent === 'Create one').getBoundingClientRect();
  const form = dialog().querySelector('form').getBoundingClientRect();
  expect(Math.abs(mid(forgot) - mid(create))).toBeLessThan(1.5);
  expect(Math.abs(forgot.right - form.right)).toBeLessThan(1);
});

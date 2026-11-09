// SOCIAL's layer over everything (SocialDialogs.vue): its first question once something of SOCIAL is wanted, a page
// in a box named by its heading, where Escape goes from each, and a room's link asking whether to join. Opening the
// lobby and a page from the address is tests/browser/address.test.js; the flows with a real page, tests/e2e.
import { test, expect, afterEach } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import { CONSENT_KEY } from '@/social/consent';
import { useSocialStore } from '@/store/SocialStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
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
const dialog = () => document.querySelector('[role=dialog]');
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
  expect(dialog().textContent).toContain('Before you open SOCIAL');

  social.declineConsent();
  await nextTick();
  expect([dialog(), workspace.sidePanelTab]).toEqual([null, 'layers']);

  social.page = 'sign-in';
  await nextTick();
  expect(dialog().textContent).toContain('Before you open SOCIAL');   // not the page, until it's answered
  social.declineConsent();
  social._roomLink = 'abcdefghij';
  await nextTick();
  expect(dialog().textContent).toContain('Before you open SOCIAL');
});

test('a page shows in a box named by its heading once you\'re known; Escape goes back where its own back link does', async () => {
  const { social } = await mount();
  social.page = 'sign-in';
  await nextTick();
  expect(dialog()).toBe(null);   // who you are isn't known yet
  social.supported = true;
  await nextTick();
  expect(dialog().getAttribute('aria-label')).toBe('Sign in');
  expect(dialog().querySelector('[data-page="sign-in"] h2').textContent).toBe('Sign in');
  await nextTick();
  expect(document.activeElement).toBe(dialog().querySelector('h2'));   // focus starts at its heading

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

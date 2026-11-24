// The session's log (src/dev/actionLog.js), installed as main.js installs it, never keeps what a SOCIAL store's action
// was given. Signing in, a two-factor code, a changed password and email, a room's password, a line of chat and who was
// invited to draw each leave a line with the action's name and nothing of what was typed: in the log, and in the text
// the HISTORY tab's Copy and an issue report carry.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore } from '@/store/RoomStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { clearLog, installActionLog, log, logText } from '@/dev/actionLog.js';
import { NAMES_ONLY, SKIPPED } from '@/dev/skipped.js'; // after the stores, as main.js has them: it reads the project store's action groups
import { forgetKey } from '@/social/keys';
import { desktopQuery } from '@/social/config';
import { ownSocialDatabase } from '../support/socialDatabase.js';
import { fakeServer, useFakeSockets } from '../support/socialServer.js';
import { seedConsent } from '../support/app.js';

// Each shorter than the 40 characters the log keeps of a string, so one that was kept would be there whole.
const TYPED = {
  email: 'wren@example.com', password: 'right-password', code: '123456', token: 'turnstile-token-xyz',
  newPassword: 'correct-horse-battery', newEmail: 'new-wren@example.com', roomPassword: 'open-sesame',
  chat: 'meet me at the usual place', address: 'wren-at-home.example:99999', sub: 'u_someone-else',
};

let social;
beforeEach(async () => {
  const deleteDatabase = ownSocialDatabase('history');
  forgetKey();
  await deleteDatabase();
  localStorage.clear();
  seedConsent();
  sessionStorage.clear();
  useFakeSockets();
  vi.stubGlobal('matchMedia', (query) => ({ matches: query === desktopQuery }));
  const pinia = createPinia();
  installActionLog(pinia, SKIPPED, NAMES_ONLY);
  createApp({}).use(pinia); // plugins wait for an app, as in main.js
  setActivePinia(pinia);
  social = useSocialStore();
  clearLog();
});
afterEach(() => {
  social.disconnectLobby();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('signing in, a code, a new password and email, a room\'s password, chat and an invitation are logged by name, with nothing that was typed', async () => {
  const server = fakeServer();
  server.route('POST /api/auth/two-factor/verify-totp', () => [200, { token: 't' }]);
  server.route('POST /api/auth/change-password', () => [200, { status: true }]);
  server.route('POST /api/auth/change-email', () => [200, { status: true }]);
  const room = useRoomStore(), drawing = useDrawingStore();

  expect(await social.signIn(TYPED.email, TYPED.password, TYPED.token)).toBe(true);
  await social.verifyTwoFactor(TYPED.code);
  expect(await social.changePassword(TYPED.password, TYPED.newPassword)).toBe(true);
  expect(await social.changeEmail(TYPED.newEmail, TYPED.password, TYPED.token)).toBe(true);
  await social.requestReset(TYPED.email, TYPED.token);
  expect(await room.joinAddress(TYPED.address, { password: TYPED.roomPassword })).toBe(false); // no port like that: nothing is asked
  await room.say(TYPED.chat); // not in a room: it goes nowhere, and its line is written before it runs
  try { drawing.invite(TYPED.sub); } catch { /* not hosting */ }
  useWorkspaceStore().setActiveTool('brush'); // any other store's arguments are kept, as before

  expect(server.sent('POST', '/api/auth/change-password')[0].body.newPassword).toBe(TYPED.newPassword); // it did go to the server
  const text = logText({ version: '1.0.0', sha: 'abc1234', userAgent: 'a browser', viewport: '800×600' });
  for (const name of ['social.signIn', 'social.verifyTwoFactor', 'social.changePassword', 'social.changeEmail', 'social.requestReset', 'room.joinAddress', 'room.say', 'drawing.invite']) {
    expect(text, name).toMatch(new RegExp(`^\\+\\d+\\.\\ds {2}${name.replace('.', '\\.')}( ×\\d+)?$`, 'm')); // the name, and nothing after it
  }
  expect(text).toContain('workspace.setActiveTool ("brush")');
  for (const [what, typed] of Object.entries(TYPED)) expect(text, what).not.toContain(typed);
  // Not one line of a SOCIAL store's has arguments, whichever action it was (a request's path and the server's code among them).
  const lines = log.entries.filter((entry) => /^(social|room|drawing)\./.test(entry.text));
  expect(lines.length).toBeGreaterThan(8);
  expect(lines.filter((entry) => entry.args !== '' || entry.first !== '')).toEqual([]);
});

test('the stores whose arguments are never kept are SOCIAL\'s three, by the names Pinia knows them by', () => {
  expect([...NAMES_ONLY].sort()).toEqual([useDrawingStore().$id, useRoomStore().$id, useSocialStore().$id].sort());
});

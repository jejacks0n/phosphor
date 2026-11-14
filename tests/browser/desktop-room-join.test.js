// The room store joining in the desktop build: by an address typed in, asked first what's there (/info), then the
// host's room service's /room and its channel, with no server. The sockets are the fake the test answers
// (tests/support/socialServer.js). Nothing may reach fetch.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore } from '@/store/RoomStore';
import { RETURN_WITHIN_MS } from '@/social/hosting';
import { forgetKey, loadKey } from '@/social/keys';
import { t } from '@/i18n/index.js';
import { createTestApp } from '../support/app.js';
import { ownSocialDatabase } from '../support/socialDatabase.js';
import { verify, sockets, useFakeSockets, lastSocket } from '../support/socialServer.js';

const ID = 'abcdefgh23';
const ADDRESS = '192.168.1.20:4000';

let deleteDatabase, social, room, fetched;
beforeEach(async () => {
  deleteDatabase = ownSocialDatabase('desktop-room-join');
  forgetKey();
  await deleteDatabase();
  useFakeSockets();
  await createTestApp();
  fetched = vi.fn(() => Promise.reject(new Error('no server on desktop')));
  vi.stubGlobal('fetch', fetched);
  social = useSocialStore();
  room = useRoomStore();
  await social.boot();
  social.setDesktopName('bo');
});
afterEach(() => {
  vi.useRealTimers();
  room.leave();
  room.needsPassword = null;
  social.dropPass();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(fetched).not.toHaveBeenCalled();
});

// The nth socket, /info's, answered with this.
async function answerInfo(n, info = {}) {
  const socket = await lastSocket(n);
  socket.accept();
  socket.receive({ type: 'info', protocol: 1, id: ID, name: 'Night shift', password: false, ...info });
  return socket;
}

// Joined at ADDRESS: /info answered, the room's socket greeted. Returns that socket.
async function joinRoom() {
  const joining = room.joinAddress(ADDRESS);
  const info = await answerInfo(1);
  expect(info.url).toBe(`ws://${ADDRESS}/info`);
  expect(await joining).toBe(true);
  const socket = await lastSocket(2);
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('join'));
  return socket;
}

test('joinAddress: an answer that isn\'t info says not-phosphor', async () => {
  const notPhosphor = 'That isn\'t a Phosphor room.';
  let joining = room.joinAddress('192.168.1.20');
  let socket = await lastSocket(1);
  expect(socket.url).toBe('ws://192.168.1.20:31337/info');
  socket.accept();
  socket.receive({ type: 'state', rooms: [] });
  expect(await joining).toBe(false);
  expect(social.notice).toBe(notPhosphor);
  expect(socket.closed).toBe(true);

  // Opened, then gone with nothing said.
  joining = room.joinAddress(ADDRESS);
  socket = await lastSocket(2);
  socket.accept();
  socket.serverClose();
  expect(await joining).toBe(false);
  expect(social.notice).toBe(notPhosphor);

  // Nothing there at all: no answer.
  joining = room.joinAddress(ADDRESS);
  (await lastSocket(3)).serverClose();
  expect(await joining).toBe(false);
  expect(social.notice).toMatch(/^No Phosphor room answered/);

  // Quiet for 5 s.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  joining = room.joinAddress(ADDRESS);
  socket = await lastSocket(4);
  vi.advanceTimersByTime(5000);
  expect(await joining).toBe(false);
  expect(social.notice).toMatch(/^No Phosphor room answered/);
  expect(socket.closed).toBe(true);
  vi.useRealTimers();

  // Phosphor, with no room open, or another version.
  joining = room.joinAddress(ADDRESS);
  await answerInfo(5, { id: null, name: null });
  expect(await joining).toBe(false);
  expect(social.notice).toBe(t('social.errors.join.noRoom'));
  joining = room.joinAddress(ADDRESS);
  await answerInfo(6, { protocol: 2 });
  expect(await joining).toBe(false);
  expect(social.notice).toBe('They\'re on a newer Phosphor. Update to join.');
  joining = room.joinAddress(ADDRESS);
  await answerInfo(7, { protocol: 0 });
  expect(await joining).toBe(false);
  expect(social.notice).toBe(t('social.errors.join.older'));

  // An address that isn't one never connects.
  expect(await room.joinAddress('host:abc')).toBe(false);
  expect(social.notice).toBe(t('social.errors.join.badPort'));
  expect(await room.joinAddress('  ')).toBe(false);
  expect(social.notice).toBe(t('social.errors.join.empty'));
  expect(sockets).toHaveLength(7);
  expect(room.role).toBe(null);
});

test('joinAddress asks for the password when info says so', async () => {
  let joining = room.joinAddress(ADDRESS);
  await answerInfo(1, { password: true });
  expect(await joining).toBe(false);
  expect(room.needsPassword).toEqual({ address: ADDRESS, name: 'Night shift' });
  expect(room.role).toBe(null);

  joining = room.joinAddress(ADDRESS, { password: 'sesame' });
  expect(room.needsPassword).toBe(null);
  await answerInfo(2, { password: true });
  expect(await joining).toBe(true);
  const socket = await lastSocket(3);
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('join'));
  expect(socket.sent[0]).toMatchObject({ room: ID, password: 'sesame', protocol: 1 });

  // A wrong one ends the try, and the page asks again.
  socket.receive({ type: 'refused', reason: 'wrong-password' });
  expect(room.role).toBe(null);
  expect(social.notice).toBe('Wrong password');
  expect(room.needsPassword).toEqual({ address: ADDRESS, name: 'Night shift' });
});

test('joinAddress joins with room id and protocol, waiting then joined', async () => {
  const socket = await joinRoom();
  expect(socket.url).toBe(`ws://${ADDRESS}/room`);
  expect([room.role, room.id, room.status, room.room?.name]).toEqual(['watch', ID, 'joining', 'Night shift']);
  const greeting = socket.sent[0];
  expect(greeting).toMatchObject({ type: 'join', room: ID, protocol: 1, pass: social.pass });
  expect(greeting).not.toHaveProperty('password');
  expect(await verify((await loadKey()).publicKey, `room:${ID}:${greeting.ts}`, greeting.proof)).toBe(true);

  socket.receive({ type: 'waiting' });
  expect(room.status).toBe('waiting');
  expect(room._connection.status).toBe('live');   // a long wait for the host's yes isn't a quiet socket

  socket.receive({ type: 'joined', id: ID, peer: 'p_1', token: 'tok', hostName: 'ann', hostSub: 'u_ann', artists: [] });
  expect(room.status).toBe('waiting');
  expect(room.room).toMatchObject({ name: 'Night shift', host: 'ann', hostSub: 'u_ann' });
});

test('the Watch\'s channel url carries peer and token', async () => {
  const socket = await joinRoom();
  socket.receive({ type: 'joined', id: ID, peer: 'p_7', token: 'Tk-9_x', hostName: 'ann', hostSub: 'u_ann', artists: [] });
  socket.receive({ type: 'signal-from', from: 'host', data: { sdp: { type: 'offer' } } });
  const channel = await lastSocket(3);
  expect(channel.url).toBe(`ws://${ADDRESS}/channel?peer=p_7&token=Tk-9_x`);
  expect(room.status).toBe('connecting');
});

test('a host gone past RETURN_WITHIN_MS closes with the host-gone words', async () => {
  let socket = await joinRoom();
  socket.receive({ type: 'waiting' });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

  // Back within the time: the wait starts over.
  socket.serverClose();
  expect(room._connection.status).toBe('reconnecting');
  vi.advanceTimersByTime(1000);   // the socket's first retry
  socket = await lastSocket(3);
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('join'));
  socket.receive({ type: 'waiting' });
  vi.advanceTimersByTime(RETURN_WITHIN_MS);
  expect(room.role).toBe('watch');

  socket.serverClose();
  vi.advanceTimersByTime(RETURN_WITHIN_MS - 1);
  expect(room.role).toBe('watch');
  const connection = room._connection, made = sockets.length;
  vi.advanceTimersByTime(1);
  expect(room.role).toBe(null);
  expect(social.notice).toBe('The host went away. You can try joining again later.');
  expect(connection.status).toBe('closed');   // no retries left to join again later, unasked
  vi.advanceTimersByTime(RETURN_WITHIN_MS);
  expect(sockets).toHaveLength(made);
});

test('turned-away and busy refusals show their words', async () => {
  const words = {
    'turned-away': 'The host didn\'t let you in.',
    busy: 'The host has too many people waiting. Try again in a moment.',
    moved: t('social.errors.room.moved'),
  };
  for (const [reason, said] of Object.entries(words)) {
    const socket = await joinRoom();
    socket.receive({ type: 'refused', reason });
    expect(room.role).toBe(null);
    expect(social.notice).toBe(said);
    sockets.length = 0;
  }
  const socket = await joinRoom();
  socket.receive({ type: 'refused', reason: 'version', protocol: 2 });
  expect(social.notice).toBe('They\'re on a newer Phosphor. Update to join.');
});

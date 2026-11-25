// The room store hosting in the desktop build: the room service on this computer in place of the server. A fake
// desktop bridge stands in for the main process, and the room's socket is the fake the test answers
// (tests/support/socialServer.js). Nothing may reach fetch: there's no server to ask.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore, ROOM_ID } from '@/store/RoomStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useFakeDesktop, resetDesktop } from '@/social/desktop';
import { forgetKey } from '@/social/keys';
import { WINDOW_KEY } from '@/social/windowKey';
import { makeSelfPass } from '@/social/selfPass';
import { toBase64url } from '@/social/base64url';
import { createTestApp, settle } from '../support/app.js';
import { ownSocialDatabase } from '../support/socialDatabase.js';
import { verify, sockets, useFakeSockets, lastSocket } from '../support/socialServer.js';

const RECORD = 'phosphor-hosting';
const SECRET = 'launch-secret';
const PORT = 31338;   // the service took the next port: 31337 was in use
const ADDRESSES = ['192.168.1.20:31338'];
const gradient = await (await fetch('/tests/fixtures/images/gradient.png')).blob();   // before fetch is stubbed

async function openArt() {
  await project.setImageFromFile(new File([gradient], 'gradient.png', { type: gradient.type }), { withLayer: true });
  Object.assign(project, { aspectLock: false, cols: 8, rows: 8 });
  project.render();
  await settle(project);
}

// Someone else's self-signed pass, and its claims.
async function someone(name) {
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const publicKey = toBase64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  return makeSelfPass({ privateKey: pair.privateKey, publicKey }, name);
}

let deleteDatabase, social, room, project, pinia, desktop, fetched;
beforeEach(async () => {
  deleteDatabase = ownSocialDatabase('desktop-room-host');
  sessionStorage.removeItem(RECORD);
  sessionStorage.removeItem(WINDOW_KEY);   // each test's window starts with no key of its own
  forgetKey();
  await deleteDatabase();
  useFakeSockets();
  ({ project, pinia } = await createTestApp());
  await openArt();
  fetched = vi.fn(() => Promise.reject(new Error('no server on desktop')));
  vi.stubGlobal('fetch', fetched);
  desktop = {
    startService: vi.fn(async () => ({ port: PORT, addresses: ADDRESSES, secret: SECRET })),
    serviceInfo: vi.fn(async () => ({ port: PORT, addresses: ADDRESSES, secret: SECRET, mode: 'host' })),
    stopService: vi.fn(async () => {}),
  };
  useFakeDesktop(desktop);
  social = useSocialStore(pinia);
  room = useRoomStore(pinia);
});
afterEach(() => {
  room.leave();
  social.dropPass();
  resetDesktop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const start = (fields = {}) => room.startRoom({ name: 'Night shift', welcome: 'Hi', password: 'sesame', max: 5, port: 31337, ...fields });

// A room started and its socket hosting. Returns the socket.
async function goLive() {
  await social.boot();
  expect(await start()).toBe(true);
  const socket = await lastSocket(1);
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('host'));
  socket.receive({ type: 'hosting', room: { id: room.id, name: 'Night shift', welcome: 'Hi', max: 5, count: 0 }, peers: [] });
  return socket;
}

test('desktop startRoom starts the service and greets as host with the secret and room', async () => {
  await social.boot();
  social.setDesktopName('ansi-fan');
  expect(await start()).toBe(true);
  expect(desktop.startService).toHaveBeenCalledWith({ port: 31337, mode: 'host', sub: social.claims.sub });
  expect(localStorage.getItem('phosphor-desktop-port')).toBe('31337');
  expect(room.id).toMatch(ROOM_ID);
  expect([room.role, room.status, room.link, room.hasPassword, room.lobbyPin]).toEqual(['host', 'connecting', null, true, null]);
  expect([room.port, room.addresses]).toEqual([PORT, ADDRESSES]);

  const socket = await lastSocket(1);
  expect(socket.url).toBe(`ws://127.0.0.1:${PORT}/room`);
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('host'));
  const greeting = socket.sent[0];
  expect(greeting).toMatchObject({
    type: 'host', secret: SECRET, protocol: 1, pass: social.pass,
    room: { id: room.id, name: 'Night shift', welcome: 'Hi', password: 'sesame', max: 5, approved: [] },
  });
  expect(await verify(social.claims.key, `room:${room.id}:${greeting.ts}`, greeting.proof)).toBe(true);   // the window's key, which its pass names
  expect(sessionStorage.getItem(RECORD)).not.toContain('sesame');   // the password goes to the service alone
  expect(sessionStorage.getItem(RECORD)).not.toContain(SECRET);

  socket.receive({ type: 'hosting', room: { id: room.id, name: 'Night shift', welcome: 'Hi', max: 5, count: 0 }, peers: [] });
  expect(room.status).toBe('live');
});

test('desktop startRoom without a password greets with none; a service that won\'t start is a notice', async () => {
  await social.boot();
  expect(await start({ password: '' })).toBe(true);
  expect(room.hasPassword).toBe(false);
  const socket = await lastSocket(1);
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('host'));
  expect(socket.sent[0].room.password).toBe(null);
  room.leave();

  desktop.startService.mockRejectedValueOnce(new Error('No free port'));
  expect(await start()).toBe(false);
  expect(room.role).toBe(null);
  expect(social.notice).toBeTruthy();
  expect(sockets).toHaveLength(1);
});

test('asking shows in asks, letIn answers yes, ask-gone drops it', async () => {
  const socket = await goLive();
  const people = await Promise.all(['ann', 'bo', 'cy', 'di', 'ed', 'fay'].map(someone));
  people.forEach(({ pass }, i) => socket.receive({ type: 'asking', ask: `a_${i + 1}`, pass }));
  expect(room.asks).toHaveLength(5);   // never more than the service lets wait
  socket.receive({ type: 'asking', ask: 'a_9', pass: 'not a pass' });
  expect(room.asks.map((a) => a.ask)).not.toContain('a_9');

  const last = room.asks.at(-1);
  expect(last).toEqual({ ask: 'a_6', sub: people[5].claims.sub, name: 'fay' });
  room.letIn('a_6');
  expect(socket.sent.at(-1)).toEqual({ type: 'answer', ask: 'a_6', yes: true });
  room.turnAway('a_5');
  expect(socket.sent.at(-1)).toEqual({ type: 'answer', ask: 'a_5', yes: false });
  socket.receive({ type: 'ask-gone', ask: 'a_4' });
  expect(room.asks.map((a) => a.ask)).toEqual(['a_2', 'a_3']);

  // A host greeting again hears every waiting ask again: none twice.
  socket.receive({ type: 'hosting', room: { id: room.id, name: 'Night shift', welcome: 'Hi', max: 5, count: 0 }, peers: [] });
  socket.receive({ type: 'asking', ask: 'a_2', pass: people[1].pass });
  socket.receive({ type: 'asking', ask: 'a_2', pass: people[1].pass });
  expect(room.asks.map((a) => a.ask)).toEqual(['a_2']);
});

test('artists-now\'s hostable sets canBeHost', async () => {
  const socket = await goLive();
  const { claims } = await someone('ann');
  expect(room.canBeHost(claims.sub)).toBe(false);
  socket.receive({ type: 'artists-now', subs: [claims.sub], hostable: { [claims.sub]: ['192.168.1.30:31337'] } });
  expect(useDrawingStore(pinia).artists).toEqual([claims.sub]);
  expect(room.canBeHost(claims.sub)).toBe(true);
  expect(room.canBeHost('someone-else')).toBe(false);
  socket.receive({ type: 'artists-now', subs: [claims.sub], hostable: {} });
  expect(room.canBeHost(claims.sub)).toBe(false);
});

// As tests/browser/social-room-store.test.js reloads: the record kept, the stores made again.
async function reload() {
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  const record = sessionStorage.getItem(RECORD);
  const connection = room._connection;
  room._connection = null;
  connection?.close();
  room.close();
  sessionStorage.setItem(RECORD, record);
  ({ project, pinia } = await createTestApp());
  await openArt();
  social = useSocialStore(pinia);
  room = useRoomStore(pinia);
}

test('a host\'s reload comes back with serviceInfo\'s secret, and its password for the next host', async () => {
  await goLive();
  const id = room.id;
  await reload();
  desktop.serviceInfo.mockResolvedValue({ port: PORT, addresses: ADDRESSES, secret: SECRET, mode: 'host', password: 'sesame' });
  room.resume();
  expect([room.role, room.id, room.status]).toEqual(['host', id, 'reconnecting']);
  const socket = await lastSocket(2);
  expect(socket.url).toBe(`ws://127.0.0.1:${PORT}/room`);
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('host'));
  expect(socket.sent[0]).toMatchObject({ type: 'host', secret: SECRET, protocol: 1, room: { id, password: null } });   // the service keeps the room it has
  expect([room.port, room.addresses]).toEqual([PORT, ADDRESSES]);
  socket.receive({ type: 'hosting', room: { id, name: 'Night shift', welcome: 'Hi', max: 5, count: 0 }, peers: [] });
  expect(room.status).toBe('live');
  expect(room._host.handOverExtra()).toMatchObject({ password: 'sesame', name: 'Night shift', welcome: 'Hi', max: 5 });   // a hand-over now keeps it
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  expect(sessionStorage.getItem(RECORD)).not.toContain('sesame');
  expect(fetched).not.toHaveBeenCalled();
});

test('a relaunch isn\'t a reload: with no service running, the room is over', async () => {
  await goLive();
  await reload();
  desktop.serviceInfo.mockResolvedValue(null);
  room.resume();
  await vi.waitFor(() => expect(room.role).toBe(null));
  expect(sockets).toHaveLength(1);
});

test('report, reportRoom and block do nothing on desktop', async () => {
  const socket = await goLive();
  const { claims, pass } = await someone('ann');
  expect(room.canChat).toBe(true);   // a self pass is verified, so only the desktop check keeps Report off
  expect(room.canReport).toBe(false);
  room.chat = [{ id: 'm1', ts: 1, text: 'hi', sub: claims.sub, name: 'ann', host: false, mine: false, deleted: false, pass, sig: 's' }];
  const sent = socket.sent.length;
  expect(room.report({ sub: claims.sub, messageId: 'm1', reason: 'spam' })).toBe(false);
  expect(await room.block({ peer: 'p_1', sub: claims.sub, name: 'ann' })).toBe(false);
  expect(socket.sent).toHaveLength(sent);

  Object.assign(room, { role: 'watch', room: { name: 'Elsewhere', host: 'bo', hostSub: 'u_bo' } });
  expect(room.canReportRoom).toBe(false);
  expect(await room.reportRoom('spam')).toBe(false);
  room.role = 'host';
  expect(fetched).not.toHaveBeenCalled();
});

test('no request leaves the store while hosting', async () => {
  const socket = await goLive();
  const { pass } = await someone('ann');
  socket.receive({ type: 'peer', peer: 'p_1', pass });
  const channel = await lastSocket(2);   // the watcher's channel, through the service
  expect(channel.url).toBe(`ws://127.0.0.1:${PORT}/channel?peer=p_1&secret=${SECRET}`);

  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  expect(await room.copyLink()).toBe(true);
  expect(writeText).toHaveBeenCalledWith(ADDRESSES[0]);
  room.addresses = [];
  await room.copyLink();
  expect(writeText).toHaveBeenLastCalledWith(`127.0.0.1:${PORT}`);   // only this computer can join

  await room.lookForOwnRooms();
  expect(room.reclaimable).toEqual([]);
  room.leave();
  expect(socket.sent.at(-1)).toEqual({ type: 'end' });
  expect(desktop.stopService).toHaveBeenCalled();
  expect(fetched).not.toHaveBeenCalled();
});

test('hosting is refused while a layer is on a plugin solver, naming it and saying Flatten', async () => {
  await social.boot();
  social.setDesktopName('ansi-fan');
  project.setLayerChars('edit', { charChoice: 'plugin:jane.lines/lines' });
  const words = 'Layer 1 is on a plugin solver, which rooms don\'t use. Choose a built-in solver for it, or Flatten the drawing first.';
  await expect(start()).rejects.toMatchObject({ userMessage: words });
  await expect(room.startDesktopRoom({ name: 'Night shift', welcome: '', password: '', max: 5, port: 31337 })).rejects.toMatchObject({ userMessage: words });
  expect(desktop.startService).not.toHaveBeenCalled();
  expect(room.role).toBe(null);
});

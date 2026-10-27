// The room store: going live and sharing the art as it changes, joining, refusals, leaving and ending,
// against the fake server (tests/support/socialServer.js). The Room's socket is a fake the test answers;
// the other side of a room is a real Watch (or a raw peer) made here, over real WebRTC without STUN,
// its signals relayed through the fake socket. Watchers' passes are signed by a test key, served as
// the server's.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore } from '@/store/RoomStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { thumbnailOf } from '@/social/thumbnail';
import { forgetKey, loadKey } from '@/social/keys';
import { toBase64url } from '@/social/base64url';
import { hex2rgb } from '@/lib/ColorUtils';
import { desktopQuery, rtcConfig } from '@/social/config';
import { Watch } from '@/social/watching';
import { Host } from '@/social/hosting';
import { openPeer } from '@/social/peer';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { ownSocialDatabase } from '../support/socialDatabase.js';
import { verify, claimsOf, member, fakeServer, sockets, useFakeSockets, lastSocket, at } from '../support/socialServer.js';

vi.mock('@/social/thumbnail', () => ({ thumbnailOf: vi.fn(async () => 'AAAA') }));   // drawn and encoded in social-thumbnail.test.js

const ID = 'abcdefghij';
const PATIENT = { timeout: 5000 };   // connecting and packing a snapshot take longer on a busy machine
const later = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const keyB64 = toBase64url(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)));
async function passFor(sub, name, guest = false) {
  const claims = { sub, name, guest, verified: !guest, key: 'k', exp: Date.now() / 1000 + 3600 };
  const body = toBase64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(body)));
  return `${body}.${toBase64url(signature)}`;
}

// The room as the Room tells its host.
const info = (fields = {}) => ({
  id: ID, name: 'Night shift', hostSub: 'u_1', hostName: 'ansi-fan', public: true, allowGuests: true, max: 12,
  signal: null, liveSince: 1000, count: 0, ...fields,
});

let deleteDatabase, server, social, room, project, toClose;
beforeEach(async () => {
  deleteDatabase = ownSocialDatabase('room-store');
  forgetKey();
  await deleteDatabase();
  useFakeSockets();
  vi.stubGlobal('matchMedia', (query) => ({ matches: query === desktopQuery }));
  vi.stubEnv('VITE_SOCIAL_STUN', 'none');   // the store's peers use no STUN server
  expect(rtcConfig()).toEqual({ iceServers: [] });
  ({ project } = await createTestApp());
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 8, rows: 8 });   // before fetch is the fake's
  server = fakeServer();
  server.session = member();
  server.route('GET /api/pass-key', () => [200, { key: keyB64 }]);
  server.route('POST /api/rooms', () => [200, { id: ID, link: `http://localhost/?room=${ID}` }]);
  social = useSocialStore();
  room = useRoomStore();
  toClose = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.mocked(thumbnailOf).mockClear();
  room.leave();
  social.disconnectLobby();
  for (const side of toClose.splice(0)) side.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const startPublic = (fields = {}) => room.startRoom({ name: 'Night shift', welcome: 'Hi', isPublic: true, allowGuests: true, max: 12, ...fields });

// A public room started, and its socket hosting. Returns the socket.
async function goLive() {
  await social.boot();
  expect(await startPublic()).toBe(true);
  const socket = await lastSocket(1);
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('host'));
  socket.receive({ type: 'hosting', room: info(), peers: [] });
  return socket;
}

// The host's signals for `peer` go from the socket to the watch.
function relay(socket, peer, watch) {
  socket.heard = (msg) => {
    if (msg.type === 'signal-to' && msg.to === peer) later().then(() => watch.signalFrom('host', msg.data));
  };
}

// A Watch the Room let in as `peer`: its signals go back through the newest socket.
async function watcherOn(socket, peer = 'p1') {
  const log = { rooms: [], arts: [], states: [] };
  log.watch = new Watch({
    config: { iceServers: [] },
    send: async (msg) => { await later(); sockets.at(-1).receive({ type: 'signal-from', from: peer, data: msg.data }); },
    onRoom: (r) => log.rooms.push(r),
    onArt: (a) => log.arts.push(a),
    onView: () => {},
    onState: (s) => log.states.push(s),
  });
  toClose.push(log.watch);
  relay(socket, peer, log.watch);
  socket.receive({ type: 'peer', peer, pass: await passFor(`u_${peer}`, peer) });
  await expect.poll(() => log.arts.length, PATIENT).toBe(1);
  return log;
}

const color = (hex) => ({ ...hex2rgb(hex), hex });
const cell = (char) => ({ char, fg: color('#ffffff'), bg: color('#000000') });
const shown = (cells) => cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`);

// What went over the host's channels, as parsed text messages (the snapshot's chunks left out).
function channelSends() {
  const send = vi.spyOn(RTCDataChannel.prototype, 'send');
  return () => send.mock.calls.flatMap(([data]) => (typeof data === 'string' ? [JSON.parse(data)] : []));
}

test('startRoom POSTs the room with your signal and no password; a private one sends its password', async () => {
  await social.boot();
  social.signal = 'chat';
  expect(await startPublic()).toBe(true);
  expect(server.sent('POST', '/api/rooms')[0].body).toEqual({ name: 'Night shift', public: true, allowGuests: true, max: 12, signal: 'chat' });
  expect(room.role).toBe('host');
  expect(room.link).toBe(`http://localhost/?room=${ID}`);
  room.leave();

  expect(await room.startRoom({ name: 'Back room', welcome: '', isPublic: false, password: 'sesame', allowGuests: false, max: 3 })).toBe(true);
  expect(server.sent('POST', '/api/rooms')[1].body).toEqual({ name: 'Back room', public: false, password: 'sesame', allowGuests: false, max: 3, signal: 'chat' });
});

test('The room\'s socket presents the host\'s pass with a proof over room:<id>:<ts>; hosting makes it live', async () => {
  await social.boot();
  await startPublic();
  const socket = await lastSocket(1);
  expect(socket.url).toMatch(new RegExp(`^ws://.+/api/rooms/${ID}/ws$`));
  expect(room.status).toBe('connecting');
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('host'));
  const greeting = socket.sent[0];
  expect(greeting.pass).toBe(social.pass);
  expect(await verify((await loadKey()).publicKey, `room:${ID}:${greeting.ts}`, greeting.proof)).toBe(true);
  socket.receive({ type: 'hosting', room: info({ count: 2 }), peers: [] });
  expect(room.status).toBe('live');
  expect(room.room).toEqual({ ...info({ count: 2 }), welcome: 'Hi' });
});

test('INVALID for the name says so in words and stays off the air', async () => {
  await social.boot();
  server.route('POST /api/rooms', () => [400, { code: 'INVALID', field: 'name' }]);
  expect(await startPublic({ name: ' ' })).toBe(false);
  expect(social.notice).toBe('Room names are 1 to 60 characters');
  expect(room.role).toBe(null);
  expect(sockets).toHaveLength(0);
});

test('A watcher gets the room and the host\'s cells; one painted cell reaches it within 300 ms, as cells', async () => {
  const socket = await goLive();
  const log = await watcherOn(socket);
  expect(log.rooms).toEqual([{ name: 'Night shift', welcome: 'Hi', host: 'ansi-fan' }]);
  expect(log.arts[0]).toMatchObject({ cols: 8, lines: 4, font: { id: 'jetbrains', size: 17 } });
  expect(shown(log.arts[0].cells)).toEqual(shown(project.cells));
  await expect.poll(() => room.watchers).toEqual([{ peer: 'p1', sub: 'u_p1', name: 'p1', guest: false, following: true, connected: true }]);

  const sent = channelSends();
  project.editCell(2, 1, { char: '#' });
  project.commitEdit();
  await expect.poll(() => log.arts.at(-1).cells[8 + 2].char, { timeout: 300, interval: 5 }).toBe('#');
  expect(sent().map((m) => m.t)).toEqual(['cells']);
  expect(shown(log.arts.at(-1).cells)).toEqual(shown(project.cells));
});

test('Nothing is sent while a slider move is open; once it ends, one snapshot goes', async () => {
  const socket = await goLive();
  const log = await watcherOn(socket);
  const sent = channelSends();
  project.setSlider('contrast', 0);
  await settle(project);
  await wait(400);
  expect(log.arts).toHaveLength(1);
  expect(sent()).toEqual([]);

  project.commitSliders('contrast');
  await expect.poll(() => log.arts.length, PATIENT).toBe(2);
  await wait(300);
  expect(sent().map((m) => m.t)).toEqual(['snapshot']);
  expect(shown(log.arts[1].cells)).toEqual(shown(project.cells));
});

test('Two changeSettings within a second send one settings, then the latest; settings-now replaces the room, keeping the welcome', async () => {
  const socket = await goLive();
  const settings = () => socket.sent.filter((m) => m.type === 'settings');
  room.changeSettings({ welcome: 'Hello', allowGuests: false, max: 6 });
  room.changeSettings({ welcome: 'Hello', allowGuests: false, max: 4 });
  expect(settings()).toEqual([{ type: 'settings', allowGuests: false, max: 6 }]);
  expect(room.room).toMatchObject({ welcome: 'Hello', allowGuests: false, max: 4 });
  await vi.waitFor(() => expect(settings()).toHaveLength(2), { timeout: 2000 });
  expect(settings()[1]).toEqual({ type: 'settings', allowGuests: false, max: 4 });

  socket.receive({ type: 'settings-now', room: info({ allowGuests: false, max: 6 }) });
  expect(room.room).toEqual({ ...info({ allowGuests: false, max: 6 }), welcome: 'Hello' });
});

test('A new welcome goes to watchers over their channels, never to the server', async () => {
  const socket = await goLive();
  const log = await watcherOn(socket);
  room.changeSettings({ welcome: 'Back soon', allowGuests: true, max: 12 });
  await expect.poll(() => log.rooms.at(-1)?.welcome, PATIENT).toBe('Back soon');
  expect(socket.sent.filter((m) => m.type === 'settings')).toEqual([]);
});

test('Review focus 1: a dropped socket reconnects with a new host, and hosting with the same peer keeps its connection', async () => {
  const socket = await goLive();
  const log = await watcherOn(socket);
  const sent = channelSends();
  socket.close();
  expect(room.status).toBe('reconnecting');
  const again = await lastSocket(2);
  again.accept();
  await vi.waitFor(() => expect(again.sent[0]?.type).toBe('host'));
  expect(again.sent[0].ts).toBeGreaterThanOrEqual(socket.sent[0].ts);
  again.receive({ type: 'hosting', room: info({ count: 1 }), peers: [{ peer: 'p1', pass: await passFor('u_p1', 'p1') }] });
  expect(room.status).toBe('live');
  await wait(300);
  expect(log.states).toEqual(['connecting', 'live']);
  expect(log.arts).toHaveLength(1);
  expect(sent()).toEqual([]);
  expect(again.sent.filter((m) => m.type === 'signal-to')).toEqual([]);
});

test('Review focus 4: a pagehide sends end', async () => {
  const socket = await goLive();
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  expect(socket.sent.at(-1)).toEqual({ type: 'end' });
});

test('endRoom sends end, closes the socket and the watchers\' connections, and goes back to the lobby', async () => {
  const socket = await goLive();
  const log = await watcherOn(socket);
  social.page = 'account';
  room.endRoom();
  expect(socket.sent.at(-1)).toEqual({ type: 'end' });
  expect(socket.closed).toBe(true);
  expect([room.role, room.room, room.status]).toEqual([null, null, null]);
  expect(social.page).toBe('lobby');
  await expect.poll(() => log.states.at(-1), PATIENT).toBe('lost');
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  expect(socket.sent.filter((m) => m.type === 'end')).toHaveLength(1);
});

test('A refused bad-pass is tried once more with a fresh pass; refused again, the room isn\'t available', async () => {
  await social.boot();
  await startPublic();
  const first = await lastSocket(1);
  first.accept();
  await vi.waitFor(() => expect(first.sent[0]?.type).toBe('host'));
  first.receive({ type: 'refused', reason: 'bad-pass' });
  const second = await lastSocket(2);
  second.accept();
  await vi.waitFor(() => expect(second.sent[0]?.type).toBe('host'));
  expect(second.sent[0].pass).not.toBe(first.sent[0].pass);
  expect(server.sent('POST', '/api/pass')).toHaveLength(2);
  second.receive({ type: 'refused', reason: 'bad-pass' });
  expect(social.notice).toBe('This room isn\'t available');
  expect(room.role).toBe(null);
  await wait(50);
  expect(sockets).toHaveLength(2);
});

test('join with a bad id says the room isn\'t available, with no socket', async () => {
  await social.boot();
  room.join('ABC');
  expect(social.notice).toBe('This room isn\'t available');
  expect(room.role).toBe(null);
  expect(sockets).toHaveLength(0);
});

// A watcher's join: the socket, accepted, and its join message.
async function joining(count, options) {
  room.join(ID, options);
  const socket = await lastSocket(count);
  expect(socket.url).toMatch(new RegExp(`^ws://.+/api/rooms/${ID}/ws$`));
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('join'));
  return socket;
}

test('wrong-password without a password asks for one; sent with one and refused, it\'s wrong', async () => {
  await social.boot();
  const first = await joining(1);
  expect(first.sent[0]).not.toHaveProperty('password');
  expect(await verify((await loadKey()).publicKey, `room:${ID}:${first.sent[0].ts}`, first.sent[0].proof)).toBe(true);
  expect([room.role, room.status]).toEqual(['watch', 'joining']);
  first.receive({ type: 'refused', reason: 'wrong-password' });
  expect([room.role, room.status, room.passwordWrong]).toEqual(['watch', 'password', false]);

  const second = await joining(2, { password: 'nope' });
  expect(second.sent[0].password).toBe('nope');
  second.receive({ type: 'refused', reason: 'wrong-password' });
  expect([room.role, room.status, room.passwordWrong]).toEqual(['watch', 'password', true]);
  expect(social.notice).toBe(null);
});

test('full gives "Room is full", and ended "The host ended the room"; both clear the role and go to the lobby', async () => {
  await social.boot();
  social.page = 'account';
  (await joining(1)).receive({ type: 'refused', reason: 'full' });
  expect(social.notice).toBe('Room is full');
  expect([room.role, social.page]).toEqual([null, 'lobby']);

  social.page = 'account';
  const socket = await joining(2);
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan' });
  socket.receive({ type: 'ended' });
  expect(social.notice).toBe('The host ended the room');
  expect([room.role, room.room, social.page]).toEqual([null, null, 'lobby']);
  expect(socket.closed).toBe(true);
});

test('removed gives "The host removed you"', async () => {
  await social.boot();
  const socket = await joining(1);
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan' });
  socket.receive({ type: 'removed' });
  expect(social.notice).toBe('The host removed you');
  expect(room.role).toBe(null);
});

test('Review focus 3: joined waits for the host\'s offer; an offer whose answer never arrives gives failed, and the role stays', async () => {
  await social.boot();
  room._connectWithinMs = 500;
  const socket = await joining(1);
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan' });
  expect(room.status).toBe('waiting');
  expect(room.room).toEqual({ name: '', welcome: '', host: 'ansi-fan' });
  await wait(300);
  expect(room.status).toBe('waiting');

  const host = openPeer({
    initiator: true, config: { iceServers: [] }, connectWithinMs: 5000,
    sendSignal: (data) => socket.receive({ type: 'signal-from', from: 'host', data }),   // the answer never comes back
    onOpen: () => {}, onClose: () => {},
  });
  toClose.push(host);
  await vi.waitFor(() => expect(room.status).toBe('connecting'));
  await vi.waitFor(() => expect(room.status).toBe('failed'), { timeout: 2000 });
  expect(room.role).toBe('watch');
  expect(socket.closed).toBe(true);   // no join again for an offer that would fail the same way
});

test('A watcher\'s room, art and the host\'s view come from the channel; leave clears them and goes to the lobby', async () => {
  await social.boot();
  const socket = await joining(1);
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan' });
  // The host's side, its signals joined to the watcher's socket as the Room would.
  const lists = [];
  const host = new Host({
    config: { iceServers: [] }, passKey: async () => keyB64, onWatchers: (list) => lists.push(list),
    send: async (msg) => {
      await later();
      if (msg.type === 'signal-to') socket.receive({ type: 'signal-from', from: 'host', data: msg.data });
    },
  });
  toClose.push(host);
  socket.heard = (msg) => {
    if (msg.type === 'signal-to') later().then(() => host.signalFrom('p1', msg.data));
  };
  const art = { cols: 2, lines: 1, font: null, cells: [cell('a'), cell('b')] };
  host.setRoom({ name: 'Night shift', welcome: 'Hi', host: 'ansi-fan' });
  host.setArt(art);
  host.setView({ col: 1, row: 0, cols: 1, rows: 1 });
  await host.peer('p1', await passFor('g_1', 'quiet-amber-fox-1', true));
  await expect.poll(() => room.hostView, PATIENT).toEqual({ col: 1, row: 0, cols: 1, rows: 1 });
  expect(room.status).toBe('live');
  expect(room.room).toEqual({ name: 'Night shift', welcome: 'Hi', host: 'ansi-fan' });
  expect(room.art).toEqual(art);

  room.setFollowing(false);
  expect(room.following).toBe(false);
  await expect.poll(() => lists.at(-1)?.[0].following, PATIENT).toBe(false);
  social.page = 'account';
  room.leave();
  expect(socket.closed).toBe(true);
  expect([room.role, room.room, room.art, room.hostView, room.following, social.page]).toEqual([null, null, null, null, true, 'lobby']);
  await expect.poll(() => lists.at(-1), PATIENT).toEqual([]);
});

test('?room=<id> on a desktop opens SOCIAL and joins once you\'re known, taking the link off the URL', async () => {
  const replaceState = vi.spyOn(history, 'replaceState').mockImplementation(() => {});
  const { useWorkspaceStore } = await import('@/store/WorkspaceStore');
  await social.start(at(`?room=${ID}&keep=1`));
  expect(useWorkspaceStore().editorTab).toBe('social');
  expect(replaceState.mock.calls[0][2]).toBe(`${window.location.pathname}?keep=1`);
  const socket = await lastSocket(1);
  expect(server.requests.findIndex((r) => r.path === '/api/me')).toBeGreaterThanOrEqual(0);
  expect(socket.url).toMatch(new RegExp(`/api/rooms/${ID}/ws$`));
  expect(room.role).toBe('watch');
  await social.showLobby();
  expect(sockets.filter((s) => s.url.includes('/api/rooms/'))).toHaveLength(1);   // once
});

test('Signing out while hosting sends end first', async () => {
  const socket = await goLive();
  let passWhenEnded;
  socket.heard = (msg) => { if (msg.type === 'end') passWhenEnded = social.pass; };
  const pass = social.pass;
  expect(await social.signOut()).toBe(true);
  expect(passWhenEnded).toBe(pass);
  expect(socket.sent.at(-1)).toEqual({ type: 'end' });
  expect(socket.closed).toBe(true);
  expect(room.role).toBe(null);
  expect(claimsOf(pass).guest).toBe(false);
});

// The lobby's picture of a public room: once soon after going live, then at most every 3 minutes and
// only after the art or the view changed.
const thumbnails = (socket) => socket.sent.filter((m) => m.type === 'thumbnail');

test('A public room sends one thumbnail soon after going live, then one only after a change once 3 minutes have passed', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const socket = await goLive();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(thumbnails(socket)).toEqual([{ type: 'thumbnail', webp: 'AAAA' }]);
  expect(thumbnailOf).toHaveBeenLastCalledWith(
    expect.objectContaining({ cols: 8, lines: 4, cells: project.cells, font: expect.objectContaining({ id: 'jetbrains', size: 17 }) }),
    expect.objectContaining({ col: 0, row: 0 }),
  );

  await vi.advanceTimersByTimeAsync(2 * 60_000);   // nothing changed
  expect(thumbnails(socket)).toHaveLength(1);

  project.editCell(2, 1, { char: '#' });
  project.commitEdit();
  await vi.advanceTimersByTimeAsync(30_000);       // changed, but 3 minutes after the last one aren't up
  expect(thumbnails(socket)).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(2 * 60_000);
  expect(thumbnails(socket)).toHaveLength(2);

  await vi.advanceTimersByTimeAsync(10 * 60_000);  // nothing changed since
  expect(thumbnails(socket)).toHaveLength(2);
  project.editCell(3, 1, { char: '#' });
  project.commitEdit();
  await vi.advanceTimersByTimeAsync(1000);         // 3 minutes are up: it goes at once
  expect(thumbnails(socket)).toHaveLength(3);
});

test('A change of the host\'s view alone sends a thumbnail once 3 minutes have passed since the last', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const socket = await goLive();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(thumbnails(socket)).toHaveLength(1);

  useWorkspaceStore().ansiViewOrigin = { col: 3, row: 1 };
  await vi.advanceTimersByTimeAsync(60_000);
  expect(thumbnails(socket)).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(2 * 60_000);
  expect(thumbnails(socket)).toHaveLength(2);
  expect(thumbnailOf).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ col: 3, row: 1 }));
});

test('A private room sends none, and ending a room stops the timer', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  await social.boot();
  await startPublic({ isPublic: false, password: 'sesame' });
  const socket = await lastSocket(1);
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('host'));
  socket.receive({ type: 'hosting', room: info({ public: false }), peers: [] });
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(thumbnails(socket)).toEqual([]);
  expect(thumbnailOf).not.toHaveBeenCalled();
});

test('Ending a public room before its first thumbnail sends none', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const socket = await goLive();
  room.leave();
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(thumbnails(socket)).toEqual([]);
});

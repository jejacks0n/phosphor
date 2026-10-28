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
import { measureAdvance } from '@/lib/CellCanvas';
import { DISPLAY_FONT, setDisplayFont } from '@/lib/displayFonts';
import { MOST_KEPT, signedText } from '@/social/chat';
import { openPeer } from '@/social/peer';
import { passKey } from '@/social/pass';
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
  expect(log.rooms).toEqual([{ name: 'Night shift', welcome: 'Hi' }]);
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

test('A paced-out settings: the room shows the Room\'s values, and choosing the refused ones again sends them', async () => {
  const socket = await goLive();
  const settings = () => socket.sent.filter((m) => m.type === 'settings');
  room.changeSettings({ welcome: 'Hi', allowGuests: true, max: 6 });
  socket.receive({ type: 'settings-now', room: info({ max: 12 }) });
  expect(room.room.max).toBe(12);
  room.changeSettings({ welcome: 'Hi', allowGuests: true, max: 6 });
  await vi.waitFor(() => expect(settings()).toHaveLength(2), { timeout: 2000 });
  expect(settings()[1]).toEqual({ type: 'settings', allowGuests: true, max: 6 });
  expect(room.room.max).toBe(6);
});

test('A settings-now while a newer change waits keeps that change shown, and it goes', async () => {
  const socket = await goLive();
  const settings = () => socket.sent.filter((m) => m.type === 'settings');
  room.changeSettings({ welcome: 'Hi', allowGuests: true, max: 6 });
  room.changeSettings({ welcome: 'Hi', allowGuests: false, max: 8 });   // waits for the interval
  socket.receive({ type: 'settings-now', room: info({ max: 12 }) });
  expect(room.room).toMatchObject({ allowGuests: false, max: 8 });
  await vi.waitFor(() => expect(settings()).toHaveLength(2), { timeout: 2000 });
  expect(settings()[1]).toEqual({ type: 'settings', allowGuests: false, max: 8 });
  expect(room.room).toMatchObject({ allowGuests: false, max: 8 });
});

test('A settings change made while the socket is down goes once hosting is back', async () => {
  const socket = await goLive();
  socket.close();
  expect(room.status).toBe('reconnecting');
  room.changeSettings({ welcome: 'Hi', allowGuests: true, max: 6 });   // nowhere to send it
  const again = await lastSocket(2);
  again.accept();
  await vi.waitFor(() => expect(again.sent[0]?.type).toBe('host'));
  again.receive({ type: 'hosting', room: info(), peers: [] });
  await vi.waitFor(() => expect(again.sent.filter((m) => m.type === 'settings')).toEqual([{ type: 'settings', allowGuests: true, max: 6 }]), { timeout: 2000 });
  expect(room.room.max).toBe(6);
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
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan', hostSub: 'u_9' });
  socket.receive({ type: 'ended' });
  expect(social.notice).toBe('The host ended the room');
  expect([room.role, room.room, social.page]).toEqual([null, null, 'lobby']);
  expect(socket.closed).toBe(true);
});

test('removed gives "The host removed you"', async () => {
  await social.boot();
  const socket = await joining(1);
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan', hostSub: 'u_9' });
  socket.receive({ type: 'removed' });
  expect(social.notice).toBe('The host removed you');
  expect(room.role).toBe(null);
});

test('replaced (the same account watching in another tab) puts this one back in the lobby, saying so, and it doesn\'t join again', async () => {
  await social.boot();
  social.page = 'account';
  const socket = await joining(1);
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan', hostSub: 'u_9' });
  socket.receive({ type: 'replaced' });
  expect(social.notice).toBe('You\'re watching this room in another tab');
  expect([room.role, social.page]).toEqual([null, 'lobby']);
  expect(socket.closed).toBe(true);
  await wait(1200);   // past the first retry
  expect(sockets).toHaveLength(1);
});

// A raw host peer for a joined watcher, its signals through the watcher's socket as the Room relays them.
async function rawHost(socket, { answered = true } = {}) {
  let host;
  socket.heard = (msg) => { if (answered && msg.type === 'signal-to') later().then(() => host.signal(msg.data)); };
  return new Promise((resolve) => {
    host = openPeer({
      initiator: true, config: { iceServers: [] }, connectWithinMs: 5000,
      sendSignal: async (data) => { await later(); socket.receive({ type: 'signal-from', from: 'host', data }); },
      onOpen: resolve, onClose() {},
    });
    toClose.push(host);
    if (!answered) resolve(null);
  });
}

test('"hosted by" is the Room\'s word: a room from the channel naming another host doesn\'t change it', async () => {
  await social.boot();
  const socket = await joining(1);
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan', hostSub: 'u_9' });
  const channel = await rawHost(socket);
  channel.send(JSON.stringify({ t: 'room', name: 'Night shift', welcome: 'Hi', host: 'impostor' }));
  await expect.poll(() => room.room?.name, PATIENT).toBe('Night shift');
  expect(room.room).toEqual({ name: 'Night shift', welcome: 'Hi', host: 'ansi-fan', hostSub: 'u_9' });
});

test('the Room closing the socket while the host\'s connection is being made is final: failed, and no join again', async () => {
  await social.boot();
  const socket = await joining(1);
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan', hostSub: 'u_9' });
  await rawHost(socket, { answered: false });
  await vi.waitFor(() => expect(room.status).toBe('connecting'));
  socket.close();   // the host gave up on reaching us first, and the Room put us out
  expect(room.status).toBe('failed');
  expect(room.role).toBe('watch');
  await wait(1200);   // past the first retry
  expect(sockets).toHaveLength(1);
  expect(room.status).toBe('failed');
});

test('a pass that won\'t come ends a room being joined: onboarding stays on its page, suspended says so', async () => {
  server.session = member({ needsOnboarding: true });
  await social.boot();
  room.join(ID);
  (await lastSocket(1)).accept();
  await vi.waitFor(() => expect(room.role).toBe(null));
  expect(social.page).toBe('onboarding');

  server.session = member();
  server.suspended = { until: null };
  social.page = 'lobby';
  room.join(ID);
  (await lastSocket(2)).accept();
  await vi.waitFor(() => expect(room.role).toBe(null));
  expect(social.notice).toBe('This account is suspended for good');
  await wait(1200);   // past the first retry
  expect(sockets).toHaveLength(2);
  expect(sockets.every((s) => s.sent.length === 0)).toBe(true);
});

test('Review focus 3: joined waits for the host\'s offer; an offer whose answer never arrives gives failed, and the role stays', async () => {
  await social.boot();
  room._connectWithinMs = 500;
  const socket = await joining(1);
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan', hostSub: 'u_9' });
  expect(room.status).toBe('waiting');
  expect(room.room).toEqual({ name: '', welcome: '', host: 'ansi-fan', hostSub: 'u_9' });
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
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan', hostSub: 'u_9' });
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
  host.setRoom({ name: 'Night shift', welcome: 'Hi' });
  host.setArt(art);
  host.setView({ col: 1, row: 0, cols: 1, rows: 1 });
  await host.peer('p1', await passFor('g_1', 'quiet-amber-fox-1', true));
  await expect.poll(() => room.hostView, PATIENT).toEqual({ col: 1, row: 0, cols: 1, rows: 1, zoom: 1 });
  expect(room.status).toBe('live');
  expect(room.room).toEqual({ name: 'Night shift', welcome: 'Hi', host: 'ansi-fan', hostSub: 'u_9' });
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
  await vi.advanceTimersByTimeAsync(2500);         // soon is about 3 seconds
  expect(thumbnails(socket)).toEqual([]);
  await vi.advanceTimersByTimeAsync(1500);
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

test('on PIXEL the host sends the cells in view and the PIXEL zoom against the font\'s cell; on ANSI its view and zoom; SAUCE keeps the last one', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const setView = vi.spyOn(Host.prototype, 'setView');
  const workspace = useWorkspaceStore();
  Object.assign(workspace, { editorTab: 'input', viewTab: 'input', inputView: { col: 2, row: 1, cols: 6, rows: 3, zoom: 4 } });
  await goLive();
  const zoom = 4 / measureAdvance(DISPLAY_FONT);
  expect(zoom).toBeLessThan(1);
  expect(setView).toHaveBeenLastCalledWith({ col: 2, row: 1, cols: 6, rows: 3, zoom });

  workspace.inputView = { col: 2, row: 1, cols: 6, rows: 3, zoom: 16 };   // wider than the font's cell: no more than 100%
  await vi.advanceTimersByTimeAsync(300);
  expect(setView).toHaveBeenLastCalledWith({ col: 2, row: 1, cols: 6, rows: 3, zoom: Math.min(1, 16 / measureAdvance(DISPLAY_FONT)) });

  Object.assign(workspace, { editorTab: 'output', viewTab: 'output', ansiViewZoom: 0.5, ansiViewOrigin: { col: 3, row: 1 }, ansiViewSize: { cols: 10, rows: 5 } });
  await vi.advanceTimersByTimeAsync(300);
  expect(setView).toHaveBeenLastCalledWith({ col: 3, row: 1, cols: 10, rows: 5, zoom: 0.5 });

  const sent = setView.mock.calls.length;
  workspace.editorTab = 'sauce';   // the ANSI view stays the view
  Object.assign(workspace, { editZoom: 2, ansiZoom: 0.25 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(setView).toHaveBeenCalledTimes(sent);
  expect(workspace.sharedView).toEqual({ col: 3, row: 1, cols: 10, rows: 5, zoom: 0.5 });
});

test('on PIXEL new cells in view don\'t measure the font again; a new font size sends a new zoom', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const setView = vi.spyOn(Host.prototype, 'setView');
  const workspace = useWorkspaceStore();
  Object.assign(workspace, { editorTab: 'input', viewTab: 'input', inputView: { col: 2, row: 1, cols: 6, rows: 3, zoom: 4 } });
  await goLive();
  const was = measureAdvance(DISPLAY_FONT);
  const createElement = vi.spyOn(document, 'createElement');   // a measure makes a canvas
  workspace.inputView = { col: 3, row: 1, cols: 6, rows: 3, zoom: 4 };
  await vi.advanceTimersByTimeAsync(300);
  expect(createElement.mock.calls.filter(([tag]) => tag === 'canvas')).toEqual([]);
  createElement.mockRestore();
  expect(setView).toHaveBeenLastCalledWith({ col: 3, row: 1, cols: 6, rows: 3, zoom: 4 / was });

  // The font at twice its size, once it has loaded (as App.vue does): the cell is twice as wide.
  workspace.displayFontSizes = { jetbrains: 2 * DISPLAY_FONT.size };
  await setDisplayFont(workspace.displayFontSpec);
  workspace.displayFontLoaded = workspace.displayFontSpec;
  await vi.advanceTimersByTimeAsync(300);
  expect(setView.mock.lastCall[0].zoom).toBeCloseTo(4 / (2 * was), 2);
});

test('a zoom goes with the cells measured at it: a new zoom alone sends nothing, and never with the old cells', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const setView = vi.spyOn(Host.prototype, 'setView');
  const workspace = useWorkspaceStore();
  Object.assign(workspace, { editorTab: 'output', viewTab: 'output', ansiViewOrigin: { col: 3, row: 1 }, ansiViewSize: { cols: 10, rows: 5 } });
  await goLive();
  expect(setView).toHaveBeenLastCalledWith({ col: 3, row: 1, cols: 10, rows: 5, zoom: 1 });
  workspace.setAnsiZoom(0.5);   // a frame before AnsiEditor has the cells at 50%
  await vi.advanceTimersByTimeAsync(300);
  Object.assign(workspace, { ansiViewOrigin: { col: 0, row: 0 }, ansiViewSize: { cols: 20, rows: 10 }, ansiViewZoom: 0.5 });
  await vi.advanceTimersByTimeAsync(300);
  expect(setView.mock.calls.map(([v]) => v)).toEqual([{ col: 3, row: 1, cols: 10, rows: 5, zoom: 1 }, { col: 0, row: 0, cols: 20, rows: 10, zoom: 0.5 }]);

  setView.mockClear();
  Object.assign(workspace, { editorTab: 'input', viewTab: 'input', inputView: { col: 2, row: 1, cols: 6, rows: 3, zoom: 4 } });
  await vi.advanceTimersByTimeAsync(300);
  workspace.setEditZoom(8);   // a frame before InputEditor has the cells at 8
  await vi.advanceTimersByTimeAsync(300);
  workspace.inputView = { col: 1, row: 0, cols: 3, rows: 1, zoom: 8 };
  await vi.advanceTimersByTimeAsync(300);
  const advance = measureAdvance(DISPLAY_FONT);
  expect(setView.mock.calls.map(([v]) => v)).toEqual([{ col: 2, row: 1, cols: 6, rows: 3, zoom: 4 / advance }, { col: 1, row: 0, cols: 3, rows: 1, zoom: 8 / advance }]);
});

test('going live on SOCIAL sends the last art tab\'s view at once', async () => {
  const setView = vi.spyOn(Host.prototype, 'setView');
  const workspace = useWorkspaceStore();
  Object.assign(workspace, { editorTab: 'social', ansiViewZoom: 0.5, ansiViewOrigin: { col: 3, row: 1 }, ansiViewSize: { cols: 10, rows: 5 } });
  await goLive();
  expect(setView).toHaveBeenLastCalledWith({ col: 3, row: 1, cols: 10, rows: 5, zoom: 0.5 });
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

test('A picture that finishes encoding after the room ended sends nothing', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  let finish;
  vi.mocked(thumbnailOf).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const socket = await goLive();
  await vi.advanceTimersByTimeAsync(4000);
  expect(thumbnailOf).toHaveBeenCalledTimes(1);
  room.leave();
  finish('AAAA');
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(thumbnails(socket)).toEqual([]);
  expect(thumbnailOf).toHaveBeenCalledTimes(1);   // and no retry was scheduled
});

test('A picture that fails to make is a picture the browser couldn\'t make: nothing is sent and the room carries on', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(thumbnailOf).mockRejectedValueOnce(new Error('no encoder'));
  const unhandled = vi.fn();
  addEventListener('unhandledrejection', unhandled);
  const socket = await goLive();
  await vi.advanceTimersByTimeAsync(4000);
  expect(thumbnailOf).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalled();
  expect(thumbnails(socket)).toEqual([]);
  await vi.advanceTimersByTimeAsync(10);
  removeEventListener('unhandledrejection', unhandled);
  expect(unhandled).not.toHaveBeenCalled();

  project.editCell(2, 1, { char: '#' });           // the next change tries again, 3 minutes on
  project.commitEdit();
  await vi.advanceTimersByTimeAsync(3 * 60_000 + 1000);
  expect(thumbnails(socket)).toHaveLength(1);
  expect(room.status).toBe('live');
});

// The room's chat: a host's own messages and the watchers', through Host and Watch (their own tests are
// social-hosting and social-watching). A watcher's store is fed what its Watch would hand it.
const chatId = (n) => String(n).padStart(16, '0');
const said = (n, fields = {}) => ({
  entry: { pass: 'p', id: chatId(n), ts: 1000 + n, text: `m${n}`, sig: 's' },
  claims: { sub: 'u_2', name: 'someone', guest: false, verified: true, key: 'k', exp: 0, ...fields },
});
const mark = (n) => ({ id: chatId(n), ts: 1000 + n, text: `m${n}`, sub: 'u_2', name: 'someone', host: false, mine: false, deleted: false });

async function watching() {
  await social.boot();
  const socket = await joining(1);
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan', hostSub: 'u_9' });
  return socket;
}

test('A host\'s say trims, shows at once as the host\'s own, and sends one chat signed over the room', async () => {
  const socket = await goLive();
  await watcherOn(socket);
  const sent = channelSends();
  expect(await room.say('  hi ')).toBe(true);
  const said = () => room.chat.filter((m) => !m.presence);   // the watcher's joining is a row too
  expect(said()).toEqual([{ id: expect.any(String), ts: expect.any(Number), text: 'hi', sub: 'u_1', name: 'ansi-fan', host: true, mine: true, deleted: false }]);
  const chats = sent().filter((m) => m.t === 'chat');
  expect(chats).toHaveLength(1);
  const { id, ts, sig } = chats[0];
  expect(chats[0]).toMatchObject({ pass: social.pass, text: 'hi' });
  expect(await verify((await loadKey()).publicKey, `chat:${ID}:${id}:${ts}:hi`, sig)).toBe(true);
  expect(said()[0]).toMatchObject({ id, ts });
});

test('Both sides are given the room\'s id to sign over, and a watcher the pass key', async () => {
  await goLive();
  expect(room._host.roomId).toBe(ID);
  room.leave();
  await social.boot();
  await joining(2);
  expect(room._watch.roomId).toBe(ID);
  expect(room._watch.passKey).toBe(passKey);
});

test('An empty or too long message sends nothing', async () => {
  const socket = await goLive();
  await watcherOn(socket);
  const sent = channelSends();
  expect(await room.say('  ')).toBe(false);
  expect(await room.say('x'.repeat(301))).toBe(false);
  expect(room.chat.filter((m) => !m.presence)).toEqual([]);   // the watcher's joining is a row
  expect(room.chatRefused).toBe(null);
  expect(sent().filter((m) => m.t === 'chat')).toEqual([]);
});

test('A guest or an unconfirmed member can\'t chat: canChat is false and say sends nothing', async () => {
  await goLive();
  expect(room.canChat).toBe(true);
  social.claims = { ...social.claims, guest: true, verified: false };
  expect(room.canChat).toBe(false);
  social.claims = { ...social.claims, guest: false, verified: false };
  expect(room.canChat).toBe(false);
  expect(await room.say('hi')).toBe(false);
  expect(room.chat).toEqual([]);
  social.claims = null;
  expect(room.canChat).toBe(false);
});

test('A 4th message in a second is too fast; after a second the next good one clears the word', async () => {
  await goLive();
  vi.useFakeTimers({ toFake: ['Date'] });
  expect(await room.say('a')).toBe(true);
  expect(await room.say('b')).toBe(true);
  expect(await room.say('c')).toBe(true);
  expect(await room.say('d')).toBe(false);
  expect(room.chatRefused).toBe('too-fast');
  expect(room.chat.map((m) => m.text)).toEqual(['a', 'b', 'c']);
  vi.setSystemTime(Date.now() + 1000);
  expect(await room.say('d')).toBe(true);
  expect(room.chatRefused).toBe(null);
});

test('A host\'s Delete marks the message deleted, drops its text and tells the watchers', async () => {
  const socket = await goLive();
  await watcherOn(socket);
  await room.say('oops');
  const sent = channelSends();
  const { id } = room.chat[0];
  expect(room.deleteMessage(id)).toBe(true);
  expect(room.chat[0]).toMatchObject({ id, deleted: true, text: '' });
  expect(sent().filter((m) => m.t === 'deleted')).toEqual([{ t: 'deleted', id }]);
});

test('A watcher\'s say signs and sends over the channel, and shows only on its echo; the host\'s refusal is shown', async () => {
  const socket = await watching();
  const sent = vi.fn(() => true);
  room._watch.say = sent;
  room._watch.channel = { readyState: 'open' };
  expect(await room.say(' hello ')).toBe(true);
  const { id, ts, text, sig } = sent.mock.calls[0][0];
  expect(text).toBe('hello');
  expect(await verify((await loadKey()).publicKey, signedText(ID, { id, ts, text }), sig)).toBe(true);
  expect(room.chat).toEqual([]);
  room._watch.onChat({ type: 'refused', id, reason: 'too-fast' });
  expect(room.chatRefused).toBe('too-fast');
  expect(await room.say('again')).toBe(true);
  expect(room.chatRefused).toBe(null);
  expect(socket.closed).toBe(false);
});

test('A watcher\'s say returns false when the channel isn\'t open, and spends none of the allowance', async () => {
  await watching();
  for (const text of ['a', 'b', 'c', 'd']) expect(await room.say(text)).toBe(false);
  expect(room.chatRefused).toBe(null);
  room._watch.channel = { readyState: 'open' };
  room._watch.say = vi.fn(() => true);
  for (const text of ['a', 'b', 'c']) expect(await room.say(text)).toBe(true);   // all three still there
  expect(room.chatRefused).toBe(null);
});

test('A watcher\'s first history sets the chat, more and where it joined; a host message is the host\'s, mine is mine', async () => {
  await watching();
  const own = said(3, { sub: 'u_1', name: 'ansi-fan' });   // the watcher's own, here also the host's name: not the host's
  room._watch.onChat({ type: 'history', messages: [said(1, { sub: 'u_9', name: 'ansi-fan' }), said(2), { id: chatId(9), ts: 1009, deleted: true }, own], more: true, earlier: false });
  expect(room.chat.map((m) => [m.id, m.host, m.mine, m.deleted, m.text])).toEqual([
    [chatId(1), true, false, false, 'm1'], [chatId(2), false, false, false, 'm2'],
    [chatId(9), false, false, true, ''], [chatId(3), false, true, false, 'm3'],
  ]);
  expect(room.chat[1]).toEqual(mark(2));
  expect(room.chatMore).toBe(true);
  expect(room.joinedAt).toBe(chatId(3));
});

test('Who came and went is a row of the chat, live and in a history, named by their pass and marked as theirs', async () => {
  await watching();
  const came = (n, presence, fields) => ({ entry: { pass: 'p', id: chatId(n), ts: 1000 + n, presence }, claims: said(n, fields).claims });
  room._watch.onChat({ type: 'history', messages: [came(1, 'joined', { name: 'tin-owl' }), said(2)], more: false, earlier: false });
  room._watch.onChat({ type: 'presence', ...came(3, 'joined', { sub: 'u_1', name: 'ansi-fan' }) });
  expect(room.chat.map((m) => [m.name, m.presence ?? null, m.mine, m.text])).toEqual([
    ['tin-owl', 'joined', false, ''], ['someone', null, false, 'm2'], ['ansi-fan', 'joined', true, ''],
  ]);
});

test('The host\'s tag follows its account, not its name: a host who renamed keeps it, a namesake does not get it', async () => {
  await watching();   // the host is u_9, joined as ansi-fan
  room._watch.onChat({ type: 'history', messages: [said(1, { sub: 'u_9', name: 'renamed' })], more: false, earlier: false });
  room._watch.onChat({ type: 'chat', ...said(2, { sub: 'u_5', name: 'ansi-fan' }) });
  expect(room.chat.map((m) => [m.name, m.host])).toEqual([['renamed', true], ['ansi-fan', false]]);
});

test('earlier() asks for the page before the oldest, once while waiting, and the answer goes in front', async () => {
  await watching();
  room._watch.earlier = vi.fn(() => true);
  expect(room.earlier()).toBe(false);   // nothing more yet
  room._watch.onChat({ type: 'history', messages: [said(5), said(6)], more: true, earlier: false });
  expect(room.earlier()).toBe(true);
  expect(room.earlier()).toBe(false);
  expect(room._watch.earlier).toHaveBeenCalledTimes(1);
  expect(room._watch.earlier).toHaveBeenCalledWith(chatId(5));
  room._watch.onChat({ type: 'history', messages: [said(3), said(4)], more: false, earlier: true });
  expect(room.chat.map((m) => m.id)).toEqual([3, 4, 5, 6].map(chatId));
  expect(room.chatMore).toBe(false);
  expect(room.joinedAt).toBe(chatId(6));
  expect(room.earlier()).toBe(false);   // no more
});

test('An earlier-marked history nobody asked for is merged, not trusted: only new ids, more and joinedAt kept', async () => {
  await watching();
  room._watch.onChat({ type: 'history', messages: [said(5), said(6)], more: true, earlier: false });
  room._watch.onChat({ type: 'history', messages: [said(5), said(6), said(7)], more: false, earlier: true });
  expect(room.chat.map((m) => m.id)).toEqual([5, 6, 7].map(chatId));
  expect(room.chatMore).toBe(true);
  expect(room.joinedAt).toBe(chatId(6));
});

test('A fresh history after a reconnect adds only the messages not there yet, and a new asking can start', async () => {
  await watching();
  room._watch.earlier = vi.fn(() => true);
  room._watch.onChat({ type: 'history', messages: [said(5), said(6)], more: true, earlier: false });
  room.earlier();   // never answered: the connection dropped
  room.watchState('lost');
  room._watch.onChat({ type: 'history', messages: [said(6), said(7)], more: false, earlier: true });
  expect(room.chat.map((m) => m.id)).toEqual([5, 6, 7].map(chatId));
  expect(room.earlier()).toBe(true);
  expect(room._watch.earlier).toHaveBeenCalledTimes(2);
});

test('A reconnect keeps the host\'s order even when the senders\' clocks disagree', async () => {
  await watching();
  const at = (n, ts) => { const m = said(n); m.entry.ts = ts; return m; };
  room._watch.onChat({ type: 'history', messages: [at(1, 5000), at(2, 4000)], more: false, earlier: false });
  room.watchState('lost');
  room._watch.onChat({ type: 'history', messages: [at(1, 5000), at(2, 4000), at(3, 1000), at(4, 9000), at(5, 2000)], more: false, earlier: false });
  expect(room.chat.map((m) => m.id)).toEqual([1, 2, 3, 4, 5].map(chatId));
});

test('A gap longer than a page replaces the list with the page, and more is the page\'s', async () => {
  await watching();
  room._watch.onChat({ type: 'history', messages: [said(1), said(2)], more: false, earlier: false });
  room.watchState('lost');
  room._watch.onChat({ type: 'history', messages: [said(8), said(9)], more: true, earlier: false });
  expect(room.chat.map((m) => m.id)).toEqual([8, 9].map(chatId));
  expect(room.chatMore).toBe(true);
  expect(room.joinedAt).toBe(null);   // it was in the list that went
});

test('A chat entry whose id is already shown is ignored', async () => {
  await watching();
  room._watch.onChat({ type: 'chat', ...said(1) });
  room._watch.onChat({ type: 'chat', ...said(1) });
  room._watch.onChat({ type: 'chat', ...said(2) });
  expect(room.chat.map((m) => m.id)).toEqual([1, 2].map(chatId));
});

test('A watcher\'s deleted marks the message deleted and drops its text; an unknown id is ignored', async () => {
  await watching();
  room._watch.onChat({ type: 'history', messages: [said(1), said(2)], more: false, earlier: false });
  room._watch.onChat({ type: 'deleted', id: chatId(2) });
  room._watch.onChat({ type: 'deleted', id: chatId(8) });
  expect(room.chat.map((m) => [m.deleted, m.text])).toEqual([[false, 'm1'], [true, '']]);
});

test('A deletion made while the watcher was reconnecting comes with the new history and blanks the message shown', async () => {
  await watching();
  room._watch.onChat({ type: 'history', messages: [said(1), said(2)], more: false, earlier: false });
  room.watchState('lost');
  room._watch.onChat({ type: 'history', messages: [said(1), { id: chatId(2), ts: 1002, deleted: true }, said(3)], more: false, earlier: true });
  expect(room.chat.map((m) => [m.id, m.deleted, m.text])).toEqual([[chatId(1), false, 'm1'], [chatId(2), true, ''], [chatId(3), false, 'm3']]);
});

test('A member who confirms their email while watching joins the room again, with the same password, so the host gets the new pass', async () => {
  await social.boot();
  const first = await joining(1, { password: 'pw' });
  first.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan', hostSub: 'u_9' });
  social.claims = { ...social.claims, verified: false };   // as the pass the room was joined with
  await later();
  expect(sockets).toHaveLength(1);
  social.claims = { ...social.claims, verified: true };    // the next pass: confirmed
  const second = await lastSocket(2);
  second.accept();
  await vi.waitFor(() => expect(second.sent[0]).toMatchObject({ type: 'join', password: 'pw' }));
  expect(room.id).toBe(ID);
  social.claims = { ...social.claims, verified: false };
  await later();
  social.claims = { ...social.claims, verified: true };
  await lastSocket(3);   // one more for each time it turns true again
});

test('5,001 messages keep the last 5,000 and leave nothing more to ask for', async () => {
  await watching();
  room._watch.onChat({ type: 'history', messages: [said(0)], more: true, earlier: false });
  for (let n = 1; n <= MOST_KEPT; n++) room._watch.onChat({ type: 'chat', ...said(n) });
  expect(room.chat).toHaveLength(MOST_KEPT);
  expect(room.chat[0].id).toBe(chatId(1));
  expect(room.chatMore).toBe(false);
  room._watch.earlier = vi.fn(() => true);
  expect(room.earlier()).toBe(false);
  expect(room._watch.earlier).not.toHaveBeenCalled();
});

test('An earlier page that would overfill the list adds only what fits, nearest first, and the list is then full', async () => {
  await watching();
  const first = Array.from({ length: MOST_KEPT - 10 }, (_, n) => said(100 + n));
  room._watch.onChat({ type: 'history', messages: first, more: true, earlier: false });
  expect(room.chatMore).toBe(true);
  room._watch.earlier = vi.fn(() => true);
  expect(room.earlier()).toBe(true);
  room._watch.onChat({ type: 'history', messages: Array.from({ length: 50 }, (_, n) => said(n)), more: true, earlier: true });
  expect(room.chat).toHaveLength(MOST_KEPT);
  expect(room.chat[0].id).toBe(chatId(40));
  expect(room.chat.at(-1).id).toBe(chatId(100 + MOST_KEPT - 11));
  expect(room.chatMore).toBe(false);
  expect(room.earlier()).toBe(false);
});

test('An earlier() nobody answers can be asked again after a wait', async () => {
  await watching();
  room._watch.earlier = vi.fn(() => true);
  room._watch.onChat({ type: 'history', messages: [said(5)], more: true, earlier: false });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  expect(room.earlier()).toBe(true);
  await vi.advanceTimersByTimeAsync(2900);
  expect(room.earlier()).toBe(false);
  await vi.advanceTimersByTimeAsync(200);
  expect(room.earlier()).toBe(true);
  expect(room._watch.earlier).toHaveBeenCalledTimes(2);
  room.leave();
  expect(vi.getTimerCount()).toBe(0);
});

test('An id repeated within a history page is shown once', async () => {
  await watching();
  room._watch.onChat({ type: 'history', messages: [said(1), said(1), said(2)], more: false, earlier: false });
  expect(room.chat.map((m) => m.id)).toEqual([1, 2].map(chatId));
});

test('A watcher can\'t remove or block', async () => {
  await watching();
  expect(await room.block({ name: 'someone', peer: 'p9' })).toBe(false);
  expect(server.sent('POST', '/api/blocks')).toEqual([]);
  room.remove('p9');   // nothing to send it with: no throw
});

test('block POSTs the name, then removes the watcher; a failed POST removes no one', async () => {
  const socket = await goLive();
  await watcherOn(socket);
  await expect.poll(() => room.watchers.length).toBe(1);
  const [watcher] = room.watchers;
  server.route('POST /api/blocks', () => [404, { code: 'NO_SUCH_USER' }]);
  expect(await room.block(watcher)).toBe(false);
  expect(socket.sent.filter((m) => m.type === 'remove')).toEqual([]);
  expect(room.watchers).toHaveLength(1);

  server.route('POST /api/blocks', () => [200, {}]);
  expect(await room.block(watcher)).toBe(true);
  expect(server.sent('POST', '/api/blocks').at(-1).body).toEqual({ username: 'p1' });
  expect(socket.sent.filter((m) => m.type === 'remove')).toEqual([{ type: 'remove', peer: 'p1' }]);
  expect(room.watchers).toEqual([]);
});

test('remove sends the Room\'s remove and drops the watcher', async () => {
  const socket = await goLive();
  await watcherOn(socket);
  room.remove('p1');
  expect(socket.sent.at(-1)).toEqual({ type: 'remove', peer: 'p1' });
  await expect.poll(() => room.watchers).toEqual([]);
});

test('Joining as a member loads the blocked list with its ids; a guest asks for nothing', async () => {
  server.route('GET /api/blocks', () => [200, { blocked: [{ id: 'u_9', username: 'troll', since: 1 }] }]);
  await social.boot();
  room.join(ID);
  await vi.waitFor(() => expect(social.blocked).toEqual([{ id: 'u_9', username: 'troll', since: 1 }]));
  room.leave();

  server.session = null;
  await social.signOut();
  const before = server.sent('GET', '/api/blocks').length;
  room.join(ID);
  await wait(50);
  expect(server.sent('GET', '/api/blocks')).toHaveLength(before);
});

test('Leaving clears the chat, and the next room starts with a full allowance', async () => {
  await goLive();
  vi.useFakeTimers({ toFake: ['Date'] });
  for (const t of ['a', 'b', 'c']) await room.say(t);
  expect(await room.say('d')).toBe(false);
  room.leave();
  expect([room.chat, room.chatMore, room.joinedAt, room.chatRefused]).toEqual([[], false, null, null]);
  expect(await startPublic()).toBe(true);
  expect(await room.say('e')).toBe(true);
});

test('artZoom follows the host\'s zoom while following, stays put while looking around, and Follow takes the host\'s again', async () => {
  await social.boot();
  const socket = await joining(1);
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan', hostSub: 'u_9' });
  const host = new Host({
    config: { iceServers: [] }, passKey: async () => keyB64, onWatchers: () => {},
    send: async (msg) => {
      await later();
      if (msg.type === 'signal-to') socket.receive({ type: 'signal-from', from: 'host', data: msg.data });
    },
  });
  toClose.push(host);
  socket.heard = (msg) => {
    if (msg.type === 'signal-to') later().then(() => host.signalFrom('p1', msg.data));
  };
  expect(room.artZoom).toBe(1);
  host.setRoom({ name: 'Night shift', welcome: 'Hi' });
  host.setArt({ cols: 2, lines: 1, font: null, cells: [cell('a'), cell('b')] });
  host.setView({ col: 0, row: 0, cols: 2, rows: 1, zoom: 0.5 });
  await host.peer('p1', await passFor('g_1', 'quiet-amber-fox-1', true));
  await expect.poll(() => room.artZoom, PATIENT).toBe(0.5);

  host.setView({ col: 0, row: 0, cols: 2, rows: 1, zoom: 0.25 });
  await expect.poll(() => room.artZoom, PATIENT).toBe(0.25);
  room.setFollowing(false);
  host.setView({ col: 0, row: 0, cols: 2, rows: 1, zoom: 0.75 });
  await expect.poll(() => room.hostView.zoom, PATIENT).toBe(0.75);
  expect(room.artZoom).toBe(0.25);
  room.setFollowing(true);
  expect(room.artZoom).toBe(0.75);
});

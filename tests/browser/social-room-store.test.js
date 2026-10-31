// The room store: going live and sharing the art as it changes, joining, refusals, leaving and ending,
// against the fake server (tests/support/socialServer.js). The server's socket is a fake the test answers;
// the other side of a room is a real Watch (or a raw peer) made here, over real WebRTC without STUN,
// its signals relayed through the fake socket. Watchers' passes are signed by a test key, served as
// the server's.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore, hasReportedRoom } from '@/store/RoomStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { thumbnailOf } from '@/social/thumbnail';
import { forgetKey, loadKey } from '@/social/keys';
import { toBase64url } from '@/social/base64url';
import { hex2rgb } from '@/lib/ColorUtils';
import { desktopQuery, rtcConfig } from '@/social/config';
import { Watch } from '@/social/watching';
import { Host, RETURN_WITHIN_MS } from '@/social/hosting';
import { measureAdvance } from '@/lib/CellCanvas';
import { DISPLAY_FONT, setDisplayFont } from '@/lib/displayFonts';
import { MOST_KEPT, signedText } from '@/social/chat';
import { fontFor } from '@/social/wire';
import { openPeer } from '@/social/peer';
import { passKey } from '@/social/pass';
import { ROOM_AWAY_WORDS, HOST_REPLACED_WORDS, refusalWords } from '@/social/messages';
import { keepHostingRecord, keptHostingRecord } from '@/social/hostingRecord';
import { toastMessage } from '@/composables/useToast';
import { newSession, removedCount } from '@/social/session';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { ownSocialDatabase } from '../support/socialDatabase.js';
import { verify, claimsOf, member, fakeServer, sockets, useFakeSockets, lastSocket, at } from '../support/socialServer.js';

vi.mock('@/social/thumbnail', () => ({ thumbnailOf: vi.fn(async () => 'AAAA') }));   // drawn and encoded in social-thumbnail.test.js

const ID = 'abcdefghij';
const PATIENT = { timeout: 5000 };   // connecting and packing a snapshot take longer on a busy machine
const later = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RECORD = 'phosphor-hosting';
const gradient = await (await fetch('/tests/fixtures/images/gradient.png')).blob();   // before fetch is the fake's

const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const keyB64 = toBase64url(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)));
async function passFor(sub, name, guest = false) {
  const claims = { sub, name, guest, verified: !guest, key: 'k', exp: Date.now() / 1000 + 3600 };
  const body = toBase64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(body)));
  return `${body}.${toBase64url(signature)}`;
}

// The room as the server tells its host.
const info = (fields = {}) => ({
  id: ID, name: 'Night shift', hostSub: 'u_1', hostName: 'ansi-fan', public: true, allowGuests: true, max: 12,
  signal: null, liveSince: 1000, count: 0, ...fields,
});

let deleteDatabase, server, social, room, project, toClose;
beforeEach(async () => {
  deleteDatabase = ownSocialDatabase('room-store');
  localStorage.removeItem('phosphor-reported');
  sessionStorage.removeItem(RECORD);
  toastMessage.value = null;
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

// A Watch the server let in as `peer`: its signals go back through the newest socket.
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

test('startRoom POSTs the room with the draft\'s signal and no password; a private one sends its password and no signal', async () => {
  await social.boot();
  expect(room.startDraft.signal).toBe(null);
  expect(await startPublic({ signal: 'chat' })).toBe(true);
  expect(server.sent('POST', '/api/rooms')[0].body).toEqual({ name: 'Night shift', public: true, allowGuests: true, max: 12, signal: 'chat' });
  expect(room.role).toBe('host');
  expect(room.link).toBe(`http://localhost/?room=${ID}`);
  room.leave();

  expect(await room.startRoom({ name: 'Back room', welcome: '', isPublic: false, password: 'sesame', allowGuests: false, max: 3, signal: 'chat' })).toBe(true);
  expect(server.sent('POST', '/api/rooms')[1].body).toEqual({ name: 'Back room', public: false, password: 'sesame', allowGuests: false, max: 3, signal: null });
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
  await expect.poll(() => room.watchers).toEqual([{ peer: 'p1', sub: 'u_p1', name: 'p1', guest: false, tracking: true, connected: true }]);

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
  expect(settings()).toEqual([{ type: 'settings', allowGuests: false, max: 6, signal: null }]);
  expect(room.room).toMatchObject({ welcome: 'Hello', allowGuests: false, max: 4 });
  await vi.waitFor(() => expect(settings()).toHaveLength(2), { timeout: 2000 });
  expect(settings()[1]).toEqual({ type: 'settings', allowGuests: false, max: 4, signal: null });

  socket.receive({ type: 'settings-now', room: info({ allowGuests: false, max: 6 }) });
  expect(room.room).toEqual({ ...info({ allowGuests: false, max: 6 }), welcome: 'Hello' });
});

test('A new signal goes with the rest of the settings; settings-now\'s signal shows, and a waiting one stays', async () => {
  const socket = await goLive();
  const settings = () => socket.sent.filter((m) => m.type === 'settings');
  room.changeSettings({ welcome: '', allowGuests: true, max: 12, signal: 'chat' });
  expect(settings()).toEqual([{ type: 'settings', allowGuests: true, max: 12, signal: 'chat' }]);
  expect(room.room.signal).toBe('chat');
  socket.receive({ type: 'settings-now', room: info({ signal: 'feedback' }) });
  expect(room.room.signal).toBe('feedback');
  room.changeSettings({ welcome: '', allowGuests: true, max: 12, signal: 'heads-down' });   // waits for the interval
  socket.receive({ type: 'settings-now', room: info({ signal: 'feedback' }) });
  expect(room.room.signal).toBe('heads-down');
});

test('A paced-out settings: the room shows the server\'s values, and choosing the refused ones again sends them', async () => {
  const socket = await goLive();
  const settings = () => socket.sent.filter((m) => m.type === 'settings');
  room.changeSettings({ welcome: 'Hi', allowGuests: true, max: 6 });
  socket.receive({ type: 'settings-now', room: info({ max: 12 }) });
  expect(room.room.max).toBe(12);
  room.changeSettings({ welcome: 'Hi', allowGuests: true, max: 6 });
  await vi.waitFor(() => expect(settings()).toHaveLength(2), { timeout: 2000 });
  expect(settings()[1]).toEqual({ type: 'settings', allowGuests: true, max: 6, signal: null });
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
  expect(settings()[1]).toEqual({ type: 'settings', allowGuests: false, max: 8, signal: null });
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
  await vi.waitFor(() => expect(again.sent.filter((m) => m.type === 'settings')).toEqual([{ type: 'settings', allowGuests: true, max: 6, signal: null }]), { timeout: 2000 });
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

test('a pagehide doesn\'t end the room, and leaves a record', async () => {
  const socket = await goLive();
  sessionStorage.removeItem(RECORD);
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  expect(socket.sent.map((m) => m.type)).not.toContain('end');
  expect(socket.closed).toBe(false);
  expect(keptHostingRecord()).toMatchObject({ sub: 'u_1', id: ID, link: room.link, hasPassword: false, peopleOpen: false, muted: [] });
});

test('a pagehide tells an open watcher, which goes to lost while the room stays', async () => {
  const socket = await goLive();
  const log = await watcherOn(socket);
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  await expect.poll(() => log.states.at(-1), PATIENT).toBe('lost');
  expect(socket.sent.map((m) => m.type)).not.toContain('end');
  expect(room.status).toBe('live');
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

// A raw host peer for a joined watcher, its signals through the watcher's socket as the server relays them.
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

test('"hosted by" is the server\'s word: a room from the channel naming another host doesn\'t change it', async () => {
  await social.boot();
  const socket = await joining(1);
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan', hostSub: 'u_9' });
  const channel = await rawHost(socket);
  channel.send(JSON.stringify({ t: 'room', name: 'Night shift', welcome: 'Hi', host: 'impostor' }));
  await expect.poll(() => room.room?.name, PATIENT).toBe('Night shift');
  expect(room.room).toEqual({ name: 'Night shift', welcome: 'Hi', host: 'ansi-fan', hostSub: 'u_9' });
});

test('the server closing the socket while the host\'s connection is being made is final: failed, and no join again', async () => {
  await social.boot();
  const socket = await joining(1);
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan', hostSub: 'u_9' });
  await rawHost(socket, { answered: false });
  await vi.waitFor(() => expect(room.status).toBe('connecting'));
  socket.close();   // the host gave up on reaching us first, and the server kicked us
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
  // The host's side, its signals joined to the watcher's socket as the server would.
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

  room.setTracking(false);
  expect(room.tracking).toBe(false);
  await expect.poll(() => lists.at(-1)?.[0].tracking, PATIENT).toBe(false);
  social.page = 'account';
  room.leave();
  expect(socket.closed).toBe(true);
  expect([room.role, room.room, room.art, room.hostView, room.tracking, social.page]).toEqual([null, null, null, null, true, 'lobby']);
  await expect.poll(() => lists.at(-1), PATIENT).toEqual([]);
});

test('?room=<id> on a desktop opens SOCIAL and asks once you\'re known, joining only on yes, taking the link off the URL', async () => {
  const replaceState = vi.spyOn(history, 'replaceState').mockImplementation(() => {});
  const { useWorkspaceStore } = await import('@/store/WorkspaceStore');
  await social.start(at(`?room=${ID}&keep=1`));
  expect(useWorkspaceStore().editorTab).toBe('social');
  expect(replaceState.mock.calls[0][2]).toBe(`${window.location.pathname}?keep=1`);
  expect(social.roomInvite).toBe(ID);
  expect(room.role).toBe(null);
  expect(sockets.filter((s) => s.url.includes('/api/rooms/'))).toHaveLength(0);
  social.answerRoomInvite(true);
  expect(social.roomInvite).toBe(null);
  const socket = await lastSocket(1);
  expect(server.requests.findIndex((r) => r.path === '/api/me')).toBeGreaterThanOrEqual(0);
  expect(socket.url).toMatch(new RegExp(`/api/rooms/${ID}/ws$`));
  expect(room.role).toBe('watch');
  await social.showLobby();
  expect(sockets.filter((s) => s.url.includes('/api/rooms/'))).toHaveLength(1);   // once
});

test('saying no to a ?room= link joins nothing', async () => {
  vi.spyOn(history, 'replaceState').mockImplementation(() => {});
  await social.start(at(`?room=${ID}`));
  social.answerRoomInvite(false);
  expect([social.roomInvite, room.role]).toEqual([null, null]);
  expect(sockets.filter((s) => s.url.includes('/api/rooms/'))).toHaveLength(0);
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
    { middleCol: expect.any(Number), middleRow: expect.any(Number) },
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
  const workspace = useWorkspaceStore();
  Object.assign(workspace, { editorTab: 'output', viewTab: 'output', ansiViewOrigin: { col: 0, row: 0 }, ansiViewSize: { cols: 10, rows: 4 } });
  const socket = await goLive();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(thumbnails(socket)).toHaveLength(1);

  workspace.ansiViewOrigin = { col: 3, row: 1 };
  await vi.advanceTimersByTimeAsync(60_000);
  expect(thumbnails(socket)).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(2 * 60_000);
  expect(thumbnails(socket)).toHaveLength(2);
  expect(thumbnailOf).toHaveBeenLastCalledWith(expect.anything(), { middleCol: 8, middleRow: 3 });
});

test('The lobby picture follows the shared view\'s middle until pinned to a cell; pinning or tracking again is a change, and a pin picked before going live carries into the room', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const workspace = useWorkspaceStore();
  Object.assign(workspace, { editorTab: 'output', viewTab: 'output', ansiViewOrigin: { col: 0, row: 10 }, ansiViewSize: { cols: 10, rows: 6 } });
  const socket = await goLive();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(thumbnails(socket)).toHaveLength(1);
  expect(thumbnailOf).toHaveBeenLastCalledWith(expect.anything(), { middleCol: 5, middleRow: 13 });

  room.pinLobby({ col: 2, row: 12 });
  expect(room.lobbyPin).toEqual({ col: 2, row: 12 });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(thumbnails(socket)).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(2 * 60_000);
  expect(thumbnails(socket)).toHaveLength(2);
  expect(thumbnailOf).toHaveBeenLastCalledWith(expect.anything(), { col: 2, row: 12 });

  workspace.ansiViewOrigin = { col: 0, row: 40 };   // pinned: the view moving is not a change
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(thumbnails(socket)).toHaveLength(2);

  room.followLobby();
  await vi.advanceTimersByTimeAsync(3 * 60_000 + 1000);
  expect(thumbnails(socket)).toHaveLength(3);
  expect(thumbnailOf).toHaveBeenLastCalledWith(expect.anything(), { middleCol: 5, middleRow: 43 });

  room.pinLobby({ col: 0, row: 5 });
  room.leave();
  expect(room.lobbyPin).toBe(null);
  room.pinLobby({ col: 0, row: 5 });   // picked in Setup room, before the room is made
  expect(await startPublic()).toBe(true);   // the new room keeps it
  expect(room.lobbyPin).toEqual({ col: 0, row: 5 });
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
const mark = (n) => ({ id: chatId(n), ts: 1000 + n, text: `m${n}`, pass: 'p', sig: 's', sub: 'u_2', name: 'someone', host: false, mine: false, deleted: false });

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
  expect(said()).toEqual([{ id: expect.any(String), ts: expect.any(Number), text: 'hi', pass: social.pass, sig: expect.any(String), sub: 'u_1', name: 'ansi-fan', host: true, mine: true, deleted: false }]);
  const chats = sent().filter((m) => m.t === 'chat');
  expect(chats).toHaveLength(1);
  const { id, ts, sig } = chats[0];
  expect(chats[0]).toMatchObject({ pass: social.pass, text: 'hi' });
  expect(await verify((await loadKey()).publicKey, `chat:${ID}:u_1:${id}:${ts}:hi`, sig)).toBe(true);
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
  expect(await verify((await loadKey()).publicKey, signedText(ID, 'u_1', { id, ts, text }), sig)).toBe(true);
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

test('block counts someone who left while the confirm was open', async () => {
  const socket = await goLive();
  await watcherOn(socket);
  await expect.poll(() => room.watchers.length).toBe(1);
  const [watcher] = room.watchers;
  server.route('POST /api/blocks', () => [200, {}]);
  room.watchers = [];   // gone before the answer
  expect(await room.block({ ...watcher })).toBe(true);
  expect(room.session.people.find((p) => p.sub === watcher.sub).removed).toEqual(expect.any(Number));
  expect(removedCount(room.session)).toBe(1);
});

test('A host\'s session: who came and went, messages, removed and the most at once, and a new room starts fresh', async () => {
  const socket = await goLive();
  expect(room.session).toEqual({ ...newSession(), liveSince: expect.any(Number) });
  const since = room.session.liveSince;
  await watcherOn(socket);
  await expect.poll(() => room.hereNow).toBe(1);
  const pass = await passFor('u_p9', 'tin-owl');
  const entry = (id, presence, ts) => ({ type: 'presence', entry: { pass, id: `p${id}`, ts, presence } });
  room._host.onChat(entry(1, 'joined', 1000));
  room._host.onChat(entry(2, 'left', 61_000));
  room._host.onChat(entry(3, 'joined', 100_000));
  room._host.onChat({ type: 'chat', entry: { pass, id: 'm1', ts: 101_000, text: 'hi' } });
  room._host.onChat({ type: 'chat', entry: { pass: social.pass, id: 'm2', ts: 102_000, text: 'hello' } });
  expect(room.session.messages).toBe(2);
  expect(room.session.people.find((p) => p.sub === 'u_p9')).toEqual({ sub: 'u_p9', name: 'tin-owl', guest: false, since: 100_000, total: 60_000, left: null, removed: null, said: 1 });
  expect(room.session.most).toBe(1);

  room.remove('p1');
  expect(room.session.people.find((p) => p.sub === 'u_p1').removed).toEqual(expect.any(Number));
  room.remove('p1');   // once
  expect(removedCount(room.session)).toBe(1);

  socket.close();
  expect(room.status).toBe('reconnecting');
  const again = await lastSocket(2);
  again.accept();
  await vi.waitFor(() => expect(again.sent[0]?.type).toBe('host'));
  again.receive({ type: 'hosting', room: info(), peers: [] });
  await vi.waitFor(() => expect(room.status).toBe('live'));
  expect(room.session.liveSince).toBe(since);

  room.leave();
  expect(room.session).toEqual(newSession());
  await startPublic();
  expect(room.session).toEqual(newSession());
});

test('remove sends the server\'s remove and drops the watcher', async () => {
  const socket = await goLive();
  await watcherOn(socket);
  room.remove('p1');
  expect(socket.sent.at(-1)).toEqual({ type: 'remove', peer: 'p1' });
  await expect.poll(() => room.watchers).toEqual([]);
});

test('mute tells the host and lists the person until unmuted or the room ends; their messages come marked', async () => {
  const socket = await goLive();
  await watcherOn(socket);
  const told = vi.spyOn(room._host, 'mute');
  room.mute('u_p1', true);
  expect(told).toHaveBeenCalledWith('u_p1', true);
  expect(room.muted).toEqual(['u_p1']);
  room.mute('u_p1', true);   // once
  expect(room.muted).toEqual(['u_p1']);
  const pass = await passFor('u_p1', 'p1');
  room._host.onChat({ type: 'chat', entry: { pass, id: 'm1', ts: 1000, text: 'hush' }, muted: true });
  room._host.onChat({ type: 'chat', entry: { pass, id: 'm2', ts: 2000, text: 'loud' } });
  expect(room.chat.filter((m) => m.text).map((m) => !!m.muted)).toEqual([true, false]);
  room.mute('u_p1', false);
  expect(told).toHaveBeenLastCalledWith('u_p1', false);
  expect(room.muted).toEqual([]);
  room.mute('u_p1', true);
  room.leave();
  expect(room.muted).toEqual([]);
});

test('A watcher can\'t mute', async () => {
  await watching();
  room.mute('u_p9', true);
  expect(room.muted).toEqual([]);
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

test('artZoom follows the host\'s zoom while tracking, stays put while looking around, and Track takes the host\'s again', async () => {
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

  room.fitArt(0.2);   // the window is smaller than the host's view: the less of the two, below the zoom's own range
  expect(room.artZoom).toBe(0.2);
  host.setView({ col: 0, row: 0, cols: 2, rows: 1, zoom: 0.4 });
  await expect.poll(() => room.hostView?.zoom, PATIENT).toBe(0.4);
  expect(room.artZoom).toBe(0.2);
  room.fitArt(1);
  expect(room.artZoom).toBe(0.4);

  host.setView({ col: 0, row: 0, cols: 2, rows: 1, zoom: 0.25 });
  await expect.poll(() => room.artZoom, PATIENT).toBe(0.25);
  room.setTracking(false);
  host.setView({ col: 0, row: 0, cols: 2, rows: 1, zoom: 0.75 });
  await expect.poll(() => room.hostView.zoom, PATIENT).toBe(0.75);
  expect(room.artZoom).toBe(0.25);
  room.setTracking(true);
  expect(room.artZoom).toBe(0.75);

  // The watcher's own zoom stops tracking and is held to the range; Track goes back to the host's.
  room.setArtZoom(0.5);
  expect([room.tracking, room.artZoom]).toEqual([false, 0.5]);
  room.setArtZoom(5);
  expect(room.artZoom).toBe(1);
  room.setArtZoom(0);
  expect(room.artZoom).toBe(0.25);
  room.setTracking(true);
  expect(room.artZoom).toBe(0.75);
});

// Reporting: what a report sends, and a silence heard from the room.
const reports = (socket) => socket.sent.filter((m) => m.type === 'report');
const evidence = (...ns) => ns.map((n) => ({ pass: 'p', id: chatId(n), ts: 1000 + n, text: `m${n}`, sig: 's' }));

test('Chat rows keep the pass and signature, and a deleted clears them', async () => {
  await watching();
  room._watch.onChat({ type: 'history', messages: [said(1), said(2)], more: false, earlier: false });
  expect(room.chat[0]).toMatchObject({ pass: 'p', sig: 's' });
  room._watch.onChat({ type: 'deleted', id: chatId(1) });
  expect(room.chat[0]).toMatchObject({ deleted: true, text: '', pass: null, sig: null });
  room._watch.onChat({ type: 'history', messages: [{ id: chatId(2), ts: 1002, deleted: true }], more: false, earlier: false });
  expect(room.chat[1]).toMatchObject({ deleted: true, pass: null, sig: null });
});

test('A report of a message sends one report with its id and the messages before it', async () => {
  const socket = await watching();
  room._watch.onChat({ type: 'history', messages: [1, 2, 3].map((n) => said(n)), more: false, earlier: false });
  expect(room.canReport).toBe(true);
  expect(room.report({ sub: 'u_2', messageId: chatId(3), reason: 'harassment' })).toBe(true);
  expect(reports(socket)).toEqual([{ type: 'report', sub: 'u_2', reason: 'harassment', message: chatId(3), messages: evidence(1, 2, 3) }]);
});

test('A report from the people list sends the person\'s last messages and no message id', async () => {
  const socket = await watching();
  room._watch.onChat({ type: 'history', messages: [said(1), said(2, { sub: 'u_3' }), said(3)], more: false, earlier: false });
  expect(room.report({ sub: 'u_2', reason: 'spam' })).toBe(true);
  expect(reports(socket)).toEqual([{ type: 'report', sub: 'u_2', reason: 'spam', messages: evidence(1, 3) }]);
});

test('A report that can\'t be made returns false and sends nothing', async () => {
  const socket = await watching();
  room._watch.onChat({ type: 'history', messages: [said(1), said(2, { sub: 'u_1' })], more: false, earlier: false });
  expect(room.report({ sub: 'u_1', messageId: chatId(2), reason: 'spam' })).toBe(false);   // yourself
  expect(room.report({ sub: 'u_2', messageId: chatId(1), reason: 'rude' })).toBe(false);   // not a reason
  expect(room.report({ sub: 'u_2', messageId: chatId(7), reason: 'spam' })).toBe(false);   // not a message here
  social.claims = { ...social.claims, verified: false };
  expect(room.report({ sub: 'u_2', messageId: chatId(1), reason: 'spam' })).toBe(false);   // can't report
  social.claims = { ...social.claims, verified: true };
  room._connection.close();
  expect(room.report({ sub: 'u_2', messageId: chatId(1), reason: 'spam' })).toBe(false);   // no socket
  expect(reports(socket)).toEqual([]);
});

test('Who you reported is kept for the room: not a report that couldn\'t go, no second report of them, and still them when you join it again', async () => {
  const socket = await watching();
  room._watch.onChat({ type: 'history', messages: [said(1), said(2, { sub: 'u_3' })], more: false, earlier: false });
  expect(room.report({ sub: 'u_2', messageId: chatId(1), reason: 'rude' })).toBe(false);
  expect(room.reported).toEqual([]);
  expect(room.report({ sub: 'u_2', messageId: chatId(1), reason: 'spam' })).toBe(true);
  expect(room.reported).toEqual(['u_2']);
  expect(room.report({ sub: 'u_2', reason: 'other' })).toBe(false);   // once is enough
  expect(reports(socket)).toHaveLength(1);
  room.leave();
  expect(room.reported).toEqual([]);

  const again = await joining(2);   // the same room again (a reload too): Report is still gone for them
  again.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan', hostSub: 'u_9' });
  room._watch.onChat({ type: 'history', messages: [said(1)], more: false, earlier: false });
  expect(room.reported).toEqual(['u_2']);
  expect(room.report({ sub: 'u_2', messageId: chatId(1), reason: 'spam' })).toBe(false);
  expect(reports(again)).toEqual([]);

  room.leave();
  room.join('zyxwvutsrq');   // another room: nobody yet
  expect(room.reported).toEqual([]);
  room.leave();
  social.claims = { ...social.claims, sub: 'u_5' };   // another account in this browser: nobody yet
  room.join(ID);
  expect(room.reported).toEqual([]);
});

// Reporting the room itself, from inside: the reason and a picture of what the watcher sees.
const roomReports = (socket) => socket.sent.filter((m) => m.type === 'report-room');
const smallArt = { cols: 2, lines: 1, font: { id: 'vga', size: 16 }, cells: [cell('a'), cell('b')] };
const REPORT_PICTURE = { width: 480, most: 96 * 1024 };

test('a watcher\'s reportRoom sends the reason and a base64 picture of what they see, once; then Report room is gone for this room', async () => {
  const socket = await watching();
  Object.assign(room, { art: smallArt, hostView: { col: 10, row: 4, cols: 20, rows: 10, zoom: 1 } });
  expect(hasReportedRoom(ID)).toBe(false);
  expect(room.roomReported).toBe(false);
  // Tracking: centered on the host's view. Asked twice at once, it goes once.
  expect(await Promise.all([room.reportRoom('sexual'), room.reportRoom('sexual')])).toEqual([true, false]);
  expect(roomReports(socket)).toEqual([{ type: 'report-room', reason: 'sexual', picture: 'AAAA' }]);
  expect(thumbnailOf).toHaveBeenCalledTimes(1);
  expect(thumbnailOf).toHaveBeenCalledWith({ ...smallArt, font: fontFor(smallArt.font) }, { middleCol: 20, middleRow: 9 }, REPORT_PICTURE);
  expect(room.reported).toContain('*room');
  expect(room.roomReported).toBe(true);
  expect(hasReportedRoom(ID)).toBe(true);
  expect(social.reportedRooms).toEqual([ID]);   // the lobby's card has no Report room for it either
  expect(await room.reportRoom('spam')).toBe(false);

  room.leave();   // the same room again (a reload too): still reported
  const again = await joining(2);
  again.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan', hostSub: 'u_9' });
  expect(room.reported).toContain('*room');
  expect(room.roomReported).toBe(true);
  expect(await room.reportRoom('spam')).toBe(false);
  expect(roomReports(again)).toEqual([]);
  social.claims = { ...social.claims, sub: 'u_5' };   // another account in this browser hasn't
  expect(hasReportedRoom(ID)).toBe(false);
  expect(social.reportedRooms).toEqual([]);
});

test('looking around, the room report\'s picture is centered on what the watcher sees; no picture, it goes without one', async () => {
  const socket = await watching();
  Object.assign(room, { art: smallArt, hostView: { col: 10, row: 4, cols: 20, rows: 10, zoom: 1 } });
  room.setTracking(false);
  room.lookingAt = { middleCol: 70, middleRow: 33 };
  vi.mocked(thumbnailOf).mockResolvedValueOnce(null);
  expect(await room.reportRoom('other')).toBe(true);
  expect(thumbnailOf).toHaveBeenCalledWith(expect.anything(), { middleCol: 70, middleRow: 33 }, REPORT_PICTURE);
  expect(roomReports(socket)).toEqual([{ type: 'report-room', reason: 'other' }]);
});

test('watching your own room from a second tab, you can\'t report it', async () => {
  await social.boot();
  const socket = await joining(1);
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan', hostSub: social.claims.sub });
  room.art = smallArt;
  expect(room.canReportRoom).toBe(false);
  expect(await room.reportRoom('spam')).toBe(false);
  expect(roomReports(socket)).toEqual([]);
});

test('the connection to the host failing while the report\'s picture is made sends nothing and leaves Report room there', async () => {
  const socket = await watching();
  room.art = smallArt;
  let made;
  vi.mocked(thumbnailOf).mockReturnValueOnce(new Promise((resolve) => { made = resolve; }));
  expect(room.canReportRoom).toBe(true);
  const reporting = room.reportRoom('spam');
  await vi.waitFor(() => expect(made).toBeTypeOf('function'));
  room.watchState('failed');
  made('AAAA');
  expect(await reporting).toBe(false);
  expect(roomReports(socket)).toEqual([]);
  expect(room.roomReported).toBe(false);
  expect(hasReportedRoom(ID)).toBe(false);
});

test('the host, a guest or an unconfirmed member can\'t reportRoom', async () => {
  const hostSocket = await goLive();
  expect(await room.reportRoom('spam')).toBe(false);   // the host
  expect(roomReports(hostSocket)).toEqual([]);
  room.leave();

  const socket = await joining(2);
  socket.receive({ type: 'joined', peer: 'p1', hostName: 'ansi-fan', hostSub: 'u_9' });
  room.art = smallArt;
  expect(await room.reportRoom('rude')).toBe(false);   // not a reason
  social.claims = { ...social.claims, guest: true, verified: false };
  expect(await room.reportRoom('spam')).toBe(false);   // a guest
  social.claims = { ...social.claims, guest: false, verified: false };
  expect(await room.reportRoom('spam')).toBe(false);   // unconfirmed
  social.claims = { ...social.claims, verified: true };
  room._connection.close();
  expect(await room.reportRoom('spam')).toBe(false);   // no socket: and not kept as reported
  expect(roomReports(socket)).toEqual([]);
  expect(room.reported).not.toContain('*room');
  expect(room.roomReported).toBe(false);
  expect(hasReportedRoom(ID)).toBe(false);
  expect(social.reportedRooms).toEqual([]);
});

test('A silence for your own sub gets a new pass that carries it', async () => {
  const socket = await goLive();
  expect(room.silencedUntil).toBe(null);
  server.silencedUntil = Date.now() + 3_600_000;
  const passes = server.sent('POST', '/api/pass').length;
  socket.receive({ type: 'silenced', sub: 'u_1', until: server.silencedUntil });
  await vi.waitFor(() => expect(server.sent('POST', '/api/pass')).toHaveLength(passes + 1));
  await vi.waitFor(() => expect(room.silencedUntil).toBe(server.silencedUntil));
});

test('A watcher silenced elsewhere (in another room, or by a moderator) is told in this room, and gets a new pass that carries it', async () => {
  const socket = await watching();
  expect(room.silencedUntil).toBe(null);
  server.silencedUntil = Date.now() + 3_600_000;
  const passes = server.sent('POST', '/api/pass').length;
  socket.receive({ type: 'silenced', sub: social.claims.sub, until: server.silencedUntil });
  await vi.waitFor(() => expect(server.sent('POST', '/api/pass')).toHaveLength(passes + 1));
  await vi.waitFor(() => expect(room.silencedUntil).toBe(server.silencedUntil));
});

test('A host keeps the silences it was told through a reconnect, and takes the ones sent again after hosting', async () => {
  const socket = await goLive();
  const host = room._host;
  socket.receive({ type: 'silenced', sub: 'u_p1', until: 5000 });
  socket.close();
  const again = await lastSocket(2);
  again.accept();
  await vi.waitFor(() => expect(again.sent[0]?.type).toBe('host'));
  again.receive({ type: 'hosting', room: info(), peers: [] });
  // Decided while the host was away: the server sends it again once the host is back.
  again.receive({ type: 'silenced', sub: 'u_p2', until: 6000 });
  expect(room._host).toBe(host);
  expect([...host.silences]).toEqual([['u_p1', 5000], ['u_p2', 6000]]);
});

test('A host drops a silence for a watcher\'s sub into its Host; anything malformed is ignored', async () => {
  const socket = await goLive();
  const silence = vi.spyOn(room._host, 'silence');
  socket.receive({ type: 'silenced', sub: 'u_p1', until: 5000 });
  socket.receive({ type: 'silenced', sub: 7, until: 5000 });
  socket.receive({ type: 'silenced', sub: 'u_p1', until: 'soon' });
  expect(silence.mock.calls).toEqual([['u_p1', 5000]]);
});

test('While your pass says you\'re silenced, say sends nothing', async () => {
  await goLive();
  expect(await room.say('hi')).toBe(true);
  social.claims = { ...social.claims, silencedUntil: Date.now() + 60_000 };
  expect(await room.say('again')).toBe(false);
  expect(room.chat.map((m) => m.text)).toEqual(['hi']);
  social.claims = { ...social.claims, silencedUntil: Date.now() - 1 };
  expect(await room.say('later')).toBe(true);
});

// A host's reload. The page goes: what its pagehide left stays, its socket closes without an end, and the
// stores are new (with the art back, unless art is false).
async function reload({ art = true } = {}) {
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  const record = sessionStorage.getItem(RECORD);
  const connection = room._connection;
  room._connection = null;
  connection?.close();
  room.close();
  sessionStorage.setItem(RECORD, record);
  ({ project } = await createTestApp());
  social = useSocialStore();
  room = useRoomStore();
  if (art) await openArt();
}

async function openArt() {
  await project.setImageFromFile(new File([gradient], 'gradient.png', { type: gradient.type }));
  Object.assign(project, { aspectLock: false, cols: 8, rows: 8 });
  project.render();
  await settle(project);
}

// The resumed room's socket (the test's second), greeted.
async function greeted() {
  const socket = await lastSocket(2);
  socket.accept();
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('host'));
  return socket;
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test('the record round-trips RoomStore', async () => {
  const socket = await goLive();
  await watcherOn(socket);
  await room.say('mine');
  await room.say('gone');
  room.deleteMessage(room.chat.at(-1).id);
  const pass = await passFor('u_p1', 'p1');
  room._host.post('chat', { pass, id: 'theirs', ts: 1000, text: 'theirs', sig: 's' });
  room.mute('u_p1', true);
  room._host.post('chat', { pass, id: 'hushed', ts: 2000, text: 'hushed', sig: 's' }, 'u_p1');
  room.pinLobby({ col: 1, row: 2 });
  room.peopleOpen = true;
  room.hasPassword = true;
  await expect.poll(() => room.session.liveSince).not.toBe(null);
  const fields = () => plain({
    role: room.role, id: room.id, link: room.link, room: room.room, hasPassword: room.hasPassword, session: room.session,
    lobbyPin: room.lobbyPin, peopleOpen: room.peopleOpen, muted: room.muted,
  });
  const before = fields();
  const chat = plain(room.chat).map((m) => (m.deleted ? { id: m.id, ts: m.ts, text: '', pass: null, sig: null, sub: null, name: null, host: false, mine: false, deleted: true } : m));
  expect(chat.map((m) => [m.text, !!m.mine, !!m.host, !!m.muted, !!m.deleted])).toEqual([
    ['', false, false, false, false],   // p1 joined
    ['mine', true, true, false, false],
    ['', false, false, false, true],
    ['theirs', false, false, false, false],
    ['hushed', false, false, true, false],
  ]);

  await reload();
  expect(socket.sent.map((m) => m.type)).not.toContain('end');
  room.resume();
  await lastSocket(2);
  expect(fields()).toEqual(before);
  expect(before.session.liveSince).toBeGreaterThan(0);
  expect(plain(room.chat)).toEqual(chat);
  expect(room._host.muted.has('u_p1')).toBe(true);
  expect(room._host.returning.has('u_p1')).toBe(true);
});

test('resume() sets role, id and status \'reconnecting\' synchronously', async () => {
  await goLive();
  await reload({ art: false });
  room.resume();
  expect([room.role, room.id, room.status]).toEqual(['host', ID, 'reconnecting']);
});

test.each([
  ['output', { viewTab: 'output', ansiZoom: 0.5, editZoom: 9, ansiViewOrigin: { col: 3, row: 40 }, ansiViewSize: { cols: 60, rows: 20 }, ansiViewZoom: 0.5, inputView: { col: 1, row: 2, cols: 5, rows: 6, zoom: 9 } }, { col: 3, row: 40 }],
  ['input', { viewTab: 'input', ansiZoom: 0.75, editZoom: 7, ansiViewOrigin: { col: 8, row: 9 }, ansiViewSize: { cols: 10, rows: 11 }, ansiViewZoom: 0.75, inputView: { col: 12, row: 13, cols: 14, rows: 15, zoom: 7 } }, { col: 12, row: 13 }],
])('the view round-trips, and sharedView is the host\'s on resume before any editor mounts (%s)', async (tab, view, at) => {
  await goLive();
  Object.assign(useWorkspaceStore(), view);
  const shared = plain(useWorkspaceStore().sharedView);
  await reload();
  expect(keptHostingRecord().view).toEqual(view);
  const workspace = useWorkspaceStore();
  room.resume();
  expect(plain(workspace.$state)).toMatchObject(view);
  expect(plain(workspace.sharedView)).toEqual(shared);
  expect(workspace.viewToRestore).toEqual({ tab, ...at });
  await lastSocket(2);
});

test('the view waits for the font to go to the Host, and goes once it\'s in', async () => {
  const workspace = useWorkspaceStore();
  Object.assign(workspace, { viewTab: 'input', displayFontLoaded: null, inputView: { col: 2, row: 1, cols: 6, rows: 3, zoom: 4 } });
  await goLive();
  expect(room._host.view).toBe(null);
  workspace.inputView = { col: 3, row: 1, cols: 6, rows: 3, zoom: 4 };
  await later();
  expect(room._host.view).toBe(null);
  expect(keptHostingRecord().view.inputView.col).toBe(2);   // what's kept doesn't wait: the next write has it

  workspace.displayFontLoaded = workspace.displayFontSpec;
  await expect.poll(() => room._host.view).toEqual(plain(workspace.sharedView));
  expect(room._host.view.col).toBe(3);
  await expect.poll(() => keptHostingRecord().view.inputView.col, { timeout: 3000 }).toBe(3);
});

test('a host going live with the font in sends the view at once', async () => {
  Object.assign(useWorkspaceStore(), { viewTab: 'output', ansiViewOrigin: { col: 3, row: 1 }, ansiViewSize: { cols: 10, rows: 5 } });
  await goLive();
  expect(room._host.view).toMatchObject({ col: 3, row: 1, cols: 10, rows: 5 });
});

test('closing a resumed room leaves no view to scroll the next art to', async () => {
  await goLive();
  Object.assign(useWorkspaceStore(), { viewTab: 'output', ansiViewOrigin: { col: 3, row: 40 } });
  await reload();
  room.resume();
  expect(useWorkspaceStore().viewToRestore).toEqual({ tab: 'output', col: 3, row: 40 });
  await lastSocket(2);
  room.close();
  expect(useWorkspaceStore().viewToRestore).toBe(null);
});

test('no art to come back to, or another account: no view to scroll the next art to', async () => {
  await goLive();
  Object.assign(useWorkspaceStore(), { viewTab: 'output', ansiViewOrigin: { col: 3, row: 40 } });
  await reload({ art: false });
  const record = sessionStorage.getItem(RECORD);
  room.resume();
  expect(useWorkspaceStore().viewToRestore).toEqual({ tab: 'output', col: 3, row: 40 });
  useWorkspaceStore().documentAnswered = true;
  await expect.poll(() => room.role).toBe(null);
  expect(useWorkspaceStore().viewToRestore).toBe(null);

  sessionStorage.setItem(RECORD, JSON.stringify({ ...JSON.parse(record), sub: 'someone-else' }));
  room.resume();
  expect(useWorkspaceStore().viewToRestore).toEqual({ tab: 'output', col: 3, row: 40 });
  await expect.poll(() => room.role).toBe(null);
  expect(useWorkspaceStore().viewToRestore).toBe(null);
});

test('another document while hosting leaves no view to scroll its art to; the one autosave brings back at load keeps it', async () => {
  await goLive();
  Object.assign(useWorkspaceStore(), { viewTab: 'output', ansiViewOrigin: { col: 3, row: 40 } });
  await reload({ art: false });
  room.resume();
  await social.boot();
  await expect.poll(() => social.claims?.sub).toBe('u_1');
  await openArt();   // restoring the art gives it an id: that's the same document
  await greeted();
  expect(useWorkspaceStore().viewToRestore).toEqual({ tab: 'output', col: 3, row: 40 });

  project.documentId = 'another-document';
  await later();
  expect(useWorkspaceStore().viewToRestore).toBe(null);
});

test('the view is kept as it changes, not only when the page goes', async () => {
  await goLive();
  useWorkspaceStore().ansiViewOrigin = { col: 2, row: 30 };
  await expect.poll(() => keptHostingRecord().view?.ansiViewOrigin, { timeout: 3000 }).toEqual({ col: 2, row: 30 });
});

test('a record kept without a view comes back at the view there is', async () => {
  await goLive();
  await reload();
  sessionStorage.setItem(RECORD, JSON.stringify({ ...JSON.parse(sessionStorage.getItem(RECORD)), view: null }));
  const { viewTab, ansiViewOrigin } = useWorkspaceStore();
  room.resume();
  expect(room.role).toBe('host');
  expect(useWorkspaceStore().viewToRestore).toBe(null);
  expect([useWorkspaceStore().viewTab, useWorkspaceStore().ansiViewOrigin]).toEqual([viewTab, ansiViewOrigin]);
  await lastSocket(2);
});

test('resume() with no record, or one that can\'t be read, changes nothing', async () => {
  const good = { sub: 'u_1', id: ID, link: 'l', room: {}, session: newSession(), muted: [], host: { log: [], only: [], removed: [], here: [] } };
  for (const bad of [null, 'not json', '{}', '"text"', JSON.stringify({ ...good, id: 'NOT A ROOM' }), JSON.stringify({ ...good, sub: undefined }), JSON.stringify({ ...good, room: null }),
    JSON.stringify({ ...good, session: null })]) {
    if (bad === null) sessionStorage.removeItem(RECORD);
    else sessionStorage.setItem(RECORD, bad);
    expect(() => room.resume()).not.toThrow();
    expect([room.role, room.id, room.status, room._host]).toEqual([null, null, null, null]);
  }
  await later();
  expect(sockets).toHaveLength(0);
});

test('a record whose restore throws is forgotten, with nothing half set', async () => {
  const good = { sub: 'u_1', id: ID, link: 'l', room: {}, session: newSession(), muted: [], host: { log: [], only: [], removed: [], here: [] } };
  const view = { viewTab: 'output', ansiZoom: 0.5, editZoom: 9, ansiViewOrigin: { col: 3, row: 40 }, ansiViewSize: { cols: 60, rows: 20 }, ansiViewZoom: 0.5, inputView: { col: 1, row: 2, cols: 5, rows: 6, zoom: 9 } };
  const workspace = () => { const { ansiZoom, editZoom, ansiViewOrigin, viewToRestore } = useWorkspaceStore(); return plain({ ansiZoom, editZoom, ansiViewOrigin, viewToRestore }); };
  const before = workspace();
  for (const fields of [{ host: undefined }, { host: { ...good.host, only: [1] } }, { view: {} }, { host: { ...good.host, only: [1] }, view }]) {
    sessionStorage.setItem(RECORD, JSON.stringify({ ...good, ...fields }));
    expect(() => room.resume()).not.toThrow();
    expect(workspace()).toEqual(before);
    expect([room.role, room.id, room.status, room.link, room._host, room._settings, room._resuming]).toEqual([null, null, null, null, null, null, false]);
    expect(sessionStorage.getItem(RECORD)).toBe(null);
  }
  expect(sockets).toHaveLength(0);
});

test('comeBack failing says ROOM_AWAY_WORDS, keeps its warning, and drops the record', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await goLive();
  await reload();
  const record = JSON.parse(sessionStorage.getItem(RECORD));
  sessionStorage.setItem(RECORD, JSON.stringify({ ...record, host: { ...record.host, log: [{ id: 'bad', ts: 1, text: 'x', pass: 'not a pass', sig: 's' }] } }));
  room.resume();
  await expect.poll(() => room.role).toBe(null);
  expect(social.notice).toBe(ROOM_AWAY_WORDS);
  expect(sessionStorage.getItem(RECORD)).toBe(null);
  expect(warn).toHaveBeenCalledWith('The room couldn\'t come back.', expect.anything());
  expect(sockets).toHaveLength(1);
});

test('resume() greets with host once the account is known and the document is there', async () => {
  await goLive();
  await reload({ art: false });
  room.resume();
  await social.boot();
  await expect.poll(() => social.claims?.sub).toBe('u_1');
  await wait(50);
  expect(sockets).toHaveLength(1);
  await openArt();
  await greeted();
});

test('a restored host\'s hosting keeps liveSince and sends the art to the returning watcher', async () => {
  const socket = await goLive();
  const log = await watcherOn(socket);
  await expect.poll(() => room.session.liveSince).not.toBe(null);
  const since = room.session.liveSince;
  await reload();
  await expect.poll(() => log.states.at(-1), PATIENT).toBe('lost');
  room.resume();
  const again = await greeted();
  relay(again, 'p1', log.watch);
  const arts = log.arts.length;
  again.receive({ type: 'hosting', room: info({ count: 1 }), peers: [{ peer: 'p1', pass: await passFor('u_p1', 'p1') }] });
  expect(room.status).toBe('live');
  await expect.poll(() => log.arts.length, PATIENT).toBeGreaterThan(arts);
  expect(room.session.liveSince).toBe(since);
  expect(room.chat.filter((m) => m.presence === 'joined')).toHaveLength(1);
});

test.each([
  ['a different account', () => { server.session = member({ id: 'u_2', username: 'someone-else' }); }],
  ['signed out', () => { server.session = null; }],
])('%s drops the record and stays quiet', async (_, away) => {
  await goLive();
  await reload();
  away();
  room.resume();
  await expect.poll(() => room.role).toBe(null);
  await wait(50);
  expect(sockets).toHaveLength(1);
  expect(social.notice).toBe(null);
  expect(toastMessage.value).toBe(null);
  expect(sessionStorage.getItem(RECORD)).toBe(null);
});

test('a host\'s socket closed as replaced: role null, record gone, HOST_REPLACED_WORDS, no end sent', async () => {
  const socket = await goLive();
  expect(HOST_REPLACED_WORDS).toBe('This room is open in another tab');
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  expect(sessionStorage.getItem(RECORD)).not.toBe(null);
  socket.serverClose('replaced');
  expect(room.role).toBe(null);
  expect(social.notice).toBe(HOST_REPLACED_WORDS);
  expect(sessionStorage.getItem(RECORD)).toBe(null);
  expect(socket.sent.map((m) => m.type)).not.toContain('end');
  await wait(1200);   // past the first retry
  expect(sockets).toHaveLength(1);
});

test('refused unavailable on resume drops the record, says ROOM_AWAY_WORDS, and the art stays', async () => {
  await goLive();
  await reload();
  const { image } = project;
  room.resume();
  const again = await greeted();
  again.receive({ type: 'refused', reason: 'unavailable' });
  expect(room.role).toBe(null);
  expect(ROOM_AWAY_WORDS).toBe('Your room ended while the page was away');
  expect(social.notice).toBe(ROOM_AWAY_WORDS);
  expect(sessionStorage.getItem(RECORD)).toBe(null);
  expect(project.image).toBe(image);
  expect(again.sent.map((m) => m.type)).not.toContain('end');
});

test('ended before the first hosting says ROOM_AWAY_WORDS', async () => {
  await goLive();
  await reload();
  room.resume();
  (await greeted()).receive({ type: 'ended' });
  expect(room.role).toBe(null);
  expect(social.notice).toBe(ROOM_AWAY_WORDS);
  expect(sessionStorage.getItem(RECORD)).toBe(null);
});

test('ended after a resumed room\'s first hosting, as today, says nothing', async () => {
  await goLive();
  await reload();
  room.resume();
  const again = await greeted();
  again.receive({ type: 'hosting', room: info(), peers: [] });
  again.receive({ type: 'ended' });
  expect(room.role).toBe(null);
  expect(social.notice).toBe(null);
  expect(sessionStorage.getItem(RECORD)).toBe(null);
});

test('no document once autosave has answered drops the record and says ROOM_AWAY_WORDS', async () => {
  await goLive();
  await reload({ art: false });
  room.resume();
  await social.boot();
  await expect.poll(() => social.claims?.sub).toBe('u_1');
  useWorkspaceStore().documentAnswered = true;
  await expect.poll(() => room.role).toBe(null);
  expect(social.notice).toBe(ROOM_AWAY_WORDS);
  expect(sessionStorage.getItem(RECORD)).toBe(null);
  expect(sockets).toHaveLength(1);
});

test('a document that never gets answered is the room gone, once those who were here have stopped waiting', async () => {
  await goLive();
  await reload({ art: false });
  await social.boot();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  room.resume();
  await vi.waitFor(() => expect(social.claims?.sub).toBe('u_1'));
  await vi.advanceTimersByTimeAsync(RETURN_WITHIN_MS - 5000);
  expect([room.role, social.notice]).toEqual(['host', null]);
  await vi.advanceTimersByTimeAsync(6000);
  expect(room.role).toBe(null);
  expect(social.notice).toBe(ROOM_AWAY_WORDS);
  expect(sessionStorage.getItem(RECORD)).toBe(null);
  expect(sockets).toHaveLength(1);
});

test('a slow restore isn\'t a dead room: settled with no answer yet waits, and the art arriving connects', async () => {
  await goLive();
  await reload({ art: false });
  room.resume();
  await social.boot();
  await expect.poll(() => social.claims?.sub).toBe('u_1');
  useWorkspaceStore().documentSettled = true;
  await wait(50);
  expect([room.role, social.notice, sockets.length]).toEqual(['host', null, 1]);
  expect(sessionStorage.getItem(RECORD)).not.toBe(null);
  await openArt();
  await greeted();
});

test('End room during the wait for the art leaves it ended: no socket, no record', async () => {
  await goLive();
  await reload({ art: false });
  room.resume();
  await social.boot();
  await expect.poll(() => social.claims?.sub).toBe('u_1');
  room.endRoom();
  expect(sessionStorage.getItem(RECORD)).toBe(null);
  await openArt();
  await wait(50);
  expect(room.role).toBe(null);
  expect(sockets).toHaveLength(1);
  expect(sessionStorage.getItem(RECORD)).toBe(null);
});

test('a pass that can\'t be had yet isn\'t someone else: it\'s asked for again, and the room comes back', async () => {
  await goLive();
  await reload();
  const me = server.routeOf('GET /api/me'), pass = server.routeOf('POST /api/pass');
  server.route('GET /api/me', () => [503, { code: 'NETWORK' }]);
  server.route('POST /api/pass', () => {
    server.route('POST /api/pass', pass);
    server.route('GET /api/me', me);
    return [429, { code: 'THROTTLED' }];
  });
  const asked = server.sent('POST', '/api/pass').length;
  room.resume();
  await expect.poll(() => server.sent('POST', '/api/pass').length).toBe(asked + 1);
  await later();
  expect([room.role, room.status, social.claims]).toEqual(['host', 'reconnecting', null]);
  expect(social.me).toBe(null);
  await vi.waitFor(() => expect(sockets).toHaveLength(2), { timeout: 5000 });   // about 3 s on
  const again = sockets[1];
  expect(social.me?.id).toBe('u_1');
  expect(social.notice).toBe(null);
  expect(keptHostingRecord().id).toBe(ID);
  again.accept();
  await vi.waitFor(() => expect(again.sent[0]?.type).toBe('host'));
});

test('a pass that still can\'t be had once those who were here have stopped waiting says ROOM_AWAY_WORDS', async () => {
  await goLive();
  await reload();
  server.route('POST /api/pass', () => [429, { code: 'THROTTLED' }]);
  const asked = server.sent('POST', '/api/pass').length;
  room.resume();
  await expect.poll(() => server.sent('POST', '/api/pass').length).toBe(asked + 1);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + RETURN_WITHIN_MS);
  await vi.waitFor(() => expect(room.role).toBe(null), { timeout: 5000 });
  expect(social.notice).toBe(ROOM_AWAY_WORDS);
  expect(sessionStorage.getItem(RECORD)).toBe(null);
  expect(sockets).toHaveLength(1);
});

test('a throttled refusal on resume opens the same connection again, and keeps the record', async () => {
  await goLive();
  await reload();
  room.resume();
  const again = await greeted();
  again.receive({ type: 'refused', reason: 'throttled' });
  expect([room.role, social.notice]).toEqual(['host', null]);
  expect(keptHostingRecord().id).toBe(ID);
  const third = await vi.waitFor(() => {
    expect(sockets).toHaveLength(3);
    return sockets[2];
  }, { timeout: 5000 });
  third.accept();
  await vi.waitFor(() => expect(third.sent[0]?.type).toBe('host'));
  third.receive({ type: 'hosting', room: info(), peers: [] });
  expect(room.status).toBe('live');
});

test('a pass that can\'t be had is asked for again after 3 s, 6 s, 12 s, and gives up when those who were here have stopped waiting', async () => {
  await goLive();
  await reload();
  server.route('POST /api/pass', () => [429, { code: 'THROTTLED' }]);
  await social.boot();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const asked = () => server.sent('POST', '/api/pass').length;
  const before = asked();
  room.resume();
  await vi.waitFor(() => expect(asked()).toBeGreaterThan(before));
  const first = asked();
  for (const [wait, then] of [[2500, 0], [1000, 1], [5000, 1], [1000, 2], [11_000, 2], [1000, 3]]) {   // asked at about 3 s, 9 s and 21 s
    await vi.advanceTimersByTimeAsync(wait);
    expect(asked()).toBe(first + then);
  }
  await vi.advanceTimersByTimeAsync(RETURN_WITHIN_MS);
  expect(room.role).toBe(null);
  expect(social.notice).toBe(ROOM_AWAY_WORDS);
  expect(sessionStorage.getItem(RECORD)).toBe(null);
});

test('throttled refusals on resume are tried again after 3 s, 6 s, 12 s, and the room is given up when those who were here have stopped waiting', async () => {
  await goLive();
  await reload();
  room.resume();
  await greeted();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  for (const [step, count] of [[3000, 3], [6000, 4], [12_000, 5]]) {
    sockets.at(-1).receive({ type: 'refused', reason: 'throttled' });
    await vi.advanceTimersByTimeAsync(step - 100);
    expect(sockets).toHaveLength(count - 1);
    await vi.advanceTimersByTimeAsync(200);
    expect(sockets).toHaveLength(count);
  }
  sockets.at(-1).receive({ type: 'refused', reason: 'throttled' });   // 24 s next, but 21 s are gone and 39 s left
  await vi.advanceTimersByTimeAsync(23_900);
  expect(sockets).toHaveLength(5);
  await vi.advanceTimersByTimeAsync(200);
  expect(sockets).toHaveLength(6);
  sockets.at(-1).receive({ type: 'refused', reason: 'throttled' });   // 48 s next, but about 15 s are left
  await vi.advanceTimersByTimeAsync(10_000);
  expect(sockets).toHaveLength(6);
  await vi.advanceTimersByTimeAsync(6000);
  expect(sockets).toHaveLength(7);
  sockets.at(-1).receive({ type: 'refused', reason: 'throttled' });   // and none left
  expect(room.role).toBe(null);
  expect(social.notice).toBe(ROOM_AWAY_WORDS);
  expect(sessionStorage.getItem(RECORD)).toBe(null);
});

test('a throttled refusal outside a resume stays the end of it', async () => {
  const socket = await goLive();
  socket.close();
  const again = await lastSocket(2);
  again.accept();
  await vi.waitFor(() => expect(again.sent[0]?.type).toBe('host'));
  again.receive({ type: 'refused', reason: 'throttled' });
  expect(room.role).toBe(null);
  expect(social.notice).toBe(refusalWords('throttled'));
});

test('a failed resume toasts when the tab isn\'t SOCIAL', async () => {
  await goLive();
  await reload();
  useWorkspaceStore().editorTab = 'output';
  room.resume();
  (await greeted()).receive({ type: 'refused', reason: 'unavailable' });
  expect(toastMessage.value).toBe(ROOM_AWAY_WORDS);
});

test('a failed resume on the SOCIAL tab doesn\'t toast: the notice is in view', async () => {
  await goLive();
  await reload();
  useWorkspaceStore().editorTab = 'social';
  room.resume();
  (await greeted()).receive({ type: 'refused', reason: 'unavailable' });
  expect(social.notice).toBe(ROOM_AWAY_WORDS);
  expect(toastMessage.value).toBe(null);
});

test('End room, signing out and starting another room forget the record', async () => {
  await goLive();
  expect(keptHostingRecord().id).toBe(ID);
  room.pinLobby({ col: 1, row: 2 });   // a write on its way doesn't bring it back
  room.endRoom();
  expect(sessionStorage.getItem(RECORD)).toBe(null);
  await wait(1100);
  expect(sessionStorage.getItem(RECORD)).toBe(null);

  await startPublic();
  expect(keptHostingRecord().id).toBe(ID);
  await lastSocket(2);
  expect(await social.signOut()).toBe(true);
  expect(sessionStorage.getItem(RECORD)).toBe(null);

  server.session = member();
  await social.refreshMe();
  await startPublic();
  await vi.waitFor(() => expect(keptHostingRecord()?.id).toBe(ID));
  await room.say('old');
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  server.route('POST /api/rooms', () => [200, { id: 'zyxwvutsrq', link: 'http://localhost/?room=zyxwvutsrq' }]);
  await startPublic();
  expect(keptHostingRecord()).toMatchObject({ id: 'zyxwvutsrq', host: { log: [] } });
});

test('the record follows the room about once a second, with no pagehide', async () => {
  await goLive();
  await room.say('kept');
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  for (const col of [1, 2, 3, 4, 5]) {
    room.pinLobby({ col, row: 0 });
    await later();
  }
  await expect.poll(() => keptHostingRecord().lobbyPin, { timeout: 2000 }).toEqual({ col: 5, row: 0 });
  expect(keptHostingRecord().host.log).toHaveLength(1);
  expect(setItem.mock.calls.filter(([key]) => key === RECORD).length).toBeLessThanOrEqual(2);
});

test('a write that won\'t fit leaves the last good record', async () => {
  await goLive();
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  const good = sessionStorage.getItem(RECORD);
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  room.pinLobby({ col: 1, row: 2 });
  expect(() => window.dispatchEvent(new PageTransitionEvent('pagehide'))).not.toThrow();
  expect(setItem).toHaveBeenCalled();
  expect(sessionStorage.getItem(RECORD)).toBe(good);
  expect(keepHostingRecord({})).toBe(false);
});

// A room's two sides in one page: a Host and its Watches, real WebRTC (no STUN), a small relay standing
// in for the server's socket, and passes signed by a test key. RTCDataChannel's send is watched, so the
// tests can count what the host sends; the watchers here send only 'tracking' (chat is social-chat.test.js).
import { test, expect, afterEach, vi } from 'vitest';
import { Host, KEPT_THROUGH_RELOAD } from '@/social/hosting';
import { Watch } from '@/social/watching';
import { openPeer } from '@/social/peer';
import { newId } from '@/social/chat';
import { packSnapshot, CHUNK_BYTES, MOST_SNAPSHOT_BYTES, MOST_SNAPSHOT_CHUNKS } from '@/social/wire';
import { toBase64url } from '@/social/base64url';
import { hex2rgb } from '@/lib/ColorUtils';

const config = { iceServers: [] };
const later = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PATIENT = { timeout: 5000 };   // connecting and packing a snapshot take longer on a busy machine

const toClose = [];
afterEach(() => {
  for (const side of toClose.splice(0)) side.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const keyB64 = toBase64url(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)));
async function passFor(sub, name, guest = false) {
  const claims = { sub, name, guest, verified: !guest, key: 'k', exp: Date.now() / 1000 + 3600 };
  const body = toBase64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(body)));
  return `${body}.${toBase64url(signature)}`;
}

const color = (hex) => ({ ...hex2rgb(hex), hex });
const COLS = 8, LINES = 4;
const art = (chars = 'abcdefgh'.repeat(LINES)) => ({
  cols: COLS, lines: LINES, font: { id: 'vga', size: 20 },
  cells: [...chars].map((char, i) => ({ char, fg: color(i % 2 ? '#ffffff' : '#aa0000'), bg: color('#000000') })),
});
const changed = (from, indexes, char = '#') => {
  const cells = from.cells.slice();
  for (const i of indexes) cells[i] = { ...cells[i], char };
  return { ...from, cells };
};

// What the host sent over its channels, as parsed text messages (the chunks are left out).
function watchSends() {
  const send = vi.spyOn(RTCDataChannel.prototype, 'send');
  const sent = () => send.mock.calls.flatMap(([data], i) => (typeof data === 'string'
    ? [{ ...JSON.parse(data), channel: send.mock.contexts[i] }] : [])).filter((m) => m.t !== 'tracking');
  const chunks = () => send.mock.calls.flatMap(([data]) => (typeof data === 'string' ? [] : [data]));
  return { sent, chunks, clear: () => send.mockClear() };
}

// A host and its watchers joined through the relay. `room.toHost` are the host's messages to the server
// other than signals; `room.offers[peer]` counts the offers that went to each watcher; signals for a
// peer in `room.lost` go nowhere (the host's socket is down).
async function room(peers = ['p1', 'p2'], { lost = [], first = art(), restore, returnWithinMs } = {}) {
  const r = { toHost: [], offers: {}, watchers: [], log: {}, lost: new Set(lost) };
  r.host = new Host({
    config, passKey: async () => keyB64,
    send: async (msg) => {
      if (msg.type !== 'signal-to') return r.toHost.push(msg);
      if (r.lost.has(msg.to)) return;
      if (msg.data.sdp?.type === 'offer') r.offers[msg.to] = (r.offers[msg.to] ?? 0) + 1;
      await later();
      r.log[msg.to]?.watch.signalFrom('host', msg.data);
    },
    onWatchers: (list) => r.watchers.push(list),
    returnWithinMs,
  });
  toClose.push(r.host);
  if (restore) r.host.restore(restore);
  for (const peer of peers) r.log[peer] = watcher(r, peer);
  r.host.setRoom({ name: 'Night shift', welcome: 'Hi' });
  r.host.setArt(first);
  r.host.setView({ col: 1, row: 2, cols: 3, rows: 4 });
  for (const peer of peers) await r.host.peer(peer, await passFor(`u_${peer}`, peer));
  return r;
}
function watcher(r, peer) {
  const log = { rooms: [], arts: [], views: [], states: [] };
  log.watch = new Watch({
    config,
    send: async (msg) => { await later(); r.host.signalFrom(peer, msg.data); },
    onRoom: (room) => log.rooms.push(room),
    onArt: (a) => log.arts.push(a),
    onView: (view) => log.views.push(view),
    onState: (state) => log.states.push(state),
  });
  toClose.push(log.watch);
  return log;
}
const lastArt = (log) => log.arts.at(-1);
const lastList = (r) => r.watchers.at(-1) ?? [];

test('each watcher gets the room, the latest messages, then art deep-equal to the host\'s, then the view', async () => {
  const sends = watchSends();
  const r = await room();
  for (const peer of ['p1', 'p2']) {
    const log = r.log[peer];
    await expect.poll(() => log.views.length, PATIENT).toBe(1);
    expect(log.states).toEqual(['connecting', 'live']);
    expect(log.rooms).toEqual([{ name: 'Night shift', welcome: 'Hi' }]);
    expect(log.arts).toEqual([art()]);
    expect(log.views).toEqual([{ col: 1, row: 2, cols: 3, rows: 4, zoom: 1 }]);
  }
  for (const channel of new Set(sends.sent().map((m) => m.channel))) {
    expect(sends.sent().filter((m) => m.channel === channel && m.t !== 'presence').map((m) => m.t)).toEqual(['room', 'history', 'artists', 'snapshot', 'view']);   // who came goes as they come
  }
  expect(lastList(r)).toEqual([
    { peer: 'p1', sub: 'u_p1', name: 'p1', guest: false, tracking: true, connected: true },
    { peer: 'p2', sub: 'u_p2', name: 'p2', guest: false, tracking: true, connected: true },
  ]);
});

test('one changed cell goes as one cells message per watcher; half the grid changed goes as a snapshot', async () => {
  const sends = watchSends();
  const r = await room();
  for (const peer of ['p1', 'p2']) await expect.poll(() => r.log[peer].arts.length, PATIENT).toBe(1);
  sends.clear();

  const one = changed(art(), [5]);
  r.host.setArt(one);
  for (const peer of ['p1', 'p2']) await expect.poll(() => lastArt(r.log[peer]), PATIENT).toEqual(one);
  expect(sends.sent().map((m) => m.t)).toEqual(['cells', 'cells']);
  expect(sends.sent()[0].at).toEqual([5]);
  expect(sends.sent()[0].channel).not.toBe(sends.sent()[1].channel);

  sends.clear();
  r.host.setArt({ ...one, cells: one.cells.slice() });   // nothing changed: nothing goes
  await wait(100);
  expect(sends.sent()).toEqual([]);
  const half = changed(one, Array.from({ length: COLS * LINES / 2 }, (_, i) => i), '%');
  r.host.setArt(half);
  for (const peer of ['p1', 'p2']) await expect.poll(() => lastArt(r.log[peer]), PATIENT).toEqual(half);
  expect(sends.sent().map((m) => m.t)).toEqual(['snapshot', 'snapshot']);
  const [first, second] = sends.chunks();   // one packed snapshot for both
  expect(sends.chunks().length).toBe(2);
  expect(first).toBe(second);
});

// Chromium's channel takes a message of 256 KB at most, and throws for a bigger one.
test('a change too big for one message (under a quarter of the grid, over 256 KB as cells) goes as a snapshot', async () => {
  const sends = watchSends();
  const blank = {
    cols: 300, lines: 200, font: { id: 'vga', size: 20 },
    cells: Array.from({ length: 300 * 200 }, () => ({ char: ' ', fg: color('#ffffff'), bg: color('#000000') })),
  };
  const r = await room(['p1', 'p2'], { first: blank });
  for (const peer of ['p1', 'p2']) await expect.poll(() => r.log[peer].arts.length, PATIENT).toBe(1);
  sends.clear();

  const cells = blank.cells.slice();
  for (let i = 0; i < 14_000; i++) cells[i] = { char: '#', fg: color(`#${i.toString(16).padStart(6, '0')}`), bg: color('#000000') };
  const next = { ...blank, cells };
  r.host.setArt(next);
  for (const peer of ['p1', 'p2']) await expect.poll(() => lastArt(r.log[peer]), PATIENT).toEqual(next);
  expect(sends.sent().map((m) => m.t)).toEqual(['snapshot', 'snapshot']);
  expect(sends.chunks().every((chunk) => chunk.byteLength <= CHUNK_BYTES)).toBe(true);
});

test('a channel that refuses a send closes that watcher\'s connection only, and the server hears it left', async () => {
  const r = await room();
  for (const peer of ['p1', 'p2']) await expect.poll(() => r.log[peer].arts.length, PATIENT).toBe(1);
  const send = RTCDataChannel.prototype.send;
  let refusing = null;
  vi.spyOn(RTCDataChannel.prototype, 'send').mockImplementation(function (data) {
    refusing ??= this;   // p1's, the first sent to
    if (this === refusing) throw new TypeError('Too big');
    return send.call(this, data);
  });
  const one = changed(art(), [5]);
  r.host.setArt(one);
  await expect.poll(() => lastArt(r.log.p2), PATIENT).toEqual(one);
  await expect.poll(() => r.log.p1.states.at(-1), PATIENT).toBe('lost');
  expect(r.toHost).toEqual([{ type: 'left', peer: 'p1' }]);
  expect(lastList(r).map((w) => w.peer)).toEqual(['p2']);
});

test('a connection that can\'t be made (openPeer throws) gets left sent for it, and no watcher stays', async () => {
  const r = await room([]);
  vi.stubGlobal('RTCPeerConnection', class { constructor() { throw new Error('Too many connections'); } });
  await r.host.peer('p1', await passFor('u_p1', 'p1'));
  expect(r.toHost).toEqual([{ type: 'left', peer: 'p1' }]);
  expect(r.host.watchers.size).toBe(0);
  expect(r.watchers.flat().some((w) => w.peer === 'p1')).toBe(false);
});

test('goingAway reaches an open watcher, which goes to lost and then takes a new offer live', async () => {
  const r = await room(['p1']);
  await expect.poll(() => r.log.p1.views.length, PATIENT).toBe(1);
  r.host.goingAway();
  await expect.poll(() => r.log.p1.states, PATIENT).toEqual(['connecting', 'live', 'lost']);

  await r.host.peer('p1', await passFor('u_p1', 'p1'));
  await expect.poll(() => r.log.p1.states, PATIENT).toEqual(['connecting', 'live', 'lost', 'connecting', 'live']);
  await expect.poll(() => r.log.p1.views.length, PATIENT).toBe(2);
});

test('a view reaches the watchers, and the same view again sends nothing', async () => {
  const sends = watchSends();
  const r = await room();
  for (const peer of ['p1', 'p2']) await expect.poll(() => r.log[peer].views.length, PATIENT).toBe(1);
  sends.clear();
  r.host.setView({ col: 1, row: 2, cols: 3, rows: 4 });
  r.host.setView({ col: 0, row: 1, cols: 8, rows: 2 });
  r.host.setView({ col: 0, row: 1, cols: 8, rows: 2 });
  for (const peer of ['p1', 'p2']) await expect.poll(() => r.log[peer].views.at(-1), PATIENT).toEqual({ col: 0, row: 1, cols: 8, rows: 2, zoom: 1 });
  await wait(100);
  expect(sends.sent().map((m) => m.t)).toEqual(['view', 'view']);
  expect(r.log.p1.views.length).toBe(2);
});

test('a view carries its zoom; the same view at another zoom is sent', async () => {
  const r = await room(['p1']);
  await expect.poll(() => r.log.p1.views.length, PATIENT).toBe(1);
  r.host.setView({ col: 1, row: 2, cols: 3, rows: 4, zoom: 0.5 });
  await expect.poll(() => r.log.p1.views.at(-1), PATIENT).toEqual({ col: 1, row: 2, cols: 3, rows: 4, zoom: 0.5 });
  r.host.setView({ col: 1, row: 2, cols: 3, rows: 4, zoom: 0.5 });
  r.host.setView({ col: 1, row: 2, cols: 3, rows: 4, zoom: 0.25 });
  await expect.poll(() => r.log.p1.views.at(-1), PATIENT).toEqual({ col: 1, row: 2, cols: 3, rows: 4, zoom: 0.25 });
  expect(r.log.p1.views.length).toBe(3);
});

test('a watcher takes a zoom in (0, 1], and 1 or 0.25 for anything else', async () => {
  const { log, json } = await hostileHost();
  const zooms = [undefined, 'x', 0, -1, 2, 0.1, 0.5];
  for (const [i, zoom] of zooms.entries()) json({ t: 'view', col: i, row: 0, cols: 8, rows: 2, zoom });
  await expect.poll(() => log.views.length, PATIENT).toBe(zooms.length);
  expect(log.views.map((v) => v.zoom)).toEqual([1, 1, 1, 1, 1, 0.25, 0.5]);
});

test('a watcher that stops tracking shows tracking: false', async () => {
  const r = await room();
  await expect.poll(() => r.log.p2.states.at(-1), PATIENT).toBe('live');
  r.log.p2.watch.setTracking(false);
  await expect.poll(() => lastList(r).find((w) => w.peer === 'p2')?.tracking, PATIENT).toBe(false);
  expect(lastList(r).find((w) => w.peer === 'p1').tracking).toBe(true);
});

test('a tampered pass, or no pass key, gets left sent for it and no connection', async () => {
  const r = await room(['p1']);
  const [body, signature] = (await passFor('u_p3', 'p3')).split('.');
  const forged = toBase64url(new TextEncoder().encode(JSON.stringify({ sub: 'u_x', name: 'x', guest: false, exp: Date.now() / 1000 + 60 })));
  await r.host.peer('p3', `${forged}.${signature}`);
  expect(r.toHost).toEqual([{ type: 'left', peer: 'p3' }]);
  expect(r.offers.p3).toBeUndefined();
  expect(r.watchers.flat().some((w) => w.peer === 'p3')).toBe(false);

  const keyless = new Host({ config, passKey: async () => { throw new Error('No pass key'); }, send: (msg) => r.toHost.push(msg) });
  toClose.push(keyless);
  await keyless.peer('p4', `${body}.${signature}`);
  expect(r.toHost).toEqual([{ type: 'left', peer: 'p3' }, { type: 'left', peer: 'p4' }]);
});

test('peerGone closes that watcher\'s connection, and its state becomes lost', async () => {
  const r = await room();
  await expect.poll(() => r.log.p1.states.at(-1), PATIENT).toBe('live');
  r.host.peerGone('p1');
  await expect.poll(() => r.log.p1.states.at(-1), PATIENT).toBe('lost');
  expect(lastList(r).map((w) => w.peer)).toEqual(['p2']);
});

// Review focus 1: the host's socket came back and the server lists who's inside.
test('hosting with the same watchers keeps their connections; one not listed is closed, one new is met', async () => {
  const sends = watchSends();
  const r = await room();
  for (const peer of ['p1', 'p2']) await expect.poll(() => r.log[peer].arts.length, PATIENT).toBe(1);
  const passes = { p1: await passFor('u_p1', 'p1'), p2: await passFor('u_p2', 'p2') };
  sends.clear();

  await r.host.hosting([{ peer: 'p1', pass: passes.p1 }, { peer: 'p2', pass: passes.p2 }]);
  await wait(200);
  expect(r.offers).toEqual({ p1: 1, p2: 1 });
  expect(sends.sent()).toEqual([]);
  expect(r.log.p1.states).toEqual(['connecting', 'live']);

  r.log.p3 = watcher(r, 'p3');
  await r.host.hosting([{ peer: 'p1', pass: passes.p1 }, { peer: 'p3', pass: await passFor('u_p3', 'p3') }]);
  await expect.poll(() => r.log.p2.states.at(-1), PATIENT).toBe('lost');
  await expect.poll(() => lastArt(r.log.p3), PATIENT).toEqual(art());
  expect(r.log.p1.states).toEqual(['connecting', 'live']);
  expect(lastList(r).map((w) => w.peer)).toEqual(['p1', 'p3']);
});

// Review focus 1: a watcher whose offer or answer was lost while the host's socket was down is met again.
test('hosting meets again a listed watcher whose connection is still being made', async () => {
  const r = await room(['p1', 'p2'], { lost: ['p2'] });
  await expect.poll(() => r.log.p1.arts.length, PATIENT).toBe(1);
  expect(r.log.p2.states).toEqual([]);
  r.lost.clear();
  await r.host.hosting([{ peer: 'p1', pass: await passFor('u_p1', 'p1') }, { peer: 'p2', pass: await passFor('u_p2', 'p2') }]);
  await expect.poll(() => lastArt(r.log.p2), PATIENT).toEqual(art());
  expect(r.offers).toEqual({ p1: 1, p2: 1 });
  expect(r.log.p1.states).toEqual(['connecting', 'live']);
  expect(r.toHost).toEqual([]);   // the first try at p2 closed quietly
});

// The host's socket was reconnecting when it removed a watcher: the server never heard, and lists it again.
test('a removed watcher is not met again when the server lists it, and remove goes again', async () => {
  const r = await room(['p1']);
  await expect.poll(() => r.log.p1.states.at(-1), PATIENT).toBe('live');
  const pass = await passFor('u_p1', 'p1');
  r.host.remove('p1');
  r.toHost.length = 0;
  await r.host.hosting([{ peer: 'p1', pass }]);
  await r.host.peer('p1', pass);
  expect(r.toHost).toEqual([{ type: 'remove', peer: 'p1' }]);
  expect(r.offers).toEqual({ p1: 1 });
  expect(lastList(r)).toEqual([]);
});

test('a snapshot that fails to pack is no unhandled rejection, and the next art still goes', async () => {
  const rejections = [];
  const note = (e) => { rejections.push(e.reason); e.preventDefault(); };
  window.addEventListener('unhandledrejection', note);
  try {
    const broken = changed(art(), []);
    broken.cells[0] = { ...broken.cells[0], char: 1n };   // JSON can't take it
    const r = await room(['p1'], { first: broken });
    await expect.poll(() => r.log.p1.states.at(-1), PATIENT).toBe('live');
    await wait(200);
    expect(r.log.p1.arts).toEqual([]);
    r.host.setArt(art());
    await expect.poll(() => lastArt(r.log.p1), PATIENT).toEqual(art());
  } finally {
    window.removeEventListener('unhandledrejection', note);
  }
  expect(rejections).toEqual([]);
});

// Review focus 2: a watcher that can't keep up isn't sent more until it drains, then gets one snapshot.
test('a channel over 8 MB buffered is skipped, and at bufferedamountlow gets one fresh snapshot', async () => {
  const sends = watchSends();
  const r = await room(['p1']);
  await expect.poll(() => r.log.p1.arts.length, PATIENT).toBe(1);
  const backedUp = new Set();
  const buffered = vi.spyOn(RTCDataChannel.prototype, 'bufferedAmount', 'get').mockImplementation(function () {
    backedUp.add(this);
    return 9 * 1024 * 1024;
  });
  sends.clear();
  r.host.setArt(changed(art(), [1]));
  const latest = changed(art(), [1, 2], '!');
  r.host.setArt(latest);
  await wait(200);
  expect(sends.sent()).toEqual([]);
  expect(r.log.p1.arts.length).toBe(1);

  buffered.mockRestore();
  expect(backedUp.size).toBe(1);
  for (const channel of backedUp) channel.dispatchEvent(new Event('bufferedamountlow'));
  await expect.poll(() => lastArt(r.log.p1), PATIENT).toEqual(latest);
  expect(sends.sent().map((m) => m.t)).toEqual(['snapshot']);
  expect(r.log.p1.arts.length).toBe(2);
});

test('a watcher\'s message that isn\'t one it sends, or is over 2 KB, is ignored', async () => {
  const r = await room(['p1']);
  await expect.poll(() => r.log.p1.states.at(-1), PATIENT).toBe('live');
  const send = vi.spyOn(RTCDataChannel.prototype, 'send');
  r.log.p1.watch.setTracking(true);
  const channel = send.mock.contexts[0];   // the watcher's own
  await wait(100);
  const before = r.watchers.length;
  channel.send(JSON.stringify({ t: 'tracking', on: false, pad: 'x'.repeat(2048) }));
  channel.send(JSON.stringify({ t: 'other', on: false }));
  channel.send('not json');
  await wait(100);
  expect(r.watchers.length).toBe(before);
  channel.send(JSON.stringify({ t: 'tracking', on: false }));
  await expect.poll(() => lastList(r)[0].tracking, PATIENT).toBe(false);
});

test('a burst of tracking toggles redraws who\'s here a few times, not once per toggle, and ends right', async () => {
  const r = await room(['p1']);
  await expect.poll(() => r.log.p1.states.at(-1), PATIENT).toBe('live');
  const send = vi.spyOn(RTCDataChannel.prototype, 'send');
  r.log.p1.watch.setTracking(true);
  const channel = send.mock.contexts[0];   // the watcher's own
  await wait(100);
  const before = r.watchers.length;
  for (let i = 0; i < 200; i++) channel.send(JSON.stringify({ t: 'tracking', on: i % 2 === 0 }));
  await expect.poll(() => lastList(r)[0].tracking, PATIENT).toBe(false);
  await wait(500);
  expect(r.watchers.length - before).toBeLessThan(5);
  expect(lastList(r)[0].tracking).toBe(false);
});

// The watcher doesn't trust the host: a test host sends it what a broken or hostile one might.
async function hostileHost() {
  const log = { arts: [], states: [], rooms: [], views: [] };
  let host;
  const watch = new Watch({
    config,
    send: async (msg) => { await later(); host.signal(msg.data); },
    onRoom: (room) => log.rooms.push(room),
    onView: (view) => log.views.push(view),
    onArt: (a) => log.arts.push(a),
    onState: (state) => log.states.push(state),
  });
  toClose.push(watch);
  const opened = new Promise((resolve) => {
    host = openPeer({ initiator: true, config, sendSignal: async (data) => { await later(); watch.signalFrom('host', data); }, onOpen: resolve, onClose() {} });
  });
  toClose.push(host);
  const channel = await opened;
  const json = (msg) => channel.send(JSON.stringify(msg));
  const snapshot = (chunks) => { json({ t: 'snapshot', chunks: chunks.length }); for (const c of chunks) channel.send(c); };
  return { log, channel, json, snapshot };
}
const gzip = async (value) => new Uint8Array(await new Response(new Blob([JSON.stringify(value)]).stream()
  .pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const noise = (bytes) => toBase64url(crypto.getRandomValues(new Uint8Array(bytes)));   // doesn't compress

test('a watcher ignores a snapshot of the wrong size or with unknown colors, and cells out of range', async () => {
  const { log, json, snapshot } = await hostileHost();
  json({ t: 'cells', at: [0], colors: ['#ffffff'], cells: [['x', 0, 0]] });   // before any snapshot
  const good = art();
  snapshot(await packSnapshot(good));
  await expect.poll(() => log.arts.length, PATIENT).toBe(1);
  expect(log.arts[0]).toEqual(good);

  snapshot(await packSnapshot({ ...good, cells: good.cells.slice(1) }));
  snapshot([await gzip({ cols: 1, lines: 1, font: null, colors: ['#000000'], cells: [['a', 0, 3]] })]);
  json({ t: 'cells', at: [COLS * LINES], colors: ['#ffffff'], cells: [['x', 0, 0]] });
  json({ t: 'cells', at: [-1], colors: ['#ffffff'], cells: [['x', 0, 0]] });
  json({ t: 'cells', at: [0], colors: ['#ffffff'], cells: [['x', 0, 1]] });
  json({ t: 'cells', at: [0, 1], colors: ['#ffffff'], cells: [['x', 0, 0]] });
  json({ t: 'cells', at: [3], colors: ['#ffffff', '#0000aa'], cells: [['y', 0, 1]] });
  const after = changed(good, []);
  after.cells[3] = { char: 'y', fg: color('#ffffff'), bg: color('#0000aa') };
  await expect.poll(() => log.arts.length, PATIENT).toBe(2);
  expect(log.arts[1]).toEqual(after);
  expect(log.arts[0]).toEqual(good);   // a copy changed, not the art already given
  await wait(100);
  expect(log.arts.length).toBe(2);
});

// A host can send cells as fast as it likes: the watcher puts them into one copy, and hands it on at
// most once a frame (a fresh one each time: the art already given is never changed).
test('many cells messages in one frame make one onArt, and the art already given isn\'t changed', async () => {
  const frames = new Map();
  let made = 0;
  vi.stubGlobal('requestAnimationFrame', (fn) => { frames.set(++made, fn); return made; });
  vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
  const draw = () => {
    const due = [...frames.values()];
    frames.clear();
    for (const fn of due) fn();
  };
  const { log, json, snapshot } = await hostileHost();
  const good = art();
  snapshot(await packSnapshot(good));
  await expect.poll(() => { draw(); return log.arts.length; }, PATIENT).toBe(1);

  for (let i = 0; i < 20; i++) json({ t: 'cells', at: [i], colors: ['#ffffff', '#000000'], cells: [['x', 0, 1]] });
  await wait(200);
  expect(log.arts.length).toBe(1);
  draw();
  expect(log.arts.length).toBe(2);
  expect(log.arts[1].cells.slice(0, 20).map((c) => c.char).join('')).toBe('x'.repeat(20));
  expect(log.arts[0]).toEqual(good);

  json({ t: 'cells', at: [25], colors: ['#ffffff', '#000000'], cells: [['y', 0, 1]] });
  await wait(100);
  draw();
  expect(log.arts.length).toBe(3);
  expect(log.arts[2].cells[25].char).toBe('y');
  expect(log.arts[1].cells[25].char).toBe(good.cells[25].char);
});

test('a watcher ignores a grid past the app\'s limits, a snapshot that inflates too far, too many or too big chunks', async () => {
  const { log, json, snapshot } = await hostileHost();
  const tiny = { cols: 1, lines: 1, font: null, colors: ['#000000'], cells: [['a', 0, 0]] };
  snapshot([await gzip({ ...tiny, cols: 301, cells: Array(301).fill(['a', 0, 0]) })]);
  snapshot([await gzip({ ...tiny, pad: ' '.repeat(MOST_SNAPSHOT_BYTES) })]);
  const big = await gzip({ ...tiny, pad: noise(CHUNK_BYTES) });
  expect(big.length).toBeGreaterThan(CHUNK_BYTES);
  snapshot([big]);
  const split = async (pieces) => {   // a good snapshot, cut into this many pieces
    const bytes = await gzip({ ...tiny, pad: noise(MOST_SNAPSHOT_CHUNKS * 2) });
    const size = Math.ceil(bytes.length / pieces);
    return Array.from({ length: pieces }, (_, i) => bytes.subarray(i * size, (i + 1) * size));
  };
  snapshot(await split(MOST_SNAPSHOT_CHUNKS + 1));
  json({ t: 'cells', at: [0], colors: ['#ffffff'], cells: [['x', 0, 0]] });
  await wait(300);
  expect(log.arts).toEqual([]);
  snapshot(await split(MOST_SNAPSHOT_CHUNKS));
  await expect.poll(() => log.arts.length, PATIENT).toBe(1);
  expect(log.arts[0].cells).toEqual([{ char: 'a', fg: color('#000000'), bg: color('#000000') }]);
}, 30_000);

test('a watcher ignores a room or a view that doesn\'t fit, and cuts a long name and welcome', async () => {
  const { log, json } = await hostileHost();
  json({ t: 'room', name: 5, welcome: 'Hi', host: 'ansi-fan' });
  json({ t: 'room', name: 'Night', welcome: { a: 1 }, host: 'ansi-fan' });
  for (const bad of [{ col: -1 }, { col: 1.5 }, { col: '1' }, { rows: null }, { cols: [8] }]) json({ t: 'view', col: 0, row: 0, cols: 8, rows: 2, ...bad });
  json({ t: 'room', name: 'n'.repeat(100), welcome: 'w'.repeat(300), host: 'ansi-fan' });
  json({ t: 'view', col: 0, row: 3, cols: 8, rows: 2 });
  await expect.poll(() => log.views.length, PATIENT).toBe(1);
  expect(log.rooms).toEqual([{ name: 'n'.repeat(60), welcome: 'w'.repeat(200) }]);   // the host's name in it isn't taken
  expect(log.views).toEqual([{ col: 0, row: 3, cols: 8, rows: 2, zoom: 1 }]);
});

// A host taken back after a reload: it restores what was kept, and the server then lists who's inside.
async function returning(restore, listed, { lost, returnWithinMs } = {}) {
  const r = await room([], { restore, lost, returnWithinMs });
  for (const peer of listed) r.log[peer] = watcher(r, peer);
  await r.host.hosting(await Promise.all(listed.map(async (peer) => ({ peer, pass: await passFor(`u_${peer}`, peer) }))));
  return r;
}
const line = async (sub, presence = 'joined') => ({ pass: await passFor(sub, sub), id: newId(), ts: Date.now(), presence });
const said = (text, i = 0) => ({ pass: 'p', id: newId(), ts: i, text, sig: 's' });
const presences = (r) => r.host.log.list.filter((m) => m.presence);
const historyOf = (sends, r, peer) => sends.sent().filter((m) => m.t === 'history' && m.channel === r.host.watchers.get(peer)?.channel);
const here = async (...subs) => Promise.all(subs.map(async (sub) => ({ sub, pass: await passFor(sub, sub) })));

test('a restored host\'s log goes to a returning watcher as its history', async () => {
  const sends = watchSends();
  const log = [said('one', 1), said('two', 2), { id: newId(), ts: 3, deleted: true }, await line('u_p2')];
  const r = await returning({ log, only: [], removed: [], muted: [], here: await here('u_p1') }, ['p1']);
  await expect.poll(() => r.log.p1.views.length, PATIENT).toBe(1);
  expect(historyOf(sends, r, 'p1').map((m) => m.messages)).toEqual([log]);
});

test('a watcher who was here comes back with no joined line', async () => {
  const log = [said('one', 1), await line('u_p1')];
  const r = await returning({ log, only: [], removed: [], muted: [], here: await here('u_p1') }, ['p1']);
  await expect.poll(() => r.log.p1.views.length, PATIENT).toBe(1);
  expect(r.host.log.list).toEqual(log);
});

test('someone who was here but isn\'t in hosting\'s peers gets a left line at once, with their kept pass', async () => {
  const [p1, p2] = await here('u_p1', 'u_p2');
  const r = await returning({ log: [], only: [], removed: [], muted: [], here: [p1, p2] }, ['p1'], { lost: ['p1'] });
  expect(presences(r).map(({ pass, presence }) => ({ pass, presence }))).toEqual([{ pass: p2.pass, presence: 'left' }]);
});

test('someone listed who never connects gets a left line after returnWithinMs, and one who connects first gets none', async () => {
  const [p1, p2] = await here('u_p1', 'u_p2');
  const r = await returning({ log: [], only: [], removed: [], muted: [], here: [p1, p2] }, ['p1', 'p2'], { lost: ['p1'], returnWithinMs: 2000 });
  await expect.poll(() => r.log.p2.views.length, PATIENT).toBe(1);
  expect(presences(r)).toEqual([]);
  await expect.poll(() => presences(r).length, PATIENT).toBe(1);
  expect(presences(r).map(({ pass, presence }) => ({ pass, presence }))).toEqual([{ pass: p1.pass, presence: 'left' }]);
});

test('a muted message stays shown only to its sender after restore', async () => {
  const sends = watchSends();
  const mine = said('muted', 1);
  const log = [said('before', 0), mine, said('after', 2)];
  const r = await returning({ log, only: [[mine.id, 'u_p1']], removed: [], muted: ['u_p1'], here: await here('u_p1', 'u_p2') }, ['p1', 'p2']);
  for (const peer of ['p1', 'p2']) await expect.poll(() => r.log[peer].views.length, PATIENT).toBe(1);
  expect(historyOf(sends, r, 'p1')[0].messages.map((m) => m.id)).toEqual(log.map((m) => m.id));
  expect(historyOf(sends, r, 'p2')[0].messages.map((m) => m.id)).toEqual([log[0].id, log[2].id]);
  expect(r.host.muted).toEqual(new Set(['u_p1']));
});

test('kept() still lists those awaited, so a second reload gives no joined or left line for them', async () => {
  const [p1] = await here('u_p1');
  const first = await returning({ log: [], only: [], removed: [], muted: [], here: [p1] }, ['p1'], { lost: ['p1'] });
  expect(first.host.kept().here).toEqual([p1]);
  const second = await returning(first.host.kept(), ['p1']);
  await expect.poll(() => second.log.p1.views.length, PATIENT).toBe(1);
  expect(presences(second)).toEqual([]);
  expect(second.host.kept().here.map((h) => h.sub)).toEqual(['u_p1']);   // now by the pass it came back with
});

test('kept() holds the newest KEPT_THROUGH_RELOAD entries, and only pairs for those', async () => {
  const log = Array.from({ length: KEPT_THROUGH_RELOAD + 5 }, (_, i) => said(`m${i}`, i));
  const only = [[log[0].id, 'u_p1'], [log[4].id, 'u_p1'], [log[5].id, 'u_p2'], [log.at(-1).id, 'u_p3']];
  const { host } = await room([], { restore: { log, only, removed: [], muted: [], here: [] } });
  const kept = host.kept();
  expect(kept.log).toEqual(log.slice(5));
  expect(kept.only).toEqual(only.slice(2));
});

test('a removed peer stays unmet after restore', async () => {
  const r = await returning({ log: [], only: [], removed: ['p1'], muted: [], here: [] }, ['p1', 'p2']);
  await expect.poll(() => r.log.p2.views.length, PATIENT).toBe(1);
  expect(r.offers.p1).toBeUndefined();
  expect(r.host.watchers.has('p1')).toBe(false);
  expect(r.toHost).toContainEqual({ type: 'remove', peer: 'p1' });
  expect(r.host.kept().removed).toEqual(['p1']);
});

test('close() stops the wait: no left line after it', async () => {
  const r = await returning({ log: [], only: [], removed: [], muted: [], here: await here('u_p1') }, ['p1'], { lost: ['p1'], returnWithinMs: 100 });
  r.host.close();
  await wait(400);
  expect(presences(r)).toEqual([]);
});

// Drawing together: what the Host does with an artist's messages. What the store does with them is
// social-drawing.test.js. Here the callbacks are spies; the watchers post by hand.
function drawingCalls(r) {
  const calls = { change: [], undo: [], redo: [], cursor: [], hello: [], answer: [], refused: 0 };
  r.host.onChange = (sub, msg) => { calls.change.push([sub, msg]); return msg.good !== false; };
  r.host.onUndo = (sub, msg) => calls.undo.push([sub, msg]);
  r.host.onRedo = (sub, msg) => calls.redo.push([sub, msg]);
  r.host.onCursor = (sub, msg) => calls.cursor.push([sub, msg]);
  r.host.onHello = (w, msg) => calls.hello.push([w.peer, msg]);
  r.host.onAnswer = (sub, yes) => calls.answer.push([sub, yes]);
  return calls;
}
const seated = async (r, ...peers) => {
  for (const peer of peers) await expect.poll(() => r.log[peer].watch.ready && r.host.open().some((w) => w.peer === peer), PATIENT).toBe(true);
};
const connected = (r, peer) => r.host.open().find((w) => w.peer === peer);
const CHANGE = { t: 'change', stroke: 's', cells: [], runs: [] };
const padded = (chars) => ({ ...CHANGE, pad: 'x'.repeat(chars) });

test('a change from a non-artist is ignored and the watcher stays', async () => {
  const r = await room(['p1']);
  const calls = drawingCalls(r);
  await seated(r, 'p1');
  r.log.p1.watch.post(CHANGE);
  r.log.p1.watch.post({ t: 'undo', stroke: 's' });
  r.log.p1.watch.post({ t: 'redo', stroke: 's' });
  r.log.p1.watch.post({ t: 'cursor', at: null, view: null });
  r.log.p1.watch.post({ t: 'artist-hello', has: -1, epoch: null });
  await wait(60);
  expect([calls.change, calls.undo, calls.redo, calls.cursor, calls.hello].flat()).toEqual([]);
  expect(connected(r, 'p1').took).toBe(0);
  expect(r.log.p1.watch.ready).toBe(true);
  expect(lastList(r)[0].connected).toBe(true);
});

test('a host-only message from an artist does nothing', async () => {
  const r = await room(['p1']);
  const calls = drawingCalls(r);
  await seated(r, 'p1');
  r.host.setArtists(['u_p1']);
  const artThen = r.host.art;
  for (const t of ['numbered', 'settings', 'base', 'project-start', 'check', 'cursors', 'artists', 'invite', 'withdrawn', 'cells', 'snapshot', 'room', 'view', 'away', 'deleted']) {
    r.log.p1.watch.post({ t, n: 1, subs: ['u_p1'], cells: [], runs: [], values: {}, chunks: 1 });
  }
  await wait(60);
  expect([calls.change, calls.undo, calls.redo, calls.cursor, calls.hello, calls.answer].flat()).toEqual([]);
  expect(r.host.art).toBe(artThen);
  expect(r.host.isArtist('u_p1')).toBe(true);
  expect(r.log.p1.watch.ready).toBe(true);
});

test('a change still in flight from someone just put back to watching is ignored', async () => {
  const r = await room(['p1']);
  const calls = drawingCalls(r);
  await seated(r, 'p1');
  r.host.setArtists(['u_p1']);
  r.log.p1.watch.sendChange({ stroke: 's', cells: [], runs: [] });
  r.host.setArtists([]);   // before it's heard
  await wait(60);
  expect(calls.change).toEqual([]);
  expect(r.log.p1.watch.ready).toBe(true);
});

test('a large change from an artist is heard; the same size from a watcher isn\'t', async () => {
  const r = await room(['p1', 'p2']);
  const calls = drawingCalls(r);
  await seated(r, 'p1', 'p2');
  r.host.setArtists(['u_p1']);
  r.log.p1.watch.post(padded(40_000));
  r.log.p2.watch.post(padded(40_000));
  await expect.poll(() => calls.change.length, PATIENT).toBe(1);
  await wait(30);
  expect(calls.change[0][0]).toBe('u_p1');
  expect(r.log.p2.watch.ready).toBe(true);
});

test('only a change may be large: chat and the rest are held to what everyone is', async () => {
  const r = await room(['p1']);
  const calls = drawingCalls(r);
  await seated(r, 'p1');
  r.host.setArtists(['u_p1']);
  r.log.p1.watch.post({ t: 'cursor', at: 'x'.repeat(3000) });
  r.log.p1.watch.post({ t: 'accept', pad: 'x'.repeat(3000) });
  await wait(60);
  expect([calls.cursor, calls.answer].flat()).toEqual([]);
});

test('past an artist\'s limit nothing is heard, and junk from an artist is shrugged off', async () => {
  const r = await room(['p1']);
  const calls = drawingCalls(r);
  await seated(r, 'p1');
  r.host.setArtists(['u_p1']);
  connected(r, 'p1').channel.onmessage({ data: JSON.stringify(padded(70_000)) });
  connected(r, 'p1').channel.onmessage({ data: '{"t":"change"' });
  connected(r, 'p1').channel.onmessage({ data: 'null' });
  connected(r, 'p1').channel.onmessage({ data: new ArrayBuffer(8) });
  await wait(30);
  expect(calls.change).toEqual([]);
  expect(r.log.p1.watch.ready).toBe(true);
});

test('a callback that throws doesn\'t reach the channel, and a change that threw is refused', async () => {
  const r = await room(['p1']);
  const calls = drawingCalls(r);
  await seated(r, 'p1');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  r.host.setArtists(['u_p1']);
  r.host.onUndo = () => { throw new Error('no'); };
  r.host.onChange = () => { throw new Error('no'); };
  r.host.project = () => ({ n: 1, epoch: 'e', chunks: Promise.resolve([new Uint8Array(1)]) });
  const w = connected(r, 'p1');
  w.drawing = true;
  expect(() => r.host.heard(w, JSON.stringify({ t: 'undo', stroke: 's' }))).not.toThrow();
  expect(() => r.host.heard(w, JSON.stringify(CHANGE))).not.toThrow();
  expect(w.took).toBe(1);
  expect(w.projecting).toBe(true);
  expect(calls.undo).toEqual([]);
});

test('accept and decline come from anyone; undo, redo, cursor and hello from artists reach their callbacks', async () => {
  const r = await room(['p1']);
  const calls = drawingCalls(r);
  await seated(r, 'p1');
  r.log.p1.watch.post({ t: 'accept' });
  r.log.p1.watch.post({ t: 'decline' });
  await expect.poll(() => calls.answer, PATIENT).toEqual([['u_p1', true], ['u_p1', false]]);
  r.host.setArtists(['u_p1']);
  r.log.p1.watch.sendUndo('a');
  r.log.p1.watch.sendRedo('b');
  r.log.p1.watch.sendCursor({ col: 1, row: 2 }, null);
  r.log.p1.watch.post({ t: 'artist-hello', has: 3, epoch: 'e' });
  await expect.poll(() => calls.hello.length, PATIENT).toBe(1);
  expect(calls.undo).toEqual([['u_p1', { t: 'undo', stroke: 'a' }]]);
  expect(calls.redo).toEqual([['u_p1', { t: 'redo', stroke: 'b' }]]);
  expect(calls.cursor[0][1]).toMatchObject({ at: { col: 1, row: 2 }, view: null });
  expect(calls.hello[0]).toEqual(['p1', { t: 'artist-hello', has: 3, epoch: 'e' }]);
});

test('sendAll reaches artists who said hello, and no one else', async () => {
  const sends = watchSends();
  const r = await room(['p1', 'p2', 'p3']);
  drawingCalls(r);
  await seated(r, 'p1', 'p2', 'p3');
  r.host.setArtists(['u_p1', 'u_p2']);
  connected(r, 'p1').channel.onmessage({ data: JSON.stringify({ t: 'artist-hello', has: -1, epoch: null }) });
  sends.clear();
  r.host.sendAll({ t: 'numbered', n: 1 });
  const got = sends.sent().filter((m) => m.t === 'numbered');
  expect(got.map((m) => m.channel)).toEqual([connected(r, 'p1').channel]);
  expect(r.host.isArtist('u_p3')).toBe(false);
});

test('who may draw goes to everyone in the room, and to anyone who connects later', async () => {
  const sends = watchSends();
  const r = await room(['p1']);
  await seated(r, 'p1');
  sends.clear();
  r.host.setArtists(['u_p1']);
  await expect.poll(() => sends.sent().filter((m) => m.t === 'artists').length).toBe(1);
  expect(sends.sent().find((m) => m.t === 'artists').subs).toEqual(['u_p1']);
  r.log.p2 = watcher(r, 'p2');
  sends.clear();
  await r.host.peer('p2', await passFor('u_p2', 'p2'));
  await expect.poll(() => sends.sent().filter((m) => m.t === 'artists').length, PATIENT).toBe(1);
});

test('a project goes as a start, its chunks, then what was numbered while it was packed, in order', async () => {
  const sends = watchSends();
  const r = await room(['p1']);
  drawingCalls(r);
  await seated(r, 'p1');
  r.host.setArtists(['u_p1']);
  const w = connected(r, 'p1');
  w.drawing = true;
  w.took = 3;
  let release;
  r.host.project = () => ({ n: 9, epoch: 'e1', chunks: new Promise((resolve) => { release = resolve; }) });
  sends.clear();
  const going = r.host.sendProject(w);
  r.host.sendAll({ t: 'numbered', n: 10 });
  w.took = 4;   // handled after the project's n
  r.host.sendAll({ t: 'numbered', n: 11 });
  expect(sends.sent()).toEqual([]);
  const chunk = new Uint8Array(CHUNK_BYTES - 1);
  release([chunk, chunk]);
  await going;
  expect(sends.sent().map((m) => m.t)).toEqual(['project-start', 'numbered', 'numbered']);
  expect(sends.sent()[0]).toMatchObject({ n: 9, epoch: 'e1', chunks: 2, bytes: 2 * chunk.length, took: 3 });
  expect(sends.chunks().length).toBe(2);
  expect(sends.sent().slice(1).map((m) => m.n)).toEqual([10, 11]);
  expect(w.projecting).toBe(false);
});

test('a refused change counts in took and is answered with a project, one in flight, and one more for any refused meanwhile', async () => {
  const sends = watchSends();
  const r = await room(['p1']);
  drawingCalls(r);
  await seated(r, 'p1');
  r.host.setArtists(['u_p1']);
  const w = connected(r, 'p1');
  w.drawing = true;
  const makes = [];
  r.host.project = () => {
    let resolve;
    const chunks = new Promise((done) => { resolve = done; });
    makes.push(resolve);
    return { n: makes.length, epoch: 'e', chunks };
  };
  sends.clear();
  const bad = JSON.stringify({ ...CHANGE, good: false });
  r.host.heard(w, JSON.stringify(CHANGE));
  r.host.heard(w, bad);
  r.host.heard(w, bad);
  expect(w.took).toBe(3);
  expect(makes.length).toBe(1);
  makes[0]([new Uint8Array(4)]);
  await expect.poll(() => makes.length).toBe(2);
  expect(sends.sent().filter((m) => m.t === 'project-start').map((m) => m.took)).toEqual([2]);
  makes[1]([new Uint8Array(4)]);
  await expect.poll(() => sends.sent().filter((m) => m.t === 'project-start').length).toBe(2);
  expect(sends.sent().filter((m) => m.t === 'project-start').at(-1).took).toBe(3);
  await later();
  expect(makes.length).toBe(2);
});

test('someone put back to watching while their project is packed isn\'t sent it, or what waited', async () => {
  const sends = watchSends();
  const r = await room(['p1']);
  drawingCalls(r);
  await seated(r, 'p1');
  r.host.setArtists(['u_p1']);
  const w = connected(r, 'p1');
  w.drawing = true;
  let release;
  r.host.project = () => ({ n: 1, epoch: 'e', chunks: new Promise((resolve) => { release = resolve; }) });
  const going = r.host.sendProject(w);
  r.host.sendAll({ t: 'numbered', n: 2 });
  r.host.setArtists([]);
  sends.clear();
  release([new Uint8Array(4)]);
  await going;
  expect(sends.sent().filter((m) => m.t !== 'artists')).toEqual([]);
  expect(sends.chunks()).toEqual([]);
  expect(w.took).toBe(0);
});

test('a project that won\'t pack still lets out what waited, and leaves the room going', async () => {
  const sends = watchSends();
  const r = await room(['p1']);
  drawingCalls(r);
  await seated(r, 'p1');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  r.host.setArtists(['u_p1']);
  const w = connected(r, 'p1');
  w.drawing = true;
  let fail;
  r.host.project = () => ({ n: 1, epoch: 'e', chunks: new Promise((_, reject) => { fail = reject; }) });
  sends.clear();
  const going = r.host.sendProject(w);
  r.host.sendAll({ t: 'numbered', n: 2 });
  fail(new Error('no'));
  await going;
  expect(sends.sent().map((m) => m.t)).toEqual(['numbered']);
  expect(w.projecting).toBe(false);
  expect(r.log.p1.watch.ready).toBe(true);
});

// A channel as Chromium's is: send throws past 16 MiB buffered. It drains in steps, as a slow network does.
const CHANNEL_LIMIT = 16 * 1024 * 1024;
function fullChannel(real) {
  const channel = {
    readyState: 'open', bufferedAmount: 0, bufferedAmountLowThreshold: real.bufferedAmountLowThreshold, onbufferedamountlow: real.onbufferedamountlow,
    sent: [], most: 0,
    send(data) {
      const size = typeof data === 'string' ? data.length : data.byteLength;
      if (channel.bufferedAmount + size > CHANNEL_LIMIT) throw new DOMException('RTCDataChannel send queue is full', 'OperationError');
      channel.bufferedAmount += size;
      channel.most = Math.max(channel.most, channel.bufferedAmount);
      channel.sent.push(data);
    },
    drain() {
      if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) return;
      channel.bufferedAmount = channel.bufferedAmountLowThreshold;
      channel.onbufferedamountlow?.();
    },
  };
  return channel;
}

test('a project past what a channel buffers goes at the pace it drains, and the artist stays', async () => {
  const r = await room(['p1']);
  drawingCalls(r);
  await seated(r, 'p1');
  r.host.setArtists(['u_p1']);
  const w = connected(r, 'p1'), channel = fullChannel(w.channel), close = vi.spyOn(w.conn, 'close');
  w.channel = channel;
  w.drawing = true;
  const chunks = Array.from({ length: 400 }, () => new Uint8Array(CHUNK_BYTES));   // 26 MB
  r.host.project = () => ({ n: 1, epoch: 'e', chunks: Promise.resolve(chunks) });
  let done = false;
  const going = r.host.sendProject(w).then(() => { done = true; });
  await later();
  r.host.sendAll({ t: 'numbered', n: 2 });
  expect(done).toBe(false);
  expect(w.projecting).toBe(true);
  expect(channel.sent.filter((d) => typeof d === 'string' && JSON.parse(d).t === 'numbered')).toEqual([]);
  while (!done) {
    channel.drain();
    await later();
  }
  await going;
  expect(close).not.toHaveBeenCalled();
  expect(channel.sent.filter((d) => typeof d !== 'string').length).toBe(400);
  expect(channel.most).toBeLessThanOrEqual(CHANNEL_LIMIT);
  expect(channel.sent.filter((d) => typeof d === 'string').map((d) => JSON.parse(d).t).slice(0, 2)).toEqual(['project-start', 'numbered']);
  expect(w.projecting).toBe(false);
});

test('art waits for a project\'s chunks, and that artist is brought up to date after', async () => {
  const r = await room(['p1']);
  drawingCalls(r);
  await seated(r, 'p1');
  await expect.poll(() => r.log.p1.arts.length, PATIENT).toBe(1);
  r.host.setArtists(['u_p1']);
  const w = connected(r, 'p1'), channel = fullChannel(w.channel);
  w.channel = channel;
  w.drawing = true;
  const chunks = Array.from({ length: 200 }, () => new Uint8Array(CHUNK_BYTES));
  r.host.project = () => ({ n: 1, epoch: 'e', chunks: Promise.resolve(chunks) });
  let done = false;
  r.host.sendProject(w).then(() => { done = true; });
  await later();
  const chunksThen = channel.sent.length;
  r.host.setArt(changed(art(), [5]));   // cells
  r.host.setArt(art('z'.repeat(COLS * LINES)));   // too much: a snapshot
  await wait(50);
  const texts = () => channel.sent.filter((d) => typeof d === 'string').map((d) => JSON.parse(d).t);
  expect(texts()).not.toContain('cells');
  expect(texts()).not.toContain('snapshot');
  expect(channel.sent.length).toBe(chunksThen);
  expect(w.behind).toBe(true);
  channel.onbufferedamountlow();   // a drain mid-project doesn't let art through
  await wait(30);
  expect(texts()).not.toContain('snapshot');
  while (!done) {
    channel.drain();
    await later();
  }
  await expect.poll(() => texts().includes('snapshot'), PATIENT).toBe(true);
  expect(w.behind).toBe(false);
  expect(channel.sent.filter((d) => typeof d !== 'string').length).toBeGreaterThan(200);
  expect(channel.sent.lastIndexOf(chunks[199])).toBeLessThan(channel.sent.findIndex((d) => typeof d === 'string' && JSON.parse(d).t === 'snapshot'));
});

test('someone put back to watching in the middle of a project is still sent the rest: their watcher is expecting it', async () => {
  const r = await room(['p1']);
  drawingCalls(r);
  await seated(r, 'p1');
  r.host.setArtists(['u_p1']);
  const w = connected(r, 'p1'), channel = fullChannel(w.channel);
  w.channel = channel;
  w.drawing = true;
  const chunks = Array.from({ length: 200 }, () => new Uint8Array(CHUNK_BYTES));
  r.host.project = () => ({ n: 1, epoch: 'e', chunks: Promise.resolve(chunks) });
  let done = false;
  r.host.sendProject(w).then(() => { done = true; });
  await later();
  r.host.setArtists([]);
  while (!done) {
    channel.drain();
    await later();
  }
  expect(channel.sent.filter((d) => typeof d !== 'string').length).toBe(200);
});

test('a connection gone while a project waits to drain ends the wait', async () => {
  const r = await room(['p1']);
  drawingCalls(r);
  await seated(r, 'p1');
  r.host.setArtists(['u_p1']);
  const w = connected(r, 'p1'), channel = fullChannel(w.channel);
  w.channel = channel;
  w.drawing = true;
  r.host.project = () => ({ n: 1, epoch: 'e', chunks: Promise.resolve(Array.from({ length: 200 }, () => new Uint8Array(CHUNK_BYTES))) });
  const going = r.host.sendProject(w);
  await later();
  r.host.drop('p1');
  await going;
  expect(channel.sent.filter((d) => typeof d !== 'string').length).toBeLessThan(200);
});

test('who may draw goes to someone connecting even when no one may', async () => {
  const sends = watchSends();
  const r = await room(['p1']);
  await seated(r, 'p1');
  await expect.poll(() => sends.sent().find((m) => m.t === 'artists')?.subs, PATIENT).toEqual([]);
});

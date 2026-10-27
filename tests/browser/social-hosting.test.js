// A room's two sides in one page: a Host and its Watches, real WebRTC (no STUN), a small relay standing
// in for the Room's socket, and passes signed by a test key. RTCDataChannel's send is watched, so the
// tests can count what the host sends; a watcher only ever sends 'following'.
import { test, expect, afterEach, vi } from 'vitest';
import { Host } from '@/social/hosting';
import { Watch } from '@/social/watching';
import { openPeer } from '@/social/peer';
import { packSnapshot } from '@/social/wire';
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
    ? [{ ...JSON.parse(data), channel: send.mock.contexts[i] }] : [])).filter((m) => m.t !== 'following');
  const chunks = () => send.mock.calls.flatMap(([data]) => (typeof data === 'string' ? [] : [data]));
  return { sent, chunks, clear: () => send.mockClear() };
}

// A host and its watchers joined through the relay. `room.toHost` are the host's messages to the Room
// other than signals; `room.offers[peer]` counts the offers that went to each watcher.
async function room(peers = ['p1', 'p2']) {
  const r = { toHost: [], offers: {}, watchers: [], log: {} };
  r.host = new Host({
    config, passKey: async () => keyB64,
    send: async (msg) => {
      if (msg.type !== 'signal-to') return r.toHost.push(msg);
      if (msg.data.sdp?.type === 'offer') r.offers[msg.to] = (r.offers[msg.to] ?? 0) + 1;
      await later();
      r.log[msg.to]?.watch.signalFrom('host', msg.data);
    },
    onWatchers: (list) => r.watchers.push(list),
  });
  toClose.push(r.host);
  for (const peer of peers) r.log[peer] = watcher(r, peer);
  r.host.setRoom({ name: 'Night shift', welcome: 'Hi', host: 'ansi-fan' });
  r.host.setArt(art());
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

test('each watcher gets the room, then art deep-equal to the host\'s, then the view', async () => {
  const sends = watchSends();
  const r = await room();
  for (const peer of ['p1', 'p2']) {
    const log = r.log[peer];
    await expect.poll(() => log.views.length, PATIENT).toBe(1);
    expect(log.states).toEqual(['connecting', 'live']);
    expect(log.rooms).toEqual([{ name: 'Night shift', welcome: 'Hi', host: 'ansi-fan' }]);
    expect(log.arts).toEqual([art()]);
    expect(log.views).toEqual([{ col: 1, row: 2, cols: 3, rows: 4 }]);
  }
  for (const channel of new Set(sends.sent().map((m) => m.channel))) {
    expect(sends.sent().filter((m) => m.channel === channel).map((m) => m.t)).toEqual(['room', 'snapshot', 'view']);
  }
  expect(lastList(r)).toEqual([
    { peer: 'p1', sub: 'u_p1', name: 'p1', guest: false, following: true, connected: true },
    { peer: 'p2', sub: 'u_p2', name: 'p2', guest: false, following: true, connected: true },
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

test('a view reaches the watchers, and the same view again sends nothing', async () => {
  const sends = watchSends();
  const r = await room();
  for (const peer of ['p1', 'p2']) await expect.poll(() => r.log[peer].views.length, PATIENT).toBe(1);
  sends.clear();
  r.host.setView({ col: 1, row: 2, cols: 3, rows: 4 });
  r.host.setView({ col: 0, row: 1, cols: 8, rows: 2 });
  r.host.setView({ col: 0, row: 1, cols: 8, rows: 2 });
  for (const peer of ['p1', 'p2']) await expect.poll(() => r.log[peer].views.at(-1), PATIENT).toEqual({ col: 0, row: 1, cols: 8, rows: 2 });
  await wait(100);
  expect(sends.sent().map((m) => m.t)).toEqual(['view', 'view']);
  expect(r.log.p1.views.length).toBe(2);
});

test('a watcher that stops following shows following: false', async () => {
  const r = await room();
  await expect.poll(() => r.log.p2.states.at(-1), PATIENT).toBe('live');
  r.log.p2.watch.setFollowing(false);
  await expect.poll(() => lastList(r).find((w) => w.peer === 'p2')?.following, PATIENT).toBe(false);
  expect(lastList(r).find((w) => w.peer === 'p1').following).toBe(true);
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

// Review focus 1: the host's socket came back and the Room lists who's inside.
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

test('a watcher\'s message that isn\'t following, or is over 1 KB, is ignored', async () => {
  const r = await room(['p1']);
  await expect.poll(() => r.log.p1.states.at(-1), PATIENT).toBe('live');
  const send = vi.spyOn(RTCDataChannel.prototype, 'send');
  r.log.p1.watch.setFollowing(true);
  const channel = send.mock.contexts[0];   // the watcher's own
  await wait(100);
  const before = r.watchers.length;
  channel.send(JSON.stringify({ t: 'following', on: false, pad: 'x'.repeat(1024) }));
  channel.send(JSON.stringify({ t: 'other', on: false }));
  channel.send('not json');
  await wait(100);
  expect(r.watchers.length).toBe(before);
  channel.send(JSON.stringify({ t: 'following', on: false }));
  await expect.poll(() => lastList(r)[0].following, PATIENT).toBe(false);
});

// The watcher doesn't trust the host: a test host sends it what a broken or hostile one might.
test('a watcher ignores a snapshot of the wrong size or with unknown colors, and cells out of range', async () => {
  const log = { arts: [], states: [] };
  let host;
  const watch = new Watch({
    config,
    send: async (msg) => { await later(); host.signal(msg.data); },
    onRoom() {}, onView() {},
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
  const gzip = async (value) => [new Uint8Array(await new Response(new Blob([JSON.stringify(value)]).stream()
    .pipeThrough(new CompressionStream('gzip'))).arrayBuffer())];

  json({ t: 'cells', at: [0], colors: ['#ffffff'], cells: [['x', 0, 0]] });   // before any snapshot
  const good = art();
  snapshot(await packSnapshot(good));
  await expect.poll(() => log.arts.length, PATIENT).toBe(1);
  expect(log.arts[0]).toEqual(good);

  snapshot(await packSnapshot({ ...good, cells: good.cells.slice(1) }));
  snapshot(await gzip({ cols: 1, lines: 1, font: null, colors: ['#000000'], cells: [['a', 0, 3]] }));
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

// The desktop room service's channels (a guest's socket and the host's for that guest, piped together in place of a
// WebRTC data channel), its probes, the addresses an artist could host at, and handing the room over.
import { test, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import net from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import { probeAddress } from '../../desktop/roomService.js';
import { ROOM, SECRET, opened, closeAll, person, service, client, hosting, joining, letIn, refusal } from '../support/desktopRoom.js';

afterEach(closeAll);

const MiB = 1024 * 1024;
const frame = (data, isBinary) => (isBinary ? Buffer.from(data) : data.toString());
const channel = (s, query) => client(s.port, `/channel?${new URLSearchParams(query)}`, frame);
const hostChannel = (s, peer, secret = SECRET) => channel(s, { peer, secret });
const guestChannel = (s, peer, token) => channel(s, token === undefined ? { peer } : { peer, token });
const sendJson = (ws, msg) => ws.send(JSON.stringify(msg));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A room with a guest let in, and the channel between them opened.
async function piped(options) {
  const s = await service(options);
  const { ws: room } = await hosting(s, await person('Host'));
  const ana = await person();
  const { ws: guestRoom, joined } = await letIn(s, room, ana);
  const host = hostChannel(s, joined.peer);
  await host.ready;
  const guest = guestChannel(s, joined.peer, joined.token);
  await guest.ready;
  return { s, room, ana, guestRoom, joined, host, guest };
}

// The artist's own service, in standby, answering probes as them.
async function standbyFor(who) {
  const s = await service({ mode: 'standby', owner: { sub: who.sub } });
  return `127.0.0.1:${s.port}`;
}

// The next message of a type, past any others.
async function nextOf(ws, type) {
  for (;;) {
    const msg = await ws.next();
    if (msg.type === type) return msg;
  }
}

test('a guest channel and the host\'s channel for its peer are piped both ways', async () => {
  const { host, guest } = await piped();
  host.send('{"t":"hi"}');
  assert.equal(await guest.next(), '{"t":"hi"}');
  guest.send(Buffer.from([1, 2, 3]));
  assert.deepEqual(await host.next(), Buffer.from([1, 2, 3]));

  // Sent before the other side came, a frame waits for it.
  const { s, room } = await piped();
  const bo = await person('Bo');
  const { joined } = await letIn(s, room, bo);
  const early = hostChannel(s, joined.peer);
  await early.ready;
  early.send(Buffer.from([9]));
  const late = guestChannel(s, joined.peer, joined.token);
  assert.deepEqual(await late.next(), Buffer.from([9]));

  // One side closing closes the other.
  late.close();
  assert.equal((await early.closed).code, 1000);
});

test('a bad token or secret closes the channel 1008', async () => {
  const { s, joined } = await piped();
  for (const ws of [
    guestChannel(s, joined.peer, 'not-the-token'),
    guestChannel(s, joined.peer),
    hostChannel(s, joined.peer, 'wrong'),
    guestChannel(s, 'p_99', joined.token),
    hostChannel(s, 'p_99'),
  ]) assert.equal((await ws.closed).code, 1008);
});

test('a newer host channel for the peer replaces the older pair', async () => {
  const { s, joined, host, guest } = await piped();
  const newer = hostChannel(s, joined.peer);
  await newer.ready;
  assert.equal((await host.closed).code, 1000);
  assert.equal((await guest.closed).code, 1000);
  const again = guestChannel(s, joined.peer, joined.token);
  await again.ready;
  newer.send('after');
  assert.equal(await again.next(), 'after');

  // A second guest socket while one is there is turned away, and the first carries on.
  const twice = guestChannel(s, joined.peer, joined.token);
  assert.equal((await twice.closed).code, 1008);
  again.send('still');
  assert.equal(await newer.next(), 'still');
});

test('a channel the other side never comes to is closed', async () => {
  const s = await service({ pairWithinMs: 50 });
  const { ws: room } = await hosting(s, await person('Host'));
  const { joined } = await letIn(s, room, await person());
  const alone = hostChannel(s, joined.peer);
  assert.equal((await alone.closed).code, 1008);
});

test('a guest leaving the room closes its channel', async () => {
  const { guestRoom, host, guest } = await piped();
  guestRoom.close();
  assert.equal((await host.closed).code, 1000);
  assert.equal((await guest.closed).code, 1000);
});

test('a backed-up guest pauses the host side', async () => {
  const { host, guest } = await piped();
  let got = 0;
  guest.removeAllListeners('message');
  guest.on('message', (data) => { got += data.length; });
  guest.pause();   // a slow consumer
  const chunk = Buffer.alloc(64 * 1024, 7), total = 48 * MiB;
  for (let sent = 0; sent < total; sent += chunk.length) host.send(chunk);

  // Once it settles, what the host still holds is past 1 MiB: the service stopped reading it.
  let before = -1;
  while (host.bufferedAmount !== before) {
    before = host.bufferedAmount;
    await wait(100);
  }
  assert.ok(host.bufferedAmount > MiB, `the host holds ${host.bufferedAmount} bytes`);

  guest.resume();
  while (got < total) await wait(20);
  assert.equal(got, total);
  assert.equal(host.bufferedAmount, 0);
});

test('probe answers the owner\'s sub and nonce', async () => {
  const s = await service({ mode: 'standby' });
  const probe = client(s.port, '/probe?nonce=n-1');
  assert.deepEqual(await probe.next(), { type: 'probe', nonce: 'n-1', sub: 'me' });
  assert.equal((await probe.closed).code, 1000);
  assert.equal(await probeAddress(`127.0.0.1:${s.port}`), 'me');
  s.set({ owner: { sub: 'someone' } });
  assert.equal(await probeAddress(`127.0.0.1:${s.port}`), 'someone');

  // In standby there is no room to greet, and no channel.
  for (const path of ['/room', '/channel?peer=p_1&secret=the-secret']) await assert.rejects(client(s.port, path).ready);
  assert.equal(s.mode(), 'standby');
  s.set({ mode: 'host' });
  await hosting(s, await person('Host'));
});

test('addresses are probed and listed in artists-now\'s hostable', async () => {
  const s = await service();
  const { ws: host } = await hosting(s, await person('Host'));
  const ana = await person();
  const { ws: guest } = await letIn(s, host, ana);
  sendJson(host, { type: 'artists', subs: [ana.sub], tag: 4 });
  assert.deepEqual(await host.next(), { type: 'artists-now', subs: [ana.sub], tag: 4, hostable: {} });

  const address = await standbyFor(ana);
  sendJson(guest, { type: 'addresses', list: [address] });
  assert.deepEqual(await host.next(), { type: 'artists-now', subs: [ana.sub], hostable: { [ana.sub]: [address] } });
  sendJson(host, { type: 'artists', subs: [ana.sub, 'gone-sub'], tag: 5 });
  assert.deepEqual(await host.next(), { type: 'artists-now', subs: [ana.sub, 'gone-sub'], tag: 5, hostable: { [ana.sub]: [address] } });

  // The same person on a new socket keeps them.
  assert.equal((await (await joining(s, ana)).next()).type, 'joined');
  assert.equal((await host.next()).type, 'peer-gone');
  assert.equal((await host.next()).type, 'peer');
  sendJson(host, { type: 'artists', subs: [ana.sub], tag: 6 });
  assert.deepEqual((await host.next()).hostable, { [ana.sub]: [address] });
});

test('an address that doesn\'t answer is left out', async () => {
  const probed = [];
  const s = await service({ probeEveryMs: 0, probe: (address) => probed.push(address) && probeAddress(address, 200) });
  const { ws: host } = await hosting(s, await person('Host'));
  const ana = await person();
  const { ws: guest } = await letIn(s, host, ana);

  const good = await standbyFor(ana);
  const someoneElse = await standbyFor(await person('Eve'));
  const silent = net.createServer().listen(0, '127.0.0.1');   // takes the connection, never answers
  const liar = new WebSocketServer({ port: 0, host: '127.0.0.1' });   // answers with the wrong nonce
  liar.on('connection', (ws) => ws.send(JSON.stringify({ type: 'probe', nonce: 'nope', sub: ana.sub })));
  const free = net.createServer().listen(0, '127.0.0.1');
  await Promise.all([silent, liar, free].map((server) => new Promise((resolve) => server.once('listening', resolve))));
  opened.push(() => new Promise((resolve) => silent.close(resolve)), () => new Promise((resolve) => liar.close(resolve)));
  const refused = `127.0.0.1:${free.address().port}`;
  await new Promise((resolve) => free.close(resolve));
  silent.on('connection', (socket) => opened.push(() => socket.destroy()));

  const unshaped = ['evil/x?y=1:80', 'my-mac.local:31337', '127.0.0.1:70000', '127.0.0.1:0', '300.0.0.1:80'];
  const list = [refused, `127.0.0.1:${silent.address().port}`, `127.0.0.1:${liar.address().port}`, someoneElse, good];
  sendJson(guest, { type: 'addresses', list: [...unshaped.slice(0, 3), ...list] });
  assert.deepEqual(await host.next(), { type: 'artists-now', subs: [], hostable: { [ana.sub]: [good] } });
  assert.deepEqual(probed, list);   // only IPv4 with a port that can be one is tried
  for (const address of unshaped) assert.equal(await probeAddress(address, 200), null);

  // Past eight, the rest aren't tried; leaving drops what was found.
  sendJson(guest, { type: 'addresses', list: [...Array(8).fill(refused), good] });
  assert.deepEqual(await host.next(), { type: 'artists-now', subs: [], hostable: {} });
  sendJson(guest, { type: 'addresses', list: [good] });
  assert.deepEqual((await host.next()).hostable, { [ana.sub]: [good] });
  guest.close();
  assert.equal((await host.next()).type, 'peer-gone');
  sendJson(host, { type: 'artists', subs: [], tag: 1 });
  assert.deepEqual((await host.next()).hostable, {});
});

test('addresses sent again within ten seconds aren\'t probed again', async () => {
  const probed = [];
  const s = await service({ probe: (address) => probed.push(address) && probeAddress(address) });
  const { ws: host } = await hosting(s, await person('Host'));
  const ana = await person();
  const { ws: guest } = await letIn(s, host, ana);
  const good = await standbyFor(ana);
  sendJson(guest, { type: 'addresses', list: [good] });
  assert.deepEqual((await host.next()).hostable, { [ana.sub]: [good] });
  for (let i = 0; i < 5; i++) sendJson(guest, { type: 'addresses', list: [good] });   // the round before is over
  await wait(100);
  sendJson(host, { type: 'artists', subs: [], tag: 1 });
  assert.equal((await host.next()).tag, 1);   // no second artists-now came first
  assert.deepEqual(probed, [good]);
});

test('hand-over names the artist with their addresses and closes every room socket', async () => {
  const s = await service();
  const { ws: host } = await hosting(s, await person('Host'));
  const ana = await person('Ana');
  const { ws: artist, joined } = await letIn(s, host, ana);
  const { ws: bo } = await letIn(s, host, await person('Bo'));
  const channel = hostChannel(s, joined.peer);
  await channel.ready;
  sendJson(host, { type: 'artists', subs: [ana.sub] });
  await host.next();
  const address = await standbyFor(ana);
  sendJson(artist, { type: 'addresses', list: [address] });
  await host.next();

  sendJson(host, { type: 'hand-over', to: ana.sub });
  const said = { type: 'new-host', name: 'Ana', sub: ana.sub, planned: true, addresses: [address] };
  for (const ws of [host, artist, bo]) {
    assert.deepEqual(await ws.next(), said);
    assert.deepEqual(await ws.closed, { code: 1000, reason: 'new-host' });
  }
  assert.equal((await channel.closed).code, 1000);
  assert.equal(s.room(), null);
  assert.equal(s.mode(), 'standby');
  assert.equal((await client(s.port, '/info').next()).id, null);
  await assert.rejects(client(s.port).ready);
});

test('hand-over refuses waiting asks moved', async () => {
  const s = await service();
  const { ws: host } = await hosting(s, await person('Host'));
  const ana = await person();
  const { ws: artist } = await letIn(s, host, ana);
  sendJson(host, { type: 'artists', subs: [ana.sub] });
  await host.next();
  sendJson(artist, { type: 'addresses', list: [await standbyFor(ana)] });
  await host.next();
  const asker = await joining(s, await person('Bo'));
  await asker.next();
  await host.next();

  sendJson(host, { type: 'hand-over', to: ana.sub });
  const { msg, closed } = await refusal(asker);
  assert.deepEqual(msg, { type: 'refused', reason: 'moved' });
  assert.equal(closed.code, 1008);
});

test('hand-over to an artist with no hostable address does nothing', async () => {
  const s = await service();
  const { ws: host } = await hosting(s, await person('Host'));
  const [ana, bo] = [await person('Ana'), await person('Bo')];
  const { ws: anas } = await letIn(s, host, ana);
  await letIn(s, host, bo);

  // Ana could host, but isn't an artist; Bo is an artist with nowhere to host.
  sendJson(anas, { type: 'addresses', list: [await standbyFor(ana)] });
  await nextOf(host, 'artists-now');
  sendJson(host, { type: 'artists', subs: [bo.sub], tag: 1 });
  await host.next();
  for (const to of [ana.sub, bo.sub]) sendJson(host, { type: 'hand-over', to });
  sendJson(host, { type: 'artists', subs: [bo.sub], tag: 2 });
  assert.equal((await host.next()).tag, 2);
  assert.equal(s.room().id, ROOM.id);
  assert.equal(s.mode(), 'host');
  assert.equal(anas.readyState, WebSocket.OPEN);
});

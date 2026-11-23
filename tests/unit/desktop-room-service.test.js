// The desktop room service: the room API (as RoomStore speaks it) served from this machine, with the host
// approving every join. Real sockets on real ports, real self-signed passes.
import { test, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import net from 'node:net';
import WebSocket from 'ws';
import { isLoopback } from '../../desktop/roomService.js';
import { ROOM, SECRET, opened, closeAll, person, service, client, greet, hosting, joining, letIn, refusal } from '../support/desktopRoom.js';

afterEach(closeAll);

test('info names the room and whether it has a password', async () => {
  const s = await service();
  let info = client(s.port, '/info');
  assert.deepEqual(await info.next(), { type: 'info', protocol: 1, id: null, name: null, password: false });
  assert.equal((await info.closed).code, 1000);
  await hosting(s, await person('Host'), { ...ROOM, password: 'pw' });
  info = client(s.port, '/info');
  assert.deepEqual(await info.next(), { type: 'info', protocol: 1, id: 'r_1', name: 'neon harbor', password: true });
  assert.equal(s.room().id, 'r_1');
});

test('host greeting needs loopback and the secret', async () => {
  const s = await service();
  const owner = await person('Host');
  for (const secret of ['wrong', undefined]) {
    const ws = client(s.port);
    await greet(ws, owner, 'host', ROOM.id, { secret, room: ROOM });
    const { msg, closed } = await refusal(ws);
    assert.deepEqual(msg, { type: 'refused', reason: 'not-host' });
    assert.equal(closed.code, 1008);
  }
  assert.equal(s.room(), null);
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(isLoopback(address), true);
  for (const address of ['192.168.1.20', '::ffff:192.168.1.20', 'fe80::1', undefined]) assert.equal(isLoopback(address), false);
});

test('a join waits, the host is asked, and yes joins', async () => {
  const s = await service();
  const { ws: host, msg } = await hosting(s, await person('Host'));
  assert.deepEqual(msg, { type: 'hosting', room: { id: 'r_1', name: 'neon harbor', welcome: 'hi', max: 12, count: 0 }, peers: [] });
  const ana = await person('Ana');
  const guest = await joining(s, ana);
  assert.deepEqual(await guest.next(), { type: 'waiting' });
  const asking = await host.next();
  assert.equal(asking.type, 'asking');
  assert.equal(asking.pass, ana.pass);
  host.send(JSON.stringify({ type: 'answer', ask: asking.ask, yes: true }));
  const joined = await guest.next();
  assert.equal(joined.type, 'joined');
  assert.equal(joined.id, 'r_1');
  assert.equal(typeof joined.token, 'string');
  assert.ok(joined.token.length >= 16);
  assert.equal(joined.hostName, 'Host');
  assert.deepEqual(joined.artists, []);
  assert.deepEqual(await host.next(), { type: 'peer', peer: joined.peer, pass: ana.pass });
  assert.equal(s.room().count, 1);

  // The host signals a guest; a guest's signals go nowhere (a socket peer's guest has none to send, and the host's
  // page isn't to be flooded with them). A guest's socket closing tells the host.
  host.send(JSON.stringify({ type: 'signal-to', to: joined.peer, data: { a: 1 } }));
  assert.deepEqual(await guest.next(), { type: 'signal-from', from: 'host', data: { a: 1 } });
  guest.send(JSON.stringify({ type: 'signal-to', data: { b: 2 } }));
  guest.close();
  assert.deepEqual(await host.next(), { type: 'peer-gone', peer: joined.peer });
});

test('no answers turned-away', async () => {
  const s = await service();
  const { ws: host } = await hosting(s, await person('Host'));
  const guest = await joining(s, await person());
  await guest.next();
  const { ask } = await host.next();
  host.send(JSON.stringify({ type: 'answer', ask, yes: false }));
  const { msg, closed } = await refusal(guest);
  assert.deepEqual(msg, { type: 'refused', reason: 'turned-away' });
  assert.equal(closed.code, 1008);
});

test('a waiting ask that closes is withdrawn', async () => {
  const s = await service();
  const { ws: host } = await hosting(s, await person('Host'));
  const guest = await joining(s, await person());
  await guest.next();
  const { ask } = await host.next();
  guest.close();
  assert.deepEqual(await host.next(), { type: 'ask-gone', ask });

  // Asking again from a second socket takes the first ask's place.
  const ana = await person();
  const first = await joining(s, ana);
  await first.next();
  const asked = await host.next();
  const second = await joining(s, ana);
  assert.deepEqual(await second.next(), { type: 'waiting' });
  assert.deepEqual(await first.next(), { type: 'replaced' });
  assert.deepEqual(await host.next(), { type: 'ask-gone', ask: asked.ask });
  assert.equal((await host.next()).type, 'asking');
});

test('an approved sub rejoins without asking and without the password', async () => {
  const s = await service();
  const ana = await person();
  const { ws: host } = await hosting(s, await person('Host'), { ...ROOM, password: 'pw', approved: [ana.sub] });
  const first = await joining(s, ana);
  const joined = await first.next();
  assert.equal(joined.type, 'joined');
  assert.equal((await host.next()).type, 'peer');

  // Again, from a second socket: the first is replaced.
  const second = await joining(s, ana);
  assert.equal((await second.next()).type, 'joined');
  assert.deepEqual(await first.next(), { type: 'replaced' });
  assert.equal((await first.closed).code, 1000);
  assert.deepEqual(await host.next(), { type: 'peer-gone', peer: joined.peer });
  assert.equal((await host.next()).type, 'peer');

  // Let in by the host counts as approved too.
  const bo = await person('Bo');
  const { ws: bos } = await letIn(s, host, bo, { password: 'pw' });
  bos.close();
  await host.next();
  const again = await joining(s, bo);
  assert.equal((await again.next()).type, 'joined');
});

test('remove drops approval', async () => {
  const s = await service();
  const { ws: host } = await hosting(s, await person('Host'));
  const ana = await person();
  const { ws, joined } = await letIn(s, host, ana);
  host.send(JSON.stringify({ type: 'remove', peer: joined.peer }));
  assert.deepEqual(await ws.next(), { type: 'removed' });
  assert.equal((await ws.closed).code, 1000);
  assert.deepEqual(s.room().approved, []);
  const back = await joining(s, ana);
  assert.deepEqual(await back.next(), { type: 'waiting' });
  assert.equal((await host.next()).type, 'asking');
});

test('wrong-password, full and unavailable refuse with those reasons', async () => {
  const s = await service();
  const nobody = await joining(s, await person());
  assert.deepEqual((await refusal(nobody)).msg, { type: 'refused', reason: 'unavailable' });

  const ana = await person();
  const { ws: host } = await hosting(s, await person('Host'), { ...ROOM, password: 'pw', max: 1, approved: [ana.sub] });
  const wrongId = client(s.port);
  await greet(wrongId, ana, 'join', 'r_2', { room: 'r_2' });
  assert.deepEqual((await refusal(wrongId)).msg, { type: 'refused', reason: 'unavailable' });

  for (const password of [undefined, 'nope']) {
    const ws = await joining(s, await person(), { password });
    const { msg, closed } = await refusal(ws);
    assert.deepEqual(msg, { type: 'refused', reason: 'wrong-password' });
    assert.equal(closed.code, 1008);
  }

  await joining(s, ana).then((ws) => ws.next());
  await host.next();
  const late = await joining(s, await person(), { password: 'pw' });
  assert.deepEqual((await refusal(late)).msg, { type: 'refused', reason: 'full' });
  // Not full for ana's own second socket, which takes the first one's place.
  assert.equal((await (await joining(s, ana)).next()).type, 'joined');

  host.send(JSON.stringify({ type: 'settings', max: 2 }));
  assert.equal((await (await joining(s, await person(), { password: 'pw' })).next()).type, 'waiting');

  host.send(JSON.stringify({ type: 'end' }));
  const ended = await (async () => { let msg; do msg = await host.next(); while (msg.type !== 'ended'); return msg; })();
  assert.deepEqual(ended, { type: 'ended' });
  assert.equal(s.room(), null);
  const after = await joining(s, ana);
  assert.deepEqual((await refusal(after)).msg, { type: 'refused', reason: 'unavailable' });
});

test('end tells everyone ended', async () => {
  const s = await service();
  const { ws: host } = await hosting(s, await person('Host'));
  const { ws: guest } = await letIn(s, host, await person());
  const asker = await joining(s, await person('Bo'));
  await asker.next();
  await host.next();
  host.send(JSON.stringify({ type: 'end' }));
  for (const ws of [host, guest, asker]) {
    assert.deepEqual(await ws.next(), { type: 'ended' });
    assert.equal((await ws.closed).code, 1000);
  }
});

test('closing the service ends the room first: everyone hears ended', async () => {
  const s = await service();
  const { ws: host } = await hosting(s, await person('Host'));
  const { ws: guest } = await letIn(s, host, await person());
  const asker = await joining(s, await person('Bo'));
  await asker.next();
  await host.next();
  await s.close();
  for (const ws of [host, guest, asker]) assert.deepEqual(await ws.next(), { type: 'ended' });
});

test('refuses busy past five waiting asks', async () => {
  const s = await service();
  const { ws: host } = await hosting(s, await person('Host'));
  for (let i = 0; i < 5; i++) {
    const ws = await joining(s, await person(`p${i}`));
    assert.deepEqual(await ws.next(), { type: 'waiting' });
    assert.equal((await host.next()).type, 'asking');
  }
  const sixth = await joining(s, await person('p5'));
  const { msg, closed } = await refusal(sixth);
  assert.deepEqual(msg, { type: 'refused', reason: 'busy' });
  assert.equal(closed.code, 1008);

  // An approved sub isn't one more ask: it still goes in.
  const ana = await person();
  const ok = await service();
  const { ws: okHost } = await hosting(ok, await person('Host'), { ...ROOM, approved: [ana.sub] });
  for (let i = 0; i < 5; i++) await (await joining(ok, await person(`q${i}`))).next();
  const ws = await joining(ok, ana);
  assert.equal((await ws.next()).type, 'joined');
  okHost.terminate();
});

test('resends waiting asks to a host that greets again', async () => {
  const s = await service();
  const owner = await person('Host');
  const { ws: first } = await hosting(s, owner);
  const ana = await person();
  const { ws: inside, joined } = await letIn(s, first, ana);
  const bo = await person('Bo');
  const asker = await joining(s, bo);
  await asker.next();
  const { ask } = await first.next();
  first.send(JSON.stringify({ type: 'artists', subs: [ana.sub], tag: 1 }));
  assert.deepEqual(await first.next(), { type: 'artists-now', subs: [ana.sub], tag: 1, hostable: {} });

  const { ws: second, msg } = await hosting(s, owner);
  assert.deepEqual(msg.peers, [{ peer: joined.peer, pass: ana.pass }]);
  assert.deepEqual(await second.next(), { type: 'asking', ask, pass: bo.pass });
  assert.deepEqual(await second.next(), { type: 'artists-now', subs: [ana.sub], hostable: {} });
  assert.deepEqual(await first.closed, { code: 1000, reason: 'replaced' });

  // The new host's yes lets the guest in, who was never dropped; the one inside stayed.
  second.send(JSON.stringify({ type: 'answer', ask, yes: true }));
  assert.equal((await asker.next()).type, 'joined');
  assert.equal(inside.readyState, WebSocket.OPEN);
});

test('the host socket closing keeps the room', async () => {
  const s = await service();
  const owner = await person('Host');
  const { ws: host } = await hosting(s, owner);
  const { ws: guest } = await letIn(s, host, await person());
  host.close();
  await host.closed;
  assert.equal(s.room().id, 'r_1');
  const { msg } = await hosting(s, owner);
  assert.equal(msg.peers.length, 1);
  assert.equal(guest.readyState, WebSocket.OPEN);
});

test('a stale proof or another key\'s pass is refused bad-pass', async () => {
  const s = await service();
  const owner = await person('Host');
  const stale = client(s.port);
  await greet(stale, owner, 'host', ROOM.id, { secret: SECRET, room: ROOM }, Date.now() - 61_000);
  assert.deepEqual((await refusal(stale)).msg, { type: 'refused', reason: 'bad-pass' });
  await hosting(s, owner);

  const [ana, eve] = [await person(), await person('Eve')];
  const borrowed = client(s.port);
  await greet(borrowed, { ...eve, pass: ana.pass }, 'join', ROOM.id, { room: ROOM.id });
  const { msg, closed } = await refusal(borrowed);
  assert.deepEqual(msg, { type: 'refused', reason: 'bad-pass' });
  assert.equal(closed.code, 1008);

  const junk = client(s.port);
  await greet(junk, { ...ana, pass: 'not.a-pass' }, 'join', ROOM.id, { room: ROOM.id });
  assert.deepEqual((await refusal(junk)).msg, { type: 'refused', reason: 'bad-pass' });
});

test('version mismatch refuses version with our protocol', async () => {
  const s = await service();
  const ws = client(s.port);
  await greet(ws, await person(), 'join', ROOM.id, { room: ROOM.id, protocol: 2 });
  const { msg, closed } = await refusal(ws);
  assert.deepEqual(msg, { type: 'refused', reason: 'version', protocol: 1 });
  assert.equal(closed.code, 1008);
});

test('the port falls back when taken, and NO_PORT past twenty', async () => {
  // Below the ports the system hands out for outgoing connections (Linux from 32768, macOS from 49152), so nothing else
  // takes these while the test runs; one taken all the same is as occupied as one the test holds.
  const base = 20_000 + Math.floor(Math.random() * 10_000);
  const occupy = (port) => new Promise((resolve, reject) => {
    const server = net.createServer().once('error', (error) => (error.code === 'EADDRINUSE' ? resolve(null) : reject(error))).listen(port, '127.0.0.1', () => {
      opened.push(() => new Promise((done) => server.close(done)));
      resolve(server);
    });
  });
  await occupy(base);
  const s = await service({ port: base });
  assert.ok(s.port > base && s.port < base + 20, `${s.port} after ${base}`); // the next free one: base + 1, unless that's taken too
  await s.close();
  for (let port = base + 1; port < base + 20; port++) await occupy(port);
  await assert.rejects(service({ port: base }), { code: 'NO_PORT' });
});

test('a malformed upgrade is dropped, and the service carries on', async () => {
  const s = await service();
  const raw = net.connect(s.port, '127.0.0.1');
  opened.push(() => raw.destroy());
  raw.write('GET //[ HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n');
  await new Promise((resolve) => raw.on('close', resolve));
  const info = client(s.port, '/info');
  assert.equal((await info.next()).type, 'info');
});

test('ping is answered pong', async () => {
  const s = await service();
  const ws = client(s.port);
  await ws.ready;
  ws.send('ping');
  assert.equal(await ws.next(), 'pong');
});

test('a socket that doesn\'t greet in time is closed 1008, and one that did stays', async () => {
  const s = await service({ greetWithinMs: 200 });
  const silent = client(s.port);
  const { ws: host } = await hosting(s, await person('Host'));
  assert.equal((await silent.closed).code, 1008);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(host.readyState, WebSocket.OPEN);
});

test('past 32 sockets that haven\'t greeted, a new one is refused', async () => {
  const s = await service();
  const silent = Array.from({ length: 32 }, () => client(s.port));
  await Promise.all(silent.map((ws) => ws.ready));
  const extra = client(s.port);
  await assert.rejects(extra.ready);
  // A greeting frees its place.
  const owner = await person('Host');
  await greet(silent[0], owner, 'host', ROOM.id, { secret: SECRET, room: ROOM });
  assert.equal((await silent[0].next()).type, 'hosting');
  await client(s.port).ready;
});

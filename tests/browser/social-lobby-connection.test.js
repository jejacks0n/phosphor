// The lobby's websocket: it says hello with the pass and a proof, reconnects with backoff after a drop
// (a fresh hello, a fresh state), stops on a refused pass or close(). A fake WebSocket class stands in
// for the server; the keys are real, so the proof verifies with WebCrypto.
import { test, expect, vi } from 'vitest';
import { LobbyConnection, Pacer, emptyLobby, applyLobbyMessage } from '@/social/lobby';
import { loadKey } from '@/social/keys';
import { fromBase64url } from '@/social/base64url';

const verify = async (publicKey, message, signature) => {
  const key = await crypto.subtle.importKey('raw', fromBase64url(publicKey), { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify('Ed25519', key, fromBase64url(signature), new TextEncoder().encode(message));
};

const room = (id) => ({
  id, name: `Room ${id}`, host: 'ansi-fan', count: 1, max: 12, allowGuests: true, signal: null,
  liveSince: 1000, thumbnail: null, blockedInside: false,
});

// A connection on fake sockets, a fake wait and fake timers: `sockets` are the sockets it made, in order;
// `waits` the backoff waits it asked for, each resolved by the test with `waits[i].done()`; `timers` the
// heartbeat's timers, run by the test with `fire(timers, ms)`.
async function connect(options = {}) {
  const key = await loadKey();
  const sockets = [];
  const waits = [];
  const statuses = [];
  const messages = [];
  const timers = [];
  const passes = ['pass-1', 'pass-2', 'pass-3', 'pass-4'];
  let lobby = emptyLobby();
  let failures = 0;
  class FakeSocket {
    constructor(url) {
      if (failures > 0) {
        failures--;
        throw new DOMException('The network is down', 'SyntaxError');
      }
      Object.assign(this, { url, sent: [], closed: false });
      sockets.push(this);
    }
    send(text) { this.sent.push(text === 'ping' ? text : JSON.parse(text)); }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.onclose?.({ code: 1000 });
    }
    // The server's side.
    serverClose(reason) {
      this.closed = true;
      this.onclose?.({ code: 1000, reason });
    }
    accept() { this.onopen?.({}); }
    receive(msg) { this.onmessage?.({ data: typeof msg === 'string' ? msg : JSON.stringify(msg) }); }
  }
  const getPass = vi.fn(async () => ({ pass: passes[getPass.mock.calls.length - 1], privateKey: key.privateKey }));
  const conn = new LobbyConnection({
    url: 'ws://localhost:8787/lobby',
    getPass,
    onMessage: (msg) => { messages.push(msg); lobby = applyLobbyMessage(lobby, msg); },
    onStatus: (status) => statuses.push(status),
    WebSocketImpl: FakeSocket,
    wait: (ms) => new Promise((done) => waits.push({ ms, done })),
    setTimer: (fn, ms) => {
      const timer = { fn, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => { if (timer) timer.cleared = true; },
    ...options,
  });
  const failNextSocket = () => { failures++; };
  return { conn, key, sockets, waits, statuses, messages, timers, getPass, failNextSocket, lobby: () => lobby };
}

// The heartbeat timers still waiting, by length; fire() runs the one waiting for ms.
const pending = (timers) => timers.filter((t) => !t.cleared && !t.fired).map((t) => t.ms);
const fire = (timers, ms) => {
  const timer = timers.find((t) => !t.cleared && !t.fired && t.ms === ms);
  timer.fired = true;
  timer.fn();
};

// The socket's hello, once the pass and the proof are in.
const helloOn = async (socket) => {
  await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
  return socket.sent[0];
};

test('On open it says hello with the pass and a proof over lobby:<ts>; a state makes it live', async () => {
  const { conn, key, sockets, statuses, lobby } = await connect();
  conn.open();
  expect(statuses).toEqual(['connecting']);
  expect(sockets).toHaveLength(1);
  expect(sockets[0].url).toBe('ws://localhost:8787/lobby');
  sockets[0].accept();

  const hello = await helloOn(sockets[0]);
  expect(hello).toMatchObject({ type: 'hello', pass: 'pass-1' });
  expect(Math.abs(hello.ts - Date.now())).toBeLessThan(5000);
  expect(await verify(key.publicKey, `lobby:${hello.ts}`, hello.proof)).toBe(true);

  sockets[0].receive({ type: 'state', rooms: [room('r1')], people: [] });
  expect(statuses).toEqual(['connecting', 'live']);
  expect([...lobby().rooms.keys()]).toEqual(['r1']);

  expect(conn.send({ type: 'settings', allowGuests: false, max: 4 })).toBe(true);
  expect(sockets[0].sent[1]).toEqual({ type: 'settings', allowGuests: false, max: 4 });
  conn.close();
});

test('A message that isn\'t JSON, or isn\'t a message, is ignored', async () => {
  const { conn, sockets, messages, statuses } = await connect();
  conn.open();
  sockets[0].accept();
  await helloOn(sockets[0]);
  sockets[0].receive('not json {');
  sockets[0].receive('null');
  sockets[0].receive('42');
  sockets[0].receive({ type: 'state', rooms: [], people: [] });
  expect(messages.map((m) => m.type)).toEqual(['state']);
  expect(statuses.at(-1)).toBe('live');
  conn.close();
});

test('A drop reconnects after 1 s, then 2 s, with a fresh pass and hello; the next state replaces the old rooms and resets the backoff', async () => {
  const { conn, sockets, waits, statuses, getPass, lobby } = await connect();
  conn.open();
  sockets[0].accept();
  await helloOn(sockets[0]);
  sockets[0].receive({ type: 'state', rooms: [room('before')], people: [] });

  sockets[0].close();   // a deploy, the Wi-Fi
  expect(statuses).toEqual(['connecting', 'live', 'reconnecting']);
  expect(waits.map((w) => w.ms)).toEqual([1000]);
  expect(sockets).toHaveLength(1);
  waits[0].done();
  await vi.waitFor(() => expect(sockets).toHaveLength(2));

  sockets[1].close();   // the server isn't back yet
  expect(waits.map((w) => w.ms)).toEqual([1000, 2000]);
  waits[1].done();
  await vi.waitFor(() => expect(sockets).toHaveLength(3));
  expect(statuses).toEqual(['connecting', 'live', 'reconnecting']);   // still reconnecting, not connecting again

  sockets[2].accept();
  const hello = await helloOn(sockets[2]);
  expect(hello.pass).toBe('pass-2');   // getPass is asked before every hello, so a renewed pass is used
  expect(getPass).toHaveBeenCalledTimes(2);
  sockets[2].receive({ type: 'state', rooms: [room('after')], people: [] });
  expect(statuses.at(-1)).toBe('live');
  expect([...lobby().rooms.keys()]).toEqual(['after']);

  sockets[2].close();   // the backoff starts again at 1 s
  expect(waits.map((w) => w.ms)).toEqual([1000, 2000, 1000]);
  conn.close();
});

test('The backoff doubles up to 30 s', async () => {
  const { conn, sockets, waits } = await connect();
  conn.open();
  for (let i = 0; i < 7; i++) {
    sockets[i].close();
    waits[i].done();
    await vi.waitFor(() => expect(sockets).toHaveLength(i + 2));
  }
  expect(waits.map((w) => w.ms)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  conn.close();
});

test('A refused pass doesn\'t retry', async () => {
  const { conn, sockets, waits, statuses } = await connect();
  conn.open();
  sockets[0].accept();
  await helloOn(sockets[0]);
  sockets[0].receive({ type: 'refused', code: 'bad-pass' });
  sockets[0].close();   // the server closes it after
  expect(statuses).toEqual(['connecting', 'refused']);
  expect(waits).toHaveLength(0);
  expect(sockets).toHaveLength(1);
});

test('close() stops the retries, and messages after it are ignored', async () => {
  const { conn, sockets, waits, statuses, messages } = await connect();
  conn.open();
  sockets[0].accept();
  await helloOn(sockets[0]);
  sockets[0].receive({ type: 'state', rooms: [], people: [] });
  const live = sockets[0];
  sockets[0].close();
  expect(waits).toHaveLength(1);

  conn.close();
  expect(statuses).toEqual(['connecting', 'live', 'reconnecting', 'closed']);
  waits[0].done();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(sockets).toHaveLength(1);

  live.receive({ type: 'room', room: room('late') });
  expect(messages.map((m) => m.type)).toEqual(['state']);
});

test('close() while live closes the socket and ignores what comes after; send() then does nothing', async () => {
  const { conn, sockets, waits, statuses, messages } = await connect();
  conn.open();
  sockets[0].accept();
  await helloOn(sockets[0]);
  sockets[0].receive({ type: 'state', rooms: [], people: [] });
  conn.close();
  expect(sockets[0].closed).toBe(true);
  expect(statuses).toEqual(['connecting', 'live', 'closed']);
  expect(waits).toHaveLength(0);
  sockets[0].receive({ type: 'room', room: room('late') });
  expect(messages).toHaveLength(1);
  expect(conn.send({ type: 'settings', allowGuests: false, max: 4 })).toBe(false);
  expect(sockets[0].sent).toHaveLength(1);
});

test('send() says false and sends nothing until live, and while reconnecting', async () => {
  const { conn, sockets } = await connect();
  conn.open();
  sockets[0].accept();
  await helloOn(sockets[0]);
  expect(conn.send({ type: 'settings', allowGuests: false, max: 4 })).toBe(false);
  sockets[0].receive({ type: 'state', rooms: [], people: [] });
  sockets[0].close();
  expect(conn.send({ type: 'settings', allowGuests: false, max: 4 })).toBe(false);
  expect(sockets[0].sent).toHaveLength(1);
  conn.close();
});

test('open() again closes the old socket first: only the new one says hello', async () => {
  const { conn, sockets, waits, statuses } = await connect();
  conn.open();
  sockets[0].accept();
  conn.open();   // its hello still in flight
  expect(sockets[0].closed).toBe(true);
  sockets[1].accept();
  await helloOn(sockets[1]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(sockets[0].sent).toHaveLength(0);

  sockets[1].receive({ type: 'state', rooms: [], people: [] });
  conn.open();   // live, as when a guest signs in
  expect(sockets[1].closed).toBe(true);
  expect(sockets).toHaveLength(3);
  expect(statuses).toEqual(['connecting', 'live', 'connecting']);
  expect(waits).toHaveLength(0);
  conn.close();
});

test('A socket that can\'t be made is retried like a drop', async () => {
  const { conn, sockets, waits, statuses, failNextSocket } = await connect();
  conn.open();
  sockets[0].close();
  failNextSocket();
  waits[0].done();
  await vi.waitFor(() => expect(waits.map((w) => w.ms)).toEqual([1000, 2000]));
  expect(sockets).toHaveLength(1);
  expect(statuses.at(-1)).toBe('reconnecting');
  waits[1].done();
  await vi.waitFor(() => expect(sockets).toHaveLength(2));
  conn.close();
});

test('Live, it pings every 30 s and a pong keeps it; no pong within 10 s is a drop, retried', async () => {
  const { conn, sockets, waits, statuses, messages, timers } = await connect();
  conn.open();
  sockets[0].accept();
  await helloOn(sockets[0]);
  sockets[0].receive({ type: 'state', rooms: [], people: [] });
  expect(pending(timers)).toEqual([30_000]);
  fire(timers, 30_000);
  expect(sockets[0].sent.at(-1)).toBe('ping');
  expect(pending(timers)).toEqual([10_000]);
  sockets[0].receive('pong');   // plain text, not JSON
  expect(pending(timers)).toEqual([30_000]);
  expect(messages.map((m) => m.type)).toEqual(['state']);

  fire(timers, 30_000);
  fire(timers, 10_000);   // no pong: a socket that's gone without a close
  expect(sockets[0].closed).toBe(true);
  expect(statuses).toEqual(['connecting', 'live', 'reconnecting']);
  expect(waits.map((w) => w.ms)).toEqual([1000]);
  expect(pending(timers)).toEqual([]);
  waits[0].done();
  await vi.waitFor(() => expect(sockets).toHaveLength(2));
  conn.close();
});

test('No state within 10 s of the hello is a drop, retried; close() leaves no heartbeat waiting', async () => {
  const { conn, sockets, waits, statuses, timers } = await connect();
  conn.open();
  sockets[0].accept();
  await helloOn(sockets[0]);
  expect(pending(timers)).toEqual([10_000]);
  fire(timers, 10_000);
  expect(sockets[0].closed).toBe(true);
  expect(statuses).toEqual(['connecting', 'reconnecting']);
  expect(waits.map((w) => w.ms)).toEqual([1000]);

  waits[0].done();
  await vi.waitFor(() => expect(sockets).toHaveLength(2));
  sockets[1].accept();
  await helloOn(sockets[1]);
  sockets[1].receive({ type: 'state', rooms: [], people: [] });
  conn.close();
  expect(pending(timers)).toEqual([]);
});

test('A Pacer on the browser\'s own clock and timers sends the latest after the interval; reset() clears what waits', async () => {
  const sent = [];
  const pacer = new Pacer(50, (value) => sent.push(value) > 0);
  pacer.push('chat');
  pacer.push('feedback');
  pacer.push('heads-down');
  expect(sent).toEqual(['chat']);
  await vi.waitFor(() => expect(sent).toEqual(['chat', 'heads-down']));

  pacer.push('feedback');
  pacer.reset();
  await new Promise((resolve) => setTimeout(resolve, 120));
  expect(sent).toEqual(['chat', 'heads-down']);
});

// A room's socket: its own greeting, what makes it live and what ends it.
const roomOptions = { greet: async (pass) => ({ type: 'join', pass, peer: 'p1' }), liveOn: ['joined'], endOn: ['refused', 'removed', 'ended'] };

test('With greet and liveOn it sends its own greeting on open and goes live on joined, not on state', async () => {
  const { conn, sockets, statuses, timers } = await connect(roomOptions);
  conn.open();
  sockets[0].accept();
  expect(await helloOn(sockets[0])).toEqual({ type: 'join', pass: 'pass-1', peer: 'p1' });
  sockets[0].receive({ type: 'state', rooms: [], people: [] });
  expect(statuses).toEqual(['connecting']);
  expect(pending(timers)).toEqual([10_000]);   // still waiting for joined
  sockets[0].receive({ type: 'joined' });
  expect(statuses).toEqual(['connecting', 'live']);
  expect(pending(timers)).toEqual([30_000]);
  conn.close();
});

test('No joined within 10 s of the greeting is a drop, retried; a drop retries with a fresh greeting', async () => {
  const { conn, sockets, waits, statuses, timers } = await connect(roomOptions);
  conn.open();
  sockets[0].accept();
  await helloOn(sockets[0]);
  fire(timers, 10_000);
  expect(statuses).toEqual(['connecting', 'reconnecting']);
  waits[0].done();
  await vi.waitFor(() => expect(sockets).toHaveLength(2));
  sockets[1].accept();
  expect((await helloOn(sockets[1])).pass).toBe('pass-2');
  conn.close();
});

test('A message in endOn reaches onMessage, then ends it as closed without a retry; a refused ends as refused', async () => {
  const { conn, sockets, waits, statuses, messages } = await connect(roomOptions);
  conn.open();
  sockets[0].accept();
  await helloOn(sockets[0]);
  sockets[0].receive({ type: 'joined' });
  sockets[0].receive({ type: 'ended' });
  expect(messages.map((m) => m.type)).toEqual(['joined', 'ended']);
  expect(statuses).toEqual(['connecting', 'live', 'closed']);
  expect(sockets[0].closed).toBe(true);
  expect(waits).toHaveLength(0);
  expect(sockets).toHaveLength(1);

  conn.open();
  sockets[1].accept();
  await helloOn(sockets[1]);
  sockets[1].receive({ type: 'refused', code: 'full' });
  expect(messages.at(-1)).toEqual({ type: 'refused', code: 'full' });
  expect(statuses.at(-1)).toBe('refused');
  expect(waits).toHaveLength(0);
});

test('a close whose reason is in endOn ends it, with no retry', async () => {
  const { conn, sockets, waits, statuses, messages } = await connect({ ...roomOptions, endOn: ['refused', 'removed', 'ended', 'replaced'] });
  conn.open();
  sockets[0].accept();
  await helloOn(sockets[0]);
  sockets[0].receive({ type: 'joined' });
  sockets[0].serverClose('replaced');
  expect(messages.map((m) => m.type)).toEqual(['joined', 'replaced']);
  expect(statuses).toEqual(['connecting', 'live', 'closed']);
  expect(waits).toHaveLength(0);
  expect(sockets).toHaveLength(1);
});

test('a close with any other reason retries', async () => {
  const { conn, sockets, waits, statuses, messages } = await connect({ ...roomOptions, endOn: ['refused', 'removed', 'ended', 'replaced'] });
  conn.open();
  sockets[0].accept();
  await helloOn(sockets[0]);
  sockets[0].receive({ type: 'joined' });
  sockets[0].serverClose('gone');
  expect(messages.map((m) => m.type)).toEqual(['joined']);
  expect(statuses).toEqual(['connecting', 'live', 'reconnecting']);
  waits[0].done();
  await vi.waitFor(() => expect(sockets).toHaveLength(2));
  conn.close();
});

test('a close whose reason isn\'t in endOn retries, even if it names an end the lobby doesn\'t take', async () => {
  const { conn, sockets, waits, messages } = await connect();   // the lobby's endOn is only refused
  conn.open();
  sockets[0].accept();
  await helloOn(sockets[0]);
  sockets[0].serverClose('replaced');
  expect(messages).toEqual([]);
  expect(waits).toHaveLength(1);
  conn.close();
});

test('A handler that throws on a message in endOn still leaves it ended, with the socket closed', async () => {
  const { conn, sockets, waits, statuses } = await connect({
    ...roomOptions,
    onMessage: (msg) => { if (msg.type === 'ended') throw new Error('the handler broke'); },
  });
  conn.open();
  sockets[0].accept();
  await helloOn(sockets[0]);
  sockets[0].receive({ type: 'joined' });
  expect(() => sockets[0].receive({ type: 'ended' })).toThrow('the handler broke');
  expect(statuses).toEqual(['connecting', 'live', 'closed']);
  expect(sockets[0].closed).toBe(true);
  expect(waits).toHaveLength(0);
});

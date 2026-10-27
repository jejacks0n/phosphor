// The lobby's websocket: it says hello with the pass and a proof, reconnects with backoff after a drop
// (a fresh hello, a fresh state), stops on a refused pass or close(). A fake WebSocket class stands in
// for the server; the keys are real, so the proof verifies with WebCrypto.
import { test, expect, vi } from 'vitest';
import { LobbyConnection, emptyLobby, applyLobbyMessage } from '@/social/lobby';
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

// A connection on fake sockets and a fake wait: `sockets` are the sockets it made, in order; `waits`
// the backoff waits it asked for, each resolved by the test with `waits[i].done()`.
async function connect() {
  const key = await loadKey();
  const sockets = [];
  const waits = [];
  const statuses = [];
  const messages = [];
  const passes = ['pass-1', 'pass-2', 'pass-3', 'pass-4'];
  let lobby = emptyLobby();
  class FakeSocket {
    constructor(url) {
      Object.assign(this, { url, sent: [], closed: false });
      sockets.push(this);
    }
    send(text) { this.sent.push(JSON.parse(text)); }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.onclose?.({ code: 1000 });
    }
    // The server's side.
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
  });
  return { conn, key, sockets, waits, statuses, messages, getPass, lobby: () => lobby };
}

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

  conn.send({ type: 'signal', signal: 'chat' });
  expect(sockets[0].sent[1]).toEqual({ type: 'signal', signal: 'chat' });
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
  conn.send({ type: 'signal', signal: 'chat' });
  expect(sockets[0].sent).toHaveLength(1);
});

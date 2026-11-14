// Helpers for the desktop room service's tests: real services on port 0, real ws clients, real self-signed passes.
// Whatever a helper opens is closed by closeAll (each test file's afterEach).
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createRoomService } from '../../desktop/roomService.js';
import { makeSelfPass } from '../../src/social/selfPass.js';
import { proof } from '../../src/social/keys.js';
import { toBase64url } from '../../src/social/base64url.js';

export const SECRET = 'the-secret';
export const ROOM = { id: 'r_1', name: 'neon harbor', welcome: 'hi', password: null, max: 12, approved: [] };
export const opened = [];   // closers, run newest first after each test

export async function closeAll() {
  for (const close of opened.splice(0).reverse()) await close();
}

export async function person(name = 'Ana') {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
  const publicKey = toBase64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  const { pass, claims } = await makeSelfPass({ privateKey: pair.privateKey, publicKey }, name);
  return { pass, sub: claims.sub, privateKey: pair.privateKey };
}

export async function service(options = {}) {
  const s = await createRoomService({ port: 0, host: '127.0.0.1', owner: { sub: 'me' }, secret: SECRET, ...options });
  opened.push(() => s.close());
  return s;
}

const json = (data) => {
  const text = data.toString();
  return text === 'pong' ? text : JSON.parse(text);
};

// A client socket whose messages queue up for next(), each read by `read`; closed resolves to { code, reason }.
export function client(port, path = '/room', read = json) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  opened.push(() => ws.terminate());
  const inbox = [], waiters = [];
  ws.on('message', (data, isBinary) => {
    const msg = read(data, isBinary);
    if (waiters.length) waiters.shift()(msg);
    else inbox.push(msg);
  });
  ws.next = () => (inbox.length ? Promise.resolve(inbox.shift()) : new Promise((resolve) => waiters.push(resolve)));
  ws.closed = new Promise((resolve) => ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() })));
  ws.ready = new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
  ws.ready.catch(() => {});   // a refused upgrade is a test's to look at, or not
  return ws;
}

export async function greet(ws, who, type, id, extra = {}, ts = Date.now()) {
  const signed = await proof(who.privateKey, (t) => `room:${id}:${t}`, ts);
  await ws.ready;
  ws.send(JSON.stringify({ type, pass: who.pass, ...signed, protocol: 1, ...extra }));
}

export async function hosting(s, owner, room = ROOM) {
  const ws = client(s.port);
  await greet(ws, owner, 'host', room.id, { secret: SECRET, room });
  const msg = await ws.next();
  assert.equal(msg.type, 'hosting');
  return { ws, msg };
}

export async function joining(s, who, extra = {}) {
  const ws = client(s.port);
  await greet(ws, who, 'join', ROOM.id, { room: ROOM.id, ...extra });
  return ws;
}

// Joined through the host's yes.
export async function letIn(s, host, who, extra) {
  const ws = await joining(s, who, extra);
  assert.equal((await ws.next()).type, 'waiting');
  const { ask } = await host.next();
  host.send(JSON.stringify({ type: 'answer', ask, yes: true }));
  const joined = await ws.next();
  assert.equal(joined.type, 'joined');
  assert.equal((await host.next()).type, 'peer');
  return { ws, joined };
}

export const refusal = async (ws) => ({ msg: await ws.next(), closed: await ws.closed });

// Chat over a room's channels: a Host and its Watches as in social-hosting.test.js (real WebRTC, a
// small relay for the Room's socket, passes signed by a test server key), but every person has a real
// browser key, named in their pass, that their messages are signed with. The host is checked by its
// watchers as much as they are by it.
import { test, expect, afterEach, vi } from 'vitest';
import { Host } from '@/social/hosting';
import { Watch } from '@/social/watching';
import { openPeer } from '@/social/peer';
import { newId, signedText } from '@/social/chat';
import { sign } from '@/social/keys';
import { toBase64url } from '@/social/base64url';

const config = { iceServers: [] };
const ROOM = 'abcdefgh23';
const later = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PATIENT = { timeout: 5000 };

const toClose = [];
afterEach(() => {
  for (const side of toClose.splice(0)) side.close();
  vi.restoreAllMocks();
});

const server = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const serverKey = toBase64url(new Uint8Array(await crypto.subtle.exportKey('raw', server.publicKey)));
const passKey = async () => serverKey;

// Someone with a browser key and a pass for it: { pass, claims, privateKey }. `signer` signs the pass
// (the server, unless it's made up), and `pair` is their browser key.
async function person(sub, { guest = false, verified = !guest, exp = Date.now() / 1000 + 3600, signer = server, pair } = {}) {
  pair ??= await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const key = toBase64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  const claims = { sub, name: sub, guest, verified, key, exp };
  const body = toBase64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', signer.privateKey, new TextEncoder().encode(body)));
  return { pass: `${body}.${toBase64url(signature)}`, claims, privateKey: pair.privateKey, pair };
}

// A message as its sender's browser makes it: { id, ts, text, sig }.
async function message(from, text, { id = newId(), ts = Date.now(), roomId = ROOM } = {}) {
  return { id, ts, text, sig: await sign(from.privateKey, signedText(roomId, { id, ts, text })) };
}

// A host and its watchers joined through the relay. `r.chat` is what the host's onChat got; each
// watcher's log has its onChat's events in `chat`.
async function room(people) {
  const r = { toHost: [], watchers: [], chat: [], log: {}, people };
  r.host = new Host({
    config, passKey, roomId: ROOM,
    send: async (msg) => {
      if (msg.type !== 'signal-to') return r.toHost.push(msg);
      await later();
      r.log[msg.to]?.watch.signalFrom('host', msg.data);
    },
    onWatchers: (list) => r.watchers.push(list),
    onChat: (event) => r.chat.push(event),
  });
  toClose.push(r.host);
  r.host.setRoom({ name: 'Night shift', welcome: 'Hi' });
  for (const peer of Object.keys(people)) await join(r, peer);
  return r;
}
async function join(r, peer) {
  r.log[peer] = watcher(r, peer);
  await r.host.peer(peer, r.people[peer].pass);
}
function watcher(r, peer) {
  const log = { chat: [], states: [] };
  log.watch = new Watch({
    config, passKey, roomId: ROOM,
    send: async (msg) => { await later(); r.host.signalFrom(peer, msg.data); },
    onRoom() {}, onArt() {}, onView() {},
    onState: (state) => log.states.push(state),
    onChat: (event) => log.chat.push(event),
  });
  toClose.push(log.watch);
  return log;
}
const of = (log, type) => log.chat.filter((e) => e.type === type);
const histories = (log) => of(log, 'history');
const said = (log) => of(log, 'chat').map((e) => e.entry.text);
const opened = (r, peers) => Promise.all(peers.map((peer) => expect.poll(() => histories(r.log[peer]).length, PATIENT).toBe(1)));

test('a verified member\'s message reaches the host and every watcher with their claims, and its sender once', async () => {
  const p1 = await person('u_p1');
  const r = await room({ p1, p2: await person('u_p2') });
  await opened(r, ['p1', 'p2']);
  expect(histories(r.log.p1)[0]).toEqual({ type: 'history', messages: [], more: false, earlier: false });

  const hi = await message(p1, 'hi');
  expect(r.log.p1.watch.say(hi)).toBe(true);
  const entry = { pass: p1.pass, ...hi };
  for (const peer of ['p1', 'p2']) await expect.poll(() => of(r.log[peer], 'chat'), PATIENT).toEqual([{ type: 'chat', entry, claims: p1.claims }]);
  expect(of(r, 'chat')).toEqual([{ type: 'chat', entry }]);
  await wait(100);
  expect(of(r.log.p1, 'chat').length).toBe(1);
});

test('a guest, an unconfirmed member, a bad or other room\'s signature, a used id, 301 characters, or 5 minutes off reach no one', async () => {
  const p1 = await person('u_p1');
  const r = await room({ p1, p2: await person('u_p2'), guest: await person('g_1', { guest: true }), unconfirmed: await person('u_p4', { verified: false }) });
  await opened(r, ['p1', 'p2', 'guest', 'unconfirmed']);

  r.log.guest.watch.say(await message(r.people.guest, 'guest'));
  r.log.unconfirmed.watch.say(await message(r.people.unconfirmed, 'unconfirmed'));
  const first = await message(p1, 'first');
  const say = (msg) => r.log.p1.watch.say(msg);
  say(first);
  say({ ...await message(p1, 'bad signature'), text: 'changed' });
  say(await message(p1, 'other room', { roomId: 'other' }));
  say(first);
  say(await message(p1, 'x'.repeat(301)));
  say(await message(p1, ' padded '));
  say(await message(p1, 'late', { ts: Date.now() - 5 * 60_000 }));
  say(await message(p1, 'last'));
  for (const peer of ['p1', 'p2', 'guest', 'unconfirmed']) await expect.poll(() => said(r.log[peer]), PATIENT).toEqual(['first', 'last']);
  await wait(100);
  expect(of(r, 'chat').map((e) => e.entry.text)).toEqual(['first', 'last']);
  expect(of(r.log.p1, 'refused')).toEqual([]);
});

test('the 4th message in a second is refused as too-fast, to its sender only, and one after a second goes', async () => {
  const p1 = await person('u_p1');
  const r = await room({ p1, p2: await person('u_p2') });
  await opened(r, ['p1', 'p2']);
  const four = [];
  for (const text of ['1', '2', '3', '4']) four.push(await message(p1, text));
  for (const msg of four) r.log.p1.watch.say(msg);
  await expect.poll(() => of(r.log.p1, 'refused'), PATIENT).toEqual([{ type: 'refused', id: four[3].id, reason: 'too-fast' }]);
  await expect.poll(() => said(r.log.p2), PATIENT).toEqual(['1', '2', '3']);
  expect(said(r.log.p1)).toEqual(['1', '2', '3']);
  expect(of(r.log.p2, 'refused')).toEqual([]);

  await wait(1000);
  r.log.p1.watch.say(await message(p1, '5'));
  for (const peer of ['p1', 'p2']) await expect.poll(() => said(r.log[peer]), PATIENT).toEqual(['1', '2', '3', '5']);
});

// Review focus 1: the host can't put words in a watcher's mouth.
test('a message the host signed with its own key under p1\'s pass, or p1\'s re-signed for another room, is dropped by every watcher', async () => {
  const me = await person('u_host');
  const p1 = await person('u_p1');
  const r = await room({ p1, p2: await person('u_p2') });
  await opened(r, ['p1', 'p2']);
  r.host.say({ pass: p1.pass, ...await message(me, 'forged') });
  r.host.say({ pass: p1.pass, ...await message(p1, 'replayed', { roomId: 'other' }) });
  const mine = { pass: me.pass, ...await message(me, 'mine') };
  r.host.say(mine);
  for (const peer of ['p1', 'p2']) await expect.poll(() => of(r.log[peer], 'chat'), PATIENT).toEqual([{ type: 'chat', entry: mine, claims: me.claims }]);
  expect(of(r, 'chat').map((e) => e.entry.text)).toEqual(['forged', 'replayed', 'mine']);   // the host believes itself
});

// A pass lasts an hour, a room's chat as long as the room: a message keeps the pass it was sent with.
test('a message whose pass has since expired still shows', async () => {
  const me = await person('u_host', { exp: Date.now() / 1000 - 60 });
  const r = await room({ p1: await person('u_p1') });
  await opened(r, ['p1']);
  r.host.say({ pass: me.pass, ...await message(me, 'old pass') });
  await expect.poll(() => said(r.log.p1), PATIENT).toEqual(['old pass']);
});

test('a watcher opening after 60 messages gets the last 50 and more; earlier gives the 10 before, and one sooner than 500 ms nothing', async () => {
  const me = await person('u_host');
  const r = await room({});
  const sent = [];
  for (let i = 0; i < 60; i++) {
    sent.push({ pass: me.pass, ...await message(me, `m${i}`) });
    r.host.say(sent[i]);
  }
  r.people.p1 = await person('u_p1');
  await join(r, 'p1');
  await opened(r, ['p1']);
  const [latest] = histories(r.log.p1);
  expect(latest.more).toBe(true);
  expect(latest.earlier).toBe(false);
  expect(latest.messages.map((m) => m.entry)).toEqual(sent.slice(10));
  expect(latest.messages[0].claims).toEqual(me.claims);

  expect(r.log.p1.watch.earlier(sent[10].id)).toBe(true);
  r.log.p1.watch.earlier(sent[10].id);
  await expect.poll(() => histories(r.log.p1).length, PATIENT).toBe(2);
  const earlier = histories(r.log.p1)[1];
  expect(earlier.more).toBe(false);
  expect(earlier.earlier).toBe(true);
  expect(earlier.messages.map((m) => m.entry)).toEqual(sent.slice(0, 10));
  await wait(200);
  expect(histories(r.log.p1).length).toBe(2);
});

// Review focus 3: scrolled up past what the host keeps.
test('earlier before an id the host doesn\'t have gives no messages and no more', async () => {
  const me = await person('u_host');
  const r = await room({ p1: await person('u_p1') });
  r.host.say({ pass: me.pass, ...await message(me, 'one') });
  await opened(r, ['p1']);
  r.log.p1.watch.earlier('AAAAAAAAAAAAAAAA');
  await expect.poll(() => histories(r.log.p1).length, PATIENT).toBe(2);
  expect(histories(r.log.p1)[1]).toEqual({ type: 'history', messages: [], more: false, earlier: true });
});

test('a message the host deletes goes for every watcher, and is deleted in a later watcher\'s history', async () => {
  const p1 = await person('u_p1');
  const r = await room({ p1, p2: await person('u_p2') });
  await opened(r, ['p1', 'p2']);
  const gone = await message(p1, 'gone');
  r.log.p1.watch.say(gone);
  await expect.poll(() => said(r.log.p2), PATIENT).toEqual(['gone']);
  r.host.deleteMessage(gone.id);
  for (const peer of ['p1', 'p2']) await expect.poll(() => of(r.log[peer], 'deleted'), PATIENT).toEqual([{ type: 'deleted', id: gone.id }]);
  expect(r.chat.at(-1)).toEqual({ type: 'deleted', id: gone.id });

  r.people.p3 = await person('u_p3');
  await join(r, 'p3');
  await opened(r, ['p3']);
  expect(histories(r.log.p3)[0].messages.filter((m) => !m.entry?.presence)).toEqual([{ id: gone.id, ts: gone.ts, deleted: true }]);
});

// A member sending junk can't keep the host checking signatures: past a few waiting, it's ignored.
test('a burst of 50 badly signed messages from one watcher gets only a few signature checks, and a good one after still goes', async () => {
  const p1 = await person('u_p1');
  const r = await room({ p1, p2: await person('u_p2') });
  await opened(r, ['p1', 'p2']);
  const real = crypto.subtle.verify.bind(crypto.subtle);
  const verify = vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => {   // slower than the junk comes
    await wait(50);
    return real(...args);
  });
  const junk = { ...await message(p1, 'junk'), text: 'changed' };
  for (let i = 0; i < 50; i++) r.log.p1.watch.say({ ...junk, id: newId() });
  await wait(100);
  await expect.poll(() => r.host.watchers.get('p1').checking, PATIENT).toBe(0);   // every one it took is checked
  expect(verify.mock.calls.length).toBeLessThanOrEqual(8);
  expect(of(r, 'chat')).toEqual([]);
  r.log.p1.watch.say(await message(p1, 'good'));
  await expect.poll(() => said(r.log.p2), PATIENT).toEqual(['good']);
});

test('remove asks the Room to put the watcher out, and closes its connection', async () => {
  const r = await room({ p1: await person('u_p1'), p2: await person('u_p2') });
  await opened(r, ['p1', 'p2']);
  r.host.remove('p1');
  expect(r.toHost).toEqual([{ type: 'remove', peer: 'p1' }]);
  expect(r.watchers.at(-1).map((w) => w.peer)).toEqual(['p2']);
  await expect.poll(() => r.log.p1.states.at(-1), PATIENT).toBe('lost');
});

// Who comes and goes: the host's word, kept with the messages, but the name is the person's pass.
const came = (log) => of(log, 'presence').map((e) => `${e.claims.name} ${e.entry.presence}`);
const cameKept = (messages) => messages.filter((m) => m.entry.presence).map((m) => `${m.claims.name} ${m.entry.presence}`);
const cameAll = (log) => [...cameKept(histories(log)[0]?.messages ?? []), ...came(log)];   // before it opened, and since

test('who joins and leaves goes to the host and every watcher, and is in the history of anyone joining later', async () => {
  const r = await room({ p1: await person('u_p1') });
  await opened(r, ['p1']);
  r.people.p2 = await person('u_p2');
  await join(r, 'p2');
  await opened(r, ['p2']);
  await expect.poll(() => came(r.log.p1), PATIENT).toEqual(['u_p1 joined', 'u_p2 joined']);   // its own too
  r.host.remove('p2');
  await expect.poll(() => came(r.log.p1), PATIENT).toEqual(['u_p1 joined', 'u_p2 joined', 'u_p2 left']);
  expect(r.chat.map((e) => `${e.entry.presence} ${e.entry.pass === r.people.p1.pass ? 'p1' : 'p2'}`)).toEqual(['joined p1', 'joined p2', 'left p2']);
  expect(r.chat.every((e) => e.type === 'presence')).toBe(true);

  r.people.p3 = await person('u_p3');
  await join(r, 'p3');
  await opened(r, ['p3']);
  expect(cameKept(histories(r.log.p3)[0].messages)).toEqual(['u_p1 joined', 'u_p2 joined', 'u_p2 left']);
  await expect.poll(() => came(r.log.p3), PATIENT).toEqual(['u_p3 joined']);   // after its history
});

test('one person in two tabs joins once and leaves when the last goes; a room closing says no one left', async () => {
  const p1 = await person('u_p1');
  const r = await room({ a: p1, b: p1, p2: await person('u_p2') });
  await opened(r, ['a', 'b', 'p2']);
  const p1Came = () => cameAll(r.log.p2).filter((c) => c.startsWith('u_p1'));
  await expect.poll(p1Came, PATIENT).toEqual(['u_p1 joined']);
  r.host.remove('a');
  await wait(200);
  expect(p1Came()).toEqual(['u_p1 joined']);
  r.host.remove('b');
  await expect.poll(p1Came, PATIENT).toEqual(['u_p1 joined', 'u_p1 left']);
  const before = r.chat.length;
  r.host.close();
  expect(r.chat.length).toBe(before);
});

test('say and earlier are false without an open channel', async () => {
  const log = watcher({ host: null }, 'p1');
  expect(log.watch.say(await message(await person('u_p1'), 'hi'))).toBe(false);
  expect(log.watch.earlier('AAAAAAAAAAAAAAAA')).toBe(false);
});

// The watcher doesn't trust the host: a test host sends it what a hostile one might.
async function hostileHost() {
  const log = { chat: [] };
  let host;
  const watch = new Watch({
    config, passKey, roomId: ROOM,
    send: async (msg) => { await later(); host.signal(msg.data); },
    onRoom() {}, onArt() {}, onView() {}, onState() {},
    onChat: (event) => log.chat.push(event),
  });
  toClose.push(watch);
  const ready = new Promise((resolve) => {
    host = openPeer({ initiator: true, config, sendSignal: async (data) => { await later(); watch.signalFrom('host', data); }, onOpen: resolve, onClose() {} });
  });
  toClose.push(host);
  const channel = await ready;
  return { log, json: (msg) => channel.send(JSON.stringify(msg)) };
}

// What the host might relay without checking: each watcher checks for itself.
test('a watcher drops a pass the host made up, a guest\'s or unconfirmed member\'s, 301 characters and untrimmed text', async () => {
  const { log, json } = await hostileHost();
  const p1 = await person('u_p1');
  const me = await person('u_host');
  const fakeServer = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const madeUp = await person('u_p1', { signer: fakeServer, pair: me.pair });   // p1's name, the host's key
  const guest = await person('g_1', { guest: true });
  const unconfirmed = await person('u_p4', { verified: false });
  const relay = async (from, text) => json({ t: 'chat', pass: from.pass, ...await message(from, text) });
  await relay(madeUp, 'made up');
  await relay(guest, 'guest');
  await relay(unconfirmed, 'unconfirmed');
  await relay(p1, 'x'.repeat(301));
  await relay(p1, ' hi');
  await relay(p1, 'last');
  await expect.poll(() => log.chat.length, PATIENT).toBe(1);
  expect(log.chat.map((e) => e.entry.text)).toEqual(['last']);
  await wait(100);
  expect(log.chat.length).toBe(1);
});

// A pass is checked once a connection when it's good, and again each time when it isn't (nothing kept
// for junk).
test('a watcher checks a good pass once, and a bad one each time it comes', async () => {
  const { log, json } = await hostileHost();
  const p1 = await person('u_p1');
  const fakeServer = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const madeUp = await person('u_p1', { signer: fakeServer, pair: p1.pair });
  const verify = vi.spyOn(crypto.subtle, 'verify');
  for (let i = 0; i < 3; i++) json({ t: 'chat', pass: madeUp.pass, ...await message(p1, `bad ${i}`) });
  for (let i = 0; i < 3; i++) json({ t: 'chat', pass: p1.pass, ...await message(p1, `good ${i}`) });
  await expect.poll(() => log.chat.length, PATIENT).toBe(3);
  expect(verify.mock.calls.length).toBe(3 + 1 + 3);   // the bad pass 3 times; the good pass once, and its 3 messages
});

test('a watcher takes who came and went only with a pass the server signed, and named by it', async () => {
  const { log, json } = await hostileHost();
  const p1 = await person('u_p1');
  const guest = await person('g_1', { guest: true });
  const fakeServer = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const madeUp = await person('u_p9', { signer: fakeServer });
  const at = (from, presence, id = newId()) => ({ pass: from.pass, id, ts: Date.now(), presence });
  json({ t: 'presence', ...at(madeUp, 'joined') });
  json({ t: 'presence', ...at(p1, 'waved') });
  json({ t: 'presence', ...at(p1, 'joined', 'short') });
  json({ t: 'history', more: false, messages: [at(madeUp, 'left'), at(p1, 'joined')] });
  json({ t: 'presence', ...at(guest, 'joined') });
  json({ t: 'presence', ...at(p1, 'left') });
  await expect.poll(() => log.chat.length, PATIENT).toBe(3);
  expect(cameKept(log.chat[0].messages)).toEqual(['u_p1 joined']);
  expect(came(log)).toEqual(['g_1 joined', 'u_p1 left']);
  expect(Object.keys(log.chat[2].entry).sort()).toEqual(['id', 'pass', 'presence', 'ts']);
});

test('a history with a forged entry shows the rest; deleted, refused and chat that don\'t fit are ignored', async () => {
  const { log, json } = await hostileHost();
  const p1 = await person('u_p1');
  const me = await person('u_host');
  const one = { pass: p1.pass, ...await message(p1, 'one') };
  const forged = { pass: p1.pass, ...await message(me, 'forged') };
  const three = { pass: me.pass, ...await message(me, 'three') };
  json({ t: 'history', messages: [one, forged, three], more: false });
  json({ t: 'deleted', id: 'short' });
  json({ t: 'chat-no', id: one.id, reason: 'other' });
  json({ t: 'chat', ...one, text: 5 });
  json({ t: 'chat', ...three, id: [three.id] });
  json({ t: 'chat', ...three });
  await expect.poll(() => log.chat.length, PATIENT).toBe(2);
  expect(log.chat[0]).toEqual({ type: 'history', more: false, earlier: false, messages: [{ entry: one, claims: p1.claims }, { entry: three, claims: me.claims }] });
  expect(log.chat[1]).toEqual({ type: 'chat', entry: three, claims: me.claims });
  await wait(100);
  expect(log.chat.length).toBe(2);
});

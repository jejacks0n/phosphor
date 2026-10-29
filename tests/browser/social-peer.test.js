// One WebRTC connection: two peers in this page, each one's signals handed straight to the other.
// No STUN server (config.iceServers is empty); the host candidates reach across because the browser
// runs without mDNS (vitest.config.js). The tests that don't need a real connection use a recording
// RTCPeerConnection instead.
import { test, expect, afterEach, vi } from 'vitest';
import { openPeer } from '@/social/peer';

const open = [];
afterEach(() => {
  for (const p of open.splice(0)) p.close();
  vi.unstubAllGlobals();
});

const later = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const config = { iceServers: [] };

// A host and a watcher wired together; the log has each one's open channel and closings.
function pair({ deliverAnswer = true, connectWithinMs } = {}) {
  const log = { host: { closed: [] }, watcher: { closed: [] } };
  let host, watcher;
  const channel = (side) => new Promise((resolve) => { log[side].open = resolve; });
  const opened = { host: channel('host'), watcher: channel('watcher') };
  host = openPeer({
    initiator: true, config, connectWithinMs,
    sendSignal: async (data) => { await later(); watcher.signal(data); },
    onOpen: (c) => log.host.open(c),
    onClose: (info) => log.host.closed.push(info),
  });
  watcher = openPeer({
    initiator: false, config, connectWithinMs,
    sendSignal: async (data) => { await later(); if (deliverAnswer) host.signal(data); },
    onOpen: (c) => log.watcher.open(c),
    onClose: (info) => log.watcher.closed.push(info),
  });
  open.push(host, watcher);
  return { host, watcher, log, opened };
}

// An RTCPeerConnection that does nothing but record what it is asked, and takes a moment over
// setRemoteDescription as the real one does.
function recordingConnection() {
  const calls = [];
  const made = [];
  class Recorder {
    constructor() { made.push(this); }
    createDataChannel(label) { this.channel = fakeChannel(label); return this.channel; }
    async setLocalDescription() { calls.push('setLocalDescription'); this.localDescription = { toJSON: () => ({ type: 'offer', sdp: 'x' }) }; }
    async setRemoteDescription(sdp) { await wait(20); calls.push(['setRemoteDescription', sdp.type]); }
    async addIceCandidate(candidate) { calls.push(['addIceCandidate', candidate.candidate]); }
    close() { calls.push('close'); }
  }
  vi.stubGlobal('RTCPeerConnection', Recorder);
  return { calls, made };
}
function fakeChannel(label, readyState = 'connecting') {
  return { label, readyState, close: vi.fn(function () { this.readyState = 'closed'; }) };
}

test('both channels open, and a text and a binary message cross each way', async () => {
  const { opened } = pair();
  const [h, w] = await Promise.all([opened.host, opened.watcher]);
  expect(h.label).toBe('room');
  expect(w.label).toBe('room');
  expect(h.binaryType).toBe('arraybuffer');
  expect(w.binaryType).toBe('arraybuffer');

  const got = new Promise((resolve) => { const seen = []; w.onmessage = (e) => { seen.push(e.data); if (seen.length === 2) resolve(seen); }; });
  h.send('hello');
  h.send(Uint8Array.of(1, 2, 3));
  const [text, bytes] = await got;
  expect(text).toBe('hello');
  expect([...new Uint8Array(bytes)]).toEqual([1, 2, 3]);

  const back = new Promise((resolve) => { h.onmessage = (e) => resolve(e.data); });
  w.send('hi');
  expect(await back).toBe('hi');
});

test('close() on one side brings onClose({ failed: false }) once on the other, and once on itself', async () => {
  const { host, log, opened } = pair();
  await Promise.all([opened.host, opened.watcher]);
  host.close();
  await expect.poll(() => log.watcher.closed.length).toBe(1);
  expect(log.watcher.closed).toEqual([{ failed: false }]);
  expect(log.host.closed).toEqual([{ failed: false }]);
  host.close();
  await wait(100);
  expect(log.host.closed.length).toBe(1);
  expect(log.watcher.closed.length).toBe(1);
});

test('an answer that never arrives fails the initiator once, after waiting out connectWithinMs', async () => {
  const started = performance.now();
  const { log } = pair({ deliverAnswer: false, connectWithinMs: 300 });
  await expect.poll(() => log.host.closed.length, { timeout: 2000 }).toBe(1);
  expect(performance.now() - started).toBeGreaterThanOrEqual(250);
  expect(log.host.closed).toEqual([{ failed: true }]);
  await wait(400);
  expect(log.host.closed.length).toBe(1);
});

test('close() right after openPeer gives one { failed: true } and nothing when the time runs out', async () => {
  const closed = [];
  const peer = openPeer({ initiator: true, config, connectWithinMs: 200, sendSignal() {}, onOpen() {}, onClose: (info) => closed.push(info) });
  peer.close();
  await wait(400);
  expect(closed).toEqual([{ failed: true }]);
});

test('candidates that come before the description are held until it is set, then applied', async () => {
  const { calls } = recordingConnection();
  const peer = openPeer({ initiator: false, config, sendSignal() {}, onOpen() {}, onClose() {} });
  open.push(peer);
  const early = peer.signal({ candidate: { candidate: 'early' } });
  const description = peer.signal({ sdp: { type: 'offer', sdp: 'x' } });
  const during = peer.signal({ candidate: { candidate: 'during' } });   // while the description is being set
  await Promise.all([early, description, during]);
  const order = calls.filter((c) => Array.isArray(c));
  expect(order).toEqual([['setRemoteDescription', 'offer'], ['addIceCandidate', 'early'], ['addIceCandidate', 'during']]);
  await peer.signal({ candidate: { candidate: 'after' } });
  expect(calls.at(-1)).toEqual(['addIceCandidate', 'after']);
});

test('at most 50 candidates are held before the remote description; the rest are dropped', async () => {
  const { calls } = recordingConnection();
  const peer = openPeer({ initiator: false, config, sendSignal() {}, onOpen() {}, onClose() {} });
  open.push(peer);
  for (let i = 0; i < 60; i++) await peer.signal({ candidate: { candidate: `c${i}` } });
  await peer.signal({ sdp: { type: 'offer', sdp: 'x' } });
  expect(calls.filter((c) => c[0] === 'addIceCandidate').map((c) => c[1])).toEqual(Array.from({ length: 50 }, (_, i) => `c${i}`));
});

test('one description and at most 50 candidates in all are taken; once the channel is open, nothing more is', async () => {
  const { calls, made } = recordingConnection();
  const peer = openPeer({ initiator: true, config, sendSignal() {}, onOpen() {}, onClose() {} });
  open.push(peer);
  await peer.signal({ sdp: { type: 'answer', sdp: 'x' } });
  await peer.signal({ sdp: { type: 'answer', sdp: 'again' } });
  for (let i = 0; i < 60; i++) await peer.signal({ candidate: { candidate: `c${i}` } });
  expect(calls.filter((c) => c[0] === 'setRemoteDescription')).toHaveLength(1);
  expect(calls.filter((c) => c[0] === 'addIceCandidate')).toHaveLength(50);

  const fresh = openPeer({ initiator: true, config, sendSignal() {}, onOpen() {}, onClose() {} });
  open.push(fresh);
  await fresh.signal({ sdp: { type: 'answer', sdp: 'x' } });
  made.at(-1).channel.onopen();
  const before = calls.length;
  await fresh.signal({ candidate: { candidate: 'late' } });
  await fresh.signal({ sdp: { type: 'answer', sdp: 'late' } });
  expect(calls.slice(before)).toEqual([]);
});

test('only one channel called room is taken, and only by the watcher; any other is closed', async () => {
  const opens = [];
  const taken = (initiator) => {
    const { made } = recordingConnection();
    const peer = openPeer({ initiator, config, sendSignal() {}, onOpen: (c) => opens.push(c), onClose() {} });
    open.push(peer);
    return made.at(-1);
  };
  const open_ = (pc, channel) => { pc.ondatachannel({ channel }); channel.onopen?.(); };

  const watcher = taken(false);
  const stray = fakeChannel('other');
  open_(watcher, stray);
  expect(stray.close).toHaveBeenCalled();
  expect(opens).toEqual([]);
  const room = fakeChannel('room');
  open_(watcher, room);
  expect(opens).toEqual([room]);
  const second = fakeChannel('room');
  open_(watcher, second);
  expect(second.close).toHaveBeenCalled();
  expect(room.close).not.toHaveBeenCalled();
  expect(opens).toEqual([room]);

  opens.length = 0;
  const host = taken(true);   // the host makes its own channel; a channel handed to it is a stranger
  const offered = fakeChannel('room');
  open_(host, offered);
  expect(offered.close).toHaveBeenCalled();
  expect(opens.filter((c) => c === offered)).toEqual([]);
});

test('a sendSignal that rejects is no unhandled rejection', async () => {
  recordingConnection();
  const seen = [];
  const note = (e) => { seen.push(e.reason); e.preventDefault(); };
  window.addEventListener('unhandledrejection', note);
  try {
    const peer = openPeer({ initiator: true, config, sendSignal: () => Promise.reject(new Error('socket gone')), onOpen() {}, onClose() {} });
    open.push(peer);
    await wait(100);
  } finally {
    window.removeEventListener('unhandledrejection', note);
  }
  expect(seen).toEqual([]);
});

// One WebRTC connection: two peers in this page, each one's signals handed straight to the other.
// No STUN server (config.iceServers is empty); the host candidates reach across because the browser
// runs without mDNS (vitest.config.js).
import { test, expect, afterEach } from 'vitest';
import { openPeer } from '@/social/peer';

const open = [];
afterEach(() => { for (const p of open.splice(0)) p.close(); });

const later = () => new Promise((resolve) => setTimeout(resolve, 0));
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

// One connection does both jobs: a machine that drops a page's later WebRTC packets (some Macs, after the
// first connection) would fail a second one for no reason of ours.
test('both channels open, text and binary messages cross, and close() on one side closes the other, once', async () => {
  const { host, log, opened } = pair();
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

  host.close();
  await expect.poll(() => log.watcher.closed.length).toBe(1);
  expect(log.watcher.closed).toEqual([{ failed: false }]);
  expect(log.host.closed).toEqual([{ failed: false }]);
  host.close();
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(log.host.closed.length).toBe(1);
  expect(log.watcher.closed.length).toBe(1);
});

test('an answer that never arrives fails the initiator once, within connectWithinMs', async () => {
  const { log } = pair({ deliverAnswer: false, connectWithinMs: 300 });
  await expect.poll(() => log.host.closed.length, { timeout: 2000 }).toBe(1);
  expect(log.host.closed).toEqual([{ failed: true }]);
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(log.host.closed.length).toBe(1);
});

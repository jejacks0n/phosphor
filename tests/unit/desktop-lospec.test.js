// The desktop app's Get from Lospec (desktop/lospec.js): the main process asks lospec.com for one palette at the address it
// builds from a slug, never one the page hands it, follows no redirect, sends no credentials, and stops reading past 64 KB.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { SLUG, fetchPalette } from '../../desktop/lospec.js';
import { SLUG as PAGE_SLUG } from '../../src/lib/lospec.js';

// A body of `chunks` chunks of `size` bytes each, counting the chunks pulled and whether it was canceled.
function streamed(chunks, size) {
  const seen = { pulled: 0, canceled: false };
  const body = new ReadableStream({
    pull(controller) {
      if (seen.pulled === chunks) return controller.close();
      seen.pulled++;
      controller.enqueue(new Uint8Array(size).fill(97));
    },
    cancel() { seen.canceled = true; },
  }, { highWaterMark: 0 });
  return { body, seen };
}
const answering = (respond) => {
  const calls = [];
  return { calls, fetch: async (url, options) => { calls.push({ url, options }); return respond(); } };
};

test('the main process asks Lospec for one palette at the address it builds itself', async () => {
  const { calls, fetch } = answering(() => new Response('{"name":"Sweetie 16","colors":["1a1c2c"]}'));
  assert.deepEqual(await fetchPalette('sweetie-16', { fetch }), { text: '{"name":"Sweetie 16","colors":["1a1c2c"]}' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://lospec.com/palette-list/sweetie-16.json');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('a slug that isn\'t one (a URL, a path, uppercase, empty, 101 characters) is refused without a request', async () => {
  const { calls, fetch } = answering(() => new Response('{}'));
  for (const slug of ['https://evil.example/x', '../x', 'Sweetie', '', 'a'.repeat(101), ['abc'], { toString: () => 'abc' }, null, 42, undefined]) {
    assert.deepEqual(await fetchPalette(slug, { fetch }), { failed: 'notPalette' }, String(slug));
  }
  assert.equal(calls.length, 0);
});

test('a 404 is notFound, a failure or a redirect unreachable, and a body past 64 KB notPalette', async () => {
  const failed = async (respond) => (await fetchPalette('sweetie-17', answering(respond))).failed;
  assert.equal(await failed(() => new Response('gone', { status: 404 })), 'notFound');
  assert.equal(await failed(() => new Response('down', { status: 503 })), 'unreachable');
  assert.equal(await failed(() => { throw new TypeError('fetch failed'); }), 'unreachable');
  assert.equal(await failed(() => { throw new TypeError('unexpected redirect'); }), 'unreachable'); // redirect: 'error'
  const cutOff = new ReadableStream({ pull(controller) { controller.error(new Error('reset')); } });
  assert.equal(await failed(() => new Response(cutOff)), 'unreachable');

  const { body, seen } = streamed(100, 1024);
  assert.equal(await failed(() => new Response(body)), 'notPalette');
  assert.ok(seen.canceled);
  assert.ok(seen.pulled < 100, `pulled ${seen.pulled}`);
  assert.deepEqual(await fetchPalette('big', answering(() => new Response(streamed(64, 1024).body))), { text: 'a'.repeat(64 * 1024) });
});

test('the slug pattern is the page\'s, so the two can\'t drift apart', () => {
  assert.equal(SLUG.source, PAGE_SLUG.source);
  assert.equal(SLUG.flags, PAGE_SLUG.flags);
});

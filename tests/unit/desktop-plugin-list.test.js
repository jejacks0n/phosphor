// The desktop app's marketplace fetches (desktop/pluginList.js): the main process asks only for phosphor.work's list and
// raw GitHub files, follows no redirect, and stops reading a body past its cap.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { LIST_URL, MOST_FILE_BYTES, allowedUrl, fetchText, fetchFile } from '../../desktop/pluginList.js';
import { MOST_SCRIPT_BYTES } from '../../src/plugins/manifest.js';

const RAW = 'https://raw.githubusercontent.com/kim/phosphor-rain/0123456789abcdef0123456789abcdef01234567/phosphor-plugin.json';

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
const answering = (response) => {
  const calls = [];
  return { calls, fetch: async (url, options) => { calls.push({ url, options }); return response; } };
};

test('only the list and raw GitHub URLs are allowed', () => {
  assert.equal(LIST_URL, 'https://phosphor.work/plugins.json');
  assert.ok(allowedUrl(LIST_URL));
  assert.ok(allowedUrl(RAW));
  for (const url of [
    'https://phosphor.work/x', 'https://raw.githubusercontent.com.evil.test/x', 'http://raw.githubusercontent.com/x',
    'file:///etc/passwd', 'https://raw.githubusercontent.com/kim/rain/../../x', 'https://raw.githubusercontent.com/kim/%2e%2e/x',
    'https://raw.githubusercontent.com\\kim/x', 'https://user@raw.githubusercontent.com/x', 'https://phosphor.work/plugins.json?x',
    undefined, null, 42, { toString: () => LIST_URL },
  ]) assert.equal(allowedUrl(url), false, String(url));
});

test('a disallowed URL is refused without a fetch', async () => {
  const { calls, fetch } = answering(new Response('{}'));
  await assert.rejects(fetchText('https://phosphor.work/x', { fetch, most: 100 }), /notAllowed/);
  assert.equal(calls.length, 0);
});

test('a fetch follows no redirect, has a timeout, and gives the text with a BOM dropped', async () => {
  const { calls, fetch } = answering(new Response('﻿{"a":1}'));
  assert.equal(await fetchText(LIST_URL, { fetch, most: 100 }), '{"a":1}');
  assert.equal(calls[0].options.redirect, 'error');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('a 404 is refused', async () => {
  const { fetch } = answering(new Response('gone', { status: 404 }));
  await assert.rejects(fetchText(RAW, { fetch, most: 100 }), /status 404/);
});

test('a body one byte over the cap is refused, and reading stops there', async () => {
  const { body, seen } = streamed(100, 10);
  const { fetch } = answering(new Response(body));
  await assert.rejects(fetchText(RAW, { fetch, most: 49 }), /tooBig/);
  assert.ok(seen.canceled);
  assert.ok(seen.pulled < 100, `pulled ${seen.pulled}`);

  const exact = streamed(5, 10);
  assert.equal((await fetchText(RAW, { fetch: answering(new Response(exact.body)).fetch, most: 50 })).length, 50);
});

test('a file asked for is capped at a script\'s cap, whatever the page asks', async () => {
  assert.equal(MOST_FILE_BYTES, MOST_SCRIPT_BYTES);
  for (const most of [MOST_FILE_BYTES + 1, Infinity, NaN, '9999999', undefined, -1]) {
    const { body } = streamed(1, MOST_FILE_BYTES + 1);
    assert.deepEqual(await fetchFile(RAW, most, { fetch: answering(new Response(body)).fetch }), { failed: 'changed' }, String(most));
  }
  const { body } = streamed(1, 11);
  assert.deepEqual(await fetchFile(RAW, 10, { fetch: answering(new Response(body)).fetch }), { failed: 'changed' });
});

// IPC keeps only an Error's message, so a file comes to the page as { text } or { failed }: changed for a 404 or a body
// over its cap (the listing isn't what was listed), unreachable for anything else.
test('a file is given as { text }, or why it failed in a word the page can tell apart', async () => {
  assert.deepEqual(await fetchFile(RAW, 100, { fetch: answering(new Response('{"a":1}')).fetch }), { text: '{"a":1}' });
  assert.deepEqual(await fetchFile(RAW, 100, { fetch: answering(new Response('gone', { status: 404 })).fetch }), { failed: 'changed' });
  for (const fetch of [
    answering(new Response('down', { status: 500 })).fetch,
    answering(new Response('no', { status: 403 })).fetch,
    async () => { throw new TypeError('fetch failed'); },
    async () => { throw new DOMException('timed out', 'TimeoutError'); },
  ]) assert.deepEqual(await fetchFile(RAW, 100, { fetch }), { failed: 'unreachable' });
  assert.deepEqual(await fetchFile('https://phosphor.work/x', 100, { fetch: answering(new Response('')).fetch }), { failed: 'unreachable' });
});

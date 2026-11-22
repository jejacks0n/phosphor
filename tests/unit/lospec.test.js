// Reading Lospec: what is typed as a slug, an answer as a palette, one palette asked for, and the shipped set the script
// wrote.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { slugOf, readPalette, getPalette } from '../../src/lib/lospec.js';
import { SLUGS } from '../../scripts/color-library.mjs';

const shipped = JSON.parse(readFileSync(new URL('../../src/lib/colorPalettes.json', import.meta.url), 'utf8'));

test('what is typed is a slug: a Lospec link in any of its forms, or a name', () => {
  for (const link of ['https://lospec.com/palette-list/sweetie-16', 'https://lospec.com/palette-list/sweetie-16.json',
    'https://www.lospec.com/palette-list/sweetie-16.hex', 'https://lospec.com/palette-list/sweetie-16/?page=2#top', 'lospec.com/palette-list/sweetie-16']) {
    assert.equal(slugOf(link), 'sweetie-16', link);
  }
  assert.equal(slugOf('  Sweetie 16 '), 'sweetie-16');
  assert.equal(slugOf('AAP-16'), 'aap-16');
  assert.equal(slugOf('Café — 16!'), 'caf-16');
});
test('a link anywhere else, punctuation alone, nothing, or a name past 100 characters is no slug', () => {
  for (const typed of ['https://example.com/palette-list/sweetie-16', 'https://lospec.com/gallery/x', '!!!', '', '   ', 'a'.repeat(101)]) assert.equal(slugOf(typed), '', typed);
});
test('a Lospec answer is read as a palette: its colors checked, its words cut, an empty author allowed', () => {
  assert.deepEqual(readPalette({ name: 'Sweetie 16', author: '', colors: ['1A1C2C', '5d275d'] }, 'sweetie-16'),
    { slug: 'sweetie-16', name: 'Sweetie 16', author: '', colors: ['#1a1c2c', '#5d275d'], of: null });
  assert.equal(readPalette({ name: 'x'.repeat(300), author: 7, colors: ['000000'] }, 'x').name.length, 100);
  assert.equal(readPalette({ colors: ['000000'] }, 'no-name').name, 'no-name');
  const many = readPalette({ name: 'Big', colors: Array(300).fill('abcdef') }, 'big');
  assert.deepEqual([many.colors.length, many.of], [256, 300]);
});
test('anything else is refused', () => {
  for (const bad of [null, 'text', [], {}, { colors: [] }, { colors: 'ffffff' }, { colors: ['ffffff', '#ffffff'] }, { colors: ['fff'] }, { colors: [0xffffff] }, { error: 'file not found' }]) {
    assert.throws(() => readPalette(bad, 'x'), /notPalette/, JSON.stringify(bad));
  }
});
// A fetch that answers each call with what `answer` makes, recording [url, init].
const fakeFetch = (answer) => {
  const calls = [];
  const fetch = async (url, init) => { calls.push([url, init]); return answer(); };
  return { fetch, calls };
};
const json = (data, status = 200) => () => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

test('a palette is asked for at its one address, following no redirect and sending no credentials', async () => {
  const { fetch, calls } = fakeFetch(json({ name: 'Sweetie 16', author: '', colors: ['1a1c2c', '5d275d'] }));
  assert.deepEqual(await getPalette('sweetie-16', { fetch }),
    { slug: 'sweetie-16', name: 'Sweetie 16', author: '', colors: ['#1a1c2c', '#5d275d'], of: null });
  assert.equal(calls.length, 1);
  const [url, init] = calls[0];
  assert.equal(url, 'https://lospec.com/palette-list/sweetie-16.json');
  assert.equal(init.redirect, 'error');
  assert.equal(init.credentials, 'omit');
  assert.ok(init.signal instanceof AbortSignal);
});
test('a 404, an error answer, a failure, text that isn\'t JSON, a body past 64 KB and a bad slug each say which', async () => {
  const says = async (answer, slug = 'x') => {
    const { fetch } = fakeFetch(answer);
    return getPalette(slug, { fetch }).then(() => 'kept', (error) => error.message);
  };
  assert.equal(await says(json({ error: 'file not found' }, 404)), 'notFound');
  assert.equal(await says(() => new Response('Not Found', { status: 404 })), 'notFound');
  assert.equal(await says(json({ error: 'file not found' })), 'notFound');
  assert.equal(await says(() => { throw new TypeError('Failed to fetch'); }), 'unreachable');
  assert.equal(await says(() => { throw new DOMException('timed out', 'TimeoutError'); }), 'unreachable');
  assert.equal(await says(json({ error: 'busy' }, 503)), 'unreachable');
  assert.equal(await says(() => new Response(new ReadableStream({ pull(c) { c.error(new TypeError('reset')); } }))), 'unreachable');
  assert.equal(await says(() => new Response('<!DOCTYPE html>')), 'notPalette');
  assert.equal(await says(json('text')), 'notPalette');
  assert.equal(await says(json({ colors: ['fff'] })), 'notPalette');
  assert.equal(await says(json({ name: 'x'.repeat(70_000), colors: ['000000'] })), 'notPalette'); // sound, but too big
  assert.equal(await says(json({ name: 'x'.repeat(60_000), colors: ['000000'] })), 'kept');
  const { fetch, calls } = fakeFetch(json({ colors: ['000000'] }));
  for (const bad of ['', 'Sweetie 16', '../x', 'a'.repeat(101), 'x.json']) {
    assert.equal(await getPalette(bad, { fetch }).then(() => 'kept', (error) => error.message), 'notPalette', bad);
  }
  assert.equal(calls.length, 0);
});
test('the shipped set is the script\'s list, in its order: each one sixteen sound colors and a name', () => {
  assert.equal(SLUGS.length, 29);
  assert.deepEqual(shipped.map((p) => p.slug), SLUGS);
  for (const p of shipped) {
    assert.equal(p.colors.length, 16, p.slug);
    assert.ok(p.colors.every((c) => /^#[0-9a-f]{6}$/.test(c)), p.slug);
    assert.ok(p.name && typeof p.author === 'string', p.slug);
  }
});

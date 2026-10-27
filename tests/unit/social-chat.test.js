// Chat's pieces: the text rule, the kept log and its pages, the one-a-second allowance.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { MOST_CHARS, MOST_KEPT, PAGE, ID, chatText, newId, signedText, ChatLog, Allowance } from '../../src/social/chat.js';
import { CHUNK_BYTES } from '../../src/social/wire.js';

const entries = (n, text = 'hi', pass = 'p') => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, ts: i, text, pass, sig: 's' }));
const filled = (n, text, pass) => {
  const log = new ChatLog();
  for (const e of entries(n, text, pass)) log.add(e);
  return log;
};

test('the limits are the ones the rules give', () => {
  assert.deepEqual([MOST_CHARS, MOST_KEPT, PAGE], [300, 5000, 50]);
});

test('chatText trims, and refuses what is not a string, is empty or is over 300', () => {
  assert.equal(chatText('  hi  '), 'hi');
  assert.equal(chatText('a\nb'), 'a\nb');
  for (const bad of ['   ', '', 42, null, undefined, {}, 'a'.repeat(301)]) assert.equal(chatText(bad), null);
  assert.equal(chatText('a'.repeat(300)), 'a'.repeat(300));
});

test('ids are 16 URL-safe characters and do not repeat', () => {
  assert.match(newId(), ID);
  assert.equal(new Set(Array.from({ length: 1000 }, newId)).size, 1000);
});

test('signedText is what the signature covers', () => {
  assert.equal(signedText('room1', { id: 'abc', ts: 5, text: 'a:b' }), 'chat:room1:abc:5:a:b');
});

test('a log keeps the last few and forgets the rest', () => {
  const log = new ChatLog(3);
  for (const e of entries(4)) assert.equal(log.add(e), true);
  assert.deepEqual(log.page().messages.map((m) => m.id), ['m1', 'm2', 'm3']);
  assert.equal(log.has('m0'), false);
  assert.equal(log.has('m1'), true);
});

test('an id it has is not added again', () => {
  const log = filled(2);
  assert.equal(log.add({ id: 'm0', ts: 9, text: 'again' }), false);
  assert.equal(log.page().messages[0].text, 'hi');
});

test('pages run back from the latest, 50 at a time', () => {
  const log = filled(120);
  const first = log.page();
  assert.equal(first.messages.length, 50);
  assert.equal(first.messages[0].id, 'm70');
  assert.equal(first.messages.at(-1).id, 'm119');
  assert.equal(first.more, true);
  const second = log.page(first.messages[0].id);
  assert.deepEqual([second.messages[0].id, second.messages.at(-1).id, second.more], ['m20', 'm69', true]);
  const third = log.page(second.messages[0].id);
  assert.deepEqual([third.messages.length, third.messages[0].id, third.more], [20, 'm0', false]);
});

test('a page before an id it does not have is empty', () => {
  assert.deepEqual(filled(5).page('nope'), { messages: [], more: false });
});

test('a page whose messages would not fit a chunk drops its oldest ones', () => {
  const log = filled(50, '😀'.repeat(300), 'p'.repeat(300));
  const { messages, more } = log.page();
  assert.equal(more, true);
  assert.ok(messages.length < 50 && messages.length > 0);
  assert.equal(messages.at(-1).id, 'm49');
  assert.ok(JSON.stringify({ t: 'history', messages, more: true }).length <= CHUNK_BYTES);
  assert.ok(new TextEncoder().encode(JSON.stringify({ t: 'history', messages, more })).length <= CHUNK_BYTES);
});

test('a deleted message keeps only its id and time', () => {
  const log = filled(3);
  assert.equal(log.delete('m1'), true);
  assert.deepEqual(log.page().messages[1], { id: 'm1', ts: 1, deleted: true });
  assert.equal(log.has('m1'), true);
  assert.equal(log.delete('nope'), false);
});

test('an allowance gives 3 at once, then one a second', () => {
  const a = new Allowance();
  assert.deepEqual([a.take(0), a.take(0), a.take(0), a.take(0), a.take(999)], [true, true, true, false, false]);
  assert.equal(a.take(1000), true);
  assert.equal(a.take(1000), false);
});

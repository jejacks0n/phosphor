// The host's session counts: who came and went, messages, removed, the most at once.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { newSession, sessionJoined, sessionLeft, sessionRemoved, sessionSaid, sessionSaw, timeIn, removedCount } from '../../src/social/session.js';

const ann = { sub: 'u_1', name: 'ann', guest: false };

test('a person who comes, goes and comes back is one person, their time added up', () => {
  const s = newSession();
  sessionJoined(s, ann, 0);
  sessionLeft(s, 'u_1', 60_000);
  sessionJoined(s, ann, 100_000);
  assert.equal(s.people.length, 1);
  assert.equal(timeIn(s.people[0], 130_000), 90_000);
  assert.equal(s.people[0].left, null);
});

test('the most at once only rises', () => {
  const s = newSession();
  for (const n of [2, 5, 3]) sessionSaw(s, n);
  assert.equal(s.most, 5);
});

test('messages count everyone\'s, a person\'s only theirs', () => {
  const s = newSession();
  sessionJoined(s, ann, 0);
  sessionSaid(s, 'u_1');
  sessionSaid(s, 'u_1');
  sessionSaid(s, 'u_host');
  assert.equal(s.messages, 3);
  assert.equal(s.people[0].said, 2);
});

test('removed is kept through the leaving after it, and counted once', () => {
  const s = newSession();
  sessionJoined(s, ann, 0);
  sessionRemoved(s, 'u_1', 10);
  sessionRemoved(s, 'u_1', 20);
  sessionLeft(s, 'u_1', 30);
  assert.equal(s.people[0].removed, 10);
  assert.equal(removedCount(s), 1);
});

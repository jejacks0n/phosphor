// The lobby's pure parts: the reducer for the server's lobby messages, the order rooms and people are
// listed in, the Join button's states, a card's picture as an image, and the pacer that keeps changes to one per interval.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { emptyLobby, applyLobbyMessage, sortedRooms, sortedPeople, joinState, liveFor, signalWords, signalWord, pictureUrl, Pacer } from '../../src/social/lobby.js';

const room = (id, more) => ({
  id, name: `Room ${id}`, host: 'ansi-fan', count: 1, max: 12, allowGuests: true, signal: null,
  liveSince: 1000, thumbnail: null, blockedInside: false, ...more,
});
const person = (sub, name, guest = false) => ({ sub, name, guest, signal: null });

test('A state replaces everything; room and person add or replace one; the gone messages remove one; nothing is mutated', () => {
  const start = emptyLobby();
  assert.deepEqual(start, { rooms: new Map(), people: new Map() });

  const a = applyLobbyMessage(start, { type: 'state', rooms: [room('r1'), room('r2')], people: [person('u1', 'ada')] });
  assert.deepEqual([...a.rooms.keys()], ['r1', 'r2']);
  assert.deepEqual([...a.people.keys()], ['u1']);
  assert.equal(start.rooms.size, 0);

  const b = applyLobbyMessage(a, { type: 'state', rooms: [room('r3')], people: [] });   // after a reconnect
  assert.deepEqual([...b.rooms.keys()], ['r3']);
  assert.equal(b.people.size, 0);

  const c = applyLobbyMessage(b, { type: 'room', room: room('r3', { count: 5 }) });
  assert.equal(c.rooms.get('r3').count, 5);
  assert.equal(b.rooms.get('r3').count, 1);
  const d = applyLobbyMessage(c, { type: 'room', room: room('r4') });
  assert.deepEqual([...d.rooms.keys()], ['r3', 'r4']);
  assert.equal(c.rooms.size, 1);

  const e = applyLobbyMessage(d, { type: 'room-gone', id: 'r3' });
  assert.deepEqual([...e.rooms.keys()], ['r4']);
  assert.equal(d.rooms.size, 2);

  const f = applyLobbyMessage(e, { type: 'person', person: person('g1', 'quiet-amber-fox', true) });
  assert.deepEqual([...f.people.keys()], ['g1']);
  assert.equal(e.people.size, 0);
  const g = applyLobbyMessage(f, { type: 'person-gone', sub: 'g1' });
  assert.equal(g.people.size, 0);
  assert.equal(f.people.size, 1);
});

test('A gone message for someone or something unknown, an unknown type and a refused change nothing', () => {
  const lobby = applyLobbyMessage(emptyLobby(), { type: 'state', rooms: [room('r1')], people: [person('u1', 'ada')] });
  assert.equal(applyLobbyMessage(lobby, { type: 'room-gone', id: 'nope' }), lobby);
  assert.equal(applyLobbyMessage(lobby, { type: 'person-gone', sub: 'nope' }), lobby);
  assert.equal(applyLobbyMessage(lobby, { type: 'something-new' }), lobby);
  assert.equal(applyLobbyMessage(lobby, { type: 'refused', code: 'bad-pass' }), lobby);
});

test('Rooms: most watchers first, then the newest', () => {
  const lobby = applyLobbyMessage(emptyLobby(), {
    type: 'state', people: [],
    rooms: [room('old-small', { count: 2, liveSince: 100 }), room('big', { count: 9, liveSince: 50 }), room('new-small', { count: 2, liveSince: 300 })],
  });
  assert.deepEqual(sortedRooms(lobby).map((r) => r.id), ['big', 'new-small', 'old-small']);
});

test('People: you first, then members, then guests, each by name', () => {
  const lobby = applyLobbyMessage(emptyLobby(), {
    type: 'state', rooms: [],
    people: [person('g1', 'bold-red-owl', true), person('u2', 'zed'), person('me', 'yours-truly', true), person('u1', 'ada'), person('g2', 'amber-fox', true)],
  });
  assert.deepEqual(sortedPeople(lobby, 'me').map((p) => p.sub), ['me', 'u1', 'u2', 'g2', 'g1']);
  assert.deepEqual(sortedPeople(lobby, null).map((p) => p.sub), ['u1', 'u2', 'g2', 'g1', 'me']);
});

test('Join: open, full, members only for a guest, full wins over members only, a member joins a members-only room', () => {
  assert.deepEqual(joinState(room('r', { count: 4, max: 12 }), { signedIn: false }), { enabled: true, label: 'Join 4/12', reason: null });
  assert.deepEqual(joinState(room('r', { count: 12, max: 12 }), { signedIn: true }), { enabled: false, label: 'Join 12/12', reason: 'Room is full' });
  assert.deepEqual(joinState(room('r', { count: 3, max: 8, allowGuests: false }), { signedIn: false }), { enabled: false, label: 'Join 3/8', reason: 'Signed-in users only' });
  assert.deepEqual(joinState(room('r', { count: 8, max: 8, allowGuests: false }), { signedIn: false }), { enabled: false, label: 'Join 8/8', reason: 'Room is full' });
  assert.deepEqual(joinState(room('r', { count: 3, max: 8, allowGuests: false }), { signedIn: true }), { enabled: true, label: 'Join 3/8', reason: null });
});

// A pacer on a fake clock: setTimer remembers its callbacks for the test to run, clearTimer marks one
// cleared. Its sendFn says it sent unless `clock.live` is false (a connection that isn't live).
function pacedClock() {
  const clock = { t: 0, sent: [], tried: [], timers: [], live: true };
  const send = (value) => {
    clock.tried.push(value);
    if (clock.live) clock.sent.push(value);
    return clock.live;
  };
  const setTimer = (fn, ms) => {
    const timer = { fn, at: clock.t + ms, cleared: false };
    clock.timers.push(timer);
    return timer;
  };
  clock.pacer = new Pacer(2000, send, () => clock.t, setTimer, (timer) => { timer.cleared = true; });
  return clock;
}

test('Live for: minutes under an hour, then hours and minutes', () => {
  const now = 10_000_000;
  assert.equal(liveFor(now - 30_000, now), 'live 0 min');
  assert.equal(liveFor(now - 42 * 60_000 - 59_000, now), 'live 42 min');
  assert.equal(liveFor(now - 60 * 60_000, now), 'live 1 hr 0 min');
  assert.equal(liveFor(now - 75 * 60_000, now), 'live 1 hr 15 min');
  assert.equal(liveFor(now + 5000, now), 'live 0 min');   // a clock a little ahead of the server's
});

test('Signals in words', () => {
  assert.deepEqual(signalWords, { feedback: 'Wants feedback', chat: 'Open to chat', 'heads-down': 'Heads down' });
});

test('A card\'s picture is a JPEG when it is one (from a browser that can\'t make WebP), else WebP', () => {
  assert.equal(pictureUrl('/9j/4AAQ'), 'data:image/jpeg;base64,/9j/4AAQ');
  assert.equal(pictureUrl('UklGRiQA'), 'data:image/webp;base64,UklGRiQA');
});

test('Pacing: the first value goes at once; quick changes after it become one send of the last, when the interval passes', () => {
  const clock = pacedClock();
  clock.pacer.push('feedback');
  assert.deepEqual(clock.sent, ['feedback']);
  for (const [t, value] of [[100, 'chat'], [200, 'heads-down'], [300, null]]) {
    clock.t = t;
    clock.pacer.push(value);
  }
  assert.deepEqual(clock.sent, ['feedback']);
  assert.equal(clock.timers.length, 1);
  assert.equal(clock.timers[0].at, 2000);
  clock.t = 2000;
  clock.timers[0].fn();
  assert.deepEqual(clock.sent, ['feedback', null]);

  clock.t = 4500;   // the interval has passed: a change goes at once
  clock.pacer.push('chat');
  assert.deepEqual(clock.sent, ['feedback', null, 'chat']);
  assert.equal(clock.timers.length, 1);
});

test('Pacing: a value equal to the last one sent is skipped, at once or when the interval passes', () => {
  const clock = pacedClock();
  clock.pacer.push('chat');
  clock.t = 5000;
  clock.pacer.push('chat');
  assert.deepEqual(clock.sent, ['chat']);

  clock.pacer.push('feedback');
  clock.t = 5500;
  clock.pacer.push('heads-down');
  clock.t = 6000;
  clock.pacer.push('feedback');   // back to the one sent at 5000: nothing to send when the interval passes
  assert.deepEqual(clock.sent, ['chat', 'feedback']);
  clock.t = 7000;
  clock.timers.at(-1).fn();
  assert.deepEqual(clock.sent, ['chat', 'feedback']);
});

test('Pacing: a value the connection didn\'t send isn\'t counted as sent, so the same value goes the next time', () => {
  const clock = pacedClock();
  clock.live = false;   // reconnecting
  clock.pacer.push('chat');
  assert.deepEqual(clock.tried, ['chat']);
  assert.deepEqual(clock.sent, []);
  clock.live = true;
  clock.pacer.push('chat');
  assert.deepEqual(clock.sent, ['chat']);
});

test('Pacing: reset() clears the waiting value and forgets the last sent, so the same value goes again at once', () => {
  const clock = pacedClock();
  clock.pacer.push('chat');
  clock.t = 100;
  clock.pacer.push('feedback');
  assert.equal(clock.timers.length, 1);
  clock.pacer.reset();   // the socket dropped; the new one starts over
  assert.equal(clock.timers[0].cleared, true);
  clock.t = 200;
  clock.pacer.push('chat');   // the store pushes the current value again once live
  assert.deepEqual(clock.sent, ['chat', 'chat']);
});

test('a signal the app doesn\'t know has no words, whatever it\'s called', () => {
  assert.equal(signalWord('chat'), 'Open to chat');
  for (const signal of [null, undefined, 'constructor', '__proto__', 'nope']) assert.equal(signalWord(signal), null);
});

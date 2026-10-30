// Autosave's retention rules: when a version is due, which versions and documents go.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { VERSION_EVERY_MS, versionDue, versionsToDrop, documentsToEvict } from '../../src/document/autosaveRules.js';

test('a version is due only for a change, and 5 minutes after the last', () => {
  assert.equal(versionDue({ lastVersionAt: null, now: 1000, changed: false }), false);
  assert.equal(versionDue({ lastVersionAt: null, now: 1000, changed: true }), true);
  assert.equal(versionDue({ lastVersionAt: 0, now: VERSION_EVERY_MS - 1, changed: true }), false);
  assert.equal(versionDue({ lastVersionAt: 0, now: VERSION_EVERY_MS, changed: true }), true);
  assert.equal(versionDue({ lastVersionAt: 0, now: VERSION_EVERY_MS, changed: false }), false);
});

test('the newest 20 versions stay, in any order given', () => {
  const versions = Array.from({ length: 23 }, (_, i) => ({ id: i, savedAt: (i * 7) % 23 }));
  const dropped = versionsToDrop(versions);
  assert.equal(dropped.length, 3);
  assert.deepEqual(dropped.map((id) => versions[id].savedAt).sort((a, b) => a - b), [0, 1, 2]);
  assert.deepEqual(versionsToDrop(versions.slice(0, 20)), []);
});

test('versions saved in the same millisecond: the higher id is the newer', () => {
  const versions = Array.from({ length: 22 }, (_, i) => ({ id: i, savedAt: 5 }));
  assert.deepEqual(versionsToDrop(versions).sort((a, b) => a - b), [0, 1]);
});

test('the least recently edited documents go first, past the cap, and kept ones never do', () => {
  const docs = [{ id: 'a', editedAt: 1, bytes: 60 }, { id: 'b', editedAt: 2, bytes: 60 }, { id: 'c', editedAt: 3, bytes: 60 }];
  assert.deepEqual(documentsToEvict(docs, { keep: new Set(), maxBytes: 200 }), []);
  assert.deepEqual(documentsToEvict(docs, { keep: new Set(), maxBytes: 100 }), ['a', 'b']);
  assert.deepEqual(documentsToEvict(docs, { keep: new Set(['a']), maxBytes: 100 }), ['b', 'c']);
  assert.deepEqual(documentsToEvict(docs, { keep: new Set(['a', 'b', 'c']), maxBytes: 1 }), []);
});

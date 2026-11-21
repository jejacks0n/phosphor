// What a version tag does about new library fonts (scripts/library-release.mjs): build as it is, commit them into main
// and move the tag, or warn and build the tag as it is.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { libraryStep } from '../../scripts/library-release.mjs';

const head = { tagSha: 'abc', mainSha: 'abc', hasKey: true };

test('nothing new builds the tag, key or not, head or not', () => {
  assert.equal(libraryStep({ ...head, changed: 0 }), 'build');
  assert.equal(libraryStep({ ...head, changed: 0, hasKey: false }), 'build');
  assert.equal(libraryStep({ ...head, changed: 0, mainSha: 'def' }), 'build');
});

test('new fonts on main\'s head with a key are committed', () => {
  assert.equal(libraryStep({ ...head, changed: 3 }), 'commit');
});

test('new fonts warn when the tag isn\'t main\'s head, or there is no key', () => {
  assert.equal(libraryStep({ ...head, changed: 3, mainSha: 'def' }), 'warn');
  assert.equal(libraryStep({ ...head, changed: 3, hasKey: false }), 'warn');
});

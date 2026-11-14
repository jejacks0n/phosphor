// The desktop workflow's tag check (scripts/release-tag.mjs): which tags are versions, their order, what's refused.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { compare, parse, refusal } from '../../scripts/release-tag.mjs';

test('a version is v and three numbers, with a pre-release after a dash', () => {
  for (const tag of ['v0.1.0', 'v1.2.3', 'v1.2.3-beta', 'v1.2.3-beta.2', 'v10.0.0-rc.1.x-y']) assert.ok(parse(tag), tag);
  for (const tag of ['1.2.3', 'v1.2', 'v1.2.3.4', 'v01.2.3', 'v1.2.3-', 'v1.2.3-beta..1', 'v1.2.3+build', 'nightly']) assert.equal(parse(tag), null, tag);
  assert.deepEqual(parse('v1.2.3-beta.2'), { numbers: [1, 2, 3], pre: ['beta', '2'] });
});

test('versions sort by semver: a pre-release before its release, numbers compared as numbers', () => {
  const order = ['v0.9.0', 'v0.10.0', 'v1.0.0-1', 'v1.0.0-alpha', 'v1.0.0-alpha.1', 'v1.0.0-beta', 'v1.0.0-beta.2', 'v1.0.0-beta.10', 'v1.0.0-rc.1', 'v1.0.0', 'v1.0.1-beta', 'v1.0.1'];
  const shuffled = [...order].reverse();
  assert.deepEqual(shuffled.sort(compare), order);
  assert.equal(compare('v1.0.0-beta', 'v1.0.0-beta'), 0);
});

test('a tag is refused unless it is package.json version and higher than every version tag before it', () => {
  assert.equal(refusal('v1.0.0', '1.0.0', []), null);
  assert.equal(refusal('v1.0.0-beta', '1.0.0-beta', ['v0.9.0', 'nightly', 'v2.0']), null);
  assert.equal(refusal('v1.0.0', '1.0.0', ['v1.0.0-beta.3', 'v1.0.0']), null); // the same tag pushed again
  assert.equal(refusal('v1.0.0-beta.10', '1.0.0-beta.10', ['v1.0.0-beta.9']), null);

  assert.match(refusal('v1.0', '1.0', []), /isn't a version/);
  assert.match(refusal('v1.0.1', '1.0.0', []), /isn't package\.json's version, v1\.0\.0/);
  assert.match(refusal('v1.0.0-beta', '1.0.0-beta', ['v1.0.0']), /isn't higher than the last version, v1\.0\.0$/);
  assert.match(refusal('v0.9.0', '0.9.0', ['v0.10.0', 'v0.9.5']), /, v0\.10\.0$/);
  assert.match(refusal('v1.0.0-beta.2', '1.0.0-beta.2', ['v1.0.0-beta.10']), /, v1\.0\.0-beta\.10$/);
});

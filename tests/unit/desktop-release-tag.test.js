// Version tags (src/lib/semver.js) and the desktop workflow's tag check (scripts/release-tag.mjs): which tags are
// versions, their order, what's refused, and which of the three forms a tag has (a release, a beta, an alpha), with what
// each publishes.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { compare, newerRelease, parse } from '../../src/lib/semver.js';
import { kindOf, outputs, refusal } from '../../scripts/release-tag.mjs';

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

test('a tag is a release, a beta or an alpha, each of the last two with a number after it or not, and nothing else', () => {
  assert.equal(kindOf('v1.0.0'), 'release');
  for (const tag of ['v1.0.0-beta', 'v1.0.0-beta.2', 'v1.0.0-beta.10', 'v0.1.0-beta.0']) assert.equal(kindOf(tag), 'beta', tag);
  for (const tag of ['v1.0.0-alpha', 'v1.0.0-alpha.3']) assert.equal(kindOf(tag), 'alpha', tag);
  // A version by semver, but not one of the three forms: refused, though older tags like it still take their place in the order.
  for (const tag of ['v1.0.0-rc.1', 'v1.0.0-rc', 'v1.0.0-1', 'v1.0.0-beta2', 'v1.0.0-beta.x', 'v1.0.0-beta.02', 'v1.0.0-beta.2.1', 'v1.0.0-Beta', 'v1.0.0-alpha-1', 'v1.0', 'nightly']) {
    assert.equal(kindOf(tag), null, tag);
    assert.match(refusal(tag, tag.slice(1), []), /isn't a version/, tag);
  }
  assert.equal(refusal('v1.0.0', '1.0.0', ['v1.0.0-rc.1']), null);
  assert.match(refusal('v1.0.0-beta', '1.0.0-beta', ['v1.0.0-rc.1']), /, v1\.0\.0-rc\.1$/);
});

test('a release and a beta publish phosphor.work, an alpha does not, and a beta and an alpha are GitHub pre-releases', () => {
  assert.deepEqual(outputs('v1.0.0'), { prerelease: false, prod: true });
  assert.deepEqual(outputs('v1.0.0-beta'), { prerelease: true, prod: true });
  assert.deepEqual(outputs('v1.0.0-beta.2'), { prerelease: true, prod: true });
  assert.deepEqual(outputs('v1.0.0-alpha'), { prerelease: true, prod: false });
  assert.deepEqual(outputs('v1.0.0-alpha.2'), { prerelease: true, prod: false });
});

test('Check for Updates offers the newest later release, and pre-releases only to someone on one', () => {
  const releases = [
    { tag: 'v1.0.0', prerelease: false, url: 'u/1.0.0' },
    { tag: 'v1.1.0', prerelease: false, url: 'u/1.1.0' },
    { tag: 'v1.2.0-beta.2', prerelease: true, url: 'u/1.2.0-beta.2' },
    { tag: 'v1.2.0-beta.10', prerelease: true, url: 'u/1.2.0-beta.10' },
    { tag: 'nightly', prerelease: false, url: 'u/nightly' },
  ];
  assert.equal(newerRelease('1.0.0', releases).tag, 'v1.1.0');
  assert.equal(newerRelease('1.1.0', releases), null);
  assert.equal(newerRelease('1.2.0-beta.2', releases).tag, 'v1.2.0-beta.10');
  assert.equal(newerRelease('1.2.0-beta.10', [...releases, { tag: 'v1.2.0', prerelease: false, url: 'u/1.2.0' }]).tag, 'v1.2.0');
  // A pre-release tag GitHub didn't mark as one is still a pre-release.
  assert.equal(newerRelease('1.1.0', [{ tag: 'v2.0.0-rc.1', prerelease: false, url: 'u' }]), null);
  assert.equal(newerRelease('not-a-version', releases), null);
});

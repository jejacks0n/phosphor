// What a build says it is (vite.config.js, buildInfo) and which builds are pre-releases (src/lib/buildStage.js): the web
// build's version keeps package.json's pre-release suffix, packageVersion is package.json's own, and a build is an alpha
// or a beta by that version or by running on next.
import { expect, test } from 'vitest';
import { buildInfo } from '../../vite.config.js';
import { buildStage } from '@/lib/buildStage.js';

const now = new Date(Date.UTC(2026, 10, 24, 23, 59));

test('the web build\'s version is major.minor and the day, with the pre-release suffix kept', () => {
  expect(buildInfo({ version: '1.0.0', now }).version).toBe('1.0.20261124');
  expect(buildInfo({ version: '1.0.0-beta', now }).version).toBe('1.0.20261124-beta');
  expect(buildInfo({ version: '1.0.0-beta.2', now }).version).toBe('1.0.20261124-beta.2');
  expect(buildInfo({ version: '2.3.9-alpha', now }).version).toBe('2.3.20261124-alpha');
});

test('the desktop build\'s version is package.json\'s whole, and every build carries package.json\'s own as packageVersion', () => {
  expect(buildInfo({ version: '1.0.0-beta.2', now, desktop: true })).toMatchObject({ version: '1.0.0-beta.2', packageVersion: '1.0.0-beta.2' });
  expect(buildInfo({ version: '1.0.0-beta.2', now })).toMatchObject({ packageVersion: '1.0.0-beta.2' });
  expect(buildInfo({ version: '1.0.0', now }).sha).toMatch(/^[0-9a-f]{7}(-dirty)?$|^unknown$/);
});

test('as built here, it is package.json\'s version', () => {
  const { packageVersion, version } = buildInfo();
  expect(packageVersion).toMatch(/^\d+\.\d+\.\d+/);
  expect(version.split('.').slice(0, 2)).toEqual(packageVersion.split('.').slice(0, 2));
  expect(__BUILD__.packageVersion).toBe(packageVersion); // the tests' own build (vitest.config.js)
});

test('a build is an alpha or a beta by its version, a number after either or not', () => {
  const on = (packageVersion) => buildStage({ packageVersion, hostname: 'phosphor.work', dev: false });
  expect(on('1.0.0')).toBe(null);
  expect(on('1.0.0-beta')).toBe('beta');
  expect(on('1.0.0-beta.2')).toBe('beta');
  expect(on('1.0.0-alpha')).toBe('alpha');
  expect(on('1.0.0-alpha.3')).toBe('alpha');
});

test('any build on next is a beta, and an alpha there is still an alpha', () => {
  const at = (hostname, packageVersion = '1.0.0') => buildStage({ packageVersion, hostname, dev: false });
  expect(at('next.phosphor.work')).toBe('beta');
  expect(at('next.phosphor.work', '1.0.0-alpha')).toBe('alpha');
  for (const hostname of ['phosphor.work', 'localhost', 'next.phosphor.work.example.com', 'phosphor', undefined]) expect(at(hostname), String(hostname)).toBe(null);
});

test('in development nothing is a pre-release, whatever the version or the address', () => {
  expect(buildStage({ packageVersion: '1.0.0-beta', hostname: 'next.phosphor.work', dev: true })).toBe(null);
  expect(buildStage({ packageVersion: '1.0.0-alpha', hostname: 'localhost', dev: true })).toBe(null);
});

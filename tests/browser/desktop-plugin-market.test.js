// The marketplace in the desktop app: the list and a listed plugin's files come through the main process
// (window.phosphorDesktop's pluginList and pluginFile, faked here), never the page's own fetch, and are hash-checked here.
import { afterEach, expect, test, vi } from 'vitest';
import listText from '../fixtures/plugin-list.json?raw';
import outlinesManifest from '../../plugins/outlines/phosphor-plugin.json?raw';
import outlinesScript from '../../plugins/outlines/outlines.js?raw';
import { resetDesktop, useFakeDesktop } from '@/social/desktop';
import { MOST_MANIFEST_BYTES, MOST_SCRIPT_BYTES, ManifestError } from '@/plugins/manifest';
import { fetchListed, loadList } from '@/plugins/market';

const code = (promise) => promise.then(() => null, (error) => (error instanceof ManifestError ? error.code : error));

const BASE = 'https://raw.githubusercontent.com/jejacks0n/phosphor/0123456789abcdef0123456789abcdef01234567/plugins/outlines/';

afterEach(() => {
  resetDesktop();
  vi.restoreAllMocks();
});

const fake = (files = { [`${BASE}phosphor-plugin.json`]: outlinesManifest, [`${BASE}outlines.js`]: outlinesScript }) => {
  const desktop = {
    pluginList: vi.fn(async () => listText),
    pluginFile: vi.fn(async (url) => (url in files ? { text: files[url] } : { failed: files.failed ?? 'changed' })),
  };
  useFakeDesktop(desktop);
  return desktop;
};

test('the list and a plugin\'s files come from the main process, within the caps, and fetch isn\'t called', async () => {
  const desktop = fake();
  const fetched = vi.spyOn(globalThis, 'fetch');
  const { entries } = await loadList();
  expect(desktop.pluginList).toHaveBeenCalledTimes(1);
  expect(entries.map(({ manifest }) => manifest.id)).toEqual(['phosphor.outlines', 'phosphor.midnight', 'phosphor.rain', 'phosphor.smear', 'phosphor.superformula', 'phosphor.aberration', 'kim.fog']);

  expect(await fetchListed(entries[0])).toEqual({ manifestText: outlinesManifest, scriptText: outlinesScript });
  expect(desktop.pluginFile.mock.calls).toEqual([
    [`${BASE}phosphor-plugin.json`, MOST_MANIFEST_BYTES],
    [`${BASE}outlines.js`, MOST_SCRIPT_BYTES],
  ]);
  expect(fetched).not.toHaveBeenCalled();
});

test('a file the main process gives that differs from the listed hash is refused', async () => {
  fake({ [`${BASE}phosphor-plugin.json`]: outlinesManifest, [`${BASE}outlines.js`]: `${outlinesScript}\n` });
  const { entries } = await loadList();
  const refused = await fetchListed(entries[0]).catch((error) => error);
  expect(refused).toBeInstanceOf(ManifestError);
  expect(refused.code).toBe('changedSinceListed');
});

test('a file the main process says is gone or too big is changed since listed; one it couldn\'t reach is unavailable', async () => {
  fake({});
  const { entries } = await loadList();
  expect(await code(fetchListed(entries[0]))).toBe('changedSinceListed');
  fake({ failed: 'unreachable' });
  expect(await code(fetchListed(entries[0]))).toBe('listUnavailable');
  const desktop = fake();
  desktop.pluginFile.mockRejectedValue(new Error('Error invoking remote method'));
  expect(await code(fetchListed(entries[0]))).toBe('listUnavailable');
});

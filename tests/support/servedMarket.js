import { vi } from 'vitest';
import listText from '../fixtures/plugin-list.json?raw';
import outlinesManifest from '../../plugins/outlines/phosphor-plugin.json?raw';
import outlinesScript from '../../plugins/outlines/outlines.js?raw';
import midnightManifest from '../../plugins/midnight/phosphor-plugin.json?raw';
import rainManifest from '../fixtures/plugins/rain/phosphor-plugin.json?raw';

// The marketplace as a browser test sees it: fetch stubbed with tests/fixtures/plugin-list.json at /plugins.json and the
// raw GitHub files it lists. A test changes `served` (by URL) before the file's fetched; a URL not there is a 404.
// Restore the mocks after each test.
export const COMMIT = '0123456789abcdef0123456789abcdef01234567';
export const RAW = 'https://raw.githubusercontent.com';

export function serveMarket() {
  const served = {
    '/plugins.json': listText,
    [`${RAW}/jejacks0n/phosphor/${COMMIT}/plugins/outlines/phosphor-plugin.json`]: outlinesManifest,
    [`${RAW}/jejacks0n/phosphor/${COMMIT}/plugins/outlines/outlines.js`]: outlinesScript,
    [`${RAW}/jejacks0n/phosphor/${COMMIT}/plugins/midnight/phosphor-plugin.json`]: midnightManifest,
    [`${RAW}/kim/phosphor-rain/${COMMIT}/phosphor-plugin.json`]: rainManifest,
  };
  const fetched = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (url in served
    ? new Response(served[url]) : new Response('Not found', { status: 404 })));
  return { served, fetched };
}

// The fixture list's text with its entries changed (an array of entries, to change in place or return anew).
export function listWith(change) {
  const list = JSON.parse(listText);
  list.plugins = change(list.plugins) ?? list.plugins;
  return JSON.stringify(list);
}

// A listed entry of its own, its hashes only well formed: for what a card shows, never installed.
export const listed = ({ official = false, repo = 'sam/phosphor-amber', path = '', ...manifest }) => ({
  official, repo, path, commit: COMMIT, manifestHash: 'a'.repeat(64), ...(manifest.script && { scriptHash: 'b'.repeat(64) }),
  manifest: { phosphor: 1, id: 'sam.amber', name: 'Amber CRT', version: '2.0.0', author: 'Sam Ortiz', ...manifest },
});

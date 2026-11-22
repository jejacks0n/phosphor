// The development server's stand-in for raw GitHub (vite.config.js): the fixture list's files, served from this checkout
// at /dev-raw/<repo>/<commit>/<path>/<file>, so a Marketplace install works in `npm run dev`. Only those files: every
// other path is a 404, and nothing outside their folders can be asked for.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { devRawFile } from '../../vite.config.js';

const list = JSON.parse(readFileSync(new URL('../fixtures/plugin-list.json', import.meta.url), 'utf8'));
const COMMIT = list.plugins[0].commit;
const here = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const sha256 = (path) => createHash('sha256').update(readFileSync(path, 'utf8')).digest('hex');

describe('devRawFile', () => {
  it('answers each file the fixture lists from its folder here, the bytes the list\'s hashes are of', () => {
    expect(devRawFile(`/jejacks0n/phosphor/${COMMIT}/plugins/outlines/phosphor-plugin.json`)).toBe(here('plugins/outlines/phosphor-plugin.json'));
    expect(devRawFile(`/jejacks0n/phosphor/${COMMIT}/plugins/outlines/outlines.js`)).toBe(here('plugins/outlines/outlines.js'));
    expect(devRawFile(`/jejacks0n/phosphor/${COMMIT}/plugins/midnight/phosphor-plugin.json`)).toBe(here('plugins/midnight/phosphor-plugin.json'));
    expect(devRawFile(`/kim/phosphor-fog/${COMMIT}/phosphor-plugin.json`)).toBe(here('tests/fixtures/plugins/fog/phosphor-plugin.json'));
    for (const { repo, path, commit, manifest, manifestHash, scriptHash } of list.plugins) {
      const at = `/${repo}/${commit}/${path ? `${path}/` : ''}`;
      expect(sha256(devRawFile(`${at}phosphor-plugin.json`)), repo + path).toBe(manifestHash);
      if (manifest.script) expect(sha256(devRawFile(`${at}${manifest.script}`))).toBe(scriptHash);
    }
  });

  it('answers nothing else', () => {
    for (const url of [
      `/jejacks0n/phosphor/${COMMIT}/package.json`,
      `/jejacks0n/phosphor/${COMMIT}/plugins/outlines/../../package.json`,
      `/jejacks0n/phosphor/${COMMIT}/plugins/outlines/%2e%2e/%2e%2e/package.json`,
      `/kim/phosphor-fog/${COMMIT}/../../outlines.zip`,
      `/kim/phosphor-fog/${'f'.repeat(40)}/phosphor-plugin.json`,
      `/kim/phosphor-fog/${COMMIT}/phosphor-plugin.json?x`,
      `/sam/phosphor-amber/${COMMIT}/phosphor-plugin.json`,
      '/', '', undefined,
    ]) expect(devRawFile(url), String(url)).toBe(null);
  });
});

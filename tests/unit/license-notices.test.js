// About's Licenses (vite.config.js, licenseNotices): the packages a bundle's modules came from, each once, with its
// version, license, page and text.
import { expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devModuleIds, licenseNotices } from '../../vite.config.js';

const modules = fileURLToPath(new URL('../../node_modules/', import.meta.url));

it('lists each package the modules came from once, by name, with its license text, and none for the app\'s own', () => {
  const notices = licenseNotices([
    `${modules}vue/dist/vue.runtime.esm-bundler.js`,
    `\0${modules}@vue/shared/dist/shared.esm-bundler.js?commonjs`,
    `${modules}@vue/shared/dist/other.js`,
    `${modules}paper/dist/paper-core.js`,
    fileURLToPath(new URL('../../src/main.js', import.meta.url)),
  ]);
  expect(notices.map(({ name }) => name)).toEqual(['@vue/shared', 'paper', 'vue']);
  const vue = notices.find(({ name }) => name === 'vue');
  expect(vue).toMatchObject({ license: 'MIT', version: expect.stringMatching(/^\d+\.\d+\.\d+/), url: expect.stringMatching(/^https?:\/\//) });
  expect(vue.text).toMatch(/^The MIT License/);
  expect(vue.text).toContain('Permission is hereby granted');
});

it('adds what the desktop app\'s main process uses, which isn\'t bundled, and a repository like owner/name is a GitHub page', () => {
  const [ws] = licenseNotices([], ['ws']);
  expect(ws).toMatchObject({ name: 'ws', license: 'MIT' });
  expect(ws.text).toContain('Permission is hereby granted');
  const [regex] = licenseNotices([`${modules}ansi-regex/index.js`]);
  expect(regex.url).toBe('https://github.com/chalk/ansi-regex');
});

it('the development server\'s modules are what its prebundled dependencies\' source maps name, and what it served as is', () => {
  const deps = mkdtempSync(join(tmpdir(), 'deps-'));
  writeFileSync(join(deps, 'vue.js.map'), JSON.stringify({ sources: [`${modules}@vue/shared/dist/shared.js`, `${modules}vue/dist/vue.js`] }));
  writeFileSync(join(deps, '_metadata.json'), '{}');
  // What the server served includes the prebundled files themselves, which are no package.
  const ids = devModuleIds(deps, [`${modules}paper/dist/paper-core.js`, `${modules}.vite/deps/vue.js?v=1a2b`, `${modules}.vite/deps/chunk-X.js`]);
  expect(licenseNotices(ids).map(({ name }) => name)).toEqual(['@vue/shared', 'paper', 'vue']);
  expect(devModuleIds(join(deps, 'none'))).toEqual([]);
});

// About's Licenses (vite.config.js, licenseNotices): the packages a bundle's modules came from, each once, with its
// version, license, page and text.
import { expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devModuleIds, licenseNotices, shippedModuleIds } from '../../vite.config.js';

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

// Pinia and vue-router import Vue's devtools only behind a development check, so a build reads them but ships none of
// their code; vue's own entry only re-exports @vue/*, so no chunk holds it, but the app depends on it by name.
it('a build credits the modules whose code it ships, and the app\'s own dependencies it read, never what was shaken out', () => {
  const chunk = { type: 'chunk', modules: {
    [`${modules}@vue/runtime-dom/dist/runtime-dom.esm-bundler.js`]: { renderedLength: 31249 },
    [`${modules}pinia/dist/pinia.mjs`]: { renderedLength: 13238 },
    [`${modules}hookable/dist/index.mjs`]: { renderedLength: 0 },
  } };
  const read = [
    `${modules}vue/dist/vue.runtime.esm-bundler.js`,
    `${modules}@vue/devtools-api/dist/index.js`,
    `${modules}vue-i18n/node_modules/@vue/devtools-api/lib/esm/index.js`, // vue-i18n's own copy, not vue-i18n
    `${modules}birpc/dist/index.mjs`,
    `${modules}@vue/runtime-dom/dist/runtime-dom.esm-bundler.js`,
    `${modules}pinia/dist/pinia.mjs`,
    `${modules}hookable/dist/index.mjs`,
  ];
  const ids = shippedModuleIds({ 'index.js': chunk, 'licenses.json': { type: 'asset' } }, read, ['vue', 'pinia', 'vue-i18n', 'ws']);
  expect(licenseNotices(ids).map(({ name }) => name)).toEqual(['@vue/runtime-dom', 'pinia', 'vue']);
});

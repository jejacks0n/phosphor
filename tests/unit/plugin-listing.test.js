import { test, expect } from 'vitest';
import { wikiLinks, readList, rawUrl, sameListing, marketState, ListError, LIST_FORMAT, OFFICIAL_REPO } from '../../src/plugins/listing.js';

test('wikiLinks reads both link forms, in order, and ignores the rest', () => {
  const page = '- [Rain](https://github.com/kim/phosphor-rain)\n- https://github.com/lee/stuff/tree/main/plugins/glow\nSee https://example.com';
  expect(wikiLinks(page)).toEqual([
    { repo: 'kim/phosphor-rain', branch: null, path: '' },
    { repo: 'lee/stuff', branch: 'main', path: 'plugins/glow' },
  ]);
});

test.each(['https://github.com/kim/r/', 'https://github.com/kim/r.git', 'https://github.com/kim/r#top', 'https://github.com/kim/r?tab=x'])(
  'wikiLinks reads %s as the repo', (url) => {
    expect(wikiLinks(`see ${url} now`)).toEqual([{ repo: 'kim/r', branch: null, path: '' }]);
  });

test('wikiLinks leaves off what ends a sentence after a bare link', () => {
  expect(wikiLinks('Mine is https://github.com/kim/r. Also https://github.com/lee/s, and https://github.com/lee/t;'))
    .toEqual([
      { repo: 'kim/r', branch: null, path: '' },
      { repo: 'lee/s', branch: null, path: '' },
      { repo: 'lee/t', branch: null, path: '' },
    ]);
  expect(wikiLinks('(see https://github.com/lee/stuff/tree/main/plugins/glow.)')).toEqual([{ repo: 'lee/stuff', branch: 'main', path: 'plugins/glow' }]);
  expect(wikiLinks('Clone https://github.com/kim/r.git. Or: https://github.com/kim/q:')).toEqual([
    { repo: 'kim/r', branch: null, path: '' },
    { repo: 'kim/q', branch: null, path: '' },
  ]);
  expect(wikiLinks('https://github.com/kim/r.js/tree/main/a.b')).toEqual([{ repo: 'kim/r.js', branch: 'main', path: 'a.b' }]);
});

test('wikiLinks ignores a link with no repo or a file, and lists a repo and path once', () => {
  expect(wikiLinks('https://github.com/kim https://github.com/kim/r/blob/main/x.json http://github.com/a/b')).toEqual([]);
  const twice = 'https://github.com/kim/r https://github.com/kim/r/ https://github.com/kim/r/tree/dev/a/b https://github.com/kim/r/tree/main/a/b';
  expect(wikiLinks(twice)).toEqual([
    { repo: 'kim/r', branch: null, path: '' },
    { repo: 'kim/r', branch: 'dev', path: 'a/b' },
  ]);
});

const commit = 'a'.repeat(40);
const hash = 'b'.repeat(64);
const manifest = (extra = {}) => ({ phosphor: 1, id: 'kim.glow', name: 'Glow', version: '1.0.0', author: 'Kim', script: 'glow.js', ...extra });
const entry = (extra = {}) => ({ official: false, repo: 'kim/r', path: 'plugins/glow', commit, manifest: manifest(), manifestHash: hash, scriptHash: hash, ...extra });
const list = (...entries) => JSON.stringify({ format: LIST_FORMAT, built: '2026-11-20T00:00:00Z', plugins: entries });

test('readList keeps a good entry, frozen, and the built time', () => {
  const got = readList(list(entry()));
  expect(got.built).toBe('2026-11-20T00:00:00Z');
  expect(got.entries).toHaveLength(1);
  const [one] = got.entries;
  expect(one).toMatchObject({ official: false, repo: 'kim/r', path: 'plugins/glow', commit, manifestHash: hash, scriptHash: hash });
  expect(one.manifest.id).toBe('kim.glow');
  expect(Object.isFrozen(one.manifest)).toBe(true);
});

const theme = { id: 'dim', name: 'Dim', base: 'dark', colors: { accent: '#fff' } };
test.each([
  ['a commit of 39 hex', { commit: 'a'.repeat(39) }],
  ['an uppercase commit', { commit: 'A'.repeat(40) }],
  ['a path with ..', { path: '../x' }],
  ['a path with a leading slash', { path: '/x' }],
  ['a path with an empty segment', { path: 'a//b' }],
  ['a path with a . segment', { path: 'a/./b' }],
  ['a repo with no name', { repo: 'kim' }],
  ['a repo with three parts', { repo: 'kim/r/x' }],
  ['a repo with a query', { repo: 'kim/r?x' }],
  ['a repo named .', { repo: 'kim/.' }],
  ['a repo named ..', { repo: 'kim/..' }],
  ['an owner of .', { repo: './kim' }],
  ['an owner of ..', { repo: '../x' }],
  ['a short manifest hash', { manifestHash: 'b'.repeat(63) }],
  ['an uppercase script hash', { scriptHash: 'B'.repeat(64) }],
  ['no script hash for a script', { scriptHash: undefined }],
  ['a manifest readManifest refuses', { manifest: manifest({ version: 'x' }) }],
  ['a community phosphor. id', { manifest: manifest({ id: 'phosphor.glow' }) }],
  ['official from another repo', { official: true, manifest: manifest({ id: 'phosphor.glow' }) }],
  ['a non-boolean official', { official: 'yes' }],
])('readList drops %s', (_, change) => {
  expect(readList(list(entry(change), entry({ path: 'ok' }))).entries.map((e) => e.path)).toEqual(['ok']);
});

test('readList reads an official entry, and a theme-only one with no script hash', () => {
  const official = entry({ official: true, repo: OFFICIAL_REPO, manifest: manifest({ id: 'phosphor.glow' }) });
  const themed = entry({ manifest: { ...manifest(), script: undefined, themes: [theme] }, scriptHash: undefined });
  const got = readList(list(official, themed)).entries;
  expect(got.map((e) => e.official)).toEqual([true, false]);
  expect(got[1].scriptHash).toBe(null);
});

test('readList refuses the whole file for its format', () => {
  const code = (text) => { try { readList(text); } catch (error) { expect(error).toBeInstanceOf(ListError); return error.code; } };
  expect(code('{')).toBe('notJson');
  expect(code('[]')).toBe('notJson');
  expect(code(JSON.stringify({ format: 2, plugins: [] }))).toBe('newer');
  expect(code(JSON.stringify({ format: 1 }))).toBe('badFormat');
  expect(code(JSON.stringify({ format: 1, plugins: {} }))).toBe('badFormat');
  expect(code(JSON.stringify({ plugins: [] }))).toBe('badFormat');
});

test('rawUrl names a file at the commit', () => {
  expect(rawUrl({ repo: 'kim/r', commit, path: '' }, 'phosphor-plugin.json')).toBe(`https://raw.githubusercontent.com/kim/r/${commit}/phosphor-plugin.json`);
  expect(rawUrl({ repo: 'kim/r', commit, path: 'plugins/glow' }, 'glow.js')).toBe(`https://raw.githubusercontent.com/kim/r/${commit}/plugins/glow/glow.js`);
});

test('sameListing compares repo and path', () => {
  expect(sameListing({ repo: 'a/b', path: '' }, { repo: 'a/b', path: '', commit: 'x' })).toBe(true);
  expect(sameListing({ repo: 'a/b', path: '' }, { repo: 'a/b', path: 'x' })).toBe(false);
  expect(sameListing({ repo: 'a/b', path: '' }, { repo: 'a/c', path: '' })).toBe(false);
  expect(sameListing({ repo: 'a/b', path: '' }, undefined)).toBe(false);
});

test('marketState', () => {
  const [one] = readList(list(entry({ manifest: manifest({ version: '1.1.0' }) }))).entries;
  const record = (version, extra) => ({ manifest: { id: 'kim.glow', version }, listing: { repo: 'kim/r', path: 'plugins/glow', commit, official: false }, ...extra });
  expect(marketState(one, undefined)).toBe('install');
  expect(marketState(one, record('1.0.0'))).toBe('update');
  expect(marketState(one, record('1.1.0'))).toBe('installed');
  expect(marketState(one, record('1.2.0'))).toBe('installed');
  expect(marketState(one, { manifest: { id: 'kim.glow', version: '1.0.0' }, source: 'file' })).toBe('replace');
  expect(marketState(one, record('1.0.0', { listing: { repo: 'lee/r', path: 'plugins/glow' } }))).toBe('replace');
  expect(marketState(one, record('1.0.0', { listing: { repo: 'kim/r', path: 'other' } }))).toBe('replace');
});

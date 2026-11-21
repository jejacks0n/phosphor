import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { officialSources, fetchListing, buildList, makeList, parseArgs } from '../../scripts/plugin-list.mjs';
import { readList } from '../../src/plugins/listing.js';
import { sha256 } from '../../src/plugins/hash.js';

const COMMIT = 'a'.repeat(40);
const manifest = (id, extra = {}) => JSON.stringify({ phosphor: 1, id, name: 'Rain', version: '1.0.0', author: 'Kim', script: 'rain.js', ...extra });
const SCRIPT = 'export default {};';

// A fake fetch: URL -> { status, body }, 404 for anything else; a status of 'throw' is a network error.
const fakeFetch = (map) => async (url) => {
  const hit = map[url] ?? { status: 404, body: '' };
  if (hit.status === 'throw') throw new Error('network');
  return new Response(hit.body, { status: hit.status });
};
const api = (repo, ref = 'HEAD') => `https://api.github.com/repos/${repo}/commits/${ref}`;
const raw = (repo, file, commit = COMMIT) => `https://raw.githubusercontent.com/${repo}/${commit}/${file}`;
const good = (repo, id, mf = manifest(id)) => ({
  [api(repo)]: { status: 200, body: COMMIT },
  [raw(repo, 'phosphor-plugin.json')]: { status: 200, body: mf },
  [raw(repo, 'rain.js')]: { status: 200, body: SCRIPT },
});
const source = (repo) => ({ official: false, repo, branch: null, path: '' });

describe('officialSources', () => {
  it('lists folders holding a manifest, sorted, leaving others out', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plugins-'));
    for (const name of ['outlines', 'midnight', 'notes']) mkdirSync(join(dir, name));
    writeFileSync(join(dir, 'outlines', 'phosphor-plugin.json'), '{}');
    writeFileSync(join(dir, 'midnight', 'phosphor-plugin.json'), '{}');
    expect(officialSources(dir, COMMIT)).toEqual([
      { official: true, repo: 'jejacks0n/phosphor', branch: null, path: 'plugins/midnight', commit: COMMIT },
      { official: true, repo: 'jejacks0n/phosphor', branch: null, path: 'plugins/outlines', commit: COMMIT },
    ]);
  });
});

describe('fetchListing', () => {
  it('makes an entry with the API commit and hashes of the served texts', async () => {
    const { entry } = await fetchListing(source('kim/rain'), { fetch: fakeFetch(good('kim/rain', 'kim.rain')) });
    expect(entry.commit).toBe(COMMIT);
    expect(entry.official).toBe(false);
    expect(entry.manifestHash).toBe(await sha256(manifest('kim.rain')));
    expect(entry.scriptHash).toBe(await sha256(SCRIPT));
    expect(entry.manifest.id).toBe('kim.rain');
  });
  it('sends the token and asks for the branch', async () => {
    const seen = [];
    const inner = fakeFetch({ ...good('kim/rain', 'kim.rain'), [api('kim/rain', 'dev')]: { status: 200, body: COMMIT } });
    const spy = async (url, init) => { seen.push([url, init?.headers]); return inner(url, init); };
    await fetchListing({ ...source('kim/rain'), branch: 'dev' }, { fetch: spy, token: 'tok' });
    expect(seen[0][0]).toBe(api('kim/rain', 'dev'));
    expect(seen[0][1].Authorization).toBe('Bearer tok');
    expect(seen[0][1].Accept).toBe('application/vnd.github.sha');
  });
  it('says gone for a 404, a too-big manifest, and a missing script', async () => {
    const base = good('kim/rain', 'kim.rain');
    expect(await fetchListing(source('kim/rain'), { fetch: fakeFetch({ ...base, [raw('kim/rain', 'phosphor-plugin.json')]: { status: 404, body: '' } }) })).toHaveProperty('gone');
    expect(await fetchListing(source('kim/rain'), { fetch: fakeFetch({ ...base, [raw('kim/rain', 'phosphor-plugin.json')]: { status: 200, body: 'x'.repeat(65537) } }) })).toHaveProperty('gone');
    expect(await fetchListing(source('kim/rain'), { fetch: fakeFetch({ ...base, [raw('kim/rain', 'rain.js')]: { status: 404, body: '' } }) })).toHaveProperty('gone');
    expect(await fetchListing(source('kim/rain'), { fetch: fakeFetch({ ...base, [raw('kim/rain', 'phosphor-plugin.json')]: { status: 200, body: 'nope' } }) })).toHaveProperty('gone');
  });
  it('says failed for a 500, a 429 and a network error', async () => {
    for (const status of [500, 429, 403, 'throw']) {
      const map = { ...good('kim/rain', 'kim.rain'), [raw('kim/rain', 'phosphor-plugin.json')]: { status, body: '' } };
      expect(await fetchListing(source('kim/rain'), { fetch: fakeFetch(map) })).toHaveProperty('failed');
    }
  });
});

describe('buildList', () => {
  const run = (community, map, extra = {}) => buildList({ official: [], community, previous: [], fetch: fakeFetch(map), token: '', refresh: false, ...extra });

  it('keeps the previous entry when a listing fails, leaves it out when there is none', async () => {
    const ok = await fetchListing(source('kim/rain'), { fetch: fakeFetch(good('kim/rain', 'kim.rain')) });
    const map = { ...good('kim/rain', 'kim.rain'), [api('kim/rain')]: { status: 500, body: '' } };
    expect((await run([source('kim/rain')], map, { previous: [ok.entry] })).list.plugins).toEqual([ok.entry]);
    expect((await run([source('kim/rain')], map, { previous: [] })).list.plugins).toEqual([]);
  });
  it('leaves out a community phosphor. id with a log line', async () => {
    const { list, log } = await run([source('kim/rain')], good('kim/rain', 'phosphor.rain'));
    expect(list.plugins).toEqual([]);
    expect(log.some((line) => line.includes('phosphor.rain'))).toBe(true);
  });
  it('keeps the first of two listings with one id', async () => {
    const { list, log } = await run([source('kim/rain'), source('sam/rain')], { ...good('kim/rain', 'kim.rain'), ...good('sam/rain', 'kim.rain') });
    expect(list.plugins.map((one) => one.repo)).toEqual(['kim/rain']);
    expect(log.length).toBeGreaterThan(0);
  });
  it('refuses a refresh with no previous list, builds without one otherwise', async () => {
    await expect(run([], {}, { refresh: true, previous: null })).rejects.toThrow('noPrevious');
    const { list } = await run([source('kim/rain')], good('kim/rain', 'kim.rain'), { previous: null });
    expect(list.plugins).toHaveLength(1);
  });
  it('puts official first and writes a list readList keeps whole', async () => {
    const official = [{ official: true, repo: 'jejacks0n/phosphor', branch: null, path: 'plugins/rain', commit: COMMIT }];
    const map = {
      ...good('kim/rain', 'kim.rain'),
      [raw('jejacks0n/phosphor', 'plugins/rain/phosphor-plugin.json')]: { status: 200, body: manifest('phosphor.rain') },
      [raw('jejacks0n/phosphor', 'plugins/rain/rain.js')]: { status: 200, body: SCRIPT },
      ...good('kim/dusk', 'kim.dusk', manifest('kim.dusk', { script: undefined, themes: [{ id: 'dusk', name: 'Dusk', base: 'dark', colors: {} }] })),
    };
    const { list } = await run([source('kim/rain'), source('kim/dusk')], map, { official });
    expect(list.plugins.map((one) => one.manifest.id)).toEqual(['phosphor.rain', 'kim.rain', 'kim.dusk']);
    expect(list.plugins[0].official).toBe(true);
    expect(readList(JSON.stringify(list)).entries).toHaveLength(3);
  });
});

describe('a served BOM and a big commit', () => {
  it('hashes a script without its BOM, as the page reads it', async () => {
    const map = { ...good('kim/rain', 'kim.rain'), [raw('kim/rain', 'rain.js')]: { status: 200, body: `\uFEFF${SCRIPT}` } };
    const { entry } = await fetchListing(source('kim/rain'), { fetch: fakeFetch(map) });
    expect(entry.scriptHash).toBe(await sha256(SCRIPT));
  });
});

describe('makeList', () => {
  const LIST = 'https://phosphor.work/plugins.json';
  const WIKI = 'https://raw.githubusercontent.com/wiki/jejacks0n/phosphor/Plugins.md';
  const dir = mkdtempSync(join(tmpdir(), 'plugins-'));
  const prev = async () => (await fetchListing(source('kim/rain'), { fetch: fakeFetch(good('kim/rain', 'kim.rain')) })).entry;
  const served = async () => ({ [LIST]: { status: 200, body: JSON.stringify({ format: 1, built: 'x', plugins: [await prev()] }) } });

  it('keeps the community entries when the wiki is unreadable on a normal deploy', async () => {
    const map = { ...(await served()), [WIKI]: { status: 500, body: '' } };
    const { list, log } = await makeList({ dir, commit: COMMIT, refresh: false, fetch: fakeFetch(map) });
    expect(list.plugins.map((one) => one.manifest.id)).toEqual(['kim.rain']);
    expect(log.some((line) => line.includes('wiki'))).toBe(true);
  });
  it('reads the previous list from --previous, or phosphor.work when none is given', async () => {
    const NEXT = 'https://next.phosphor.work/plugins.json';
    const seen = [];
    const spy = (map) => async (url, ...rest) => { seen.push(url); return fakeFetch(map)(url, ...rest); };
    const map = { ...(await served()), [WIKI]: { status: 404, body: '' } };
    await makeList({ dir, commit: COMMIT, refresh: false, fetch: spy(map), previousUrl: NEXT });
    expect(seen).toContain(NEXT);
    expect(seen).not.toContain(LIST);
    seen.length = 0;
    await makeList({ dir, commit: COMMIT, refresh: false, fetch: spy(map) });
    expect(seen).toContain(LIST);
  });
  it('builds with no community entries when there is nothing to keep', async () => {
    const { list } = await makeList({ dir, commit: COMMIT, refresh: false, fetch: fakeFetch({ [WIKI]: { status: 'throw', body: '' } }) });
    expect(list.plugins).toEqual([]);
  });
  it('publishes nothing on a refresh with an unreadable wiki', async () => {
    const map = { ...(await served()), [WIKI]: { status: 500, body: '' } };
    await expect(makeList({ dir, commit: COMMIT, refresh: true, fetch: fakeFetch(map) })).rejects.toThrow('noWiki');
  });
});

describe('parseArgs', () => {
  const SHA = 'b'.repeat(40);
  it('leaves a missing flag undefined, so --previous falls back to the default', () => {
    const args = parseArgs(['--out', 'dist/plugins.json', '--commit', SHA, '--refresh']);
    expect(args).toEqual({ out: 'dist/plugins.json', commit: SHA, refresh: true, previous: 'https://phosphor.work/plugins.json' });
  });
  it('reads --previous, and no --refresh is false', () => {
    const args = parseArgs(['--out', 'dist/plugins.json', '--commit', SHA, '--previous', 'https://next.phosphor.work/plugins.json']);
    expect(args.previous).toBe('https://next.phosphor.work/plugins.json');
    expect(args.refresh).toBe(false);
  });
  it('a missing --out or --commit is undefined, not another flag', () => {
    expect(parseArgs(['--refresh'])).toMatchObject({ out: undefined, commit: undefined });
    expect(parseArgs([]).out).toBeUndefined();
  });
});

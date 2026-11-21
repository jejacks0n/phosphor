// Builds plugins.json, the marketplace list (docs/plugins.md): the official plugins in plugins/ and the GitHub links on
// the wiki's Plugins page, each fetched at a commit and checked by readManifest.
//   node scripts/plugin-list.mjs --out <file> --commit <sha> [--refresh] [--previous <url>]
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIST_FORMAT, OFFICIAL_REPO, OFFICIAL_PREFIX, wikiLinks, readList } from '../src/plugins/listing.js';
import { readManifest, MOST_MANIFEST_BYTES, MOST_SCRIPT_BYTES } from '../src/plugins/manifest.js';
import { sha256 } from '../src/plugins/hash.js';

const WIKI_URL = 'https://raw.githubusercontent.com/wiki/jejacks0n/phosphor/Plugins.md';
const PREVIOUS_URL = 'https://phosphor.work/plugins.json';
const TIMEOUT_MS = 15000;
const AT_ONCE = 4;

export function officialSources(dir, commit) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((one) => one.isDirectory() && existsSync(join(dir, one.name, 'phosphor-plugin.json')))
    .map((one) => one.name)
    .sort()
    .map((name) => ({ official: true, repo: OFFICIAL_REPO, branch: null, path: `plugins/${name}`, commit }));
}

// Thrown when the listing itself is wrong (a 404, over a cap); any other error means try again later.
class Gone extends Error {}

// A body of at most `cap` bytes as text; the stream is dropped as soon as it passes the cap.
async function get(fetch, url, cap, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (response.status === 404) throw new Gone();
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > cap) {
      await response.body.cancel?.().catch(() => {});
      throw new Gone();
    }
    chunks.push(chunk);
  }
  return new TextDecoder().decode(Buffer.concat(chunks)); // like Response.text(): a BOM is dropped
}

export async function fetchListing(source, { fetch, token }) {
  try {
    let commit = source.commit;
    if (!commit) {
      const headers = { Accept: 'application/vnd.github.sha', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      commit = (await get(fetch, `https://api.github.com/repos/${source.repo}/commits/${source.branch || 'HEAD'}`, 1024, headers)).trim();
      if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Gone();
    }
    const base = `https://raw.githubusercontent.com/${source.repo}/${commit}/${source.path ? `${source.path}/` : ''}`;
    const manifestText = await get(fetch, `${base}phosphor-plugin.json`, MOST_MANIFEST_BYTES);
    let manifest;
    try { manifest = readManifest(manifestText); } catch { throw new Gone(); }
    const entry = { official: !!source.official, repo: source.repo, path: source.path, commit, manifest: JSON.parse(JSON.stringify(manifest)), manifestHash: await sha256(manifestText) };
    if (manifest.script) entry.scriptHash = await sha256(await get(fetch, `${base}${manifest.script}`, MOST_SCRIPT_BYTES));
    return { entry };
  } catch (error) {
    if (error instanceof Gone) return { gone: 'gone, a bad manifest, a missing script or over a cap' };
    return { failed: error?.message ?? String(error) };
  }
}

async function inPool(items, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await work(items[i]);
    }
  }));
  return results;
}

// previous: the list phosphor.work serves now (its entries, or a readList result), or null when it can't be read.
export async function buildList({ official, community, previous, fetch, token, refresh }) {
  if (refresh && !previous) throw new Error('noPrevious');
  const before = (Array.isArray(previous) ? previous : previous?.entries) ?? [];
  const sources = [...official, ...community];
  const results = await inPool(sources, (source) => fetchListing(source, { fetch, token }));
  const log = [];
  const plugins = [];
  const ids = new Set();
  sources.forEach((source, i) => {
    const where = `${source.repo}${source.path ? `/${source.path}` : ''}`;
    let entry = results[i].entry;
    if (results[i].gone) return void log.push(`Left out ${where}: ${results[i].gone}.`);
    if (results[i].failed) {
      entry = before.find((one) => one.repo === source.repo && one.path === source.path);
      log.push(`Could not read ${where} (${results[i].failed}); ${entry ? 'kept its entry from the list now served' : 'left out, nothing to keep'}.`);
      if (!entry) return;
      entry = Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== null));
    }
    const { id } = entry.manifest;
    if (!source.official && id.startsWith(OFFICIAL_PREFIX)) return void log.push(`Left out ${where}: ${id} is a Phosphor id.`);
    if (source.official && !id.startsWith(OFFICIAL_PREFIX)) return void log.push(`Left out ${where}: ${id} is not a Phosphor id.`);
    if (ids.has(id)) return void log.push(`Left out ${where}: ${id} is listed already.`);
    ids.add(id);
    plugins.push(entry);
  });
  return { list: { format: LIST_FORMAT, built: new Date().toISOString(), plugins }, log };
}

// The whole run: reads the list served now (at previousUrl) and the wiki page, builds, and returns { list, log }. Throws 'noPrevious'
// or 'noWiki' (a refresh that can't publish). On a normal deploy an unreadable wiki keeps the community entries now served.
export async function makeList({ dir, commit, refresh, fetch, token, previousUrl = PREVIOUS_URL }) {
  let previous = null;
  try {
    const response = await fetch(previousUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.ok) previous = readList(await response.text()).entries;
  } catch { /* no list to fall back on */ }
  if (refresh && !previous) throw new Error('noPrevious');
  let page = '';
  let wikiError = '';
  try {
    const response = await fetch(WIKI_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.ok) page = await response.text();
    else if (response.status !== 404) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    wikiError = error.message;
  }
  if (wikiError && refresh) throw new Error('noWiki');
  const official = officialSources(dir, commit);
  const community = wikiLinks(page).map((link) => ({ official: false, ...link }));
  const built = await buildList({ official, community, previous, fetch, token, refresh });
  if (wikiError) {
    built.log.push(`Could not read the wiki page (${wikiError}); kept the community entries now served.`);
    const ids = new Set(built.list.plugins.map((one) => one.manifest.id));
    for (const entry of previous ?? []) {
      if (entry.official || ids.has(entry.manifest.id)) continue;
      ids.add(entry.manifest.id);
      built.list.plugins.push(Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== null)));
    }
  }
  return built;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name) => args[args.indexOf(name) + 1];
  const out = arg('--out');
  const commit = arg('--commit');
  if (!out || !/^[0-9a-f]{40}$/.test(commit ?? '')) {
    console.error('usage: node scripts/plugin-list.mjs --out <file> --commit <sha> [--refresh] [--previous <url>]');
    process.exit(1);
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const { list, log } = await makeList({ dir: join(root, 'plugins'), commit, refresh: args.includes('--refresh'), previousUrl: arg('--previous') ?? PREVIOUS_URL, fetch, token: process.env.GITHUB_TOKEN });
    log.forEach((line) => console.log(line));
    writeFileSync(out, `${JSON.stringify(list, null, 2)}\n`);
  } catch (error) {
    const words = { noPrevious: 'No list to fall back on; publishing nothing.', noWiki: 'Could not read the wiki page; publishing nothing.' };
    console.error(words[error.message] ?? error.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();

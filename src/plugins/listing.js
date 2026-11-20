// The marketplace list (docs/plugins.md): the wiki's links read into repos, and plugins.json, a stranger's data too,
// read into clean entries. Node's build script imports this as well as the app, so no @/ imports.
import { readManifest } from './manifest.js';
import { compare } from '../lib/semver.js';

export const LIST_FORMAT = 1;
export const OFFICIAL_REPO = 'jejacks0n/phosphor';
export const OFFICIAL_PREFIX = 'phosphor.';

const NAME = /^[A-Za-z0-9._-]+$/;
const isRepo = (value) => typeof value === 'string' && value.split('/').length === 2 && value.split('/').every(segment);
const COMMIT = /^[0-9a-f]{40}$/;
const HASH = /^[0-9a-f]{64}$/;
const segment = (value) => NAME.test(value) && value !== '.' && value !== '..';
const isPath = (value) => typeof value === 'string' && (value === '' || value.split('/').every(segment));

// code: notJson, newer, badFormat.
export class ListError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// The GitHub links in a wiki page, in page order, a repo and path once: https://github.com/<owner>/<repo> or
// .../tree/<branch>/<path>. Everything else is ignored.
export function wikiLinks(markdown) {
  const found = [];
  for (const [, tail] of markdown.matchAll(/https:\/\/github\.com\/([^\s)\]>"'<]+)/g)) {
    const parts = tail.split(/[#?]/)[0].split('/');
    while (parts.length && parts.at(-1) === '') parts.pop();
    parts[1] = parts[1]?.replace(/\.git$/, '');
    const [owner, name, tree, branch, ...path] = parts;
    const ok = segment(owner ?? '') && segment(name ?? '') && (parts.length === 2 || (tree === 'tree' && segment(branch ?? '') && path.every(segment)));
    if (!ok) continue;
    const link = { repo: `${owner}/${name}`, branch: parts.length === 2 ? null : branch, path: path.join('/') };
    if (!found.some((one) => one.repo === link.repo && one.path === link.path)) found.push(link);
  }
  return found;
}

function readEntry(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  const { official, repo, path, commit, manifestHash, scriptHash } = raw;
  if (typeof official !== 'boolean' || !isRepo(repo) || !isPath(path) || !COMMIT.test(commit ?? '') || !HASH.test(manifestHash ?? '')) return null;
  let manifest;
  try { manifest = readManifest(JSON.stringify(raw.manifest)); } catch { return null; }
  if (official !== (manifest.id.startsWith(OFFICIAL_PREFIX))) return null; // only Phosphor's own ids are official
  if (official && repo !== OFFICIAL_REPO) return null;
  if (manifest.script ? !HASH.test(scriptHash ?? '') : false) return null;
  return { official, repo, path, commit, manifest, manifestHash, scriptHash: manifest.script ? scriptHash : null };
}

// plugins.json's text into { built, entries }, each bad entry dropped, or a ListError for the whole file.
export function readList(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new ListError('notJson'); }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new ListError('notJson');
  if (typeof raw.format === 'number' && raw.format > LIST_FORMAT) throw new ListError('newer');
  if (raw.format !== LIST_FORMAT || !Array.isArray(raw.plugins)) throw new ListError('badFormat');
  return { built: typeof raw.built === 'string' ? raw.built : '', entries: raw.plugins.map(readEntry).filter(Boolean) };
}

export const rawUrl = (entry, file) => `https://raw.githubusercontent.com/${entry.repo}/${entry.commit}/${entry.path ? `${entry.path}/` : ''}${file}`;

export const sameListing = (a, b) => !!b && a.repo === b.repo && a.path === b.path;

// What an entry offers beside an installed record (or none): install, installed, update, or replace.
export function marketState(entry, record) {
  if (!record) return 'install';
  if (!sameListing(entry, record.listing)) return 'replace';
  return compare(`v${entry.manifest.version}`, `v${record.manifest.version}`) > 0 ? 'update' : 'installed';
}

// A manifest's theme colors as a card or row shows them: each theme's background, surface and accent, in that order,
// a slot the theme leaves to its base left out.
export const swatches = (manifest) => manifest.themes.flatMap(({ colors }) => ['background', 'surface-0', 'accent'].map((slot) => colors[slot]).filter(Boolean));

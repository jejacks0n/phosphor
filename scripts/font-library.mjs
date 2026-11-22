// Mirrors VileR's and Mœbius's font files into public/fonts/library/ and rebuilds the library's index.
// `npm run fonts`. Never deletes a font: one gone upstream stays. `npm run fonts -- --index-only` rebuilds the index from
// the files already mirrored, fetching nothing.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildIndex, storedPath } from './fontLibraryIndex.mjs';
import { LINKED_FONTS } from '../src/lib/linkedFonts.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts', 'library');
const MIRROR_FILE = join(ROOT, '.mirror.json');

const COLLECTIONS = {
  viler: {
    name: "VileR's VGA text mode fonts", url: 'https://github.com/viler-int10h/vga-text-mode-fonts',
    license: { kind: 'none', file: 'viler/FONTS.TXT' },
  },
  moebius: {
    name: 'Mœbius XBin fonts', url: 'https://github.com/hlotvonen/moebiusXBIN',
    license: { kind: 'unknown' },
  },
};

// Each upstream: its repo, the folder mirrored and the local prefix. Mœbius's folders are a list, viler/ is left out.
const SOURCES = [
  { repo: 'viler-int10h/vga-text-mode-fonts', from: 'FONTS/', to: 'viler/', keep: () => true },
  {
    repo: 'hlotvonen/moebiusXBIN', from: 'app/fonts/', to: 'moebius/',
    keep: (p) => /^(amiga|c64|custom|discmaster|ibm)\//.test(p),
  },
];

// The names a SAUCE font field can hold, and the mirrored file each one means. IBM VGA is left to the built-in font.
export const SAUCE_NAMES = {
  'IBM EGA': 'moebius/ibm/CP437.F14',
  'IBM EGA43': 'moebius/ibm/CP437.F08',
  'IBM VGA50': 'moebius/ibm/CP437.F08',
  'Amiga Topaz 1': 'moebius/amiga/Topaz_a500.F16',
  'Amiga Topaz 1+': 'moebius/amiga/TopazPlus_a500.F16',
  'Amiga Topaz 2': 'moebius/amiga/Topaz_a1200.F16',
  'Amiga Topaz 2+': 'moebius/amiga/TopazPlus_a1200.F16',
  'Amiga P0T-NOoDLE': 'moebius/amiga/P0T-NOoDLE.F16',
  'Amiga MicroKnight': 'moebius/amiga/MicroKnight.F16',
  'Amiga MicroKnight+': 'moebius/amiga/MicroKnightPlus.F16',
  'Amiga mOsOul': "moebius/amiga/mO'sOul.F16",
  'C64 PETSCII unshifted': 'moebius/c64/PETSCII unshifted.F08',
  'C64 PETSCII shifted': 'moebius/c64/PETSCII shifted.F08',
};

// upstream: [{ path, sha }]; local: Map(path -> sha). New or changed paths are fetched, paths only held locally are kept.
export function planMirror({ upstream, local, skip = [] }) {
  const skipped = (p) => skip.includes(p) || p.startsWith('moebius/viler/');
  const fetch = upstream.filter((u) => !skipped(u.path) && local.get(u.path) !== u.sha).map((u) => u.path);
  return { fetch, keep: [...local.keys()].filter((p) => !fetch.includes(p)) };
}

// FONTS.TXT describes folders: " * NAME\ - text" or "+-- NAME\ : text", the text carrying on over indented lines.
export function parseAbout(text) {
  const about = {};
  let key = null;
  for (const line of text.split(/\r?\n/)) {
    const head = /^[ |]*[*+]-*\s+([A-Z0-9_&-]+)\\\s*[-:]\s*(.*)$/.exec(line);
    if (head) { key = head[1]; about[key] = head[2].trim(); continue; }
    const more = /^[ |]+([^ |+*].*)$/.exec(line);
    if (key && more) about[key] += ` ${more[1].replace(/^-\s*/, '').trim()}`;
    else key = null;
  }
  return about;
}

// Each VileR path gets the description of its deepest folder that has one.
export function aboutFor(paths, folders) {
  const about = {};
  for (const p of paths) {
    if (!p.startsWith('viler/')) continue;
    const dirs = p.split('/').slice(1, -1).reverse();
    const hit = dirs.find((d) => folders[d]);
    if (hit) about[p] = folders[hit];
  }
  return about;
}

const headers = () => (process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {});
const get = async (url) => {
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res;
};

async function walk(dir, base = '') {
  const out = [];
  for (const e of await readdir(join(dir, base), { withFileTypes: true }).catch(() => [])) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(dir, rel)));
    else if (!e.name.startsWith('.') && !/\.(json|TXT)$/.test(e.name)) out.push(rel);
  }
  return out;
}

async function main({ indexOnly = false } = {}) {
  const local = new Map(Object.entries(JSON.parse(await readFile(MIRROR_FILE, 'utf8').catch(() => '{}'))));
  const skip = LINKED_FONTS.map((f) => f.upstream);
  let changed = 0;
  for (const { repo, from, to, keep } of indexOnly ? [] : SOURCES) {
    const tree = (await (await get(`https://api.github.com/repos/${repo}/git/trees/master?recursive=1`)).json()).tree;
    const upstream = tree
      .filter((t) => t.type === 'blob' && t.path.startsWith(from) && keep(t.path.slice(from.length)))
      .map((t) => ({ path: to + t.path.slice(from.length), sha: t.sha, src: t.path }));
    const plan = planMirror({ upstream, local, skip });
    const srcOf = new Map(upstream.map((u) => [u.path, u.src]));
    for (const path of plan.fetch) {
      const bytes = Buffer.from(await (await get(`https://raw.githubusercontent.com/${repo}/master/${srcOf.get(path).split('/').map(encodeURIComponent).join('/')}`)).arrayBuffer());
      await mkdir(dirname(join(ROOT, storedPath(path))), { recursive: true });
      await writeFile(join(ROOT, storedPath(path)), bytes);
      local.set(path, upstream.find((u) => u.path === path).sha);
      changed++;
    }
  }
  await mkdir(ROOT, { recursive: true });
  if (!indexOnly) await writeFile(MIRROR_FILE, `${JSON.stringify(Object.fromEntries([...local].sort()), null, 1)}\n`);
  // FONTS.TXT lives at the repo's root, outside FONTS/: fetched when missing, shipped unchanged.
  const fontsTxt = (await readFile(join(ROOT, 'viler', 'FONTS.TXT'), 'utf8').catch(() => '')) || (indexOnly ? '' :
    await (await get('https://raw.githubusercontent.com/viler-int10h/vga-text-mode-fonts/master/FONTS.TXT')).text());
  if (!indexOnly) {
    await mkdir(join(ROOT, 'viler'), { recursive: true });
    await writeFile(join(ROOT, 'viler', 'FONTS.TXT'), fontsTxt);
  }

  // The files are stored under escaped names (storedPath); the index is built from each font's own path.
  const paths = (await walk(ROOT)).map(decodeURIComponent).sort();
  const files = await Promise.all(paths.map(async (path) => ({ path, bytes: new Uint8Array(await readFile(join(ROOT, storedPath(path)))) })));
  const { index, sauce } = buildIndex({
    files, collections: COLLECTIONS, sauceNames: SAUCE_NAMES, about: aboutFor(paths, parseAbout(fontsTxt)),
  });
  await writeFile(join(ROOT, 'index.json'), JSON.stringify(index));
  await writeFile(join(ROOT, 'sauce.json'), JSON.stringify(sauce));
  console.log(`changed=${changed}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main({ indexOnly: process.argv.includes('--index-only') });

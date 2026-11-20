import { ManifestError, readManifest, MOST_MANIFEST_BYTES, MOST_SCRIPT_BYTES } from './manifest.js';
import { readZip } from './zip.js';

const MANIFEST = 'phosphor-plugin.json';
// The manifest is at the top or one folder down; the script is looked up from the manifest's folder.
export const PACKAGE_ROOTS = Object.freeze({ file: MANIFEST, deepest: 1 });

const isRoot = (path) => path === MANIFEST || (path.endsWith(`/${MANIFEST}`) && path.split('/').length === 2);
const dirOf = (path) => path.slice(0, path.length - MANIFEST.length);
const utf8 = (bytes) => new TextDecoder().decode(bytes);

// Each source is { paths: manifest paths found, read(path, most) → text, or null when it isn't there }.
const ofFile = (file, most) => {
  if (file.size > most) throw new ManifestError('tooBig');
  return file.text();
};

function ofFiles(list) {
  let entries = list.map(({ path, file }) => [path.replace(/^\/+/, ''), file]);
  const first = entries[0]?.[0].split('/')[0];
  // a picked folder's own name is the first segment of every path: it is the top
  if (entries.length && entries.every(([path]) => path.includes('/') && path.split('/')[0] === first)) {
    entries = entries.map(([path, file]) => [path.slice(first.length + 1), file]);
  }
  const byPath = new Map(entries);
  return {
    paths: [...byPath.keys()].filter(isRoot),
    read: async (path, most) => (byPath.has(path) ? ofFile(byPath.get(path), most) : null),
  };
}

async function ofHandle(handle) {
  const get = async (path) => {
    const parts = path.split('/');
    try {
      let at = handle;
      for (const part of parts.slice(0, -1)) at = await at.getDirectoryHandle(part);
      return await at.getFileHandle(parts.at(-1));
    } catch (error) {
      if (error?.name === 'NotFoundError' || error?.name === 'TypeMismatchError') return null;
      throw error;
    }
  };
  const paths = [];
  for await (const [name, entry] of handle.entries()) {
    if (name === MANIFEST && entry.kind === 'file') paths.push(name);
    else if (entry.kind === 'directory' && (await get(`${name}/${MANIFEST}`))) paths.push(`${name}/${MANIFEST}`);
  }
  return {
    paths,
    read: async (path, most) => {
      const found = await get(path);
      return found ? ofFile(await found.getFile(), most) : null;
    },
  };
}

async function ofZip(blob) {
  const manifests = await readZip(blob, (path) => (isRoot(path) ? MOST_MANIFEST_BYTES : 0));
  return {
    paths: [...manifests.keys()],
    read: async (path, most) => {
      if (manifests.has(path)) return utf8(manifests.get(path));
      // ponytail: reads the zip's directory again for the script; one pass if that is ever slow
      const got = await readZip(blob, (name) => (name === path ? most : 0));
      return got.has(path) ? utf8(got.get(path)) : null;
    },
  };
}

// A folder's files ({ path, file }), a directory handle, a .zip, or a lone manifest into
// { manifestText, scriptText (null when it has none), handle (the directory handle, else null) }.
export async function readPackage(source) {
  let found;
  if (source instanceof File && !/\.zip$/i.test(source.name)) {
    const manifestText = await ofFile(source, MOST_MANIFEST_BYTES);
    const { script } = readManifest(manifestText);
    if (script) throw new ManifestError('noScript', { path: script });
    return { manifestText, scriptText: null, handle: null };
  }
  if (Array.isArray(source)) found = ofFiles(source);
  else if (source instanceof Blob) found = await ofZip(source);
  else found = await ofHandle(source);

  // the top wins; two one folder down and none at the top is ambiguous
  const top = found.paths.find((path) => path === MANIFEST);
  const at = top ?? (found.paths.length === 1 ? found.paths[0] : null);
  if (at === null || at === undefined) throw new ManifestError('noManifest');
  const manifestText = await found.read(at, MOST_MANIFEST_BYTES);
  const { script } = readManifest(manifestText);
  let scriptText = null;
  if (script) {
    scriptText = await found.read(dirOf(at) + script, MOST_SCRIPT_BYTES);
    if (scriptText === null) throw new ManifestError('noScript', { path: script });
  }
  return { manifestText, scriptText, handle: source instanceof Blob || Array.isArray(source) ? null : source };
}

const MOST_DROPPED = 2000;
const SKIPPED = new Set(['node_modules', '.git']);

const entriesOf = (reader) => new Promise((resolve, reject) => reader.readEntries(resolve, reject));
async function walk(entry, out) {
  if (out.length >= MOST_DROPPED) return;
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    out.push({ path: entry.fullPath.replace(/^\/+/, ''), file });
    return;
  }
  const reader = entry.createReader();
  for (let batch = await entriesOf(reader); batch.length; batch = await entriesOf(reader)) {
    for (const child of batch) if (!SKIPPED.has(child.name)) await walk(child, out);
  }
}

// A drop into a folder's files, else the first file dropped.
export async function filesOfDrop(dataTransfer) {
  // the entry is only available before the first await
  const entry = dataTransfer.items?.[0]?.webkitGetAsEntry?.();
  if (entry?.isDirectory) {
    const out = [];
    await walk(entry, out);
    return out;
  }
  return dataTransfer.files[0];
}

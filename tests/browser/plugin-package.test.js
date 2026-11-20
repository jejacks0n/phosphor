// A plugin comes as a folder, a .zip or a lone manifest; readPackage turns any of them into texts.
import { expect, test } from 'vitest';
import { readPackage, filesOfDrop } from '@/plugins/package.js';
import { MOST_SCRIPT_BYTES } from '@/plugins/manifest.js';
import { zipOf } from '../support/zipOf.js';

const theme = { id: 'ink', name: 'Ink', base: 'dark', colors: {} };
const manifest = (script = 'outlines.js') =>
  JSON.stringify({ phosphor: 1, id: 'jane.outlines', name: 'Outlines', version: '1.0.0', author: 'Jane', ...(script ? { script } : { themes: [theme] }) });
const SCRIPT = 'export default { solvers: [] }';
const file = (text, name = 'x') => new File([text], name);
const files = (entries) => entries.map(([path, text]) => ({ path, file: file(text, path.split('/').pop()) }));

test('a folder\'s files: the manifest at the top or one folder down, and the script it names', async () => {
  const got = await readPackage(files([['outlines/phosphor-plugin.json', manifest()], ['outlines/outlines.js', SCRIPT]]));
  expect(got).toMatchObject({ scriptText: SCRIPT, handle: null });
  expect(JSON.parse(got.manifestText).id).toBe('jane.outlines');
  // picked from one level up, the same plugin one folder down
  const down = await readPackage(files([['repo/outlines/phosphor-plugin.json', manifest('src/o.js')], ['repo/outlines/src/o.js', SCRIPT], ['repo/readme.md', '#']]));
  expect(down.scriptText).toBe(SCRIPT);
});

test('a GitHub zip with its top folder reads the same', async () => {
  const zip = await zipOf([['outlines-main/', ''], ['outlines-main/phosphor-plugin.json', manifest()], ['outlines-main/outlines.js', SCRIPT], ['outlines-main/other.js', 'no']]);
  const got = await readPackage(new File([zip], 'outlines-main.zip'));
  expect(got).toMatchObject({ scriptText: SCRIPT, handle: null });
  const top = await readPackage(new File([await zipOf([['phosphor-plugin.json', manifest()], ['outlines.js', SCRIPT]])], 'o.ZIP'));
  expect(top.scriptText).toBe(SCRIPT);
});

test('a lone manifest has no script; a lone manifest that names one is refused with its path', async () => {
  const got = await readPackage(file(manifest(''), 'phosphor-plugin.json'));
  expect(got.scriptText).toBeNull();
  expect(got.manifestText).toBe(manifest(''));
  await expect(readPackage(file(manifest(), 'phosphor-plugin.json'))).rejects.toMatchObject({ code: 'noScript', detail: { path: 'outlines.js' } });
  await expect(readPackage(files([['phosphor-plugin.json', manifest()]]))).rejects.toMatchObject({ code: 'noScript', detail: { path: 'outlines.js' } });
});

test('a directory handle is read and kept', async () => {
  const root = await navigator.storage.getDirectory();
  const name = `pkg-${Math.random().toString(36).slice(2)}`;
  const dir = await root.getDirectoryHandle(name, { create: true });
  const put = async (at, name, text) => {
    const w = await (await at.getFileHandle(name, { create: true })).createWritable();
    await w.write(text);
    await w.close();
  };
  try {
    const inner = await dir.getDirectoryHandle('outlines', { create: true });
    await put(inner, 'phosphor-plugin.json', manifest());
    await put(inner, 'outlines.js', SCRIPT);
    const got = await readPackage(dir);
    expect(got.handle).toBe(dir);
    expect(got.scriptText).toBe(SCRIPT);
    await put(dir, 'phosphor-plugin.json', manifest(''));
    expect((await readPackage(dir)).scriptText).toBeNull(); // the top wins over one folder down
  } finally {
    await root.removeEntry(name, { recursive: true });
  }
});

test('two folders down, or no manifest, is noManifest', async () => {
  const none = { code: 'noManifest' };
  await expect(readPackage(files([['a/b/c/phosphor-plugin.json', manifest()], ['a/b/c/outlines.js', SCRIPT]]))).rejects.toMatchObject(none);
  await expect(readPackage(files([['a/x/phosphor-plugin.json', manifest()], ['a/y/phosphor-plugin.json', manifest()]]))).rejects.toMatchObject(none);
  await expect(readPackage(files([['a/readme.md', '#']]))).rejects.toMatchObject(none);
  await expect(readPackage(new File([await zipOf([['a/b/c/phosphor-plugin.json', manifest()]])], 'p.zip'))).rejects.toMatchObject(none);
  const root = await navigator.storage.getDirectory();
  const empty = await root.getDirectoryHandle(`pkg-${Math.random().toString(36).slice(2)}`, { create: true });
  try {
    await expect(readPackage(empty)).rejects.toMatchObject(none);
  } finally {
    await root.removeEntry(empty.name, { recursive: true });
  }
});

test('a script that is missing, or past 1 MB, is refused before it is read in full', async () => {
  await expect(readPackage(files([['phosphor-plugin.json', manifest()]]))).rejects.toMatchObject({ code: 'noScript' });
  await expect(readPackage(new File([await zipOf([['phosphor-plugin.json', manifest()]])], 'p.zip')))
    .rejects.toMatchObject({ code: 'noScript', detail: { path: 'outlines.js' } });
  const big = 'x'.repeat(MOST_SCRIPT_BYTES + 1);
  await expect(readPackage(files([['phosphor-plugin.json', manifest()], ['outlines.js', big]]))).rejects.toMatchObject({ code: 'tooBig' });
  await expect(readPackage(new File([await zipOf([['phosphor-plugin.json', manifest()], ['outlines.js', big]])], 'p.zip')))
    .rejects.toMatchObject({ code: 'tooBig' });
});

// A dropped folder comes through webkitGetAsEntry, which a test can't fake with a real drop: only the file path is covered.
test('a dropped file is the first file', async () => {
  const data = new DataTransfer();
  const dropped = file(manifest(''), 'phosphor-plugin.json');
  data.items.add(dropped);
  expect(await filesOfDrop(data)).toBe(data.files[0]);
});

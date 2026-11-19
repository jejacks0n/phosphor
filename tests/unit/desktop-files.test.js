// The desktop app's files (desktop/files.js): what it opens, the files on its command line, a save written whole, and
// the recently opened list.
import { afterEach, test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { OPENABLE, filesIn, isOpenable, isProject, recentFiles, writeWhole } from '../../desktop/files.js';
import { ART_EXTENSIONS } from '../../src/lib/ArtFile.js';

let dir;
const folder = () => (dir = mkdtempSync(path.join(tmpdir(), 'phosphor-files-')));
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

test('it opens what the page opens: projects, pictures, SVGs and every art file', () => {
  for (const ext of ['phosphor', 'png', 'jpg', 'svg', 'xb', ...ART_EXTENSIONS]) assert.ok(OPENABLE.includes(ext), ext);
  assert.ok(isOpenable('/a/Art.ANS') && isOpenable('b.Phosphor') && !isOpenable('main.js') && !isOpenable('notes'));
  assert.ok(isProject('/a/b.PHOSPHOR') && !isProject('/a/b.phosphor.png'));
});

test('the command line’s files: openable ones that exist, as full paths, not flags or the app itself', () => {
  folder();
  writeFileSync(path.join(dir, 'art.ans'), 'x');
  writeFileSync(path.join(dir, 'main.js'), 'x');
  const argv = ['desktop/main.js', '--inspect', 'art.ans', 'gone.png', path.join(dir, 'main.js'), dir];
  assert.deepEqual(filesIn(argv, dir), [path.join(dir, 'art.ans')]);
});

test('a save is written whole, and a failed one leaves the file it would replace and no temporary file', async () => {
  folder();
  const file = path.join(dir, 'art.phosphor');
  await writeWhole(file, new Uint8Array([1, 2, 3]));
  await writeWhole(file, new Uint8Array([4, 5]));
  assert.deepEqual([...readFileSync(file)], [4, 5]);
  assert.deepEqual(readdirSync(dir), ['art.phosphor']);

  await assert.rejects(writeWhole(path.join(dir, 'no-folder', 'art.phosphor'), new Uint8Array([6])));
  await assert.rejects(writeWhole(dir, new Uint8Array([6])));   // a folder in the way: the rename fails
  assert.deepEqual(readdirSync(dir), ['art.phosphor']);
  assert.deepEqual([...readFileSync(file)], [4, 5]);
});

test('the recent list: newest first, once each, at most ten, kept for the next launch', () => {
  folder();
  const store = path.join(dir, 'recent.json');
  const recent = recentFiles(store);
  for (let i = 0; i < 12; i++) recent.add(`/art/${i}.ans`);
  recent.add('/art/5.ans');
  assert.deepEqual(recent.list(), ['/art/5.ans', '/art/11.ans', '/art/10.ans', '/art/9.ans', '/art/8.ans', '/art/7.ans', '/art/6.ans', '/art/4.ans', '/art/3.ans', '/art/2.ans']);
  recent.remove('/art/11.ans');
  assert.deepEqual(recentFiles(store).list(), recent.list());
  recent.clear();
  assert.deepEqual(recentFiles(store).list(), []);
});

test('a kept list that is broken or holds anything but full paths is read as far as it makes sense', () => {
  folder();
  const store = path.join(dir, 'recent.json');
  writeFileSync(store, '{nope');
  assert.deepEqual(recentFiles(store).list(), []);
  writeFileSync(store, JSON.stringify(['/art/a.ans', 3, 'relative.ans', null, '/art/b.ans']));
  assert.deepEqual(recentFiles(store).list(), ['/art/a.ans', '/art/b.ans']);
  assert.deepEqual(recentFiles(path.join(dir, 'none', 'recent.json')).list(), []);
});

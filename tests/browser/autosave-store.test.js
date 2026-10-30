// Autosave's IndexedDB store: images kept once, versions kept to 20, and eviction. Real IndexedDB and
// WebCrypto.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hashImage, writeLatest, addVersion, readLatest, readVersion, listDocuments, listVersions, deleteDocument, evict,
} from '@/document/autosaveStore';
import { ownDatabase } from '../support/socialDatabase.js';

beforeEach(() => ownDatabase('phosphor-autosave', 'store')());
afterEach(() => { vi.restoreAllMocks(); });

// A stored row as it is, with the database's own Blobs.
const row = (store, key) => new Promise((resolve, reject) => {
  const open = indexedDB.open('phosphor-autosave', 1);
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const get = db.transaction(store).objectStore(store).get(key);
    get.onsuccess = () => { db.close(); resolve(get.result); };
  };
});

// How many rows a store holds.
const rows = (store) => new Promise((resolve, reject) => {
  const open = indexedDB.open('phosphor-autosave', 1);
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const count = db.transaction(store).objectStore(store).count();
    count.onsuccess = () => { db.close(); resolve(count.result); };
  };
});

const bytes = (...values) => new Uint8Array(values).buffer;
const sized = (length, fill) => new Uint8Array(length).fill(fill).buffer;

const save = (id, imageBuffer, extra = {}) => writeLatest({
  id, filename: `${id}.phosphor`, editedAt: 1000, savedToFile: false, dirty: true, savedSettings: null,
  rest: bytes(1, 2, 3), imageBuffer, ...extra,
});

test('hashImage is the SHA-256 hex, the same for the same buffer', async () => {
  const buffer = bytes(97, 98, 99);
  expect(await hashImage(buffer)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(await hashImage(buffer)).toBe(await hashImage(buffer));
});

test('an image is stored once, however many documents and versions use it', async () => {
  await save('a', bytes(9, 9));
  await save('b', bytes(9, 9));
  await addVersion('a', { reason: 'timed', savedAt: 1 });
  await addVersion('a', { reason: 'timed', savedAt: 2 });
  await addVersion('b', { reason: 'timed', savedAt: 3 });
  expect(await rows('images')).toBe(1);
  expect(await rows('versions')).toBe(3);
});

test('a version has the latest state, and the latest state can change after it', async () => {
  await save('a', bytes(1, 1), { rest: bytes(1) });
  await addVersion('a', { reason: 'before-restore', savedAt: 5 });
  await save('a', bytes(2, 2), { rest: bytes(2) });
  const [{ id }] = await listVersions('a');
  const { record, imageBuffer } = await readVersion(id);
  expect(new Uint8Array(record.rest)).toEqual(new Uint8Array([1]));
  expect(new Uint8Array(imageBuffer)).toEqual(new Uint8Array([1, 1]));
  expect(record).toMatchObject({ documentId: 'a', filename: 'a.phosphor', reason: 'before-restore', savedAt: 5 });
  const latest = await readLatest('a');
  expect(new Uint8Array(latest.record.rest)).toEqual(new Uint8Array([2]));
  expect(new Uint8Array(latest.imageBuffer)).toEqual(new Uint8Array([2, 2]));
});

test('the bytes are stored as Blobs and read as ArrayBuffers, and a version shares its latest state\'s rest', async () => {
  const image = bytes(7, 7);
  await save('a', image, { rest: bytes(1, 2) });
  const versionId = await addVersion('a', { reason: 'timed', savedAt: 1 });
  expect((await listVersions('a'))[0].id).toBe(versionId);

  for (const stored of [await row('documents', 'a'), await row('versions', versionId)]) {
    expect(stored.rest).toBeInstanceOf(Blob);
    expect(stored.restSize).toBe(2);
    expect(stored.imageSize).toBe(2);
  }
  expect((await row('images', await hashImage(image))).bytes).toBeInstanceOf(Blob);

  for (const { record, imageBuffer } of [await readLatest('a'), await readVersion(versionId)]) {
    expect(record.rest).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(record.rest)).toEqual(new Uint8Array([1, 2]));
    expect(imageBuffer).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(imageBuffer)).toEqual(new Uint8Array([7, 7]));
  }
});

test('past 20 versions the oldest go', async () => {
  await save('a', bytes(1));
  for (let n = 1; n <= 23; n++) await addVersion('a', { reason: 'timed', savedAt: n });
  const versions = await listVersions('a');
  expect(versions.map((v) => v.savedAt)).toEqual(Array.from({ length: 20 }, (_, i) => 23 - i));
});

test('versions saved in the same millisecond list the later one first', async () => {
  await save('a', bytes(1));
  await addVersion('a', { reason: 'timed', savedAt: 7 });
  await addVersion('a', { reason: 'before-restore', savedAt: 7 });
  expect((await listVersions('a')).map((v) => v.reason)).toEqual(['before-restore', 'timed']);
});

test('a version of a document that was never saved is not made', async () => {
  await addVersion('nope', { reason: 'timed', savedAt: 1 });
  expect(await rows('versions')).toBe(0);
});

test('an image goes when the last thing using it does', async () => {
  await save('a', bytes(1));
  await addVersion('a', { reason: 'timed', savedAt: 0 });
  await save('a', bytes(2));
  expect(await rows('images')).toBe(2); // the version still holds the first
  for (let n = 1; n <= 20; n++) await addVersion('a', { reason: 'timed', savedAt: n });
  expect(await rows('images')).toBe(1); // the first aged out
  await deleteDocument('a');
  expect(await rows('images')).toBe(0);
  expect(await rows('versions')).toBe(0);
  expect(await readLatest('a')).toBeNull();
});

test('listDocuments counts a document, its versions and each of its images once', async () => {
  await save('a', sized(100, 1), { rest: sized(10, 0), editedAt: 1 });
  await addVersion('a', { reason: 'timed', savedAt: 1 });
  await save('a', sized(50, 2), { rest: sized(10, 0), editedAt: 2 });
  await addVersion('a', { reason: 'timed', savedAt: 2 });
  await save('b', sized(5, 3), { rest: sized(1, 0), editedAt: 3 });
  expect(await listDocuments()).toEqual([
    { id: 'b', filename: 'b.phosphor', editedAt: 3, bytes: 6 },
    { id: 'a', filename: 'a.phosphor', editedAt: 2, bytes: 10 + 10 + 10 + 100 + 50 },
  ]);
  expect(await listVersions('a')).toEqual([
    { id: expect.any(Number), savedAt: 2, reason: 'timed', bytes: 60 },
    { id: expect.any(Number), savedAt: 1, reason: 'timed', bytes: 110 },
  ]);
});

test('evict removes the oldest documents and their images, and spares those kept', async () => {
  await save('old', sized(100, 1), { rest: sized(10, 0), editedAt: 1 });
  await save('mid', sized(100, 2), { rest: sized(10, 0), editedAt: 2 });
  await save('new', sized(100, 3), { rest: sized(10, 0), editedAt: 3 });
  expect(await evict(new Set(['old']), 250)).toEqual(['mid']);
  expect((await listDocuments()).map((d) => d.id)).toEqual(['new', 'old']);
  expect(await rows('images')).toBe(2);
  expect(await evict(new Set(), 10_000)).toEqual([]);
  expect(await evict(new Set(), 0)).toEqual(['old', 'new']);
  expect(await rows('images')).toBe(0);
});

test('evicting a document leaves an image a surviving document also uses', async () => {
  await save('old', bytes(9, 9), { editedAt: 1 });
  await save('new', bytes(9, 9), { editedAt: 2 });
  expect(await evict(new Set(['new']), 0)).toEqual(['old']);
  expect(await rows('images')).toBe(1);
  expect(new Uint8Array((await readLatest('new')).imageBuffer)).toEqual(new Uint8Array([9, 9]));
});

test('a document that was never saved reads as null', async () => {
  expect(await readLatest('nope')).toBeNull();
  expect(await readVersion(99)).toBeNull();
  expect(await listDocuments()).toEqual([]);
  expect(await listVersions('nope')).toEqual([]);
});

test('a write the database refuses rejects, and leaves what was stored alone', async () => {
  await save('a', bytes(1));
  await expect(save('a', bytes(2), { savedSettings: () => {} })).rejects.toThrow();
  expect(new Uint8Array((await readLatest('a')).imageBuffer)).toEqual(new Uint8Array([1]));
  expect(await rows('images')).toBe(1);
});

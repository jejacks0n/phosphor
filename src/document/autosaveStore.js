/**
 * Autosave's storage, in IndexedDB. Each document has a latest state and up to KEEP_VERSIONS older
 * versions; the images are stored apart, once each however many of them use one.
 *
 * `rest` is the .phosphor bytes with an empty image. It and the images are stored as Blobs, which load
 * lazily, so reading a row doesn't read its bytes and a version shares its latest state's. Callers pass
 * and get ArrayBuffers. The rows also carry the sizes of their `rest` and image (restSize, imageSize),
 * so sizes are counted without reading bytes.
 */
import { versionsToDrop, documentsToEvict, MAX_TOTAL_BYTES } from './autosaveRules.js';

const STORES = ['images', 'documents', 'versions'];

// One transaction as a promise, answered once it has committed and the database is closed, so what it
// wrote is stored and the database can be deleted (tests). `work` gets the transaction and may await
// requests (see ask) as it goes; whatever it throws aborts the transaction and rejects.
function run(stores, mode, work) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('phosphor-autosave', 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      db.createObjectStore('images', { keyPath: 'hash' });
      db.createObjectStore('documents', { keyPath: 'id' }).createIndex('imageHash', 'imageHash');
      const versions = db.createObjectStore('versions', { keyPath: 'id', autoIncrement: true });
      versions.createIndex('documentId', 'documentId');
      versions.createIndex('imageHash', 'imageHash');
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const fail = (error) => { db.close(); reject(error); };
      let tx;
      let result;
      let failure;
      try {
        tx = db.transaction(stores, mode);
      } catch (error) {
        return fail(error);
      }
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = () => fail(failure ?? tx.error);
      work(tx).then((value) => { result = value; }, (error) => {
        failure = error;
        try { tx.abort(); } catch { /* it already ended; onabort or oncomplete answers */ }
      });
    };
  });
}

// A request as a promise. Its error is ours to report, so the transaction isn't left to abort on its own.
const ask = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = (event) => { event.preventDefault(); reject(request.error); };
});

const hashes = new WeakMap();

// SHA-256 hex of the bytes, remembered per buffer. Pass the raw buffer, not a reactive proxy.
export async function hashImage(buffer) {
  if (!hashes.has(buffer)) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
    hashes.set(buffer, Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(''));
  }
  return hashes.get(buffer);
}

// Deletes each image that no latest state or version references any more. Called in the transaction
// that dropped the last reference, so a crash can't leave a reference to a deleted image.
async function freeImages(tx, imageHashes) {
  for (const hash of new Set(imageHashes)) {
    const used = (await ask(tx.objectStore('documents').index('imageHash').count(hash)))
      + (await ask(tx.objectStore('versions').index('imageHash').count(hash)));
    if (!used) tx.objectStore('images').delete(hash);
  }
}

// Deletes a document and its versions; the hashes they referenced, for freeImages.
async function removeDocument(tx, id) {
  const document = await ask(tx.objectStore('documents').get(id));
  const versions = await ask(tx.objectStore('versions').index('documentId').getAll(id));
  tx.objectStore('documents').delete(id);
  for (const version of versions) tx.objectStore('versions').delete(version.id);
  return [document?.imageHash, ...versions.map((v) => v.imageHash)].filter(Boolean);
}

export async function writeLatest({ id, filename, editedAt, savedToFile, dirty, savedSettings, rest, imageBuffer }) {
  const imageHash = await hashImage(imageBuffer); // before the transaction: it dies across an await on crypto
  const row = {
    id, filename, editedAt, savedToFile, dirty, savedSettings,
    rest: new Blob([rest]), restSize: rest.byteLength, imageHash, imageSize: imageBuffer.byteLength,
  };
  await run(STORES, 'readwrite', async (tx) => {
    const before = await ask(tx.objectStore('documents').get(id));
    if ((await ask(tx.objectStore('images').getKey(imageHash))) === undefined) {
      tx.objectStore('images').put({ hash: imageHash, bytes: new Blob([imageBuffer]), size: imageBuffer.byteLength });
    }
    tx.objectStore('documents').put(row);
    if (before && before.imageHash !== imageHash) await freeImages(tx, [before.imageHash]);
  });
}

// Copies the document's latest state into a new version, then drops the versions past KEEP_VERSIONS.
// Returns the new version's id. A document with no latest state has nothing to copy.
export function addVersion(documentId, { reason, savedAt }) {
  return run(STORES, 'readwrite', async (tx) => {
    const latest = await ask(tx.objectStore('documents').get(documentId));
    if (!latest) return;
    const version = { ...latest, documentId, savedAt, reason };
    delete version.id; // the version gets its own
    const versionId = await ask(tx.objectStore('versions').add(version));
    const versions = await ask(tx.objectStore('versions').index('documentId').getAll(documentId));
    const dropped = versionsToDrop(versions);
    for (const versionId of dropped) tx.objectStore('versions').delete(versionId);
    const gone = new Set(dropped);
    await freeImages(tx, versions.filter((v) => gone.has(v.id)).map((v) => v.imageHash));
    return versionId;
  });
}

// { record, imageBuffer } for a stored row, or null, with its bytes read once the transaction has
// finished: it dies across an await on a Blob. A rest or image that isn't a Blob rejects here.
async function readRow(store, key) {
  const found = await run(STORES, 'readonly', async (tx) => {
    const record = await ask(tx.objectStore(store).get(key));
    return record && { record, image: await ask(tx.objectStore('images').get(record.imageHash)) };
  });
  if (!found) return null;
  const { record, image } = found;
  const [rest, imageBuffer] = await Promise.all([record.rest.arrayBuffer(), image.bytes.arrayBuffer()]);
  return { record: { ...record, rest }, imageBuffer };
}

export const readLatest = (id) => readRow('documents', id);

export const readVersion = (versionId) => readRow('versions', versionId);

// A document's bytes: its latest rest, its versions' rest, and each distinct image once.
function documentSizes(documents, versions) {
  return documents.map((document) => {
    const own = versions.filter((v) => v.documentId === document.id);
    const images = new Map([document, ...own].map((row) => [row.imageHash, row.imageSize]));
    const bytes = document.restSize + own.reduce((sum, v) => sum + v.restSize, 0)
      + [...images.values()].reduce((sum, size) => sum + size, 0);
    return { id: document.id, filename: document.filename, editedAt: document.editedAt, bytes };
  });
}

async function readSizes(tx) {
  return documentSizes(
    await ask(tx.objectStore('documents').getAll()),
    await ask(tx.objectStore('versions').getAll()),
  );
}

export const listDocuments = () =>
  run(['documents', 'versions'], 'readonly', async (tx) =>
    (await readSizes(tx)).sort((a, b) => b.editedAt - a.editedAt));

export const listVersions = (documentId) =>
  run(['versions'], 'readonly', async (tx) => {
    const versions = await ask(tx.objectStore('versions').index('documentId').getAll(documentId));
    return versions
      .sort((a, b) => b.savedAt - a.savedAt || b.id - a.id)
      .map((v) => ({ id: v.id, savedAt: v.savedAt, reason: v.reason, bytes: v.restSize + v.imageSize }));
  });

export const deleteDocument = (id) =>
  run(STORES, 'readwrite', async (tx) => freeImages(tx, await removeDocument(tx, id)));

// Deletes the least recently edited documents until the rest fit in maxBytes, sparing those in keep
// (the open ones). Returns the ids it deleted.
export const evict = (keep, maxBytes = MAX_TOTAL_BYTES) =>
  run(STORES, 'readwrite', async (tx) => {
    const ids = documentsToEvict(await readSizes(tx), { keep, maxBytes });
    const freed = [];
    for (const id of ids) freed.push(...(await removeDocument(tx, id)));
    await freeImages(tx, freed);
    return ids;
  });

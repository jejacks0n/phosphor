// Writing the document to the browser as you work (useAutosave): when it writes, what, and what happens
// when it can't. Real IndexedDB, with the timers and the clock faked and the store's writes spied on.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from 'vue';
import { createTestApp, loadImage } from '../support/app.js';
import { ownDatabase } from '../support/socialDatabase.js';
import { useAutosave } from '@/composables/useAutosave';
import { toastMessage } from '@/composables/useToast';
import { writeLatest, addVersion, evict, readLatest, listDocuments, listVersions } from '@/document/autosaveStore';
import { SAVE_AFTER_MS, SAVE_AT_LEAST_EVERY_MS, VERSION_EVERY_MS, MAX_TOTAL_BYTES } from '@/document/autosaveRules';
import { readProject, writeProject } from '@/document/projectIO';

vi.mock('@/document/autosaveStore', { spy: true });

const GRADIENT = '/tests/fixtures/images/gradient.png';
const ATTRS = { fg: '#ffffff', bg: '#000000' };
const BROKEN = "Autosave isn't working in this browser. Save to a file to keep your work.";
let app = null, autosave = null, started = null, deleteDatabase;

beforeEach(async () => {
  deleteDatabase = ownDatabase('phosphor-autosave', 'composable');
  await deleteDatabase();
  vi.clearAllMocks();
  toastMessage.value = null;
});

afterEach(async () => {
  app?.unmount();
  await autosave?.flush();
  app = autosave = started = null;
  vi.useRealTimers();
  vi.mocked(writeLatest).mockReset();
  vi.mocked(evict).mockReset();
  vi.restoreAllMocks();
});

// The time passes, and a write it set off finishes. (flush alone would write whether it was due or not.)
async function pass(ms) {
  const before = started.mock.calls.length;
  await vi.advanceTimersByTimeAsync(ms);
  if (started.mock.calls.length > before) await autosave.flush();
}

// A store with the composable mounted, and no document yet.
async function mounted() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const { project, workspace } = await createTestApp();
  started = vi.spyOn(project, 'projectParts'); // a write's first step, the moment it's due
  app = createApp({ setup() { autosave = useAutosave(); return () => null; } });
  app.mount(document.createElement('div'));
  return { project, workspace };
}

// An image opened with the composable mounted, its opening write done and forgotten.
async function opened() {
  const { project, workspace } = await mounted();
  await loadImage(project, GRADIENT, { cols: 20, rows: 20 });
  await pass(SAVE_AFTER_MS);
  vi.mocked(writeLatest).mockClear();
  vi.mocked(addVersion).mockClear();
  vi.mocked(evict).mockClear();
  return { project, workspace };
}

const edit = (project, col = 0) => {
  project.typeAt(col, 0, 'a', ATTRS);
  project.commitEdit();
};

// The characters in a document's latest state, by cell key.
async function writtenChars(id) {
  const { record } = await readLatest(id);
  const { editCells } = await readProject(new Blob([record.rest]));
  return [...editCells].map(([key, cell]) => `${key}:${cell.char}`);
}

// A row in the store claiming to hold bytes, without the test having to make that many.
const seedDocument = (id, editedAt, bytes) => new Promise((resolve, reject) => {
  const open = indexedDB.open('phosphor-autosave', 1);
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const tx = db.transaction('documents', 'readwrite');
    tx.objectStore('documents').put({ id, filename: id, editedAt, restSize: bytes, imageHash: `hash-${id}`, imageSize: 0 });
    tx.oncomplete = () => { db.close(); resolve(); };
  };
});

test('a new document has an id, and the file calls say whether it has been saved to one', async () => {
  const { project } = await createTestApp();
  expect(project.documentId).toBe(null);
  expect(project.savedToFile).toBe(false);

  await project.setBlankCanvas();
  const first = project.documentId;
  expect(first).toBeTruthy();
  expect(project.savedToFile).toBe(false);

  await project.saveProject();
  expect(project.savedToFile).toBe(true);
  expect(project.documentId).toBe(first);

  await project.setBlankCanvas();
  expect(project.documentId).not.toBe(first);
  expect(project.savedToFile).toBe(false);

  await project.exportFile('ans');
  expect(project.savedToFile).toBe(false); // an export can't reopen as a project

  await project.saveProject();
  await loadImage(project, GRADIENT);
  expect(project.savedToFile).toBe(false);

  project.replaceImage(project.image, project.imageBuffer, { documentId: 'mine' });
  expect(project.documentId).toBe('mine');

  await project.saveProject();
  project.clearImage();
  expect(project.documentId).toBe(null);
  expect(project.savedToFile).toBe(false);
});

test('opening a project file counts as saved to one', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas();
  const blob = await writeProject({ ...await project.projectParts(), imageBuffer: project.imageBuffer });
  project.clearImage();
  await project.loadProject(new File([blob], 'mine.phosphor'));
  expect(project.savedToFile).toBe(true);
});

test('where randomUUID is missing (plain http), a new document still gets an id', async () => {
  const { project } = await createTestApp();
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  try {
    await project.setBlankCanvas();
    expect(project.documentId).toMatch(/^[0-9a-f]{32}$/);
  } finally {
    delete crypto.randomUUID;
  }
});

test('a document is written once when it opens, with no version', async () => {
  const { project } = await mounted();
  await project.setBlankCanvas();
  await pass(SAVE_AFTER_MS);

  expect(writeLatest).toHaveBeenCalledTimes(1);
  const row = (await readLatest(project.documentId)).record;
  expect(row).toMatchObject({ filename: 'untitled', savedToFile: false, dirty: false, editedAt: Date.now() });
  expect(addVersion).not.toHaveBeenCalled();
  expect(evict).toHaveBeenCalledWith(new Set([project.documentId]));
  expect(autosave.current.value).toBe(true);
});

test('edits are written a second after they stop, and at least every 10 seconds during them', async () => {
  const { project } = await opened();

  edit(project);
  vi.advanceTimersByTime(SAVE_AFTER_MS - 1);
  expect(writeLatest).not.toHaveBeenCalled();
  await pass(1);
  expect(writeLatest).toHaveBeenCalledTimes(1);
  expect(await writtenChars(project.documentId)).toEqual(['0,0:a']);

  vi.mocked(writeLatest).mockClear();
  const step = SAVE_AFTER_MS / 2;
  for (let elapsed = step; elapsed < SAVE_AT_LEAST_EVERY_MS; elapsed += step) {
    edit(project);
    vi.advanceTimersByTime(step);
  }
  expect(writeLatest).not.toHaveBeenCalled();
  edit(project);
  await pass(step);
  expect(writeLatest).toHaveBeenCalledTimes(1);
});

test('every kind of change is written: the name, a setting, the image', async () => {
  const { project } = await opened();
  project.filename = 'renamed';
  await pass(SAVE_AFTER_MS);
  expect((await readLatest(project.documentId)).record.filename).toBe('renamed');

  project.brightness += 10;
  await pass(SAVE_AFTER_MS);
  expect(writeLatest).toHaveBeenCalledTimes(2);

  project.imageBuffer = new Uint8Array([1, 2, 3]).buffer;
  await pass(SAVE_AFTER_MS);
  expect((await readLatest(project.documentId)).imageBuffer.byteLength).toBe(3);
});

test('a save with no later edit is written as saved, with no version, and the edit time stays', async () => {
  const { project } = await opened();
  const id = project.documentId;
  edit(project);
  await pass(SAVE_AFTER_MS);
  const { editedAt } = (await readLatest(id)).record;
  expect(await listVersions(id)).toHaveLength(1);

  await vi.advanceTimersByTimeAsync(VERSION_EVERY_MS); // another version would be due, if this were a change
  await project.saveProject();
  expect(autosave.current.value).toBe(false);
  await pass(SAVE_AFTER_MS);

  expect((await readLatest(id)).record).toMatchObject({ savedToFile: true, dirty: false, editedAt });
  expect(await listVersions(id)).toHaveLength(1);
  expect(autosave.current.value).toBe(true);

  edit(project, 1); // the next real change moves the time, and is due its version
  await pass(SAVE_AFTER_MS);
  expect((await readLatest(id)).record).toMatchObject({ savedToFile: true, dirty: true, editedAt: Date.now() });
  expect(await listVersions(id)).toHaveLength(2);
});

test('opening a project file is one write, saved, with no version', async () => {
  const { project } = await mounted();
  await project.setBlankCanvas();
  const blob = await writeProject({ ...await project.projectParts(), imageBuffer: project.imageBuffer });
  await pass(SAVE_AFTER_MS);
  vi.mocked(writeLatest).mockClear();

  await project.loadProject(new File([blob], 'mine.phosphor'));
  await pass(SAVE_AFTER_MS);
  await pass(SAVE_AFTER_MS * 2);
  expect(writeLatest).toHaveBeenCalledTimes(1);
  expect((await readLatest(project.documentId)).record).toMatchObject({ savedToFile: true, dirty: false });
  expect(await listVersions(project.documentId)).toEqual([]);
});

test('a real change whose write failed still counts when the next write works', async () => {
  const { project } = await opened();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(writeLatest).mockRejectedValueOnce(new Error('not this time'));
  edit(project);
  await pass(SAVE_AFTER_MS);
  expect(autosave.current.value).toBe(false);

  await vi.advanceTimersByTimeAsync(5);
  await autosave.flush();
  expect((await readLatest(project.documentId)).record.editedAt).toBe(Date.now());
  expect(await listVersions(project.documentId)).toHaveLength(1);
});

test('a change makes current false at once, with no tick for a watcher', async () => {
  const { project } = await opened();
  expect(autosave.current.value).toBe(true);
  project.typeAt(0, 0, 'a', ATTRS);
  project.commitPending();
  expect(autosave.current.value).toBe(false);
  await pass(SAVE_AFTER_MS);
  expect(autosave.current.value).toBe(true);
});

test('an edit during a write is written next, and writes never overlap', async () => {
  const { project } = await opened();
  const { writeLatest: real } = await vi.importActual('@/document/autosaveStore');
  let inFlight = 0, most = 0, release;
  const held = new Promise((resolve) => { release = resolve; });
  vi.mocked(writeLatest).mockImplementation(async (row) => {
    most = Math.max(most, ++inFlight);
    await held;
    await real(row);
    inFlight--;
  });

  edit(project, 0);
  vi.advanceTimersByTime(SAVE_AFTER_MS);
  await vi.waitUntil(() => inFlight === 1, { interval: 5 });
  edit(project, 1);
  expect(autosave.current.value).toBe(false);
  vi.advanceTimersByTime(SAVE_AFTER_MS); // due, with the first still going
  expect(writeLatest).toHaveBeenCalledTimes(1);

  release();
  await autosave.flush();
  expect(writeLatest).toHaveBeenCalledTimes(2);
  expect(most).toBe(1);
  expect(await writtenChars(project.documentId)).toEqual(['0,0:a', '1,0:a']);
  expect(autosave.current.value).toBe(true);
});

test('a write during a typing run leaves it one undo step', async () => {
  const { project } = await opened();
  project.typeAt(0, 0, 'a', ATTRS);
  await autosave.flush();
  expect(project._stroke?.typing).toBe(true);
  project.typeAt(1, 0, 'b', ATTRS);
  await autosave.flush();
  expect(project._stroke?.typing).toBe(true);
  expect(await writtenChars(project.documentId)).toEqual(['0,0:a', '1,0:b']);

  project.undo();
  expect(project.editCells.size).toBe(0);
  expect(project.canUndo).toBe(false);
});

test('a long typing run is written as it goes, and restores as unsaved', async () => {
  const { project } = await opened();
  project.markSaved();
  const step = SAVE_AFTER_MS - 100; // never pausing long enough to end the run
  for (let col = 0, elapsed = 0; elapsed <= SAVE_AT_LEAST_EVERY_MS; col++, elapsed += step) {
    project.typeAt(col, 0, 'a', ATTRS);
    vi.advanceTimersByTime(step);
  }
  await autosave.flush();
  expect(writeLatest).toHaveBeenCalled();
  expect(project._stroke?.typing).toBe(true);
  expect(project.isDirty).toBe(false); // the store doesn't count it until it commits
  expect((await readLatest(project.documentId)).record.dirty).toBe(true);
});

test('no write while a stroke is open; its end schedules one', async () => {
  const { project } = await opened();
  edit(project);
  project.paintEditPixels([{ x: 0, y: 0 }]);
  await pass(SAVE_AT_LEAST_EVERY_MS * 2);
  expect(writeLatest).not.toHaveBeenCalled();
  expect(project._stroke).toBeTruthy();

  project.commitEdit();
  await pass(SAVE_AFTER_MS);
  expect(writeLatest).toHaveBeenCalledTimes(1);
});

test('an edit before a stroke that is taken back is still written', async () => {
  const { project } = await opened();
  edit(project);
  project.paintEditPixels([{ x: 0, y: 0 }]);
  await pass(SAVE_AFTER_MS);
  expect(writeLatest).not.toHaveBeenCalled();

  project.cancelEdit();
  await pass(SAVE_AFTER_MS);
  expect(writeLatest).toHaveBeenCalledTimes(1);
  expect(await writtenChars(project.documentId)).toEqual(['0,0:a']);
});

test('a version comes after 5 minutes of changes, and none while idle', async () => {
  const { project } = await opened();
  const id = project.documentId;
  expect(await listVersions(id)).toEqual([]);

  edit(project, 0); // the first change: nothing to compare with yet
  await pass(SAVE_AFTER_MS);
  expect(await listVersions(id)).toHaveLength(1);

  edit(project, 1); // too soon for another
  await pass(SAVE_AFTER_MS);
  expect(await listVersions(id)).toHaveLength(1);

  await pass(VERSION_EVERY_MS * 3); // idle: no writes, no versions
  expect(await listVersions(id)).toHaveLength(1);

  edit(project, 2);
  await pass(SAVE_AFTER_MS);
  expect(await listVersions(id)).toHaveLength(2);
  expect((await listVersions(id))[0]).toMatchObject({ reason: 'timed', savedAt: Date.now() });
});

test('each document goes by its own versions', async () => {
  const { project } = await opened();
  const first = project.documentId;
  edit(project);
  await pass(SAVE_AFTER_MS);
  expect(await listVersions(first)).toHaveLength(1);

  await project.setBlankCanvas();
  await pass(SAVE_AFTER_MS);
  edit(project);
  await pass(SAVE_AFTER_MS);
  expect(await listVersions(project.documentId)).toHaveLength(1); // its first, however recent the other's

  project.replaceImage(project.image, project.imageBuffer, { documentId: first });
  await pass(SAVE_AFTER_MS);
  edit(project);
  await pass(SAVE_AFTER_MS);
  expect(await listVersions(first)).toHaveLength(1); // its own is too recent
});

test('a document swapped in during a write keeps the old one\'s write from being stored', async () => {
  const { project } = await opened();
  const first = project.documentId;
  const parts = project.projectParts;
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  vi.spyOn(project, 'projectParts').mockImplementationOnce(async () => {
    const built = await parts();
    await held;
    return built;
  });

  edit(project);
  vi.advanceTimersByTime(SAVE_AFTER_MS);
  await project.setBlankCanvas();
  release();
  await autosave.flush();
  expect(writeLatest).not.toHaveBeenCalledWith(expect.objectContaining({ id: first }));
  expect(await writtenChars(first)).toEqual([]);

  await pass(SAVE_AFTER_MS);
  expect(vi.mocked(writeLatest).mock.calls.map(([row]) => row.id)).toEqual([project.documentId]);
});

test('when the store fails, the toast shows once, and current stays false', async () => {
  const { project } = await opened();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(writeLatest).mockRejectedValue(new Error('no storage here'));

  edit(project, 0);
  await pass(SAVE_AFTER_MS);
  expect(toastMessage.value).toBe(BROKEN);
  expect(autosave.current.value).toBe(false);
  expect(warn).toHaveBeenCalledTimes(1);

  toastMessage.value = null;
  edit(project, 1);
  await pass(SAVE_AFTER_MS);
  expect(toastMessage.value).toBe(null);
  expect(autosave.current.value).toBe(false);
  expect(warn).toHaveBeenCalledTimes(2);
});

test('with no crypto.subtle (plain http), the same: a toast, and current stays false', async () => {
  const { project } = await opened();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  Object.defineProperty(crypto, 'subtle', { value: undefined, configurable: true });
  try {
    await project.setBlankCanvas(); // a new image: its hash isn't remembered
    await pass(SAVE_AFTER_MS);
  } finally {
    delete crypto.subtle;
  }
  expect(toastMessage.value).toBe(BROKEN);
  expect(autosave.current.value).toBe(false);
  expect(warn).toHaveBeenCalled();
});

test('a new version over the cap evicts the least recently edited other document', async () => {
  const { project } = await opened();
  await seedDocument('older', 1, MAX_TOTAL_BYTES / 2 + 1);
  await seedDocument('newer', 2, MAX_TOTAL_BYTES / 2);

  edit(project);
  await pass(SAVE_AFTER_MS);
  expect(await listVersions(project.documentId)).toHaveLength(1);
  expect((await listDocuments()).map((d) => d.id).sort()).toEqual([project.documentId, 'newer'].sort());
});

test('full storage evicts, then retries once', async () => {
  const { project } = await opened();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await seedDocument('other', 1, 10);
  vi.mocked(writeLatest).mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'));

  edit(project, 0);
  await pass(SAVE_AFTER_MS);
  expect(evict).toHaveBeenCalledWith(new Set([project.documentId]), 0);
  expect(writeLatest).toHaveBeenCalledTimes(2);
  expect((await listDocuments()).map((d) => d.id)).toEqual([project.documentId]);
  expect(await writtenChars(project.documentId)).toEqual(['0,0:a']);
  expect(autosave.current.value).toBe(true);
  expect(toastMessage.value).toBe(null);
  expect(warn).not.toHaveBeenCalled();

  vi.mocked(writeLatest).mockClear();
  vi.mocked(writeLatest).mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
  edit(project, 1);
  await pass(SAVE_AFTER_MS);
  expect(writeLatest).toHaveBeenCalledTimes(2); // one retry, not more
  expect(toastMessage.value).toBe(BROKEN);
  expect(autosave.current.value).toBe(false);
});

test('the browser is asked once to keep the storage, after the first write', async () => {
  const persist = vi.spyOn(navigator.storage, 'persist').mockResolvedValue(false);
  const { project } = await opened();
  expect(persist).toHaveBeenCalledTimes(1);
  edit(project);
  await pass(SAVE_AFTER_MS);
  expect(persist).toHaveBeenCalledTimes(1);
});

test('going hidden writes what is waiting', async () => {
  const { project } = await opened();
  started.mockClear();
  edit(project);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(started).toHaveBeenCalledTimes(1);
  await autosave.flush();
  expect(writeLatest).toHaveBeenCalledTimes(1);
  expect(autosave.current.value).toBe(true);
});

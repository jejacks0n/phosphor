// Writing the document to the browser as you work (useAutosave): when it writes, what, and what happens
// when it can't. Real IndexedDB, with the timers and the clock faked and the store's writes spied on.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { ownDatabase } from '../support/socialDatabase.js';
import { useAutosave } from '@/composables/useAutosave';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { toastMessage } from '@/composables/useToast';
import ZeroState from '@/components/ZeroState.vue';
import VersionsDialog from '@/components/VersionsDialog.vue';
import SaveDialog from '@/components/SaveDialog.vue';
import { writeLatest, addVersion, evict, readLatest, readVersion, listDocuments, listVersions } from '@/document/autosaveStore';
import { SAVE_AFTER_MS, SAVE_AT_LEAST_EVERY_MS, VERSION_EVERY_MS, MAX_TOTAL_BYTES, READY_WAIT_MS } from '@/document/autosaveRules';
import { readProject, writeProject, loadImage as decodeImage } from '@/document/projectIO';
import { AnsiFile } from '@/lib/AnsiFile';

vi.mock('@/document/autosaveStore', { spy: true });

const GRADIENT = '/tests/fixtures/images/gradient.png';
const ATTRS = { fg: '#ffffff', bg: '#000000' };
const BROKEN = "Autosave isn't working in this browser. Save to a file to keep your work.";
const COULD_NOT_OPEN = "Couldn't open that document.";
const STORAGE_FULL = "This browser's storage was full, so the oldest work kept here was removed.";
const STORAGE_FULL_STILL = "This browser's storage was full, so the oldest work kept here was removed, and this still didn't fit. Save to a file to keep your work.";
const KEPT_ID = 'phosphor-autosave-document';
let app = null, autosave = null, started = null, deleteDatabase;

beforeEach(async () => {
  deleteDatabase = ownDatabase('phosphor-autosave', 'composable');
  await deleteDatabase();
  sessionStorage.removeItem(KEPT_ID);
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
  await vi.waitUntil(() => autosave.ready.value, { timeout: 3000, interval: 5 });
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

// The page goes away; the tab's sessionStorage and the database stay. mounted() is the page coming back.
async function leave() {
  await autosave.flush();
  app.unmount();
}

// Another tab with a document open: its lock, held until the answer is called.
const otherTab = (id) => new Promise((granted) => {
  navigator.locks.request(`phosphor-autosave:${id}`, () => new Promise((release) => granted(release)));
});

const heldNames = async () => (await navigator.locks.query()).held.map((lock) => lock.name);

const junkRecord = (id) => writeLatest({
  id, filename: id, editedAt: 1, savedToFile: false, dirty: false, savedSettings: '',
  rest: new ArrayBuffer(8), imageBuffer: new Uint8Array([1]).buffer,
});

// writeLatest waits until the answer is called; resolves once a write is waiting there.
async function holdWrites() {
  const { writeLatest: real } = await vi.importActual('@/document/autosaveStore');
  let release, waiting = 0;
  const held = new Promise((resolve) => { release = resolve; });
  vi.mocked(writeLatest).mockImplementation(async (row) => {
    waiting++;
    await held;
    await real(row);
  });
  return { release, reached: () => vi.waitUntil(() => waiting === 1, { interval: 5 }) };
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

// Puts junk where a stored row's rest goes.
const overwriteRest = (id, rest) => new Promise((resolve, reject) => {
  const open = indexedDB.open('phosphor-autosave', 1);
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const tx = db.transaction('documents', 'readwrite');
    const documents = tx.objectStore('documents');
    const get = documents.get(id);
    get.onsuccess = () => documents.put({ ...get.result, rest });
    tx.oncomplete = () => { db.close(); resolve(); };
  };
});

// A row in the store claiming to hold bytes, without the test having to make that many.
const seedDocument = async (id, editedAt, bytes) => {
  await listDocuments(); // the store opens the database first: opened here, it would have no tables
  await new Promise((resolve, reject) => {
    const open = indexedDB.open('phosphor-autosave', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({ id, filename: id, editedAt, restSize: bytes, imageHash: `hash-${id}`, imageSize: 0 });
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  });
};

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

const FULL = () => new DOMException('full', 'QuotaExceededError');

test('full storage removes the oldest other documents one at a time, until the write fits, and says so', async () => {
  const { project } = await opened();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await seedDocument('oldest', 1, 10);
  await seedDocument('older', 2, 10);
  await seedDocument('newest', 3, 10);
  vi.mocked(writeLatest).mockRejectedValueOnce(FULL()).mockRejectedValueOnce(FULL());

  edit(project);
  await pass(SAVE_AFTER_MS);
  expect(writeLatest).toHaveBeenCalledTimes(3);
  expect((await listDocuments()).map((d) => d.id).sort()).toEqual([project.documentId, 'newest'].sort());
  expect(await writtenChars(project.documentId)).toEqual(['0,0:a']);
  expect(autosave.current.value).toBe(true);
  expect(toastMessage.value).toBe(STORAGE_FULL);
  expect(warn).not.toHaveBeenCalled();
});

test('full storage with no estimate to go by still removes what it can', async () => {
  const { project } = await opened();
  await seedDocument('other', 1, 10);
  vi.spyOn(navigator, 'storage', 'get').mockReturnValue(undefined);
  vi.mocked(writeLatest).mockRejectedValueOnce(FULL());

  edit(project);
  await pass(SAVE_AFTER_MS);
  expect((await listDocuments()).map((d) => d.id)).toEqual([project.documentId]);
  expect(autosave.current.value).toBe(true);
});

test('full storage with nothing left to remove says what was removed, and spares what is open', async () => {
  const { project } = await opened();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await seedDocument('closed', 1, 10);
  await seedDocument('open-elsewhere', 2, 10);
  const release = await otherTab('open-elsewhere');
  vi.mocked(writeLatest).mockRejectedValue(FULL());
  try {
    edit(project);
    await pass(SAVE_AFTER_MS);
  } finally {
    release();
  }
  expect(writeLatest).toHaveBeenCalledTimes(2);
  expect((await listDocuments()).map((d) => d.id).sort()).toEqual([project.documentId, 'open-elsewhere'].sort());
  expect(toastMessage.value).toBe(STORAGE_FULL_STILL);
  expect(autosave.current.value).toBe(false);
});

test('removing work is said even after the failure toast has had its one showing', async () => {
  const { project } = await opened();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(writeLatest).mockRejectedValue(new Error('refused'));
  edit(project);
  await pass(SAVE_AFTER_MS);
  expect(toastMessage.value).toBe(BROKEN);

  toastMessage.value = null;
  await seedDocument('closed', 1, 10);
  vi.mocked(writeLatest).mockRejectedValue(FULL());
  edit(project, 1);
  await pass(SAVE_AFTER_MS);
  expect(toastMessage.value).toBe(STORAGE_FULL_STILL);
});

test('a record larger than the browser\'s whole quota removes nothing', async () => {
  const { project } = await opened();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await seedDocument('other', 1, 10);
  vi.spyOn(navigator.storage, 'estimate').mockResolvedValue({ quota: 1, usage: 0 });
  vi.mocked(writeLatest).mockRejectedValue(FULL());

  edit(project);
  await pass(SAVE_AFTER_MS);
  expect(evict).not.toHaveBeenCalled();
  expect(writeLatest).toHaveBeenCalledTimes(1);
  expect((await listDocuments()).map((d) => d.id)).toContain('other');
  expect(toastMessage.value).toBe(BROKEN);
  expect(autosave.current.value).toBe(false);
});

// Paint on the layer, and a canvas that hands back null for it, as a browser out of memory does.
function paintThatWontEncode(project) {
  project.paintEditPixels([{ x: 1, y: 2, r: 255, g: 0, b: 0, alpha: 1 }]);
  project.commitEdit();
  return vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(null));
}

test('paint the canvas can\'t encode fails the write, rather than storing no paint', async () => {
  const { project } = await opened();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  paintThatWontEncode(project);
  await pass(SAVE_AFTER_MS);
  expect(writeLatest).not.toHaveBeenCalled();
  expect(toastMessage.value).toBe(BROKEN);
  expect(autosave.current.value).toBe(false);
});

test('a save that fails says so in the dialog, stays open and doesn\'t count as saved; trying again works', async () => {
  const { project } = await opened();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const encoding = paintThatWontEncode(project);
  const closed = vi.fn();
  const dialog = createApp(SaveDialog, { ext: 'phosphor', onClose: closed });
  dialog.mount(document.createElement('div'));
  try {
    document.querySelector('.modal-dialog form').requestSubmit();
    await vi.waitUntil(() => document.querySelector('.modal-dialog [role=alert]'), { interval: 5 });
    expect(document.querySelector('.modal-dialog [role=alert]').textContent).toBe("Couldn't save the file.");
    expect(closed).not.toHaveBeenCalled();
    expect(project.savedToFile).toBe(false);

    encoding.mockRestore();
    document.querySelector('.modal-dialog form').requestSubmit();
    await vi.waitUntil(() => closed.mock.calls.length, { interval: 5 });
    expect(project.savedToFile).toBe(true);
  } finally {
    dialog.unmount();
  }
});

test('a blank canvas that can\'t be encoded says so and stays at the start', async () => {
  const { project } = await mounted();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(null));
  await project.setBlankCanvas();
  expect(alert).toHaveBeenCalledWith("Couldn't start a blank canvas.");
  expect(project.image).toBe(null);
});

test('a save that fails leaves the name as it was', async () => {
  const { project } = await opened();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const named = project.filename;
  paintThatWontEncode(project);
  const dialog = createApp(SaveDialog, { ext: 'phosphor', onClose: () => {} });
  dialog.mount(document.createElement('div'));
  try {
    const input = document.querySelector('.modal-dialog input');
    input.value = 'renamed';
    input.dispatchEvent(new Event('input'));
    document.querySelector('.modal-dialog form').requestSubmit();
    await vi.waitUntil(() => document.querySelector('.modal-dialog [role=alert]'), { interval: 5 });
    expect(project.filename).toBe(named);
  } finally {
    dialog.unmount();
  }
});

test('an export that fails leaves the name as it was', async () => {
  const { project } = await opened();
  const named = project.filename;
  vi.spyOn(AnsiFile.prototype, 'toBlob').mockImplementation(() => { throw new Error('refused'); });
  await expect(project.exportFile('ans', { filename: 'renamed' })).rejects.toThrow('refused');
  expect(project.filename).toBe(named);
});

test('while a save is under way the dialog says so, and Cancel and Escape wait for it', async () => {
  const { project } = await opened();
  let finish;
  const parts = await project.projectParts();
  started.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve(parts); }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const closed = vi.fn();
  const dialog = createApp(SaveDialog, { ext: 'phosphor', onClose: closed });
  dialog.mount(document.createElement('div'));
  try {
    const root = document.querySelector('.modal-dialog');
    root.querySelector('form').requestSubmit();
    await vi.waitUntil(() => finish, { interval: 5 });
    await nextTick();
    expect(root.querySelector('button.primary').textContent).toBe('Saving…');
    expect(root.querySelector('button.cancel').getAttribute('aria-disabled')).toBe('true');
    root.querySelector('button.cancel').click();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).not.toHaveBeenCalled();

    finish();
    await vi.waitUntil(() => closed.mock.calls.length, { interval: 5 });
  } finally {
    dialog.unmount();
  }
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

test('a version waits while a change is unwritten, for the write with that change in it', async () => {
  const { project } = await opened();
  const { release, reached } = await holdWrites();

  edit(project, 0);
  vi.advanceTimersByTime(SAVE_AFTER_MS);
  await reached();
  edit(project, 1); // the first write's bytes could pair the old image with what's here now
  release();
  await autosave.flush();

  const versions = await listVersions(project.documentId);
  expect(versions).toHaveLength(1);
  const { record } = await readVersion(versions[0].id);
  const { editCells } = await readProject(new Blob([record.rest]));
  expect([...editCells.keys()]).toEqual(['0,0', '1,0']);
});

test('a version due when only a save follows is taken by the write after it', async () => {
  const { project } = await opened();
  const { release, reached } = await holdWrites();

  edit(project);
  vi.advanceTimersByTime(SAVE_AFTER_MS);
  await reached();
  project.savedToFile = true; // not a change, but the record has to say it
  release();
  await autosave.flush();
  expect(await listVersions(project.documentId)).toHaveLength(1);
});

test('an opening write that fails after storing leaves no change to count', async () => {
  const { project } = await mounted();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(evict).mockRejectedValueOnce(new Error('not this time'));
  await project.setBlankCanvas();
  await pass(SAVE_AFTER_MS);
  expect(autosave.current.value).toBe(false);
  const { editedAt } = (await readLatest(project.documentId)).record;

  await vi.advanceTimersByTimeAsync(5);
  await autosave.flush();
  expect(autosave.current.value).toBe(true);
  expect((await readLatest(project.documentId)).record.editedAt).toBe(editedAt);
  expect(await listVersions(project.documentId)).toEqual([]);
});

test('an opening write that fails to store keeps its first edit time when it is retried', async () => {
  const { project } = await mounted();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(writeLatest).mockRejectedValueOnce(new Error('not this time'));
  await project.setBlankCanvas();
  const first = Date.now();
  await pass(SAVE_AFTER_MS);
  expect(autosave.current.value).toBe(false);
  await vi.advanceTimersByTimeAsync(5000);
  await autosave.flush();
  expect((await readLatest(project.documentId)).record.editedAt).toBe(first + SAVE_AFTER_MS);
  expect(await listVersions(project.documentId)).toEqual([]);
});

test('evicting spares the documents open in other tabs', async () => {
  const { project } = await opened();
  await seedDocument('open-elsewhere', 1, MAX_TOTAL_BYTES + 1);
  await seedDocument('closed', 2, 10);
  const release = await otherTab('open-elsewhere');
  try {
    edit(project);
    await pass(SAVE_AFTER_MS);
    const [keep] = vi.mocked(evict).mock.calls[0];
    expect(keep).toEqual(new Set([project.documentId, 'open-elsewhere']));
    expect((await listDocuments()).map((d) => d.id)).toContain('open-elsewhere');
  } finally {
    release();
  }
});

test('restoreDocument brings back the cells, both layers, the settings and the name, and no undo', async () => {
  const { project } = await opened();
  const id = project.documentId;
  project.filename = 'mine';
  project.brightness += 10;
  edit(project);
  project.paintEditPixels([{ x: 1, y: 2, r: 255, g: 0, b: 0, alpha: 1 }]);
  project.commitEdit();
  project.writeBase([{ x: 3, y: 4, hex: '#00ff00' }]);
  project.commitEdit();
  project.render();
  await settle(project);
  await autosave.flush();
  const before = {
    cells: JSON.stringify(project.cells),
    edits: [...project.editCells],
    paint: project.paintLayer.colorAt(1, 2),
    base: project.baseLayer.colorAt(3, 4),
    brightness: project.brightness,
  };
  expect(before.paint).toEqual({ r: 255, g: 0, b: 0 });
  expect(before.base).toEqual({ r: 0, g: 255, b: 0 });
  const saved = await readLatest(id);
  const { record, imageBuffer } = saved;
  project.clearImage();

  await project.restoreDocument({ record, imageBuffer }, { documentId: id });
  await settle(project);
  expect({
    cells: JSON.stringify(project.cells),
    edits: [...project.editCells],
    paint: project.paintLayer.colorAt(1, 2),
    base: project.baseLayer.colorAt(3, 4),
    brightness: project.brightness,
  }).toEqual(before);
  expect(project.filename).toBe('mine');
  expect(project.documentId).toBe(id);
  expect(project.canUndo).toBe(false);
});

test('a document that was unsaved stays unsaved after a restore; one that was saved does not', async () => {
  const { project } = await opened();
  const id = project.documentId;
  edit(project);
  await pass(SAVE_AFTER_MS);
  expect(project.isDirty).toBe(true);

  await project.restoreDocument(await readLatest(id), { documentId: id });
  expect(project.isDirty).toBe(true);
  expect(project.savedToFile).toBe(false);

  await project.saveProject();
  await pass(SAVE_AFTER_MS);
  await project.restoreDocument(await readLatest(id), { documentId: id });
  expect(project.isDirty).toBe(false);
  expect(project.savedToFile).toBe(true);
});

test('restoreDocument throws on a record it cannot read, leaving things as they were', async () => {
  const { project } = await mounted();
  await junkRecord('junk');
  await expect(project.restoreDocument(await readLatest('junk'), { documentId: 'junk' })).rejects.toThrow();
  expect(project.image).toBe(null);
  expect(project.documentId).toBe(null);
});

test('the tab keeps its document\'s id and holds its lock for as long as it has it', async () => {
  const { project } = await mounted();
  await project.setBlankCanvas();
  await pass(SAVE_AFTER_MS);
  const first = project.documentId;
  expect(sessionStorage.getItem(KEPT_ID)).toBe(first);
  await vi.waitUntil(async () => (await heldNames()).includes(`phosphor-autosave:${first}`), { interval: 5 });

  await project.setBlankCanvas();
  await pass(SAVE_AFTER_MS);
  const second = project.documentId;
  expect(sessionStorage.getItem(KEPT_ID)).toBe(second);
  await vi.waitUntil(async () => {
    const names = await heldNames();
    return names.includes(`phosphor-autosave:${second}`) && !names.includes(`phosphor-autosave:${first}`);
  }, { interval: 5 });

  project.clearImage();
  expect(sessionStorage.getItem(KEPT_ID)).toBe(null);
  await vi.waitUntil(async () => !(await heldNames()).includes(`phosphor-autosave:${second}`), { interval: 5 });
  await vi.waitUntil(() => autosave.recent.value.length === 2, { interval: 5 }); // going back to nothing shows the old work
  expect(autosave.recent.value.every((row) => !row.openElsewhere)).toBe(true);
});

test('a refresh restores the tab\'s document under its id, on the ANSI tab, its opening write no change', async () => {
  const { project } = await opened();
  const id = project.documentId;
  const { editedAt } = (await readLatest(id)).record;
  await vi.advanceTimersByTimeAsync(1000);
  await leave();

  const back = await mounted();
  expect(back.project.documentId).toBe(id);
  expect(back.workspace.editorTab).toBe('output');
  expect(back.project.canUndo).toBe(false);
  await vi.advanceTimersByTimeAsync(VERSION_EVERY_MS);
  await autosave.flush();
  expect(writeLatest).toHaveBeenCalled();
  expect((await readLatest(id)).record.editedAt).toBe(editedAt);
  expect(await listVersions(id)).toEqual([]); // a change would be due its first by now

  await back.project.saveProject(); // and it's no change after that, either
  await pass(SAVE_AFTER_MS);
  expect((await readLatest(id)).record).toMatchObject({ savedToFile: true, editedAt });
  expect(await listVersions(id)).toEqual([]);

  edit(back.project);
  await pass(SAVE_AFTER_MS);
  expect((await readLatest(id)).record.editedAt).toBe(Date.now());
  expect(await listVersions(id)).toHaveLength(1);
});

test('a change right after a restore moves the edit time, even if the first try at writing it fails', async () => {
  const { project } = await opened();
  const id = project.documentId;
  const { editedAt } = (await readLatest(id)).record;
  await leave();
  const back = await mounted();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(writeLatest).mockRejectedValueOnce(new Error('not this time'));
  await vi.advanceTimersByTimeAsync(5);

  edit(back.project);
  await pass(SAVE_AFTER_MS);
  await vi.advanceTimersByTimeAsync(5);
  await autosave.flush();
  const moved = (await readLatest(id)).record.editedAt;
  expect(moved).not.toBe(editedAt);
  expect(moved).toBeGreaterThan(editedAt);
});

test('a restore does not pull you off the SOCIAL tab', async () => {
  const { project } = await opened();
  await leave();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const { workspace, project: back } = await createTestApp();
  workspace.editorTab = 'social'; // back from signing in, say: SocialStore.start() ran first
  app = createApp({ setup() { autosave = useAutosave(); return () => null; } });
  app.mount(document.createElement('div'));
  await vi.waitUntil(() => autosave.ready.value, { timeout: 3000, interval: 5 });
  expect(back.documentId).toBe(project.documentId);
  expect(workspace.editorTab).toBe('social');
});

test('a restore stays on the tab the address named, and settles the document', async () => {
  const { project } = await opened();
  await leave();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const { workspace, project: back } = await createTestApp();
  workspace.tabAddressed = true; // the router placed you on PIXEL before this ran
  app = createApp({ setup() { autosave = useAutosave(); return () => null; } });
  app.mount(document.createElement('div'));
  expect(workspace.documentSettled).toBe(false);
  await vi.waitUntil(() => autosave.ready.value, { timeout: 3000, interval: 5 });
  expect(back.documentId).toBe(project.documentId);
  expect(workspace.editorTab).toBe('input');
  expect(workspace.documentSettled).toBe(true);
});

test('a held lock that is let go within the wait is a reload: the document keeps its id', async () => {
  const { project } = await opened();
  const id = project.documentId;
  await leave();
  const name = `phosphor-autosave:${id}`;
  await vi.waitUntil(async () => !(await heldNames()).includes(name), { interval: 5 });
  const release = await otherTab(id);

  const coming = mounted();
  await vi.waitUntil(async () => (await navigator.locks.query()).pending.some((lock) => lock.name === name), { interval: 5 });
  release();
  const back = await coming;
  expect(back.project.documentId).toBe(id);
});

test('a lock still held after the wait is a duplicated tab: a copy with its own id and no versions', async () => {
  const { project } = await opened();
  const id = project.documentId;
  edit(project);
  await pass(SAVE_AFTER_MS);
  const { editedAt } = (await readLatest(id)).record;
  expect(await listVersions(id)).toHaveLength(1);
  await leave();
  await vi.waitUntil(async () => !(await heldNames()).includes(`phosphor-autosave:${id}`), { interval: 5 });
  const release = await otherTab(id);
  try {
    const back = await mounted();
    const copy = back.project.documentId;
    expect(copy).toBeTruthy();
    expect(copy).not.toBe(id);
    expect(sessionStorage.getItem(KEPT_ID)).toBe(copy);
    expect([...back.project.editCells.keys()]).toEqual(['0,0']);

    await pass(SAVE_AFTER_MS);
    expect((await readLatest(copy)).record.editedAt).toBe(editedAt);
    expect(await listVersions(copy)).toEqual([]);
    expect(await listVersions(id)).toHaveLength(1);
  } finally {
    release();
  }
});

test.each([
  ['no record', () => {}],
  ['an unreadable record', () => junkRecord('gone')],
  ['a record whose image is missing', () => seedDocument('gone', 1, 10)],
  ['a record whose rest is not a Blob', async () => {
    await junkRecord('gone');
    await overwriteRest('gone', 'junk');
  }],
])('%s: a warning, the id forgotten, the zero state', async (_, seed) => {
  await seed();
  sessionStorage.setItem(KEPT_ID, 'gone');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { project, workspace } = await mounted();
  expect(warn).toHaveBeenCalled();
  expect(sessionStorage.getItem(KEPT_ID)).toBe(null);
  expect(project.image).toBe(null);
  expect(workspace.editorTab).toBe('input');
  expect(autosave.ready.value).toBe(true);
  expect(autosave.recent.value.map((row) => row.id)).toEqual((await listDocuments()).map((d) => d.id));
  expect(await heldNames()).not.toContain('phosphor-autosave:gone');
});

test('no id: nothing is restored, and recent lists the documents, newest first, marking those open elsewhere', async () => {
  await seedDocument('older', 1, 10);
  await seedDocument('newer', 2, 10);
  const release = await otherTab('newer');
  try {
    const { project } = await mounted();
    expect(project.image).toBe(null);
    expect(autosave.recent.value).toEqual([
      { id: 'newer', filename: 'newer', editedAt: 2, openElsewhere: true },
      { id: 'older', filename: 'older', editedAt: 1, openElsewhere: false },
    ]);
  } finally {
    release();
  }
});

test('with the browser storage failing, the app is still ready, whether or not the tab has an id', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(indexedDB.open).mockImplementation(() => { throw new DOMException('no', 'SecurityError'); });
  await mounted();
  expect(autosave.ready.value).toBe(true);
  expect(autosave.recent.value).toEqual([]);
  app.unmount();

  sessionStorage.setItem(KEPT_ID, 'gone');
  await mounted();
  expect(autosave.ready.value).toBe(true);
  expect(warn).toHaveBeenCalled();
});

test('a document already open isn\'t restored over', async () => {
  const { project } = await opened();
  const id = project.documentId;
  await leave();
  vi.mocked(readLatest).mockImplementationOnce(async (...args) => {
    const { readLatest: real } = await vi.importActual('@/document/autosaveStore');
    const saved = await real(...args);
    await useProjectStore().setBlankCanvas(); // a dropped file, landing during the read
    return saved;
  });
  const back = await mounted();
  expect(back.project.documentId).not.toBe(id);
  expect(back.project.filename).toBe('untitled');
  expect(back.workspace.editorTab).toBe('input');
  expect(sessionStorage.getItem(KEPT_ID)).toBe(back.project.documentId);
});

test('openRecent restores under that id, taking its lock', async () => {
  const { project } = await opened();
  const id = project.documentId;
  const { editedAt } = (await readLatest(id)).record;
  await leave();
  sessionStorage.removeItem(KEPT_ID);

  const back = await mounted();
  expect(back.project.image).toBe(null);
  expect(autosave.recent.value.map((row) => row.id)).toEqual([id]);
  await autosave.openRecent(id);
  expect(back.project.documentId).toBe(id);
  expect(back.workspace.editorTab).toBe('output');
  expect(sessionStorage.getItem(KEPT_ID)).toBe(id);
  expect(await heldNames()).toContain(`phosphor-autosave:${id}`);
  await pass(SAVE_AFTER_MS);
  expect((await readLatest(id)).record.editedAt).toBe(editedAt);
});

test('openRecent on a document Start New Project just left brings it back', async () => {
  const { project } = await opened();
  const id = project.documentId;
  edit(project);
  await pass(SAVE_AFTER_MS);
  const { editedAt } = (await readLatest(id)).record;
  project.clearImage();
  await vi.waitUntil(() => autosave.recent.value.length === 1, { interval: 5 });

  await autosave.openRecent(id);
  expect(project.documentId).toBe(id);
  expect([...project.editCells.keys()]).toEqual(['0,0']);
  await pass(SAVE_AFTER_MS);
  expect((await readLatest(id)).record.editedAt).toBe(editedAt);
});

test('openRecent on a lock that turned out held: a warning, a toast, the list refreshed', async () => {
  await seedDocument('elsewhere', 1, 10);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { project } = await mounted();
  expect(autosave.recent.value[0].openElsewhere).toBe(false);
  const release = await otherTab('elsewhere');
  try {
    await autosave.openRecent('elsewhere');
    expect(project.image).toBe(null);
    expect(warn).toHaveBeenCalled();
    expect(toastMessage.value).toBe(COULD_NOT_OPEN);
    expect(autosave.recent.value[0].openElsewhere).toBe(true);
  } finally {
    release();
  }
});

test('a document let go of and then opened in another tab is marked once a click finds that out', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { project } = await opened();
  const id = project.documentId;
  project.clearImage();
  await vi.waitUntil(() => autosave.recent.value.length === 1, { interval: 5 });
  const release = await otherTab(id);
  try {
    await autosave.openRecent(id);
    expect(toastMessage.value).toBe(COULD_NOT_OPEN);
    expect(autosave.recent.value[0].openElsewhere).toBe(true);
  } finally {
    release();
  }
});

test('a document opening while openRecent waits for its lock gets no failure toast', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await seedDocument('waiting', 1, 10);
  const { project } = await mounted();
  const buffer = await (await fetch(GRADIENT)).arrayBuffer();
  const image = await decodeImage(buffer, 'image/png');

  const opening = autosave.openRecent('waiting');
  project.replaceImage(image, buffer, { cols: 20, rows: 20 });
  await opening;
  expect(project.image).not.toBe(null);
  expect(toastMessage.value).toBe(null);
});

test('a write still running when another document comes back doesn\'t count as that document\'s change', async () => {
  const { project } = await opened();
  const first = project.documentId;
  const { editedAt } = (await listDocuments()).find((d) => d.id === first);
  project.clearImage();
  await pass(SAVE_AFTER_MS);
  await loadImage(project, GRADIENT, { cols: 20, rows: 20 });
  await pass(SAVE_AFTER_MS);
  await vi.advanceTimersByTimeAsync(60_000);

  const { release, reached } = await holdWrites();
  edit(project);
  await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS);
  await reached();
  project.clearImage();
  await autosave.openRecent(first);
  vi.mocked(addVersion).mockClear();
  release();
  await autosave.flush();
  await pass(SAVE_AFTER_MS);

  expect(project.documentId).toBe(first);
  expect((await listDocuments()).find((d) => d.id === first).editedAt).toBe(editedAt);
  expect(addVersion).not.toHaveBeenCalledWith(first, expect.anything());
});

test('a database that never answers doesn\'t hold back the start screen', async () => {
  vi.mocked(listDocuments).mockImplementationOnce(() => new Promise(() => {}));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  await createTestApp();
  app = createApp({ setup() { autosave = useAutosave(); return () => null; } });
  app.mount(document.createElement('div'));
  await vi.advanceTimersByTimeAsync(READY_WAIT_MS - 1);
  expect(autosave.ready.value).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(autosave.ready.value).toBe(true);
  expect(useWorkspaceStore().documentSettled).toBe(true); // or a landing would wait on it forever
});

test('a restore that answers after the wait still brings the document back', async () => {
  const { project: before } = await opened();
  const id = before.documentId;
  await leave();

  const real = vi.mocked(readLatest).getMockImplementation() ?? (await vi.importActual('@/document/autosaveStore')).readLatest;
  let answer;
  vi.mocked(readLatest).mockImplementationOnce((...args) => new Promise((resolve) => { answer = () => resolve(real(...args)); }));
  const { project, workspace } = await createTestApp();
  app = createApp({ setup() { autosave = useAutosave(); return () => null; } });
  app.mount(document.createElement('div'));
  await vi.waitUntil(() => answer, { interval: 5 });
  await vi.advanceTimersByTimeAsync(READY_WAIT_MS);
  expect(autosave.ready.value).toBe(true);
  expect(project.image).toBe(null);

  answer();
  await vi.waitUntil(() => project.image, { interval: 5 });
  expect(project.documentId).toBe(id);
  expect(workspace.editorTab).toBe('output');
});

test('openRecent on a record that fails to restore: a warning, a toast, the lock let go, the list refreshed', async () => {
  await junkRecord('junk');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { project } = await mounted();
  vi.mocked(listDocuments).mockClear();
  await autosave.openRecent('junk');
  expect(project.image).toBe(null);
  expect(warn).toHaveBeenCalled();
  expect(toastMessage.value).toBe(COULD_NOT_OPEN);
  expect(listDocuments).toHaveBeenCalled();
  expect(sessionStorage.getItem(KEPT_ID)).toBe(null);
  await vi.waitUntil(async () => !(await heldNames()).includes('phosphor-autosave:junk'), { interval: 5 });
});

test('a record that fails to restore leaves alone a file opened while it was being read', async () => {
  await junkRecord('junk');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { project } = await mounted();
  const restoreDocument = project.restoreDocument;
  vi.spyOn(project, 'restoreDocument').mockImplementationOnce(async (...args) => {
    await project.setBlankCanvas();
    return restoreDocument(...args);
  });
  await autosave.openRecent('junk');
  expect(project.image).not.toBe(null);
  expect(project.filename).toBe('untitled');
});

test('a restore that fails partway leaves the zero state, not half a document to write', async () => {
  const { project } = await opened();
  const id = project.documentId;
  const saved = await readLatest(id);
  await leave();
  sessionStorage.removeItem(KEPT_ID);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const back = await mounted();
  vi.spyOn(back.project, 'render').mockImplementationOnce(() => { throw new Error('partway'); });
  await autosave.openRecent(id);
  expect(back.project.image).toBe(null);
  expect(back.project.documentId).toBe(null);
  expect(toastMessage.value).toBe(COULD_NOT_OPEN);
  await pass(SAVE_AFTER_MS);
  expect((await readLatest(id)).record.editedAt).toBe(saved.record.editedAt);
});

// A document with two versions: the first edit's and, past 5 minutes, the second's. Returns the older.
async function withVersions(project) {
  edit(project, 0);
  await pass(SAVE_AFTER_MS);
  await vi.advanceTimersByTimeAsync(VERSION_EVERY_MS);
  edit(project, 1);
  await pass(SAVE_AFTER_MS);
  const versions = await listVersions(project.documentId);
  expect(versions).toHaveLength(2);
  return versions[1];
}

// Going back and forth between versions: nothing new to keep, whatever the document holds.
describe.each([
  ['typed cells', () => {}],
  ['soft paint', (project) => {
    project.paintEditPixels([{ x: 1, y: 2, r: 200, g: 100, b: 50 }, { x: 2, y: 3, r: 13, g: 77, b: 201 }], 37);
    project.commitEdit();
  }],
  ['the base layer\'s pixels', (project) => {
    project.paintEditPixels([{ x: 4, y: 4, r: 1, g: 2, b: 3 }], 100);
    project.commitEdit();
    project.mergeDown();
  }],
])('with %s', (_, draw) => {
  test('restoring a version and going back makes no duplicates', async () => {
    const { project } = await opened();
    const id = project.documentId;
    draw(project);
    const older = await withVersions(project);
    const newest = (await listVersions(id))[0];
    const count = (await listVersions(id)).length;

    for (const versionId of [older.id, newest.id, older.id]) {
      await autosave.restoreVersion(versionId);
      await pass(SAVE_AFTER_MS);
      await vi.advanceTimersByTimeAsync(VERSION_EVERY_MS); // a timed version is due, if the art were new
      await autosave.flush();
    }
    expect(await listVersions(id)).toHaveLength(count);
  });
});

test('an edit made after a restore is a new version, and undoing back to one is not', async () => {
  const { project } = await opened();
  const id = project.documentId;
  const older = await withVersions(project);
  await autosave.restoreVersion(older.id);
  await pass(SAVE_AFTER_MS);
  await vi.advanceTimersByTimeAsync(VERSION_EVERY_MS);
  edit(project, 5);
  await pass(SAVE_AFTER_MS);
  expect(await listVersions(id)).toHaveLength(3);

  await vi.advanceTimersByTimeAsync(VERSION_EVERY_MS);
  project.undo();
  await pass(SAVE_AFTER_MS);
  expect(await listVersions(id)).toHaveLength(3);
});

test('a version that already existed doesn\'t put off the next one', async () => {
  const { project } = await opened();
  const id = project.documentId;
  const older = await withVersions(project);
  await vi.advanceTimersByTimeAsync(VERSION_EVERY_MS);
  await autosave.restoreVersion(older.id);
  await pass(SAVE_AFTER_MS); // a version is due, and this state already has one
  expect(await listVersions(id)).toHaveLength(2);

  edit(project, 5);
  await pass(SAVE_AFTER_MS);
  expect(await listVersions(id)).toHaveLength(3);
});

test('what was open stays a Before restoring version when it isn\'t one yet', async () => {
  const { project } = await opened();
  const id = project.documentId;
  const older = await withVersions(project);
  edit(project, 7);
  await pass(SAVE_AFTER_MS);
  await autosave.restoreVersion(older.id);
  await autosave.flush();
  const versions = await listVersions(id);
  expect(versions).toHaveLength(3);
  expect(versions[0].reason).toBe('before-restore');
});

test('restoring a version keeps what was open as a version, starts a fresh undo history and counts as unsaved', async () => {
  const { project } = await opened();
  const id = project.documentId;
  const older = await withVersions(project);
  edit(project, 2); // not in any version yet
  await project.saveProject();
  await pass(SAVE_AFTER_MS);
  expect(project.isDirty).toBe(false);

  await autosave.restoreVersion(older.id);
  expect(project.documentId).toBe(id);
  expect([...project.editCells.keys()]).toHaveLength(1);
  expect(project.canUndo).toBe(false);
  expect(project.isDirty).toBe(true);
  const kept = (await listVersions(id)).find((v) => v.reason === 'before-restore');
  expect(kept).toBeTruthy();
  expect([...(await readProject(new Blob([(await readVersion(kept.id)).record.rest]))).editCells.keys()]).toHaveLength(3);
});

test('a restored version\'s write is a change: it moves the edit time, and the version it would make already exists', async () => {
  const { project } = await opened();
  const id = project.documentId;
  const older = await withVersions(project);
  await leave(); // a refresh: the document comes back as a restored one, not a changed one
  const back = await mounted();
  expect(back.project.documentId).toBe(id);
  await vi.advanceTimersByTimeAsync(VERSION_EVERY_MS);
  const before = (await listVersions(id)).length;

  await autosave.restoreVersion(older.id);
  await pass(SAVE_AFTER_MS);
  expect((await readLatest(id)).record.editedAt).toBe(Date.now());
  expect((await listVersions(id)).length).toBe(before); // what was open and the restored one are both there
  expect(await writtenChars(id)).toHaveLength(1);
});

test('a restore that fails partway puts back what was open, and rethrows', async () => {
  const { project } = await opened();
  const id = project.documentId;
  const older = await withVersions(project);
  const cells = JSON.stringify([...project.editCells]);
  vi.spyOn(project, 'render').mockImplementationOnce(() => { throw new Error('partway'); });

  await expect(autosave.restoreVersion(older.id)).rejects.toThrow('partway');
  expect(project.documentId).toBe(id);
  expect(JSON.stringify([...project.editCells])).toBe(cells);
  expect(sessionStorage.getItem(KEPT_ID)).toBe(id);
  await vi.waitUntil(async () => (await heldNames()).includes(`phosphor-autosave:${id}`), { interval: 5 });
  const { editedAt } = (await readLatest(id)).record;
  await pass(SAVE_AFTER_MS);
  expect(await writtenChars(id)).toHaveLength(2);
  expect((await readLatest(id)).record.editedAt).toBe(editedAt);
});

test('a corrupt version leaves the document, its undo history and its selection as they were', async () => {
  const { project, workspace } = await opened();
  await withVersions(project);
  await junkRecord('junk');
  await addVersion('junk', { reason: 'timed', savedAt: 1 });
  const [corrupt] = await listVersions('junk');
  const selection = { col: 0, row: 0, cols: 1, rows: 1 };
  workspace.selection = selection;
  const document = project._document, cells = JSON.stringify([...project.editCells]);
  expect(project.canUndo).toBe(true);

  await expect(autosave.restoreVersion(corrupt.id)).rejects.toThrow();
  expect(project._document).toBe(document);
  expect(JSON.stringify([...project.editCells])).toBe(cells);
  expect(project.canUndo).toBe(true);
  expect(workspace.selection).toEqual(selection);
});

test('a restore that fails partway and can\'t put back what was open leaves the zero state, not a half to write', async () => {
  const { project } = await opened();
  const id = project.documentId;
  const older = await withVersions(project);
  const { editedAt } = (await readLatest(id)).record;
  vi.spyOn(project, 'render').mockImplementationOnce(() => { throw new Error('partway'); });
  const restoreDocument = project.restoreDocument;
  vi.spyOn(project, 'restoreDocument').mockImplementationOnce(restoreDocument).mockRejectedValueOnce(new Error('again'));

  await expect(autosave.restoreVersion(older.id)).rejects.toThrow('partway');
  expect(project.image).toBe(null);
  await pass(SAVE_AFTER_MS);
  expect((await readLatest(id)).record.editedAt).toBe(editedAt);
  expect(await writtenChars(id)).toHaveLength(2);
});

test('a restore while writes are failing rejects before changing anything, since what is open could not be kept', async () => {
  const { project } = await opened();
  const id = project.documentId;
  const older = await withVersions(project);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(writeLatest).mockRejectedValue(new Error('quota'));
  edit(project, 2);
  await pass(SAVE_AFTER_MS);
  expect(autosave.current.value).toBe(false);
  const cells = JSON.stringify([...project.editCells]);
  const restoring = vi.spyOn(project, 'restoreDocument');

  await expect(autosave.restoreVersion(older.id)).rejects.toThrow();
  expect(restoring).not.toHaveBeenCalled();
  expect(JSON.stringify([...project.editCells])).toBe(cells);
  expect((await listVersions(id)).map((v) => v.reason)).toEqual(['timed', 'timed']);
});

test('a restore whose before-restore version was not kept rejects before changing anything', async () => {
  const { project } = await opened();
  const older = await withVersions(project);
  const cells = JSON.stringify([...project.editCells]);
  const restoring = vi.spyOn(project, 'restoreDocument');
  vi.mocked(addVersion).mockResolvedValueOnce(undefined);

  await expect(autosave.restoreVersion(older.id)).rejects.toThrow();
  expect(restoring).not.toHaveBeenCalled();
  expect(JSON.stringify([...project.editCells])).toBe(cells);
});

test('restoring a version that is gone rejects and changes nothing', async () => {
  const { project } = await opened();
  edit(project);
  await pass(SAVE_AFTER_MS);
  const cells = JSON.stringify([...project.editCells]);
  await expect(autosave.restoreVersion(9999)).rejects.toThrow();
  expect(JSON.stringify([...project.editCells])).toBe(cells);
  expect((await listVersions(project.documentId)).map((v) => v.reason)).toEqual(['timed']);
});

test('without Web Locks, every lock is available', async () => {
  Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
  try {
    const { project } = await opened();
    const id = project.documentId;
    edit(project);
    await pass(SAVE_AFTER_MS);
    expect(vi.mocked(evict).mock.calls[0][0]).toEqual(new Set([id]));
    await leave();
    const back = await mounted();
    expect(back.project.documentId).toBe(id);
    back.project.clearImage();
    await vi.waitUntil(() => autosave.recent.value.length === 1, { interval: 5 });
    expect(autosave.recent.value[0].openElsewhere).toBe(false);
  } finally {
    delete navigator.locks;
  }
});

// The start screen on its own, as a component mounted without App has it.
function startScreen(props) {
  const element = document.createElement('div');
  const screen = createApp(ZeroState, props);
  screen.mount(element);
  return { element, unmount: () => screen.unmount() };
}

test('the start screen waits for ready, and shows its drop zone without being told', () => {
  const waiting = startScreen({ ready: false, recent: [{ id: 'a', filename: 'a', editedAt: 1, openElsewhere: false }] });
  expect(waiting.element.querySelector('.drop-zone')).toBe(null);
  expect(waiting.element.querySelector('li')).toBe(null);
  waiting.unmount();

  const plain = startScreen({});
  expect(plain.element.querySelector('.drop-zone')).not.toBe(null);
  expect(plain.element.textContent).not.toContain('Continue where you left off');
  plain.unmount();
});

test('the start screen lists at most 5 recent documents; one open elsewhere is disabled', () => {
  const opened = [];
  const recent = Array.from({ length: 7 }, (_, i) => ({ id: `d${i}`, filename: `art ${i}`, editedAt: 1, openElsewhere: i === 1 }));
  const { element, unmount } = startScreen({ recent, openRecent: (id) => opened.push(id) });
  expect(element.textContent).toContain('Continue where you left off');
  const rows = element.querySelectorAll('li');
  expect(rows).toHaveLength(5);
  expect(rows[0].textContent).toContain('art 0');
  expect(rows[1].querySelector('button').disabled).toBe(true);
  expect(rows[1].querySelector('button').textContent.trim()).toBe('Open in another tab');
  rows[1].querySelector('button').click();
  rows[0].querySelector('button').click();
  expect(opened).toEqual(['d0']);
  unmount();
});

test('the versions dialog says so when a restore fails, and stays open with the document as it was', async () => {
  const { project } = await opened();
  edit(project);
  await pass(SAVE_AFTER_MS);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const closed = vi.fn();
  const restoreVersion = vi.fn().mockRejectedValue(new Error('partway'));
  const dialog = createApp(VersionsDialog, { flush: autosave.flush, restoreVersion, onClose: closed });
  dialog.mount(document.createElement('div'));
  try {
    await vi.waitUntil(() => document.querySelector('.modal-dialog li button'), { interval: 5 });
    document.querySelector('.modal-dialog li button').click();
    await vi.waitUntil(() => document.querySelector('[role=alert]'), { interval: 5 });
    expect(document.querySelector('[role=alert]').textContent).toBe("Couldn't restore that version.");
    expect(restoreVersion).toHaveBeenCalledTimes(1);
    expect(closed).not.toHaveBeenCalled();
    expect(document.querySelector('.modal-dialog li button').disabled).toBe(false);
  } finally {
    dialog.unmount();
  }
});

// The versions dialog over a document with a version; its Close button and a Restore button.
async function versionsDialog(props) {
  const { project } = await opened();
  edit(project);
  await pass(SAVE_AFTER_MS);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const dialog = createApp(VersionsDialog, { flush: autosave.flush, restoreVersion: vi.fn(), ...props });
  dialog.mount(document.createElement('div'));
  await vi.waitUntil(() => document.querySelector('.modal-dialog [role=alert], .modal-dialog li button'), { interval: 5 });
  return {
    close: document.querySelector('.modal-dialog button.cancel'),
    restore: document.querySelector('.modal-dialog li button'),
    unmount: () => dialog.unmount(),
  };
}

test('the versions dialog can\'t be closed while a restore is under way', async () => {
  let finish;
  const closed = vi.fn();
  const restoreVersion = () => new Promise((resolve) => { finish = resolve; });
  const { close, restore, unmount } = await versionsDialog({ restoreVersion, onClose: closed });
  try {
    restore.click();
    await vi.waitUntil(() => restore.disabled, { interval: 5 });
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    close.click();
    document.querySelector('.modal-backdrop').click();
    expect(closed).not.toHaveBeenCalled();

    finish();
    await vi.waitUntil(() => closed.mock.calls.length, { interval: 5 });
    expect(closed).toHaveBeenCalledTimes(1);
  } finally {
    unmount();
  }
});

test('after a failed restore, focus is on Close and the dialog closes again', async () => {
  const closed = vi.fn();
  const { close, restore, unmount } = await versionsDialog({ restoreVersion: () => Promise.reject(new Error('partway')), onClose: closed });
  try {
    restore.focus();
    restore.click();
    await vi.waitUntil(() => document.querySelector('[role=alert]'), { interval: 5 });
    expect(document.activeElement).toBe(close);
    close.click();
    expect(closed).toHaveBeenCalledTimes(1);
  } finally {
    unmount();
  }
});

test('versions that can\'t be read say so, not that there are none', async () => {
  const flush = async () => { vi.mocked(listVersions).mockRejectedValueOnce(new Error('no database')); };
  const { unmount } = await versionsDialog({ flush });
  try {
    expect(document.querySelector('[role=alert]').textContent).toBe("Couldn't read the versions.");
    expect(document.querySelector('.modal-dialog').textContent).not.toContain('No versions yet');
  } finally {
    unmount();
  }
});

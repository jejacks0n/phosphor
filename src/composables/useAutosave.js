// Writes the document to the browser as you work (document/autosaveStore.js), going by the rules in
// document/autosaveRules.js, and brings it back: a refresh restores the tab's document, a new tab offers
// recent ones. A safety net: saving to a file is unchanged.
import { ref, toRaw, watch, onBeforeUnmount } from 'vue';
import { useEventListener } from '@vueuse/core';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { settingsJson } from '@/store/project/shared';
import { writeProject } from '@/document/projectIO';
import { writeLatest, addVersion, listVersions, evict, readLatest, readVersion, listDocuments } from '@/document/autosaveStore';
import { SAVE_AFTER_MS, SAVE_AT_LEAST_EVERY_MS, versionDue } from '@/document/autosaveRules';
import { toast } from '@/composables/useToast';

const KEPT_DOCUMENT = 'phosphor-autosave-document'; // in sessionStorage: this tab's document
const LOCK_PREFIX = 'phosphor-autosave:'; // a Web Lock per open document: the tab holding it has it open
const RELOAD_WAIT_MS = 500; // a reload can get here before the old page has let go of the lock

const keepDocument = (id) => {
  try {
    if (id) sessionStorage.setItem(KEPT_DOCUMENT, id);
    else sessionStorage.removeItem(KEPT_DOCUMENT);
  } catch { /* no storage: a refresh comes back to the zero state */ }
};
const keptDocument = () => {
  try {
    return sessionStorage.getItem(KEPT_DOCUMENT);
  } catch {
    return null;
  }
};

// Takes a document's lock; answers with the function that lets it go, or null if another tab has it (or
// still does when the options' signal gives up). Without Web Locks, every lock is available.
const takeLock = (id, options) => new Promise((resolve) => {
  if (!navigator.locks) return resolve(() => {});
  navigator.locks.request(LOCK_PREFIX + id, options, (lock) => {
    if (!lock) return resolve(null);
    return new Promise((release) => resolve(release));
  }).catch(() => resolve(null));
});

// The ids of the documents open in any tab, this one's too.
async function openDocuments() {
  const { held = [] } = await navigator.locks?.query() ?? {};
  return held.map((lock) => lock.name).filter((name) => name.startsWith(LOCK_PREFIX)).map((name) => name.slice(LOCK_PREFIX.length));
}

export function useAutosave() {
  const project = useProjectStore();
  const workspace = useWorkspaceStore();
  const current = ref(false); // the last write finished and nothing has changed since
  const ready = ref(false); // whether there's anything to restore has been settled
  const recent = ref([]); // what the zero state offers
  let unwritten = false;
  let edited = false; // a real change is among what's unwritten, not only what's saved to a file
  let editedAt = null; // when the document last really changed, for its record
  let quiet = null, deadline = null; // the timers: edits stopped, and edits going on too long
  let running = null, again = false; // the write under way, and that another is due after it
  let openedId = null, lastVersionAt = null; // the document that's had its opening write, and its newest version
  let restoredId = null; // the document restored last: its opening write isn't a change
  let held = null, leftId = null, lockTurn = 0; // the lock this tab has, the id it last let go of, and the latest ask
  let openingRecent = false;
  let persistAsked = false, warned = false;

  const clearTimers = () => {
    clearTimeout(quiet);
    clearTimeout(deadline);
    quiet = deadline = null;
  };

  function schedule() {
    current.value = false;
    unwritten = true;
    clearTimeout(quiet);
    quiet = setTimeout(write, SAVE_AFTER_MS);
    deadline ??= setTimeout(write, SAVE_AT_LEAST_EVERY_MS);
  }

  const keeping = async (id) => new Set([id, ...await openDocuments()]);

  async function put(record, id) {
    try {
      await writeLatest(record);
    } catch (error) {
      if (error.name !== 'QuotaExceededError') throw error;
      await evict(await keeping(id), 0);
      await writeLatest(record);
    }
  }

  async function writeOnce() {
    const id = project.documentId, imageBuffer = toRaw(project.imageBuffer);
    if (!id || !imageBuffer) {
      unwritten = edited = false;
      return;
    }
    // Committing a stroke schedules a write, but taking it back doesn't: look again. A typing run is
    // written as it goes, since committing it here would split its undo step.
    if (project._stroke && !project._stroke.typing) {
      quiet = setTimeout(write, SAVE_AFTER_MS);
      return;
    }
    const doc = project._document;
    const opening = id !== openedId;
    const real = edited;
    const now = Date.now();
    unwritten = edited = false;
    if (real || (opening && id !== restoredId)) editedAt = now;
    try {
      const record = {
        id, imageBuffer,
        filename: project.filename,
        editedAt,
        savedToFile: project.savedToFile,
        dirty: project.isDirty || !!project._stroke, // an open typing run isn't counted by isDirty yet
        savedSettings: project.savedSettings,
      };
      const rest = await writeProject({ ...await project.projectParts(), imageBuffer: new ArrayBuffer(0) });
      record.rest = await rest.arrayBuffer();
      if (project._document !== doc) return; // parts of two documents; the swap scheduled its own write

      if (opening) lastVersionAt = (await listVersions(id))[0]?.savedAt ?? null;
      await put(record, id);
      openedId = id;
      if (opening) {
        await evict(await keeping(id));
      } else if (unwritten) {
        // A change landed during this write, whose image and edits may not match (Merge into the image):
        // the version is for the next write, even if what's waiting is only a save.
        edited ||= real;
      } else if (versionDue({ lastVersionAt, now, changed: real })) {
        await addVersion(id, { reason: 'timed', savedAt: now });
        lastVersionAt = now;
        await evict(await keeping(id));
      }
      current.value = !unwritten;
      if (!persistAsked) {
        persistAsked = true;
        navigator.storage?.persist?.().catch(() => {});
      }
    } catch (error) {
      unwritten = true;
      edited ||= real && !opening; // opening isn't a change; if it wasn't stored, the next write is the opening again
      console.warn('Autosave failed', error);
      if (!warned) toast("Autosave isn't working in this browser. Save to a file to keep your work.");
      warned = true;
    }
  }

  // One write at a time; writeOnce never rejects.
  async function drain() {
    do {
      again = false;
      await writeOnce();
    } while (again);
    running = null;
  }

  function write() {
    clearTimers();
    if (running) again = true;
    else running = drain();
    return running;
  }

  const flush = async () => { await (unwritten ? write() : running); };

  watch([
    () => project.documentId,
    () => project.editVersion,
    () => project.editCells, // a typing run changes these long before its commit changes editVersion
    () => settingsJson(project),
    () => project.filename,
    () => project.imageBuffer, // merging into the image swaps it
  ], () => {
    edited = true;
    schedule();
  }, { flush: 'sync' }); // sync: beforeunload commits a typing run and reads current straight after

  // A save to a file isn't a change to the art, but the record has to say it happened. Opening a
  // document marks it saved too, in the same tick, so that's still the one opening write.
  watch([
    () => project.savedToFile,
    () => project.savedEditVersion,
    () => project.savedSettings,
  ], schedule, { flush: 'sync' });

  // Lets go of the lock this tab has and, with an id, takes that one in its place; whether it got it.
  async function holdLock(id, options = { ifAvailable: true }) {
    const turn = ++lockTurn;
    if (held) {
      held.release();
      leftId = held.id;
      held = null;
    }
    if (!id) return false;
    const release = await takeLock(id, options);
    if (turn !== lockTurn) { // the document changed while it waited
      release?.();
      return false;
    }
    if (release) held = { id, release };
    return !!release;
  }

  async function loadRecent() {
    try {
      const [documents, open] = await Promise.all([listDocuments(), openDocuments()]);
      // Letting go of a lock takes a moment to show: the one just let go of isn't open elsewhere.
      recent.value = documents.map(({ id, filename, editedAt }) => ({ id, filename, editedAt, openElsewhere: id !== leftId && open.includes(id) }));
    } catch (error) {
      console.warn('Autosave could not list documents', error);
    }
  }

  async function restore(saved, documentId) {
    try {
      await project.restoreDocument(saved, { documentId });
    } catch (error) {
      if (project.image) project.clearImage(); // gone wrong partway: not a half to write over the record
      throw error;
    }
    // Its watchers have fired by now. None of that was a change.
    edited = false;
    restoredId = project.documentId;
    editedAt = saved.record.editedAt;
  }

  // Brings back one of this document's versions, as a change like any other: unsaved, with the next
  // write moving editedAt and counting toward a version. What was open is kept as a version first, so
  // picking one can't lose it. Throws, for the dialog to say so; the document is left as it was.
  async function restoreVersion(versionId) {
    project.commitPending();
    await flush();
    const id = project.documentId;
    if (!id) throw new Error('No document to restore into');
    // Before addVersion, which may drop the oldest version, the one being asked for.
    const saved = await readVersion(versionId);
    if (!saved) throw new Error(`No version ${versionId}`);
    const savedAt = Date.now();
    await addVersion(id, { reason: 'before-restore', savedAt });
    const kept = (await listVersions(id)).find((v) => v.reason === 'before-restore' && v.savedAt === savedAt);
    try {
      await project.restoreDocument(saved, { documentId: id });
    } catch (error) {
      // Gone wrong partway: not a half to write over the record. Put back what was open.
      try {
        if (!kept) throw error;
        await project.restoreDocument(await readVersion(kept.id), { documentId: id });
        edited = false; // putting it back isn't a change
      } catch {
        if (project.image) project.clearImage();
      }
      throw error;
    }
    // It may match no file, whatever the version says.
    project.savedEditVersion = project.editVersion - 1;
  }

  // A held lock is a duplicated tab (a copy from here on, its own document) once the wait is over.
  async function comeBack(id) {
    try {
      const free = await holdLock(id, { signal: AbortSignal.timeout(RELOAD_WAIT_MS) });
      const saved = await readLatest(id);
      if (project.image) return false; // something else is open already
      if (!saved) throw new Error(`No record for ${id}`);
      await restore(saved, free ? id : undefined);
      return true;
    } catch (error) {
      console.warn('Autosave could not restore the document', error);
      if (!project.image) {
        holdLock(null);
        keepDocument(null);
      }
      return false;
    }
  }

  async function start() {
    const id = keptDocument();
    const restored = id && await comeBack(id);
    if (restored && workspace.editorTab === 'input') workspace.editorTab = 'output'; // not if a return from signing in took you to SOCIAL
    if (!restored && !project.image) await loadRecent();
    ready.value = true;
  }

  async function openRecent(id) {
    if (openingRecent) return; // a second click
    openingRecent = true;
    try {
      if (!await holdLock(id)) throw new Error(`${id} is open in another tab`);
      const saved = await readLatest(id);
      if (project.image) return; // something else opened meanwhile
      if (!saved) throw new Error(`No record for ${id}`);
      await restore(saved, id);
      workspace.editorTab = 'output';
    } catch (error) {
      console.warn('Autosave could not open the document', error);
      if (!project.image) holdLock(null);
      toast("Couldn't open that document.");
      await loadRecent();
    } finally {
      openingRecent = false;
    }
  }

  watch(() => project.documentId, (id) => {
    keepDocument(id);
    if (id !== (held?.id ?? null)) holdLock(id);
    if (!id) loadRecent();
  }, { flush: 'sync' });

  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  onBeforeUnmount(() => {
    clearTimers();
    holdLock(null);
  });

  start();

  return { current, flush, ready, recent, openRecent, restoreVersion };
}

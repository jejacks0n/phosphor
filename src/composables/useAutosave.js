// Writes the document to the browser as you work (document/autosaveStore.js), going by the rules in
// document/autosaveRules.js. A safety net: saving to a file is unchanged.
import { ref, toRaw, watch, onBeforeUnmount } from 'vue';
import { useEventListener } from '@vueuse/core';
import { useProjectStore } from '@/store/ProjectStore';
import { settingsJson } from '@/store/project/shared';
import { writeProject } from '@/document/projectIO';
import { writeLatest, addVersion, listVersions, evict } from '@/document/autosaveStore';
import { SAVE_AFTER_MS, SAVE_AT_LEAST_EVERY_MS, versionDue } from '@/document/autosaveRules';
import { toast } from '@/composables/useToast';

export function useAutosave() {
  const project = useProjectStore();
  const current = ref(false); // the last write finished and nothing has changed since
  let unwritten = false;
  let edited = false; // a real change is among what's unwritten, not only what's saved to a file
  let editedAt = null; // when the document last really changed, for its record
  let quiet = null, deadline = null; // the timers: edits stopped, and edits going on too long
  let running = null, again = false; // the write under way, and that another is due after it
  let openedId = null, lastVersionAt = null; // the document that's had its opening write, and its newest version
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

  async function put(record, keep) {
    try {
      await writeLatest(record);
    } catch (error) {
      if (error.name !== 'QuotaExceededError') throw error;
      await evict(keep, 0);
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
    const keep = new Set([id]); // the open documents
    unwritten = edited = false;
    if (opening || real) editedAt = now;
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
      await put(record, keep);
      openedId = id;
      if (opening) {
        await evict(keep);
      } else if (versionDue({ lastVersionAt, now, changed: real })) {
        await addVersion(id, { reason: 'timed', savedAt: now });
        lastVersionAt = now;
        await evict(keep);
      }
      current.value = !unwritten;
      if (!persistAsked) {
        persistAsked = true;
        navigator.storage?.persist?.().catch(() => {});
      }
    } catch (error) {
      unwritten = true;
      edited ||= real;
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

  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  onBeforeUnmount(clearTimers);

  return { current, flush };
}

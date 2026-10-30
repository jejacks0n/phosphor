/**
 * What autosave keeps, and when: the timings, and the rules that pick which versions and documents
 * go. Pure, so the storage code only has to apply the answers.
 */
export const SAVE_AFTER_MS = 1000; // the latest state is written this long after edits stop...
export const SAVE_AT_LEAST_EVERY_MS = 10_000; // ...and at least this often while they continue
export const VERSION_EVERY_MS = 5 * 60_000;
export const KEEP_VERSIONS = 20; // per document
export const READY_WAIT_MS = 5000; // how long the start screen waits on a database that isn't answering
export const MAX_TOTAL_BYTES = 500 * 2 ** 20; // across documents

// A version is a snapshot to go back to: only for a change, and not more often than every VERSION_EVERY_MS.
export function versionDue({ lastVersionAt, now, changed }) {
  return changed && (lastVersionAt == null || now - lastVersionAt >= VERSION_EVERY_MS);
}

// Ids past the newest KEEP_VERSIONS. Several can share a millisecond; ids count up, so the higher is newer.
export function versionsToDrop(versions) {
  return [...versions].sort((a, b) => b.savedAt - a.savedAt || b.id - a.id).slice(KEEP_VERSIONS).map((v) => v.id);
}

// Ids of the least recently edited documents to delete until the rest fit in maxBytes, skipping any in keep
// (the open ones). bytes counts the document's versions too.
export function documentsToEvict(documents, { keep, maxBytes = MAX_TOTAL_BYTES }) {
  let total = documents.reduce((sum, d) => sum + d.bytes, 0);
  const evict = [];
  for (const d of [...documents].sort((a, b) => a.editedAt - b.editedAt)) {
    if (total <= maxBytes) break;
    if (keep.has(d.id)) continue;
    evict.push(d.id);
    total -= d.bytes;
  }
  return evict;
}

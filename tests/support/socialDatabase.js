import { vi } from 'vitest';

// The browser test files run in parallel in one origin, so they share its IndexedDB. A file that
// deletes phosphor-social between its tests would wipe the key another file is using, or be blocked by
// its open connection: such a file calls this in beforeEach and gets a database of its own, and the
// function that deletes it.
export function ownSocialDatabase(name) {
  const open = indexedDB.open.bind(indexedDB);
  const own = (database) => (database === 'phosphor-social' ? `phosphor-social-${name}` : database);
  vi.spyOn(indexedDB, 'open').mockImplementation((database, version) => open(own(database), version));
  return () => new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(own('phosphor-social'));
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('phosphor-social is still open'));
  });
}

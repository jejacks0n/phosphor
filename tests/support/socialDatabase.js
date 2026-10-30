import { vi } from 'vitest';

// The browser test files run in parallel in one origin, so they share its IndexedDB. A file that
// deletes a database between its tests would wipe what another file is using, or be blocked by its
// open connection: such a file calls this in beforeEach and gets a copy of its own, and the function
// that deletes it. Restore the mocks after each test (a second spy would call the first).
export function ownDatabase(shared, name) {
  const open = indexedDB.open.bind(indexedDB);
  const own = (database) => (database === shared ? `${shared}-${name}` : database);
  vi.spyOn(indexedDB, 'open').mockImplementation((database, version) => open(own(database), version));
  return () => new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(own(shared));
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error(`${shared} is still open`));
  });
}

export const ownSocialDatabase = (name) => ownDatabase('phosphor-social', name);

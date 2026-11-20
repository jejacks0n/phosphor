import { vi } from 'vitest';
import { HANG_KEY } from '@/plugins/hangMark';

// The browser test files share the origin's localStorage, and every plugin store's first load reads and clears the hang
// mark (plugins/hangMark.js). A file whose imports hold the mark across an await calls this in beforeEach, before any
// store is made, and keeps its mark under a key of its own. Restore the mocks after each test.
export function ownHangMark(name) {
  const own = (key) => (key === HANG_KEY ? `${HANG_KEY}-${name}` : key);
  for (const method of ['getItem', 'setItem', 'removeItem']) {
    const real = Storage.prototype[method];
    vi.spyOn(Storage.prototype, method).mockImplementation(function (key, ...rest) { return real.call(this, own(key), ...rest); });
  }
}

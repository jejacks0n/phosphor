// Every command with a key (but the fixed rows, which the browser keeps) is in one of the lists useKeyboardShortcuts
// hands to takeKey, so a command can't be added that no key reaches.
import { test, expect } from 'vitest';
import { KEYS } from '@/composables/useKeyboardShortcuts';
import { COMMANDS } from '@/lib/commands';

test('no command with a key is left out of useKeyboardShortcuts\' lists', () => {
  const listed = Object.values(KEYS).flat();
  const heard = (id) => listed.some((l) => l === id || (l.endsWith('*') && id.startsWith(l.slice(0, -1))));
  expect(COMMANDS.filter((c) => c.run && !c.fixed && c.keys && !heard(c.id)).map((c) => c.id)).toEqual([]);
});

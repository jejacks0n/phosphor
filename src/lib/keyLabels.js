// Shortcuts as each platform writes them: ⌥F and ⇧⌘X on a Mac, Alt+F and Shift+Ctrl+X elsewhere.
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const NAMES = isMac ? { alt: '⌥', shift: '⇧', mod: '⌘', ctrl: '⌃' } : { alt: 'Alt', shift: 'Shift', mod: 'Ctrl', ctrl: 'Ctrl' };

// shortcut('shift', 'mod', 'X'): '⇧⌘X' or 'Shift+Ctrl+X'. Modifier names: alt, shift, mod (Cmd on a
// Mac, Ctrl elsewhere) and ctrl (the Control key everywhere).
export function shortcut(...keys) {
  const parts = keys.map((key) => NAMES[key] ?? key);
  return parts.join(isMac ? '' : '+');
}

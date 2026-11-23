// Shortcuts as each platform writes them: ⌥F and ⇧⌘X on a Mac, Alt+F and Shift+Ctrl+X elsewhere.
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
// Linux's browsers switch their own tabs on Alt+1–8 (Android's platform says Linux too, and has no such keys).
export const isLinux = typeof navigator !== 'undefined' && /Linux/.test(navigator.platform || navigator.userAgent) && !/Android/.test(navigator.userAgent);

export const MAC_NAMES = { alt: '⌥', shift: '⇧', mod: '⌘', ctrl: '⌃' };
export const OTHER_NAMES = { alt: 'Alt', shift: 'Shift', mod: 'Ctrl', ctrl: 'Ctrl' };
const NAMES = isMac ? MAC_NAMES : OTHER_NAMES;

// shortcut('shift', 'mod', 'X'): '⇧⌘X' or 'Shift+Ctrl+X'. Modifier names: alt, shift, mod (Cmd on a
// Mac, Ctrl elsewhere) and ctrl (the Control key everywhere).
export function shortcut(...keys) {
  const parts = keys.map((key) => NAMES[key] ?? key);
  return parts.join(isMac ? '' : '+');
}

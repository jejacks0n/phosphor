/**
 * The Text tool's keyboard: a keydown becomes an editing action, or null when the key isn't the
 * tool's (focus in a field, Cmd/Ctrl shortcuts, keys with no meaning here).
 *
 * Action = { type: 'char', char } | { type: 'move', dc, dr } | { type: 'home' } | { type: 'end' }
 *        | { type: 'newline' } | { type: 'backspace' } | { type: 'delete' }
 *        | { type: 'toggleInsert' } (Insert, or Alt+Enter: the next typing mode)
 *        | { type: 'slot', index } (F1–F12) | { type: 'grab', index } (Ctrl+Shift+F1–F12)
 *        | { type: 'line', delta } (Moebius's Alt+↑ puts a line in at the cursor: 1, Alt+↓ takes it out: -1)
 *        | { type: 'column', delta } (Alt+→ and Alt+← the same for a column)
 * The color steps (Ctrl+arrows) and the character set's (Ctrl+, and Ctrl+.) are the command table's: null here.
 */
import { graphemes, usableChar } from './CharWidth.js';

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const NAMED = { Home: 'home', End: 'end', Enter: 'newline', Backspace: 'backspace', Delete: 'delete', Insert: 'toggleInsert' };

// 0–11 for F1–F12, else -1
const fKey = (key) => {
  const m = /^F(\d{1,2})$/.exec(key);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= 12 ? n - 1 : -1;
};
const single = (key) => [...key].length === 1 && usableChar(key); // not a lone combining mark

// The color box's shortcuts (Moebius's Alt+A, and Alt+F / Alt+B for each slot): the slot, or null.
// By physical key, so Option's characters (ƒ, å, ∫) don't matter; AltGr (Ctrl+Alt) still types.
const COLOR_BOX_KEYS = { KeyF: 'fg', KeyA: 'fg', KeyB: 'bg' };
export function colorBoxKey(e) {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  return COLOR_BOX_KEYS[e.code] ?? null;
}

// Alt+? (by physical key: Option+? types ¿) opens the shortcuts list (the command table's general.help) while
// typing in Edit Mode, where ? types; it never types.
const altHelp = (e) => e.altKey && e.shiftKey && e.code === 'Slash' && !e.ctrlKey && !e.metaKey;
// Moebius's lines and columns, by Alt+arrow.
const LINES = { ArrowUp: ['line', 1], ArrowDown: ['line', -1], ArrowRight: ['column', 1], ArrowLeft: ['column', -1] };

// The letters the editor's own keys take before any tool's (useKeyboardShortcuts): X swaps the colors (Shift+X is
// left to the tools), and with Animate on, L plays and pauses and N adds a frame, with Shift or without. EDITOR_KEYS are
// them as a tool's keys are written; a plugin brush asking for one is given no key (tools/index.js's pluginTools).
export const SWAP_COLORS_KEY = 'x', PLAY_KEY = 'l', ADD_FRAME_KEY = 'n';
export const EDITOR_KEYS = [SWAP_COLORS_KEY, PLAY_KEY, ADD_FRAME_KEY].map((key) => key.toUpperCase())
  .flatMap((key) => (key === SWAP_COLORS_KEY.toUpperCase() ? [key] : [key, `Shift+${key}`]));

export function textKeyAction(e, { editable }) {
  if (editable || e.metaKey || e.isComposing || e.keyCode === 229) return null; // a field, Cmd, or an IME
  if (colorBoxKey(e) || altHelp(e)) return null; // the color box and the shortcuts list never type
  // AltGr (Windows/Linux) arrives as Ctrl+Alt and produces characters such as @ or €: those type.
  if (e.ctrlKey && e.altKey) return single(e.key) ? { type: 'char', char: e.key } : null;
  if (e.ctrlKey) {
    // With Shift: Ctrl+F-key alone is macOS's own (Ctrl+F1 keyboard access, Ctrl+F8 the status menus...).
    const index = e.shiftKey ? fKey(e.key) : -1;
    return index >= 0 ? { type: 'grab', index } : null;
  }
  if (e.altKey) {
    if (LINES[e.key]) return e.shiftKey ? null : { type: LINES[e.key][0], delta: LINES[e.key][1] };
    // The Insert key's work for a keyboard that has none (a MacBook's): Alt+Enter types nothing on any layout, where
    // an Alt+letter is a character or an accent someone types (Option+I starts ê).
    if (e.key === 'Enter') return { type: 'toggleInsert' };
    return single(e.key) ? { type: 'char', char: e.key } : null;
  }
  const index = fKey(e.key);
  if (index >= 0) return { type: 'slot', index };
  if (ARROWS[e.key]) return e.shiftKey ? null : { type: 'move', dc: ARROWS[e.key][0], dr: ARROWS[e.key][1] }; // Shift+arrows select (useKeyboardShortcuts)
  if (NAMED[e.key]) return { type: NAMED[e.key] };
  return single(e.key) ? { type: 'char', char: e.key } : null;
}

export function moveCursor({ col, row }, dc, dr, cols, rows) {
  return {
    col: Math.max(0, Math.min(cols - 1, col + dc)),
    row: Math.max(0, Math.min(rows - 1, row + dr)),
  };
}

// Text from an input method, the emoji picker or a paste, as typing actions: whole characters in
// order, any line break (\r\n, \n, \r) as one newline, anything a cell can't hold dropped.
export function typedText(text) {
  const actions = [];
  for (const char of graphemes(text)) {
    if (char === '\r\n' || char === '\n' || char === '\r') actions.push({ type: 'newline' });
    else if (usableChar(char)) actions.push({ type: 'char', char });
  }
  return actions;
}

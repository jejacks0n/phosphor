/**
 * The Text tool's keyboard: a keydown becomes an editing action, or null when the key isn't the
 * tool's (focus in a field, Cmd/Ctrl shortcuts, keys with no meaning here).
 *
 * Action = { type: 'char', char } | { type: 'move', dc, dr } | { type: 'home' } | { type: 'end' }
 *        | { type: 'newline' } | { type: 'backspace' } | { type: 'delete' } | { type: 'toggleInsert' }
 *        | { type: 'slot', index } (F1–F12) | { type: 'grab', index } (Ctrl+F1–F12)
 *        | { type: 'palette', delta } (Alt+←/→) | { type: 'color', slot, delta } (Alt+↑/↓, Shift for bg)
 */
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const NAMED = { Home: 'home', End: 'end', Enter: 'newline', Backspace: 'backspace', Delete: 'delete', Insert: 'toggleInsert' };

// 0–11 for F1–F12, else -1
const fKey = (key) => {
  const m = /^F(\d{1,2})$/.exec(key);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= 12 ? n - 1 : -1;
};
const single = (key) => [...key].length === 1;

export function textKeyAction(e, { editable }) {
  if (editable || e.metaKey || e.isComposing || e.keyCode === 229) return null; // a field, Cmd, or an IME
  // AltGr (Windows/Linux) arrives as Ctrl+Alt and produces characters such as @ or €: those type.
  if (e.ctrlKey && e.altKey) return single(e.key) ? { type: 'char', char: e.key } : null;
  if (e.ctrlKey) {
    const index = fKey(e.key);
    return index >= 0 ? { type: 'grab', index } : null;
  }
  if (e.altKey) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') return { type: 'palette', delta: e.key === 'ArrowLeft' ? -1 : 1 };
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') return { type: 'color', slot: e.shiftKey ? 'bg' : 'fg', delta: e.key === 'ArrowUp' ? -1 : 1 };
    return single(e.key) ? { type: 'char', char: e.key } : null;
  }
  const index = fKey(e.key);
  if (index >= 0) return { type: 'slot', index };
  if (ARROWS[e.key]) return { type: 'move', dc: ARROWS[e.key][0], dr: ARROWS[e.key][1] };
  if (NAMED[e.key]) return { type: NAMED[e.key] };
  return single(e.key) ? { type: 'char', char: e.key } : null;
}

export function moveCursor({ col, row }, dc, dr, cols, rows) {
  return {
    col: Math.max(0, Math.min(cols - 1, col + dc)),
    row: Math.max(0, Math.min(rows - 1, row + dr)),
  };
}

import { isMac, MAC_NAMES, OTHER_NAMES } from './keyLabels.js';

// A key string is modifiers then one part, joined by +: Mod (Cmd on a Mac, Ctrl elsewhere), Ctrl, Alt, Shift.
// The part is a KeyboardEvent.code when it looks like one (KeyN, Digit1, BracketLeft, ArrowUp) and is matched
// against e.code, so Alt+N still finds the N key when the Mac's Option makes it a different character. Any other
// part is a key value (K, ?, [, Escape) matched against e.key, letters in either case.
const CODE = /^(Key[A-Z]|Digit\d|Bracket(Left|Right)|Comma|Period|Slash|Arrow(Up|Down|Left|Right))$/;
const SHOWN = { BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.', Slash: '/', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
const ELECTRON = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.', Slash: '/' };

export function parseKey(str) {
  const [, mods, part] = str.match(/^((?:(?:Mod|Ctrl|Alt|Shift)\+)*)(.+)$/);
  const has = (name) => mods.includes(`${name}+`);
  const parsed = { mod: has('Mod'), ctrl: has('Ctrl'), alt: has('Alt'), shift: has('Shift') };
  return CODE.test(part) ? { ...parsed, code: part } : { ...parsed, key: part };
}

export function matches(e, str, { mac = isMac } = {}) {
  const k = parseKey(str);
  if (!!e.altKey !== k.alt) return false;
  // On a Mac Cmd and Control are different keys; elsewhere Mod is Control.
  if (mac ? !!e.metaKey !== k.mod || !!e.ctrlKey !== k.ctrl : !!e.metaKey || !!e.ctrlKey !== (k.mod || k.ctrl)) return false;
  if (k.code) return e.code === k.code && !!e.shiftKey === k.shift;
  const isSymbol = k.key.length === 1 && k.key.toLowerCase() === k.key.toUpperCase();
  // A symbol's e.key already carries Shift ('?' is Shift+/), so only the others compare it.
  if (!isSymbol && !!e.shiftKey !== k.shift) return false;
  return k.key.length === 1 ? e.key?.toLowerCase() === k.key.toLowerCase() : e.key === k.key;
}

// keys is a string, an array, or { mac: [...], other: [...] }.
export function keysFor(keys, { mac = isMac } = {}) {
  if (typeof keys === 'string') return [keys];
  if (Array.isArray(keys)) return keys;
  return keys[mac ? 'mac' : 'other'] ?? [];
}

export function keyLabel(str, { mac = isMac } = {}) {
  const k = parseKey(str);
  const names = mac ? MAC_NAMES : OTHER_NAMES;
  const part = k.code ? SHOWN[k.code] ?? k.code.replace(/^(Key|Digit)/, '') : k.key;
  // A Mac writes ⌃⌥⇧⌘ run together; elsewhere Shift, Ctrl, then Alt, with Mod and Ctrl one name.
  const mods = mac
    ? [k.ctrl && 'ctrl', k.alt && 'alt', k.shift && 'shift', k.mod && 'mod']
    : [k.shift && 'shift', (k.mod || k.ctrl) && 'ctrl', k.alt && 'alt'];
  return [...mods.filter(Boolean).map((m) => names[m]), part].join(mac ? '' : '+');
}

// Electron's menu accelerator form.
export function accelerator(str) {
  const k = parseKey(str);
  const part = k.code ? ELECTRON[k.code] ?? k.code.replace(/^(Key|Digit)/, '') : k.key;
  return [k.shift && 'Shift', k.ctrl && 'Ctrl', k.mod && 'CmdOrCtrl', k.alt && 'Alt'].filter(Boolean).concat(part).join('+');
}

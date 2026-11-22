// Where a key press is aimed, for the app's own keys (shortcuts, Edit Mode, the palette layer): the focused element
// keeps the keys it uses itself, and the rest are the app's. Edit Mode's hidden textarea (typing into cells, marked
// data-text-input) keeps none: the app's keys apply there.
export const isTextInput = (el) => el?.dataset?.textInput !== undefined;

const PRESS = new Set([' ', 'Enter']);
const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const SLIDE = new Set([...ARROWS, 'Home', 'End', 'PageUp', 'PageDown']);
const PICK = new Set([...PRESS, ...ARROWS]);
const TAB = new Set([...PRESS, 'ArrowLeft', 'ArrowRight']); // a tab list's own keys (EditTabs)
const WALK = new Set([...PICK, 'Home', 'End']); // a button of a grid walked by the keys, marked data-walk (ColorList)
const NOT_TEXT = new Set(['range', 'checkbox', 'radio', 'color', 'button', 'submit', 'reset', 'file', 'image', 'hidden']);
const PRESS_TAGS = new Set(['BUTTON', 'SUMMARY', 'INPUT']); // an input that isn't text, a slider or a radio: a checkbox, a color...
const PRESS_ROLES = new Set(['button', 'checkbox', 'switch', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option']);

// A field you type in: a text box (a number, a search...), a text area, editable text.
export function typesIn(el) {
  if (!el || isTextInput(el)) return false;
  return !!el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !NOT_TEXT.has(el.type));
}

// The keys the element uses itself: all of them (a field you type in, a menu), or a slider's, a radio's, a tab's, a
// walked grid's or a button's (a checkbox's too: Space and Enter), or none.
function keysOf(el) {
  if (!el || isTextInput(el)) return null;
  if (typesIn(el) || el.tagName === 'SELECT') return 'all';
  const role = el.getAttribute?.('role');
  if (el.type === 'range' || role === 'slider' || role === 'separator') return SLIDE; // a separator that's focused moves
  if (el.type === 'radio' || role === 'radio') return PICK;
  if (role === 'tab') return TAB;
  if (el.dataset?.walk !== undefined) return WALK;
  return PRESS_TAGS.has(el.tagName) || (el.tagName === 'A' && el.hasAttribute?.('href')) || PRESS_ROLES.has(role) ? PRESS : null;
}

// Does the focused element use this key itself? Then the app leaves it alone.
export function ownsKey(el, e) {
  const keys = keysOf(el);
  return keys === 'all' || !!keys?.has(e.key);
}

// A control: an element with keys of its own (a field, a slider, a button...).
export const isControl = (el) => !!keysOf(el);

// Focus is in a form field (a text box, a menu, a checkbox, a slider), which loses what it's doing if focus is taken
// from it: Edit Mode's typing leaves focus there (useTextTool).
export function isFormField(el) {
  if (!el || isTextInput(el)) return false;
  return !!el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

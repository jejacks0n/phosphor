// What Tab can stop on in a dialog, and Tab kept to the dialog handling the key (its first control after its last).
export const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';

// A field to type in: what a dialog's focus starts on, when it has one that shows.
export const FIELD = 'input:not([type=hidden], [type=radio], [type=checkbox], [type=button], [type=submit], [type=reset], [type=range], [type=color], [type=file], [type=image]):not(:disabled), textarea:not(:disabled)';

export const firstField = (root) => [...root?.querySelectorAll(FIELD) ?? []].find((field) => field.checkVisibility());

export function keepTabIn(event) {
  if (event.key !== 'Tab') return;
  const controls = [...event.currentTarget.querySelectorAll(FOCUSABLE)].filter((control) => control.checkVisibility()); // a hidden one can't take focus
  const at = controls.indexOf(document.activeElement);
  const next = event.shiftKey ? (at <= 0 ? controls.length - 1 : at - 1) : (at === controls.length - 1 ? 0 : at + 1);
  event.preventDefault();
  controls[next]?.focus();
}

// Up and Down between buttons stacked as a list (a dialog's choices, the start screen's), from the list's keydown: with
// focus on one of them, the next or the one before takes it, past any that's disabled, stopping at the ends as a menu
// does. The key stops here then, so the page doesn't scroll and the app's shortcuts don't hear it. Any other key, or one
// from anything else (a field, a slider), is left alone.
export function arrowsBetween(event, buttons) {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  const list = [...buttons];
  let at = list.indexOf(event.target);
  if (!step || at < 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  event.preventDefault();
  event.stopPropagation();
  do at += step; while (list[at]?.disabled);
  list[at]?.focus();
}

// The dialogs over the page that Back cancels, as Escape does (ModalDialog's), the last opened on top: the router asks
// before a Back or Forward moves the page under one.
const backCancels = [];
export function cancelOnBack(cancel) {
  backCancels.push(cancel);
  return () => backCancels.includes(cancel) && backCancels.splice(backCancels.indexOf(cancel), 1);
}
export function cancelTopDialog() {
  const top = backCancels.at(-1);
  top?.();
  return !!top;
}

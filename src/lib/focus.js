// What Tab can stop on in a dialog, and Tab kept to the dialog handling the key (its first control after its last).
export const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';

// A field to type in: what a dialog's focus starts on, when it has one that shows.
export const FIELD = 'input:not([type=hidden], [type=radio], [type=checkbox], [type=button], [type=submit], [type=reset], [type=range], [type=color], [type=file], [type=image]):not(:disabled), textarea:not(:disabled)';

export const firstField = (root) => [...root?.querySelectorAll(FIELD) ?? []].find((field) => field.checkVisibility());

export function keepTabIn(event) {
  if (event.key !== 'Tab') return;
  const controls = [...event.currentTarget.querySelectorAll(FOCUSABLE)];
  const at = controls.indexOf(document.activeElement);
  const next = event.shiftKey ? (at <= 0 ? controls.length - 1 : at - 1) : (at === controls.length - 1 ? 0 : at + 1);
  event.preventDefault();
  controls[next]?.focus();
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

// What Tab can stop on in a dialog, and Tab kept to the dialog handling the key (its first control after its last).
export const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';

export function keepTabIn(event) {
  if (event.key !== 'Tab') return;
  const controls = [...event.currentTarget.querySelectorAll(FOCUSABLE)];
  const at = controls.indexOf(document.activeElement);
  const next = event.shiftKey ? (at <= 0 ? controls.length - 1 : at - 1) : (at === controls.length - 1 ? 0 : at + 1);
  event.preventDefault();
  controls[next]?.focus();
}

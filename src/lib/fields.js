// Where a key press is aimed, for the app's own keys (shortcuts, Edit Mode, the palette layer): a
// field (a text box, a text area, a menu, editable content) keeps its keys. Edit Mode's hidden
// textarea (typing into cells, marked data-text-input) isn't a field: the app's keys apply there.
export const isTextInput = (el) => el?.dataset?.textInput !== undefined;

export function isField(el) {
  if (!el || isTextInput(el)) return false;
  return !!el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

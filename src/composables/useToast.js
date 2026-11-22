import { ref } from 'vue';

// One app-wide toast: a short message at the bottom of the screen (AppToast shows it), for ten seconds or until
// it's clicked. One that stays has no timer; one with an action has a button ({ label, run }) that runs it and closes,
// and a second ({ label, run }) is another beside it.
export const toastMessage = ref(null);
export const toastAction = ref(null);
export const toastSecond = ref(null);
let timer = null;
let current = 0; // the id of the message showing

export const TOAST_MS = 10_000;

// Closes the message showing; with an id, only when it's still that message.
export function closeToast(id) {
  if (id !== undefined && id !== current) return;
  clearTimeout(timer);
  toastMessage.value = null;
  toastAction.value = null;
  toastSecond.value = null;
}

// Shows a message in place of any other; its id, for closeToast.
export function toast(message, { action = null, second = null, stay = false } = {}) {
  clearTimeout(timer);
  toastMessage.value = message;
  toastAction.value = action;
  toastSecond.value = second;
  if (!stay) timer = setTimeout(() => closeToast(), TOAST_MS);
  return ++current;
}

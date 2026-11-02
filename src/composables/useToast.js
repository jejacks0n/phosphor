import { ref } from 'vue';

// One app-wide toast: a short message at the bottom of the screen (AppToast shows it), for ten seconds or until
// it's clicked.
export const toastMessage = ref(null);
let timer = null;

export const TOAST_MS = 10_000;

export function closeToast() {
  clearTimeout(timer);
  toastMessage.value = null;
}

export function toast(message) {
  clearTimeout(timer);
  toastMessage.value = message;
  timer = setTimeout(closeToast, TOAST_MS);
}

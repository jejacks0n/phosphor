import { ref } from 'vue';

// One app-wide toast: a short message at the bottom of the screen (AppToast shows it).
export const toastMessage = ref(null);
let timer = null;

export const LONG_TOAST_MS = 6000;   // a sentence or two someone didn't ask to read

export function toast(message, ms = 2600) {
  toastMessage.value = message;
  clearTimeout(timer);
  timer = setTimeout(() => { toastMessage.value = null; }, ms);
}

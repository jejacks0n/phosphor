import { ref } from 'vue';

// One app-wide toast: a short message at the bottom of the screen (AppToast shows it).
export const toastMessage = ref(null);
let timer = null;

export function toast(message) {
  toastMessage.value = message;
  clearTimeout(timer);
  timer = setTimeout(() => { toastMessage.value = null; }, 2600);
}

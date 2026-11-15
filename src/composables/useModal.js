import { nextTick } from 'vue';

// A modal <dialog> that whoever shows it closes (a v-if): it never closes itself. `open` is its ref: Vue sets it as
// the element goes in, before any onMounted, so it's open (and the slot's components can focus their fields as they
// mount, which they couldn't in a closed dialog); teleported to the body, it's in the page by then. A close request
// (Escape, Android's back gesture) calls `cancel` and leaves the dialog open. A browser can close a dialog anyway,
// after a few requests the page held off: then it cancels, and opens again if whoever shows it says no. `outside`
// tells a press on the backdrop, which is the dialog's own, from one in its box.
export function useModal(cancel, { opened } = {}) {
  let dialog = null;
  const open = (el) => {
    dialog = el;
    if (el && !el.open) {
      el.showModal();
      opened?.(el);
    }
  };
  const onCancel = (event) => {
    event.preventDefault();
    cancel();
  };
  const onClose = async () => {
    if (!dialog?.isConnected) return; // taken out of the page: closed by whoever showed it
    cancel();
    await nextTick();
    if (dialog?.isConnected && !dialog.open) open(dialog);
  };
  const outside = (event) => {
    if (event.target !== dialog) return false;
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  };
  return { open, onCancel, onClose, outside, element: () => dialog };
}

import { onMounted, onBeforeUnmount } from 'vue';
import { toast } from '@/composables/useToast';

// Phones and tablets show no tooltips, so a tap on a disabled button marked data-off-reason says why (its title) in a
// toast. touchend in the capture phase: a disabled button gets no click. Hit-tested by rectangle, not elementFromPoint:
// some disabled buttons have pointer-events: none. Mouse and pen are left alone: they have the tooltip.
function onTouchEnd(e) {
  const point = e.changedTouches[0];
  if (!point) return;
  for (const button of document.querySelectorAll('button[data-off-reason]:disabled')) {
    const r = button.getBoundingClientRect();
    if (button.title && point.clientX >= r.left && point.clientX <= r.right && point.clientY >= r.top && point.clientY <= r.bottom) {
      toast(button.title);
      return;
    }
  }
}

export function useDisabledReason() {
  onMounted(() => document.addEventListener('touchend', onTouchEnd, true));
  onBeforeUnmount(() => document.removeEventListener('touchend', onTouchEnd, true));
}

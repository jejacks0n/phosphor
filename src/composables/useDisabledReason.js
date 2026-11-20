import { onMounted, onBeforeUnmount } from 'vue';
import { toast } from '@/composables/useToast';

// Phones and tablets show no tooltips, so a tap on a disabled button marked data-off-reason says why (its title) in a
// toast. touchend in the capture phase: a disabled button gets no click. Hit-tested by rectangle, not by the touch's
// target: some disabled buttons have pointer-events: none. But only when nothing else is laid over it: what's under the
// finger must be the button, a child of it, or an ancestor of it (the one a pointer-events: none button's touch lands on).
// A touch that moved (a swipe or scroll) is not a tap. Mouse and pen are left alone: they have the tooltip.
const SLOP = 10; // px a finger may drift and still be a tap
let down = null;

const onTouchStart = (e) => { down = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; };

function onTouchEnd(e) {
  const point = e.changedTouches[0];
  const start = down;
  down = null;
  if (!point || !start || Math.hypot(point.clientX - start.x, point.clientY - start.y) > SLOP) return;
  const hit = document.elementFromPoint(point.clientX, point.clientY);
  for (const button of document.querySelectorAll('button[data-off-reason]:disabled')) {
    const r = button.getBoundingClientRect();
    if (button.title && point.clientX >= r.left && point.clientX <= r.right && point.clientY >= r.top && point.clientY <= r.bottom) {
      if (hit && (hit.contains(button) || button.contains(hit))) toast(button.title); // the button, a child of it, or an ancestor
      return;
    }
  }
}

export function useDisabledReason() {
  onMounted(() => {
    document.addEventListener('touchstart', onTouchStart, true);
    document.addEventListener('touchend', onTouchEnd, true);
  });
  onBeforeUnmount(() => {
    document.removeEventListener('touchstart', onTouchStart, true);
    document.removeEventListener('touchend', onTouchEnd, true);
  });
}

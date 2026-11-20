import { onMounted, onBeforeUnmount } from 'vue';
import { toast } from '@/composables/useToast';

// Phones and tablets show no tooltips, so a tap on a disabled button marked data-off-reason says why (its title) in a
// toast. touchend in the capture phase: a disabled button gets no click. Hit-tested by rectangle, not by the touch's
// target: some disabled buttons have pointer-events: none. But only when nothing else is laid over it: what's under the
// finger must be the button, a child of it, or an ancestor of it (the one a pointer-events: none button's touch lands on).
// A touch that moved (a swipe or scroll) is not a tap. A mouse or pen click (pointerup: a disabled button gets no
// click, but does get the pointer's own events) has the tooltip, so says nothing by itself. Either way the button
// first hears a cancelable `offreason` event: canceled, it has said why itself (a paint tool that's off: useFontSetup).
const SLOP = 10; // px a finger may drift and still be a tap
let down = null, pressed = null;

const moved = (start, x, y) => !start || Math.hypot(x - start.x, y - start.y) > SLOP;

// The disabled button marked data-off-reason at this point, with nothing laid over it, or null.
function offButtonAt(x, y) {
  const hit = document.elementFromPoint(x, y);
  for (const button of document.querySelectorAll('button[data-off-reason]:disabled')) {
    const r = button.getBoundingClientRect();
    if (button.title && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      return hit && (hit.contains(button) || button.contains(hit)) ? button : null; // the button, a child of it, or an ancestor
    }
  }
  return null;
}

function sayWhy(x, y, { touch }) {
  const button = offButtonAt(x, y);
  if (button && button.dispatchEvent(new CustomEvent('offreason', { cancelable: true })) && touch) toast(button.title);
}

const onTouchStart = (e) => { down = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; };

function onTouchEnd(e) {
  const point = e.changedTouches[0], start = down;
  down = null;
  if (point && !moved(start, point.clientX, point.clientY)) sayWhy(point.clientX, point.clientY, { touch: true });
}

// The primary button only: a right-click on a flyout's face opens the flyout.
const onPointerDown = (e) => { pressed = e.pointerType !== 'touch' && e.button === 0 ? { x: e.clientX, y: e.clientY } : null; };

function onPointerUp(e) {
  const start = pressed;
  pressed = null;
  if (e.pointerType !== 'touch' && e.button === 0 && !moved(start, e.clientX, e.clientY)) sayWhy(e.clientX, e.clientY, { touch: false });
}

const LISTENERS = { touchstart: onTouchStart, touchend: onTouchEnd, pointerdown: onPointerDown, pointerup: onPointerUp };

export function useDisabledReason() {
  onMounted(() => {
    for (const [type, listener] of Object.entries(LISTENERS)) document.addEventListener(type, listener, true);
  });
  onBeforeUnmount(() => {
    for (const [type, listener] of Object.entries(LISTENERS)) document.removeEventListener(type, listener, true);
  });
}

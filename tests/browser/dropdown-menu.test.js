// DropdownMenu's menu is a manual popover, in the top layer: nothing it's in clips it, and CSS anchors it to its
// trigger, below it lined up with one edge (or above it, with up), flipped to stay in the window.
import { afterEach, expect, test } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { i18n } from '@/i18n';
import DropdownMenu from '@/components/DropdownMenu.vue';

let app, host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

// A menu of three items, its trigger at `left`/`top` in the window, inside `box` (styles for what holds it).
async function open({ left = 300, top = 200, box = {}, ...props } = {}) {
  host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: `${left}px`, top: `${top}px`, ...box });
  document.body.append(host);
  app = createApp({
    render: () => h(DropdownMenu, { label: 'Menu', ...props }, () => ['One', 'Two', 'Three'].map((name) => h('button', name))),
  }).use(i18n);
  app.mount(host);
  host.querySelector('.dropdown-trigger').click();
  await nextTick();
  const menu = host.querySelector('.dropdown-content');
  for (const animation of menu.getAnimations()) animation.finish(); // where it ends up, not where it slides in from
  return { menu, trigger: host.querySelector('.dropdown-trigger').getBoundingClientRect(), at: menu.getBoundingClientRect() };
}

test('the menu is an open popover, below its trigger and lined up with its right edge, or its left with align left', async () => {
  let { menu, trigger, at } = await open();
  expect(menu.matches(':popover-open')).toBe(true);
  expect(Math.round(at.right)).toBe(Math.round(trigger.right));
  expect(Math.round(at.top - trigger.bottom)).toBe(4);
  app.unmount();
  host.remove();
  ({ trigger, at } = await open({ align: 'left', left: 40 }));
  expect(Math.round(at.left)).toBe(Math.round(trigger.left));
  expect(Math.round(at.top - trigger.bottom)).toBe(4);
});

test('with up it opens above its trigger', async () => {
  const { trigger, at } = await open({ up: true });
  expect(Math.round(trigger.top - at.bottom)).toBe(4);
  expect(Math.round(at.right)).toBe(Math.round(trigger.right));
});

test('at the window\'s edges it flips to the side that fits', async () => {
  const width = document.documentElement.clientWidth, height = document.documentElement.clientHeight;
  // Lined up with the left edge, at the right of the window: it lines up with the right edge instead.
  let { trigger, at } = await open({ align: 'left', box: { left: 'auto', right: '10px' } });
  expect(Math.round(at.right)).toBe(Math.round(trigger.right));
  expect(at.right).toBeLessThanOrEqual(width);
  app.unmount();
  host.remove();
  // At the bottom of the window: above the trigger.
  ({ trigger, at } = await open({ top: height - 30 }));
  expect(Math.round(trigger.top - at.bottom)).toBe(4);
  expect(at.top).toBeGreaterThanOrEqual(0);
});

test('nothing it\'s in clips it: in a small box that hides what overflows, and is transformed, its last item takes a press', async () => {
  const { menu } = await open({ box: { width: '80px', height: '30px', overflow: 'hidden', transform: 'translateX(0)' } });
  const last = [...menu.querySelectorAll('button')].at(-1), { left, top, width, height } = last.getBoundingClientRect();
  expect(document.elementFromPoint(left + width / 2, top + height / 2)).toBe(last);
});

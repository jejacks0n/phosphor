// DropdownMenu's menu is a manual popover, in the top layer: nothing it's in clips it, and CSS anchors it to its
// trigger, below it lined up with one edge (or above it, with up), flipped to stay in the window.
import { afterEach, expect, test } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { userEvent } from 'vitest/browser';
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

test('a phone\'s keyboard coming up for a field in it (the window resized and scrolled) leaves it open; otherwise either closes it', async () => {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    render: () => h(DropdownMenu, { label: 'Menu', closeOnSelect: false }, () => [h('input', { type: 'number' }), h('button', 'One')]),
  }).use(i18n);
  app.mount(host);
  host.querySelector('.dropdown-trigger').click();
  await nextTick();
  const isOpen = () => !!host.querySelector('.dropdown-content');
  host.querySelector('.dropdown-content input').focus();
  window.dispatchEvent(new Event('resize'));
  document.dispatchEvent(new Event('scroll'));
  await nextTick();
  expect(isOpen()).toBe(true);
  host.querySelector('.dropdown-content button').focus(); // no keyboard for a button
  window.dispatchEvent(new Event('resize'));
  await nextTick();
  expect(isOpen()).toBe(false);
  host.querySelector('.dropdown-trigger').click();
  await nextTick();
  document.dispatchEvent(new Event('scroll'));
  await nextTick();
  expect(isOpen()).toBe(false);
});

test('from the keys: Enter opens it, Down and Up move between its items (past a disabled one, stopping at the ends), and Enter picks one', async () => {
  host = document.createElement('div');
  document.body.append(host);
  let picked = null;
  const item = (name, disabled = false) => h('button', { disabled, onClick: () => { picked = name; } }, name);
  app = createApp({
    render: () => h(DropdownMenu, { label: 'Menu' }, () => [item('One'), item('Two'), item('Off', true), item('Three')]),
  }).use(i18n);
  app.mount(host);
  const trigger = host.querySelector('.dropdown-trigger');
  trigger.focus();
  await userEvent.keyboard('{Enter}');
  await nextTick();
  const named = () => document.activeElement.textContent;
  await userEvent.keyboard('{ArrowDown}');
  expect(named()).toBe('One');
  await userEvent.keyboard('{ArrowDown}{ArrowDown}');
  expect(named()).toBe('Three'); // past the disabled one
  await userEvent.keyboard('{ArrowDown}');
  expect(named()).toBe('Three'); // the end: it stays
  await userEvent.keyboard('{ArrowUp}');
  expect(named()).toBe('Two');
  await userEvent.keyboard('{Enter}');
  await nextTick();
  expect(picked).toBe('Two');
  expect(host.querySelector('.dropdown-content')).toBe(null);
  expect(document.activeElement).toBe(trigger);
});

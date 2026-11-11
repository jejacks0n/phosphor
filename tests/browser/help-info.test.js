// The help i (HelpInfo.vue): a real button. A mouse shows the tip by hovering, a tap opens it and keeps it open, and keys reach it.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { i18n } from '@/i18n';
import HelpInfo from '@/components/HelpInfo.vue';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
});

async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(HelpInfo, { text: 'Some help.', name: 'Seed' }) }).use(i18n);
  app.mount(host);
  await nextTick();
  return host.querySelector('button');
}
const tip = () => document.querySelector('.help-tooltip');
const fire = (el, type, pointerType) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType }));
async function tap(button) {
  fire(button, 'pointerenter', 'touch');
  fire(button, 'pointerdown', 'touch');
  button.click();
  await nextTick();
}

test('it is a button with a name, and the tip is its description while open', async () => {
  const button = await mount();
  expect(button.getAttribute('aria-label')).toBe('Help: Seed');
  expect(button.getAttribute('aria-expanded')).toBe('false');
  await tap(button);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(tip().getAttribute('role')).toBe('tooltip');
  expect(button.getAttribute('aria-describedby')).toBe(tip().id);
});

test('a tap opens the tip and keeps it open; a second tap, or a tap elsewhere, closes it', async () => {
  const button = await mount();
  await tap(button);
  expect(tip()).not.toBeNull();
  await tap(button);
  expect(tip()).toBeNull();
  await tap(button);
  fire(document.body, 'pointerdown', 'touch');
  await nextTick();
  expect(tip()).toBeNull();
});

test('a mouse shows the tip on hover, and its click does not close it', async () => {
  const button = await mount();
  fire(host.firstElementChild, 'pointerenter', 'mouse');
  await nextTick();
  expect(tip()).not.toBeNull();
  fire(button, 'pointerdown', 'mouse');
  button.click();
  await nextTick();
  expect(tip()).not.toBeNull();
  fire(host.firstElementChild, 'pointerleave', 'mouse');
  await nextTick();
  expect(tip()).toBeNull();
});

test('keys: Enter opens it, Escape closes it, and focus leaving closes it', async () => {
  const button = await mount();
  button.focus();
  button.click();   // Enter and Space on a button arrive as a click with no pointer before it
  await nextTick();
  expect(tip()).not.toBeNull();
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextTick();
  expect(tip()).toBeNull();
  button.click();
  await nextTick();
  button.blur();
  await nextTick();
  expect(tip()).toBeNull();
});

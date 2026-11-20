// The toast at the bottom of the screen: a click anywhere on it closes it; one with an action has a button that runs
// the action once and closes it.
import { afterEach, expect, test, onTestFinished } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, nextTick } from 'vue';
import { i18n } from '@/i18n';
import AppToast from '@/components/AppToast.vue';
import { toast, toastMessage, closeToast } from '@/composables/useToast';

let app, host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
  closeToast();
});

async function mount() {
  host = document.body.appendChild(document.createElement('div'));
  app = createApp(AppToast).use(i18n);
  app.mount(host);
  await nextTick();
}
const shown = () => document.querySelector('.app-toast');

test('a click on the message closes it', async () => {
  await mount();
  toast('Saved.');
  await nextTick();
  expect(shown().textContent).toContain('Saved.');
  expect(shown().querySelector('button')).toBeNull();
  shown().click();
  expect(toastMessage.value).toBe(null);
});

test('an action’s button runs it once and closes the toast; the message and its × still close it', async () => {
  await mount();
  let runs = 0;
  toast('No lower half.', { stay: true, action: { label: 'Set up its blocks', run: () => { runs += 1; } } });
  await nextTick();
  const button = shown().querySelector('button');
  expect(button.textContent).toBe('Set up its blocks');
  expect(button.title).toBe('Set up its blocks'); // not the toast's "Close"
  button.click();
  expect(runs).toBe(1);
  expect(toastMessage.value).toBe(null);
  toast('No lower half.', { stay: true, action: { label: 'Set up its blocks', run: () => { runs += 1; } } });
  await nextTick();
  shown().click();
  expect(runs).toBe(1);
  expect(toastMessage.value).toBe(null);
});

test('an action that shows a message of its own keeps it', async () => {
  await mount();
  toast('One.', { stay: true, action: { label: 'Go', run: () => toast('Two.') } });
  await nextTick();
  shown().querySelector('button').click();
  expect(toastMessage.value).toBe('Two.');
});

test('on a phone, a long toast takes the width of the screen less its margins, centered, its button whole', async () => {
  await page.viewport(390, 844);
  onTestFinished(() => page.viewport(414, 896));
  await expect.poll(() => innerWidth).toBe(390);
  await mount();
  toast('This drawing\u2019s font, Slab, has no lower half block, so it can\u2019t be painted in yet.', { stay: true, action: { label: 'Set up its blocks', run: () => {} } });
  await nextTick();
  const box = shown().getBoundingClientRect(), button = shown().querySelector('button');
  expect(box.width).toBeGreaterThan(300); // not wrapped at half the screen
  expect(box.left).toBeGreaterThanOrEqual(16);
  expect(box.right).toBeLessThanOrEqual(390 - 16);
  expect(Math.abs(box.left - (390 - box.right))).toBeLessThan(1); // centered
  expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth); // its label on one line, not squeezed
  expect(button.getBoundingClientRect().height).toBeLessThan(30);
});

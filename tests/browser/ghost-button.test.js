// Ghost on the animation bar is one button, lit while the ghost is on. It opens a box holding both of the ghost's
// settings: a checkbox that turns it on or off, and its strength.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, loadImage } from '../support/app.js';
import AnimationBar from '@/components/AnimationBar.vue';

let app = null;
afterEach(() => {
  app?.unmount();
  app = null;
  document.body.replaceChildren();
});

async function bar() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  project.setAnimate(true);
  workspace.ghost = true;
  workspace.ghostStrength = 35;
  const host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(AnimationBar) }).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  return { workspace, host };
}

const named = (host, name) => [...host.querySelectorAll('button')].filter((b) => b.getAttribute('aria-label') === name);

test('Ghost is one button, lit while the ghost is on, and nothing beside it', async () => {
  const { workspace, host } = await bar();
  expect(named(host, 'Ghost')).toHaveLength(1);
  expect(named(host, 'Ghost strength')).toHaveLength(0);
  const ghost = named(host, 'Ghost')[0];
  expect(ghost.closest('.ghost').classList.contains('active')).toBe(true);
  expect(ghost.querySelector('svg')).not.toBeNull(); // a ghost, not a word
  workspace.ghost = false;
  await nextTick();
  expect(ghost.closest('.ghost').classList.contains('active')).toBe(false);
  expect(ghost.disabled).toBe(false); // it still opens, to turn the ghost back on
});

test('its box turns the ghost on and off and sets its strength, and stays open while you do', async () => {
  const { workspace, host } = await bar();
  expect(host.querySelector('input[type=checkbox]')).toBeNull(); // a button's room until it's asked for
  named(host, 'Ghost')[0].click();
  await nextTick();
  const box = host.querySelector('.ghost .dropdown-content');
  const check = box.querySelector('input[type=checkbox]'), slider = box.querySelector('input[type=range]');
  expect(check.checked).toBe(true);
  expect(slider.value).toBe('35');
  expect(box.querySelector('output')).toBeNull(); // no readout beside the slider
  expect(box.textContent).not.toContain('Show the ghost'); // the checkbox is named for screen readers, not labeled
  expect(check.getAttribute('aria-label')).toBe('Show the ghost');
  expect(check.parentElement).toBe(slider.closest('label').parentElement); // one row: the checkbox, then the slider
  slider.value = '70';
  slider.dispatchEvent(new Event('input'));
  await nextTick();
  expect(workspace.ghostStrength).toBe(70);
  check.click();
  await nextTick();
  expect(workspace.ghost).toBe(false);
  expect(host.querySelector('.ghost .dropdown-content')).not.toBeNull(); // still open
  expect(slider.disabled).toBe(true); // no strength with no ghost
  expect(named(host, 'Ghost')[0].closest('.ghost').classList.contains('active')).toBe(false);
  check.click();
  await nextTick();
  expect(workspace.ghost).toBe(true);
  expect(slider.disabled).toBe(false);
});

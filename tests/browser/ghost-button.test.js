// Ghost on the animation bar is one button, lit while the ghost is on. It opens a box holding both of the ghost's
// settings: a checkbox that turns it on or off, its strength, and how many frames before and after it shows.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
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
  const { project, workspace, pinia } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  project.setAnimate(true);
  workspace.ghost = true;
  workspace.ghostStrength = 35;
  workspace.ghostFramesBefore = 1;
  workspace.ghostFramesAfter = 0;
  const host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(AnimationBar) }).use(pinia).use(i18n);
  app.mount(host);
  await nextTick();
  return { workspace, host };
}

const named = (host, name) => [...host.querySelectorAll('button')].filter((b) => b.getAttribute('aria-label') === name);

test('Ghost is one button, lit while the ghost is on, and nothing beside it', async () => {
  const { workspace, host } = await bar();
  expect(named(host, 'Ghost')).toHaveLength(1);
  expect(named(host, 'Ghost opacity')).toHaveLength(0);
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
  expect(box.textContent).not.toContain('Show ghost'); // the checkbox is named for screen readers, not labeled
  expect(check.getAttribute('aria-label')).toBe('Show ghost');
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

test('its box sets how many frames before (1 to 5) and after (0 to 5) the ghost shows, starting at 1 and 0', async () => {
  const { workspace, host } = await bar();
  named(host, 'Ghost')[0].click();
  await nextTick();
  const box = host.querySelector('.ghost .dropdown-content');
  const field = (name) => [...box.querySelectorAll('label')].find((label) => label.textContent.trim() === name).querySelector('input[type=number]');
  const before = field('Frames before'), after = field('Frames after');
  expect([before.value, after.value]).toEqual(['1', '0']);
  expect([before.min, before.max, after.min, after.max]).toEqual(['1', '5', '0', '5']);
  before.value = '3';
  before.dispatchEvent(new Event('input'));
  after.value = '9'; // too many: the most there is
  after.dispatchEvent(new Event('input'));
  after.dispatchEvent(new Event('change'));
  await nextTick();
  expect([workspace.ghostFramesBefore, workspace.ghostFramesAfter]).toEqual([3, 5]);
  expect(after.value).toBe('5');
  expect(host.querySelector('.ghost .dropdown-content')).not.toBeNull(); // still open
  workspace.ghost = false;
  await nextTick();
  expect(before.disabled && after.disabled).toBe(true);
});

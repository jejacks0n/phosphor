// The desktop build's start screen: a recent drawing open in another window is marked so, and can't be opened again.
import { test, expect, afterEach } from 'vitest';
import { createApp } from 'vue';
import ZeroState from '@/components/ZeroState.vue';
import { i18n, setLocale } from '@/i18n';

let mounted = null, host = null;
afterEach(async () => {
  mounted?.unmount();
  host?.remove();
  await setLocale('en', { persist: false });
});

const recent = [
  { id: 'a', filename: 'night', editedAt: 2, openElsewhere: true },
  { id: 'b', filename: 'day', editedAt: 1, openElsewhere: false },
];
function mount() {
  host = document.body.appendChild(document.createElement('div'));
  mounted = createApp(ZeroState, { recent, openRecent: () => {} }).use(i18n);
  mounted.mount(host);
  return [...host.querySelectorAll('.recent button')];
}

test('a drawing open in another window says window, not tab, and is off', async () => {
  let [elsewhere, free] = mount();
  expect([elsewhere.textContent.trim(), elsewhere.getAttribute('aria-label'), elsewhere.disabled]).toEqual(['Open in another window', 'night (open in another window)', true]);
  expect([free.textContent.trim(), free.disabled]).toEqual(['Open', false]);
  mounted.unmount();
  host.remove();

  await setLocale('fr', { persist: false });
  [elsewhere] = mount();
  expect([elsewhere.textContent.trim(), elsewhere.getAttribute('aria-label')]).toEqual(['Ouvert dans une autre fenêtre', 'night (ouvert dans une autre fenêtre)']);
});

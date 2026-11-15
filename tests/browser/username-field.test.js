// The username field says what's wrong from the first blur with something typed, or from the third character; a
// field left empty isn't nagged on blur (a dialog opens with focus in it).
import { afterEach, expect, test } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { i18n } from '@/i18n';
import UsernameField from '@/components/social/UsernameField.vue';

let app, host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

async function mount() {
  const name = ref('');
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(UsernameField, { modelValue: name.value, 'onUpdate:modelValue': (v) => { name.value = v; } }) }).use(i18n);
  app.mount(host);
  await nextTick();
  return { name, input: host.querySelector('input'), problem: () => host.querySelector('p.error')?.textContent ?? null };
}

test('left empty, a blur says nothing; with something typed, a blur says what\'s wrong', async () => {
  const { name, input, problem } = await mount();
  input.focus();
  input.blur();
  await nextTick();
  expect(problem()).toBe(null);
  name.value = 'ab';
  await nextTick();
  expect(problem()).toBe(null); // two characters, not yet blurred
  input.focus();
  input.blur();
  await nextTick();
  expect(problem()).toBe('Usernames are 3 to 24 characters');
});

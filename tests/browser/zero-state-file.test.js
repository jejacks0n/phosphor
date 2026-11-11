// The start screen's file chooser: choosing the same file twice (Cancel at the question between) is two choices.
import { test, expect, afterEach } from 'vitest';
import { createApp } from 'vue';
import { i18n } from '@/i18n';
import ZeroState from '@/components/ZeroState.vue';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
});

test('the same file chosen twice reports twice, because the chooser is emptied after each choice', async () => {
  const chosen = [];
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(ZeroState, { onFileSelected: (file) => chosen.push(file) });
  app.use(i18n).mount(host);
  const input = host.querySelector('input[type=file]');
  const file = new File(['x'], 'long.ans');
  for (let i = 0; i < 2; i++) {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    expect(input.files.length).toBe(0); // a real chooser then sees the same file as new
  }
  expect(chosen).toEqual([file, file]);
});

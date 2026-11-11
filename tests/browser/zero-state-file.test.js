// The file chooser (the start screen's button and Cmd/Ctrl+O): choosing the same file twice (Cancel at the question
// between) is two choices.
import { test, expect, afterEach } from 'vitest';
import { createApp } from 'vue';
import { createTestApp } from '../support/app.js';
import EditWorkspace from '@/components/EditWorkspace.vue';
import { i18n } from '@/i18n';
import { toastMessage, closeToast } from '@/composables/useToast.js';

let mounted = null, host = null;
afterEach(() => { mounted?.unmount(); host?.remove(); closeToast(); });

test('the same file chosen twice reports twice, because the chooser is emptied after each choice', async () => {
  await createTestApp();
  host = document.createElement('div');
  document.body.append(host);
  mounted = createApp(EditWorkspace).use(i18n);
  mounted.mount(host);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const input = host.querySelector('input[type=file]');
  const file = new File([new Uint8Array(8)], 'theme.sue');
  for (let i = 0; i < 2; i++) {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    expect(input.files.length).toBe(0); // a real chooser then sees the same file as new
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(toastMessage.value).toContain("Phosphor can't open theme.sue");
    closeToast();
  }
});

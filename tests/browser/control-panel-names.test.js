// Every field and button in the settings panel has a name a screen reader reads (maya-4): the second Dimensions number,
// the height in pixel rows, was a spinbutton with no name, and the seed button was named only by its "🎲".
import { afterEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, nextTick } from 'vue';
import { i18n } from '@/i18n';
import { createTestApp, loadImage } from '../support/app.js';
import ControlPanel from '@/components/ControlPanel.vue';

let app, host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

test('the Dimensions height and the seed button have names', async () => {
  const { project, pinia } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(ControlPanel).use(pinia).use(i18n);
  app.mount(host);
  await nextTick();
  await expect.element(page.getByRole('spinbutton', { name: 'Dimensions', exact: true })).toHaveValue(40);
  await expect.element(page.getByRole('spinbutton', { name: 'Pixel rows', exact: true })).toHaveValue(40);
  await expect.element(page.getByRole('button', { name: 'Generate new seed', exact: true })).toBeInTheDocument();
});

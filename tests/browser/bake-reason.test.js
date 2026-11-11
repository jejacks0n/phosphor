// Bake off because there's nothing to bake says so in its title, in the toolbar and in the Actions menu.
import { test, expect } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createTestApp, loadImage, settle } from '../support/app.js';
import EditToolbar from '@/components/EditToolbar.vue';
import { i18n } from '@/i18n';

const WHY = 'Nothing to bake: the sliders are at their defaults and there are no shapes on the picture.';

test('Bake says why it is off, until a slider moves', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/photo.jpg', { cols: 20, rows: 20 });
  await settle(project);
  const host = document.createElement('div'), toolbar = createApp(EditToolbar).use(i18n);
  document.body.append(host);
  toolbar.mount(host);
  try {
    const bakes = () => [...host.querySelectorAll('button')].filter((b) => b.getAttribute('aria-label') === 'Bake' || b.textContent.trim() === 'Bake' || b.title.startsWith('Bake:'));
    expect(bakes().length).toBeGreaterThan(0);
    for (const b of bakes()) {
      expect(b.disabled).toBe(true);
      expect(b.title).toBe(WHY);
    }
    project.setSlider('contrast', 130);
    await nextTick();
    for (const b of bakes()) {
      expect(b.disabled).toBe(false);
      expect(b.title).not.toBe(WHY);
    }
  } finally {
    toolbar.unmount();
    host.remove();
  }
});

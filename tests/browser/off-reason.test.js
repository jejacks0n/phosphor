// A button that is off because of something (a room, a lock) says why in its title and marks itself for a tap: phones
// show no tooltips, so useDisabledReason shows the title as a toast (the real touch is tests/e2e/disabled-reason.spec.js).
import { test, expect, afterEach } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { createTestApp } from '../support/app.js';
import { i18n } from '@/i18n';
import ProjectActions from '@/components/ProjectActions.vue';

let mounted = null, host = null;
afterEach(() => { mounted?.unmount(); host?.remove(); mounted = host = null; });

test('New and Versions, off in a room, are marked so a tap says why', async () => {
  const { project } = await createTestApp();
  const pinia = getActivePinia();
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  host = document.body.appendChild(document.createElement('div'));
  mounted = createApp(ProjectActions).use(pinia).use(i18n);
  mounted.mount(host);
  const off = () => [...host.querySelectorAll('button[data-off-reason]')].map((b) => b.title);
  expect(off()).toEqual([]);
  project._sharing = { role: 'artist' };
  await nextTick();
  expect(off()).toEqual(["Only the room's host can change this.", "Only the room's host can change this."]);
  for (const button of host.querySelectorAll('button[data-off-reason]')) expect(button.disabled).toBe(true);
  project._sharing = null;
});

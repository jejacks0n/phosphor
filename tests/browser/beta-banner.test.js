// The beta banner (components/BetaBanner.vue): one line under the settings panel's logo on a pre-release build, saying
// which (lib/buildStage.js has the rule, tests/unit/build-info.test.js holds it), with the link that opens the issue
// report. A released build has none of it.
import { afterEach, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import ControlPanel from '@/components/ControlPanel.vue';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import '@/assets/global.css';

const build = vi.hoisted(() => ({ stage: null }));
vi.mock('@/lib/buildStage.js', () => ({ buildStage: () => build.stage }));

let app, host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

async function panel(stage) {
  build.stage = stage;
  const pinia = createPinia();
  setActivePinia(pinia);
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(ControlPanel).use(pinia).use(i18n);
  app.mount(host);
  await nextTick();
  return useWorkspaceStore();
}
const banner = () => host.querySelector('p.stage');

test('a released build has no banner', async () => {
  await panel(null);
  expect(banner()).toBe(null);
  expect(host.querySelector('button.logo').nextElementSibling.matches('fieldset.drawing')).toBe(true);
});

test('a beta says Beta under the logo, with Report an issue, which opens the report', async () => {
  const workspace = await panel('beta');
  expect(banner().textContent.replace(/\s+/g, ' ').trim()).toBe('Beta · Report an issue');
  expect(getComputedStyle(banner().querySelector('span.name')).textTransform).toBe('uppercase');
  // Right under the logo, before the settings: where Tab goes from the logo.
  expect(host.querySelector('button.logo').nextElementSibling).toBe(banner());
  expect(banner().nextElementSibling.matches('fieldset.drawing')).toBe(true);
  expect(banner().querySelectorAll('button')).toHaveLength(1); // the link, and nothing to dismiss it with

  expect(workspace.issueReportOpen).toBe(false);
  await userEvent.click(banner().querySelector('button'));
  expect(workspace.issueReportOpen).toBe(true);
});

test('an alpha says Alpha', async () => {
  await panel('alpha');
  expect(banner().textContent.replace(/\s+/g, ' ').trim()).toBe('Alpha · Report an issue');
});

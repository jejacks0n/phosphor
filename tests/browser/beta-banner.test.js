// The beta banner (components/BetaBanner.vue): a small CRT screen under the settings panel's logo on a pre-release build,
// saying which (lib/buildStage.js has the rule, tests/unit/build-info.test.js holds it) in the IBM VGA font, lit between
// shade blocks, with the link that opens the issue report under it. A released build has none of it.
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
  return useWorkspaceStore(pinia);
}
const banner = () => host.querySelector('p.stage');

test('a released build has no banner', async () => {
  await panel(null);
  expect(banner()).toBe(null);
  expect(host.querySelector('button.logo').nextElementSibling.matches('fieldset.drawing')).toBe(true);
});

test('a beta shows a small screen under the logo: BETA lit between shade blocks, and Report an issue under it, which opens the report', async () => {
  const workspace = await panel('beta');
  const [name, link] = [banner().querySelector('span.name'), banner().querySelector('button')];
  expect(name.textContent).toBe('▓▒░ Beta ░▒▓');
  expect(getComputedStyle(name).textTransform).toBe('uppercase');
  expect(link.textContent.trim()).toBe('Report an issue');
  // The shade blocks are the screen's dressing: a screen reader hears "Beta" and the link.
  expect([...name.querySelectorAll('[aria-hidden="true"]')].map((dressing) => dressing.textContent.trim())).toEqual(['▓▒░', '░▒▓']);
  // The font of the art, at its own size, each line a cell high; the link on the line under the name.
  const style = getComputedStyle(banner());
  expect(style.fontFamily).toContain('IBM VGA 8x16');
  expect([style.fontSize, style.lineHeight]).toEqual(['16px', '16px']);
  expect(link.getBoundingClientRect().top).toBeGreaterThanOrEqual(name.getBoundingClientRect().bottom);
  // A screen of its own: a fill that isn't the panel's, rounded, and the same whatever the theme behind it.
  expect(style.backgroundImage).toContain('radial-gradient');
  expect(parseFloat(style.borderTopLeftRadius)).toBeGreaterThan(0);
  const dark = style.backgroundImage;
  document.documentElement.dataset.theme = 'light';
  expect(getComputedStyle(banner()).backgroundImage).toBe(dark);
  delete document.documentElement.dataset.theme;

  // Right under the logo, before the settings: where Tab goes from the logo.
  expect(host.querySelector('button.logo').nextElementSibling).toBe(banner());
  expect(banner().nextElementSibling.matches('fieldset.drawing')).toBe(true);
  expect(banner().querySelectorAll('button')).toHaveLength(1); // the link, and nothing to dismiss it with

  expect(workspace.issueReportOpen).toBe(false);
  await userEvent.click(link);
  expect(workspace.issueReportOpen).toBe(true);
});

test('an alpha says Alpha', async () => {
  await panel('alpha');
  expect(banner().querySelector('span.name').textContent).toBe('▓▒░ Alpha ░▒▓');
});

// The panel is a column that shrinks what it can once its settings run past the window: the screen keeps its two lines.
test('the screen keeps its height in a panel too short for its settings', async () => {
  await panel('beta');
  const tall = banner().getBoundingClientRect().height;
  expect(tall).toBeGreaterThanOrEqual(16 * 2 + 16); // two lines and the room around them
  host.style.cssText = 'display: flex; height: 160px;';
  await nextTick();
  expect(host.querySelector('aside.control-panel').scrollHeight).toBeGreaterThan(160); // the settings do run past it
  expect(banner().getBoundingClientRect().height).toBe(tall);
});

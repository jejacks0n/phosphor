// The History panel (components/dev/HistoryPanel.vue): the actions taken as lines, folded, with Copy (the headed log on
// the clipboard) and Clear. And its tab in the side panel: there in development, and in any other build only once
// phosphor.history(true) has been run in the console (dev/historyTab.js).
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import HistoryPanel from '@/components/dev/HistoryPanel.vue';
import SidePanel from '@/components/SidePanel.vue';
import { createTestApp } from '../support/app.js';
import { clearLog, installActionLog } from '@/dev/actionLog.js';
import { SKIPPED } from '@/dev/skipped.js';
import { installHistoryCommand } from '@/dev/historyTab.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { closeToast, toastMessage } from '@/composables/useToast';
import '@/assets/global.css';

let app, host, workspace;
beforeEach(() => {
  const pinia = createPinia();
  installActionLog(pinia);
  setActivePinia(pinia);
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(HistoryPanel).use(pinia).use(i18n);
  app.mount(host);
  workspace = useWorkspaceStore();
  clearLog();
  closeToast();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  app?.unmount();
  host?.remove();
  app = host = null;
});

const items = () => [...host.querySelectorAll('li')].map((li) => [...li.children].map((c) => c.textContent).join(' ')); // spaced by CSS gap, not text

test('the panel lists the actions taken, folded, and Copy puts the headed log on the clipboard', async () => {
  workspace.setActiveTool('brush');
  workspace.setActiveTool('brush');
  await nextTick();
  expect(items()[0]).toMatch(/^\+\d+\.\ds workspace\.setActiveTool ×2 \("brush"\)$/); // a watcher's own action may follow it
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  await userEvent.click(host.querySelector('button.copy'));
  expect(write.mock.calls[0][0]).toMatch(/^Phosphor \S+ \(\S+\)\n.+\n\d+×\d+\n\n\+\d+\.\ds {2}workspace\.setActiveTool ×2 \("brush"\)/);
  expect(toastMessage.value).toBe('Copied');
});

test('Copy refused says so, and Clear empties the list', async () => {
  workspace.setActiveTool('brush');
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
  await userEvent.click(host.querySelector('button.copy'));
  await vi.waitFor(() => expect(toastMessage.value).toBe('Copy failed'));
  await userEvent.click(host.querySelector('button.clear'));
  await nextTick();
  expect(host.querySelectorAll('li')).toHaveLength(0);
});

test('without a clipboard API (http over a LAN) Copy says it failed, and nothing is thrown', async () => {
  workspace.setActiveTool('brush');
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  try {
    await userEvent.click(host.querySelector('button.copy'));
    await vi.waitFor(() => expect(toastMessage.value).toBe('Copy failed'));
  } finally {
    delete navigator.clipboard;
  }
});

test('the skip set leaves out queries and renders, but keeps the grid-size steps a person takes', () => {
  for (const name of ['readCell', 'render', 'composite', 'commitPending', 'load', 'loadMarket', 'sliderValues', 'projectFile', 'artDrawingCells']) expect(SKIPPED.has(name), name).toBe(true);
  for (const name of ['updateCols', 'updateRows', 'setAspectLock', 'undo', 'paintStroke']) expect(SKIPPED.has(name), name).toBe(false);
});

// The tab itself, in SidePanel, mounted as side-panel.test.js does.
async function mountSidePanel() {
  app.unmount(); // the panel on its own, from beforeEach
  const stores = await createTestApp();
  workspace = stores.workspace; // the test's own, by name: after the awaits, the active Pinia may be a late test's
  await page.viewport(1200, 800); // a wide screen, where the side panel shows
  host.style.cssText = 'display:flex;height:600px';
  app = createApp({ render: () => h(SidePanel) }).use(stores.pinia).use(i18n);
  app.mount(host);
  await nextTick();
}
const tabs = () => [...host.querySelectorAll('.side-panel [role=tab]')].map((b) => b.getAttribute('aria-label') ?? b.textContent.replace(/\s+/g, ' ').trim());

// In development (import.meta.env.DEV, which tests run with) it's always there.
test('the side panel has a History tab after Social, and picking it shows the panel', async () => {
  await mountSidePanel();
  expect(tabs()).toEqual(['Layers', 'Social Beta', 'History']);
  expect(host.querySelector('aside.history')).toBeNull();
  host.querySelectorAll('.side-panel [role=tab]')[2].click();
  await vi.waitFor(() => expect(host.querySelector('aside.history')).not.toBeNull()); // the component loads lazily
  expect(workspace.sidePanelTab).toBe('history');
  await page.viewport(414, 896);
});

// A built app: hidden, until the console command is run in this browser.
test('outside development the tab is hidden until phosphor.history(true) is run, which this browser keeps, and phosphor.history(false) hides it again', async () => {
  vi.stubEnv('DEV', false);
  delete window.phosphor;
  installHistoryCommand();
  expect(Object.keys(window.phosphor)).toEqual(['history']); // the one thing the page puts there
  window.phosphor.history(false);
  await mountSidePanel();
  try {
    expect(tabs()).toEqual(['Layers', 'Social Beta']);
    expect(host.querySelector('aside.history')).toBeNull();

    window.phosphor.history(true);
    await nextTick();
    expect(tabs()).toEqual(['Layers', 'Social Beta', 'History']);
    await vi.waitFor(() => expect(localStorage.getItem('phosphor.history')).toBe('true')); // kept for the next load
    host.querySelectorAll('.side-panel [role=tab]')[2].click();
    await vi.waitFor(() => expect(host.querySelector('aside.history')).not.toBeNull());

    // Hidden while it shows: the panel goes back to Layers, not to a tab that isn't there.
    window.phosphor.history(false);
    await nextTick();
    expect(tabs()).toEqual(['Layers', 'Social Beta']);
    expect(workspace.sidePanelTab).toBe('layers');
    expect(host.querySelector('aside.history')).toBeNull();
    await vi.waitFor(() => expect(localStorage.getItem('phosphor.history')).toBe('false'));

    // Anything but true is off: a slip in the console doesn't turn it on.
    window.phosphor.history('yes');
    await nextTick();
    expect(tabs()).toEqual(['Layers', 'Social Beta']);
  } finally {
    window.phosphor.history(false);
    delete window.phosphor;
    await page.viewport(414, 896);
  }
});

// The development-only History panel (components/dev/HistoryPanel.vue): the actions taken as lines, folded, with Copy
// (the headed log on the clipboard) and Clear.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import HistoryPanel from '@/components/dev/HistoryPanel.vue';
import SidePanel from '@/components/SidePanel.vue';
import { createTestApp } from '../support/app.js';
import { clearLog, installActionLog } from '@/dev/actionLog.js';
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

// The tab itself, in SidePanel (dev builds only: import.meta.env.DEV, which tests run with). Mounted as side-panel.test.js does.
test('the side panel has a History tab after Social, and picking it shows the panel', async () => {
  app.unmount(); // the panel on its own, from beforeEach
  await createTestApp();
  await page.viewport(1200, 800); // a wide screen, where the side panel shows
  host.style.cssText = 'display:flex;height:600px';
  app = createApp({ render: () => h(SidePanel) }).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  const tabs = () => [...host.querySelectorAll('.side-panel [role=tab]')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());
  expect(tabs()).toEqual(['Layers', 'Social Beta', 'History']);
  expect(host.querySelector('aside.history')).toBeNull();
  host.querySelectorAll('.side-panel [role=tab]')[2].click();
  await vi.waitFor(() => expect(host.querySelector('aside.history')).not.toBeNull()); // the component loads lazily
  expect(useWorkspaceStore().sidePanelTab).toBe('history');
  await page.viewport(414, 896);
});

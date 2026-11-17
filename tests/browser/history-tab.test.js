// The development-only History panel (components/dev/HistoryPanel.vue): the actions taken as lines, folded, with Copy
// (the headed log on the clipboard) and Clear.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import HistoryPanel from '@/components/dev/HistoryPanel.vue';
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

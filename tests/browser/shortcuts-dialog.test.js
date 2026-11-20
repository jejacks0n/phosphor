// The shortcut list (?) names each tool key by the tool it picks, as the tool's tooltip and ⋯ entry do.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import { TOOLS, keyLabel } from '@/tools';
import ShortcutsDialog from '@/components/ShortcutsDialog.vue';

let app = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

test('each key in the Tools section is named by the tool it picks', async () => {
  await createTestApp();
  app = createApp({ render: () => h(ShortcutsDialog) }).use(getActivePinia()).use(i18n);
  app.mount(document.body.appendChild(document.createElement('div')));
  await nextTick();
  const tools = [...document.querySelectorAll('section')].find((s) => s.querySelector('h4')?.textContent === 'Tools');
  const rows = new Map([...tools.querySelectorAll('dt')].flatMap((dt) =>
    [...dt.querySelectorAll('kbd')].map((kbd) => [kbd.textContent, dt.nextElementSibling.textContent])));
  const named = TOOLS.filter((tool) => !tool.views.includes('vector')).flatMap((tool) =>
    (tool.keys ?? []).map(keyLabel).filter((key) => rows.has(key)).map((key) => [tool, rows.get(key)]));
  expect(named.map(([tool]) => tool.id)).toContain('flip');
  for (const [tool, row] of named) expect(row.slice(0, tool.title.length), tool.id).toBe(tool.title);
});

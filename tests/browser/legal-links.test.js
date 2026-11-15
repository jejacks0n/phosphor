// About links the GitHub repo, and the Terms, the Privacy Policy and the Community Guidelines; the report box links the Community
// Guidelines. Each opens the page through the workspace's legalPage, as the consent question does.
import { afterEach, expect, test } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import AboutPhosphor from '@/components/AboutPhosphor.vue';
import ReportDialog from '@/components/social/ReportDialog.vue';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

let app, host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

async function mount(component, props = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const workspace = useWorkspaceStore();
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(component, props).use(pinia).use(i18n);
  app.mount(host);
  await nextTick();
  return workspace;
}
const link = (text) => [...document.querySelectorAll('button.link')].find((b) => b.textContent === text);

test('About links the Terms, the Privacy Policy and the Community Guidelines, each opening its page', async () => {
  const workspace = await mount(AboutPhosphor);
  for (const [text, page] of [['Terms', 'terms'], ['Privacy Policy', 'privacy'], ['Community Guidelines', 'guidelines']]) {
    workspace.legalPage = null;
    link(text).click();
    expect(workspace.legalPage).toBe(page);
  }
});

test('About links the GitHub repo under the version, opening in a new tab', async () => {
  await mount(AboutPhosphor);
  const repo = document.querySelector('header a');
  expect(repo.href).toBe('https://github.com/jejacks0n/phosphor');
  expect(repo.textContent).toBe('github.com/jejacks0n/phosphor');
  expect(repo.target).toBe('_blank');
});

test('the report box links the Community Guidelines, and the link sends no report', async () => {
  const workspace = await mount(ReportDialog, { name: 'wren', sub: 'u_2' });
  link('Community Guidelines').click();
  expect(workspace.legalPage).toBe('guidelines');
  expect(document.querySelector('dialog input[type=radio]:checked')).toBe(null);
  expect(document.querySelector('dialog')).not.toBe(null);
});

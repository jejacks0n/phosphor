// About links the GitHub repo, and the Terms, the Privacy Policy and the Community Guidelines; the report box links the Community
// Guidelines. Each opens the page through the workspace's legalPage, as the consent question does.
import { afterEach, expect, test, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import AboutPhosphor from '@/components/AboutPhosphor.vue';
import ReportDialog from '@/components/social/ReportDialog.vue';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

let app, host;
afterEach(() => {
  vi.unstubAllGlobals();
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

const showLicenses = async () => {
  [...document.querySelectorAll('.switcher button')].find((b) => b.textContent === 'Licenses').click();
  await nextTick();
};

test('About switches to Licenses, which lists the build\'s open-source packages from licenses.json, each opening to its page and license text, and back', async () => {
  const fetched = vi.fn(async () => new Response(JSON.stringify([
    { name: 'paper', version: '0.17.0', license: 'MIT', url: 'http://paperjs.org', text: 'The MIT License (MIT)\n\nCopyright (c) Jürg Lehni' },
  ]), { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetched);
  await mount(AboutPhosphor);
  expect(document.querySelector('section.licenses')).toBeNull();
  const links = () => [...document.querySelectorAll('dialog a')].map((a) => a.textContent);
  expect(links()).not.toContain('Font Awesome Free'); // the fonts' and icons' licenses are on Licenses, not About
  expect(links()).not.toContain('IBM VGA 8x16');
  expect(links()).toContain('Durdraw'); // thanks stay
  expect(fetched).not.toHaveBeenCalled(); // read only when it's shown
  const top = document.querySelector('.content-container');
  top.scrollTop = 200;
  await showLicenses();
  expect(document.querySelector('header .logo')).toBeNull();
  await vi.waitUntil(() => document.querySelector('section.licenses ul.packages li'));
  expect(fetched).toHaveBeenCalledExactlyOnceWith('/licenses.json');
  expect(top.scrollTop).toBe(0);
  expect(links()).toEqual(expect.arrayContaining(['IBM VGA 8x16', 'JetBrains Mono', 'Unscii', 'GNU Unifont', 'Font Awesome Free', 'CC BY 4.0']));
  expect(links()).not.toContain('Durdraw');
  const section = document.querySelector('section.licenses');
  expect(section.getAttribute('aria-label')).toBe('Licenses');
  expect(section.querySelector('p a').href).toBe('https://github.com/jejacks0n/phosphor/blob/main/LICENSE');
  expect(section.querySelector('summary').textContent).toBe('paper 0.17.0 (MIT)');
  expect(section.querySelector('details a').href).toBe('http://paperjs.org/');
  expect(section.querySelector('pre').textContent).toContain('Copyright (c) Jürg Lehni');
  [...document.querySelectorAll('.switcher button')].find((b) => b.textContent === 'About').click();
  await nextTick();
  expect(document.querySelector('section.licenses')).toBeNull();
  expect(document.querySelector('header .logo')).not.toBeNull();
  await showLicenses();
  expect(document.querySelector('section.licenses ul.packages li')).not.toBeNull();
  expect(fetched).toHaveBeenCalledTimes(1);
});

test('About without licenses.json (a host that answers with the page) leaves the list out, quietly', async () => {
  const warned = vi.spyOn(console, 'warn');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<!DOCTYPE html>', { headers: { 'content-type': 'text/html' } })));
  await mount(AboutPhosphor);
  await showLicenses();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(warned.mock.calls.filter(([message]) => String(message).includes('licenses'))).toEqual([]);
  expect(document.querySelector('section.licenses p').textContent).toContain('MIT License');
  expect(document.querySelector('section.licenses ul.assets')).not.toBeNull();
  expect(document.querySelector('section.licenses ul.packages')).toBeNull();
});

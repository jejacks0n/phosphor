// About links the GitHub repo, and the Terms, the Privacy Policy and the Community Guidelines; the report box links the Community
// Guidelines. Each opens the page through the workspace's legalPage, as the consent question does.
import { afterEach, expect, test, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import AboutPhosphor from '@/components/AboutPhosphor.vue';
import LegalDialog from '@/components/LegalDialog.vue';
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

// About's two pages are tabs on its first line, in a title's place.
const aboutTab = (name) => [...document.querySelectorAll('dialog.modal-dialog.reading > .head [role=tablist] [role=tab]')].find((b) => b.textContent.trim() === name);
const showLicenses = async () => {
  aboutTab('Licenses').click();
  await nextTick();
};

test('About switches to Licenses, which lists the build\'s open-source packages from licenses.json, each opening to its page and license text, and back', async () => {
  const fetched = vi.fn(async () => new Response(JSON.stringify([
    { name: 'paper', version: '0.17.0', license: 'MIT', url: 'http://paperjs.org', text: 'The MIT License (MIT)\n\nCopyright (c) Jürg Lehni' },
  ]), { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetched);
  await mount(AboutPhosphor);
  expect(document.querySelector('section.licenses')).toBeNull();
  expect(document.querySelector('dialog h2')).toBeNull(); // no title: the tabs say where you are
  expect([aboutTab('About').getAttribute('aria-selected'), aboutTab('Licenses').getAttribute('aria-selected')]).toEqual(['true', 'false']);
  const links = () => [...document.querySelectorAll('dialog a')].map((a) => a.textContent);
  expect(links()).not.toContain('Font Awesome Free'); // the fonts' and icons' licenses are on Licenses, not About
  expect(links()).not.toContain('IBM VGA 8x16');
  expect(links()).toContain('Durdraw'); // thanks stay
  expect(fetched).not.toHaveBeenCalled(); // read only when it's shown
  const top = document.querySelector('dialog > .body');
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
  aboutTab('About').click();
  await nextTick();
  expect(document.querySelector('section.licenses')).toBeNull();
  expect(document.querySelector('header .logo')).not.toBeNull();
  await showLicenses();
  expect(document.querySelector('section.licenses ul.packages li')).not.toBeNull();
  expect(fetched).toHaveBeenCalledTimes(1);
});

test('Licenses credits the color palettes to Lospec\'s Palette List and their authors, with its link', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { headers: { 'content-type': 'application/json' } })));
  await mount(AboutPhosphor);
  await showLicenses();
  const line = [...document.querySelectorAll('section.licenses ul.assets li')].find((li) => li.textContent.startsWith('Color palettes'));
  expect(line.textContent).toBe('Color palettes: from the Lospec Palette List, each by the author its row names');
  const link = line.querySelector('a');
  expect([link.textContent, link.href, link.target]).toEqual(['Lospec', 'https://lospec.com/palette-list', '_blank']);
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

test('the Privacy Policy says installing from the Marketplace downloads the plugin\'s files from GitHub, which sees the request', async () => {
  await mount(LegalDialog, { page: 'privacy' });
  await vi.waitUntil(() => document.querySelector('.legal-body'));
  const text = document.querySelector('.legal-body').textContent.replace(/\s+/g, ' ');
  expect(text).toContain('When you install a plugin from the Marketplace, your browser downloads its files from GitHub, which sees the request and your IP address.');
});

test('the Privacy Policy (en and fr) says getting a palette from Lospec asks lospec.com, and the shipped ones ask nothing', async () => {
  await mount(LegalDialog, { page: 'privacy' });
  await vi.waitUntil(() => document.querySelector('.legal-body'));
  const text = document.querySelector('.legal-body').textContent.replace(/\s+/g, ' ');
  expect(text).toContain('When you get a palette from Lospec by name or link, your browser requests it from lospec.com, which sees the request and your IP address. The palettes that come with Phosphor need no request.');
  const fr = (await import('../../src/i18n/legal/fr.vue?raw')).default.replace(/\s+/g, ' ');
  expect(fr).toContain('votre navigateur la demande à lospec.com, qui voit la requête et votre adresse IP.');
  const frLocale = JSON.parse((await import('../../src/i18n/locales/fr.json?raw')).default);
  expect(frLocale.legal.desktopPrivacy).toContain("l'application la demande à lospec.com, qui voit la requête et votre adresse IP."); // the same noun
});

test('the Privacy Policy (en and fr) says what an issue report sends, what of it is public and who handles it, apart from reports of a person or a room', async () => {
  await mount(LegalDialog, { page: 'privacy' });
  await vi.waitUntil(() => document.querySelector('.legal-body'));
  const text = document.querySelector('.legal-body').textContent.replace(/\s+/g, ' ');
  expect(text).toContain('Last updated: November 24, 2026.');
  expect(text).toContain('We never receive them unless you host a room or send an issue report with your drawing (both explained below).');
  expect(text).toContain('Nothing of a report is sent until you press Send (on the web, opening the form loads Cloudflare Turnstile, described below).');
  expect(text).toContain('A report sends us what you wrote, your version of Phosphor, whether you use the web or the desktop app, and your browser and operating system');
  expect(text).toContain('If you leave its box ticked, it also sends your current drawing and the steps you took in Phosphor since the page loaded');
  expect(text).toContain('The steps never include anything you typed into the SOCIAL tab: no password, email address, code, room password, or chat.');
  expect(text).toContain('published, with the version, platform, and browser, as a public issue on GitHub, where anyone can read it.');
  expect(text).toContain('Your drawing and steps are not published: they are retained for 90 days and are seen only by Phosphor\'s developer.');
  expect(text).toContain('An issue report is separate from reporting a user or a room');
  expect(text).toContain('GitHub: Publishes what you write in an issue report as a public issue.');
  expect(text).toContain('Issue reports: Your drawing and steps, 90 days. What you wrote stays public as a GitHub issue.');
  expect(text).toContain('signing in to an account that has had too many attempts, or sending an issue report.');
  // The section of its own comes before SOCIAL's, and Reports (of a user or a room) keeps its own words.
  const headings = [...document.querySelectorAll('.legal-body h2')].map((h) => h.textContent);
  expect(headings.indexOf('Issue Reports')).toBe(headings.indexOf('The SOCIAL Tab') - 1);
  expect(headings).toContain('Reports');
  expect(text).toContain('You can report a user or a room. A report is retained for 90 days after it is resolved.');

  const fr = (await import('../../src/i18n/legal/fr.vue?raw')).default.replace(/\s+/g, ' ');
  for (const words of [
    '<h2>Rapports de problème</h2>', 'Rien d\'un rapport n\'est envoyé tant que vous n\'appuyez pas sur Envoyer', 'sous forme de ticket public sur GitHub',
    'ils sont conservés 90 jours et ne sont vus que par le développeur de Phosphor', '<strong>GitHub :</strong> Publie ce que vous écrivez dans un rapport de problème',
    '<strong>Rapports de problème :</strong> Votre dessin et vos étapes, 90 jours.', 'ou envoyez un rapport de problème avec votre dessin', 'Dernière mise à jour : 24 novembre 2026.',
  ]) expect(fr, words).toContain(words);
  // The desktop app's own privacy note, which stands in for the policy there, says the same.
  for (const code of ['en', 'fr']) {
    const note = JSON.parse((await import(`../../src/i18n/locales/${code}.json?raw`)).default).legal.desktopPrivacy;
    expect(note, code).toContain('api.phosphor.work');
    expect(note, code).toMatch(/90 (days|jours)/);
    expect(note, code).toContain('GitHub');
  }
});

test('the Privacy Policy (en and fr) names Cloudflare as the web application\'s host, not GitHub Pages', async () => {
  const [en, fr] = await Promise.all([import('../../src/i18n/legal/en.vue?raw'), import('../../src/i18n/legal/fr.vue?raw')]);
  expect(en.default.replace(/\s+/g, ' ')).toContain('<strong>Cloudflare:</strong> Hosts and serves the web application');
  expect(fr.default.replace(/\s+/g, ' ')).toContain("<strong>Cloudflare :</strong> Héberge et diffuse l'application web");
  expect(en.default + fr.default).not.toContain('GitHub Pages');
});

test('About credits the font library collections and the FROGBLOCK author, each with its link', async () => {
  await mount(AboutPhosphor);
  const hrefs = (text) => [...document.querySelectorAll('a')].filter((a) => a.closest('li')?.textContent.includes(text)).map((a) => a.href);
  const viler = hrefs("VileR's VGA text mode fonts");
  expect(viler).toContain('https://github.com/viler-int10h/vga-text-mode-fonts');
  expect(viler).toContain(new URL(`${import.meta.env.BASE_URL}fonts/library/viler/FONTS.TXT`, location.href).href);
  expect(document.body.textContent).toContain('credits in FONTS.TXT');
  expect(hrefs('Mœbius XBin fonts')).toContain('https://github.com/hlotvonen/moebiusXBIN');
  expect(document.body.textContent).toContain('license unknown');
  expect(hrefs('FROGBLOCK font by Polyducks')).toEqual(['https://polyducks.itch.io/frogblock']);
});

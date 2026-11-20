import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

// What a build is, baked into it (__BUILD__ in the app; a <meta name="phosphor-build"> in index.html):
// the version, package.json's major.minor with the day it was built (UTC) as the third number
// (0.1.20261024), and the commit it was built from (GitHub Actions' GITHUB_SHA when deploying;
// "-dirty" when built from uncommitted changes), which tells two builds on one day apart. The desktop app's version is
// package.json's whole, as its releases are tagged (v0.2.0, v0.2.0-beta).
export function buildInfo({ desktop = false } = {}) {
  const git = (cmd) => {
    try {
      return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return '';
    }
  };
  const sha = (process.env.GITHUB_SHA || git('git rev-parse HEAD')).slice(0, 7) || 'unknown';
  const dirty = !process.env.GITHUB_SHA && git('git status --porcelain') ? '-dirty' : '';
  const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
  if (desktop) return { version, sha: sha + dirty };
  const [major, minor] = version.split('.');
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return { version: `${major}.${minor}.${day}`, sha: sha + dirty };
}

// The built page's Content-Security-Policy, as a <meta> (GitHub Pages can't send headers): scripts only from here,
// Turnstile, and the page's own inline ones by hash; connections only to the SOCIAL server (both the one built in
// and the local one, as config.js picks by hostname), Turnstile, and raw GitHub files (the plugin marketplace). Styles stay open to inline ones: the icons are
// SVG markup with style attributes. Not in development, where Vite's own client needs more.
// The desktop build (VITE_DESKTOP=1) has no SOCIAL server and no Turnstile: it connects only to rooms' sockets (ws:),
// and its marketplace fetches are the main process's (desktop/pluginList.js).
const TURNSTILE = 'https://challenges.cloudflare.com';
export function contentSecurityPolicy(html, api, { desktop = false } = {}) {
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(([, code]) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`);
  const servers = [...new Set([api, 'http://localhost:8787'])].flatMap((origin) => [origin, origin.replace(/^http/, 'ws')]);
  return [
    "default-src 'self'",
    ...(desktop ? [
      `script-src 'self' blob: ${inline.join(' ')}`,
      "connect-src 'self' ws:",
    ] : [
      `script-src 'self' blob: ${TURNSTILE} ${inline.join(' ')}`,
      `connect-src 'self' ${servers.join(' ')} ${TURNSTILE} https://raw.githubusercontent.com`,
      `frame-src ${TURNSTILE}`,
    ]),
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

// The open-source packages a build holds, for About's Licenses: each package any of the build's modules came from
// (moduleIds), plus extra (the desktop app's main process, which isn't bundled), with its version, license, page and
// license text, by name.
export function licenseNotices(moduleIds, extra = []) {
  const dirs = new Set();
  for (const id of moduleIds) {
    const match = id.replaceAll('\\', '/').match(/^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//);
    if (match) dirs.add(match[1].replace(/^\0/, ''));
  }
  for (const name of extra) dirs.add(fileURLToPath(new URL(`./node_modules/${name}`, import.meta.url)));
  return [...dirs].filter((dir) => existsSync(join(dir, 'package.json'))).map((dir) => { // not node_modules/.vite, say
    const { name, version, license, homepage, repository } = JSON.parse(readFileSync(join(dir, 'package.json')));
    const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)/i.test(f));
    const repo = (typeof repository === 'string' ? repository : repository?.url)?.replace(/^(git\+|github:)/, '').replace(/^git:/, 'https:').replace(/\.git$/, '');
    const page = homepage || (repo && (/^[\w.-]+\/[\w.-]+$/.test(repo) ? `https://github.com/${repo}` : repo));
    return { name, version, license, url: page || `https://www.npmjs.com/package/${name}`, text: file ? readFileSync(join(dir, file), 'utf8').trim() : '' };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

// The development server's modules, for licenseNotices: what its prebundled dependencies were made from (their source
// maps say) and what it served as it is.
export function devModuleIds(depsDir, servedIds = []) {
  const maps = existsSync(depsDir) ? readdirSync(depsDir).filter((f) => f.endsWith('.js.map')) : [];
  return [
    ...maps.flatMap((f) => (JSON.parse(readFileSync(join(depsDir, f), 'utf8')).sources ?? []).map((source) => resolve(depsDir, source))),
    ...servedIds,
  ];
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const build = buildInfo({ desktop: env.VITE_DESKTOP === '1' });

  return {
    base: '/',
    plugins: [
      vue(),
      VueI18nPlugin({
        include: [fileURLToPath(new URL('./src/i18n/locales/**', import.meta.url))],
        runtimeOnly: true,
        strictMessage: false,
      }),
      {
        name: 'phosphor-build',
        transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'phosphor-build', content: `v${build.version} ${build.sha}` }, injectTo: 'head' }],
      },
      {
        name: 'phosphor-csp',
        apply: 'build',
        transformIndexHtml: {
          order: 'post',
          handler: (html) => [{
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy(html, env.VITE_SOCIAL_API || 'https://api.phosphor.work', { desktop: env.VITE_DESKTOP === '1' }) },
            injectTo: 'head-prepend',
          }],
        },
      },
      {
        // licenses.json beside the page, which About lists: written with a build, answered by the development server.
        name: 'phosphor-licenses',
        configureServer(server) {
          server.middlewares.use('/licenses.json', (req, res) => {
            const graph = server.environments?.client?.moduleGraph ?? server.moduleGraph;
            const ids = devModuleIds(join(server.config.cacheDir, 'deps'), graph.idToModuleMap.keys());
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(licenseNotices(ids)));
          });
        },
        generateBundle() {
          // Every module the build read, so a package that only re-exports another's (vue) is credited too.
          const notices = licenseNotices([...this.getModuleIds()], env.VITE_DESKTOP === '1' ? ['ws'] : []);
          this.emitFile({ type: 'asset', fileName: 'licenses.json', source: JSON.stringify(notices) });
        },
      },
      {
        // The marketplace's /plugins.json, which the deploy writes: the development server answers with the test fixture's
        // list (its plugins' files come from raw GitHub as they would). Nothing of it goes into a build.
        name: 'phosphor-plugin-list',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use('/plugins.json', (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(readFileSync(new URL('./tests/fixtures/plugin-list.json', import.meta.url)));
          });
        },
      },
    ],
    define: {
      __BUILD__: JSON.stringify(build),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      allowedHosts: env.ALLOWED_HOSTS ? env.ALLOWED_HOSTS.split(',') : [],
    },
  };
});

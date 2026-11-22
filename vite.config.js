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

// The built page's Content-Security-Policy: the web build sends it as a header (the _headers file, see securityHeaders;
// header: true adds frame-ancestors, which a <meta> can't carry) and the desktop build as a <meta>. Scripts only from here,
// Turnstile, and the page's own inline ones by hash; connections only to the SOCIAL server (both the one built in
// and the local one, as config.js picks by hostname), Turnstile, and raw GitHub files (the plugin marketplace). Styles stay open to inline ones: the icons are
// SVG markup with style attributes. Not in development, where Vite's own client needs more.
// The desktop build (VITE_DESKTOP=1) has no SOCIAL server and no Turnstile: it connects only to rooms' sockets (ws:),
// and its marketplace fetches are the main process's (desktop/pluginList.js).
const TURNSTILE = 'https://challenges.cloudflare.com';
export function contentSecurityPolicy(html, api, { desktop = false, header = false } = {}) {
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
    ...(header ? ["frame-ancestors 'none'"] : []),
  ].join('; ');
}

// Cloudflare Pages' _headers file for the web build: the policy and a few more security headers, on every path.
export function securityHeaders(policy) {
  return `/*\n  Content-Security-Policy: ${policy}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n`;
}

// The headers of a _headers file's /* block, as the build writes it (securityHeaders): name and value pairs. The preview
// server sends them, since vite preview doesn't read the file, so a page under test gets the policy it will have.
export function previewHeaders(text) {
  return text.split('\n').filter((line) => /^ {2}[\w-]+: /.test(line)).map((line) => line.trim().split(/: (.*)/s).slice(0, 2));
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

// A build's modules, for licenseNotices: those whose code is in the bundle's chunks, and those of the app's own
// dependencies it read (vue's entry only re-exports @vue/*, so no chunk holds it). Not every module the build read: Pinia
// and vue-router import Vue's devtools behind a development check, so their code is shaken out of a build.
export function shippedModuleIds(bundle, readIds, dependencies) {
  const rendered = Object.values(bundle).flatMap((chunk) => (chunk.type === 'chunk' ? Object.entries(chunk.modules) : []))
    .filter(([, { renderedLength }]) => renderedLength > 0).map(([id]) => id);
  // The package after the last node_modules/: vue-i18n's own copy of the devtools sits under vue-i18n/node_modules/.
  const direct = readIds.filter((id) => dependencies.includes(id.replaceAll('\\', '/').match(/.*\/node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1]));
  return [...rendered, ...direct];
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

// The development server's stand-in for raw GitHub, for the fixture list it answers /plugins.json with: that list's
// commit and kim/phosphor-fog aren't on GitHub, so its files are served from here, at
// /dev-raw/<repo>/<commit>/<path>/<file> (src/plugins/market.js asks there when VITE_DEV_RAW is set). A path the list
// names gives the file's path in this checkout; any other, null.
const DEV_RAW_FOLDERS = { 'jejacks0n/phosphor': '.', 'kim/phosphor-fog': 'tests/fixtures/plugins/fog' };
export function devRawFile(url) {
  const { plugins } = JSON.parse(readFileSync(new URL('./tests/fixtures/plugin-list.json', import.meta.url), 'utf8'));
  for (const { repo, path, commit, manifest } of plugins) {
    for (const file of ['phosphor-plugin.json', manifest.script].filter(Boolean)) {
      const at = [path, file].filter(Boolean).join('/');
      if (url === `/${repo}/${commit}/${at}`) return fileURLToPath(new URL(`./${DEV_RAW_FOLDERS[repo]}/${at}`, import.meta.url));
    }
  }
  return null;
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
        // The web build's policy goes in _headers, made from the page as emitted so its script hashes match; the
        // desktop build, which has no host to send headers, keeps a <meta>.
        name: 'phosphor-csp',
        apply: 'build',
        enforce: 'post',
        transformIndexHtml: {
          order: 'post',
          handler: (html) => env.VITE_DESKTOP === '1' ? [{
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy(html, env.VITE_SOCIAL_API || 'https://api.phosphor.work', { desktop: true }) },
            injectTo: 'head-prepend',
          }] : undefined,
        },
        generateBundle(options, bundle) {
          if (env.VITE_DESKTOP === '1') return;
          const policy = contentSecurityPolicy(String(bundle['index.html'].source), env.VITE_SOCIAL_API || 'https://api.phosphor.work', { header: true });
          this.emitFile({ type: 'asset', fileName: '_headers', source: securityHeaders(policy) });
        },
      },
      {
        // vite preview serves dist/ without its _headers file, so the end-to-end tests would run with no policy.
        name: 'phosphor-preview-headers',
        configurePreviewServer(server) {
          const file = resolve(server.config.root, server.config.build.outDir, '_headers');
          if (!existsSync(file)) return;
          const headers = previewHeaders(readFileSync(file, 'utf8'));
          server.middlewares.use((req, res, next) => {
            headers.forEach(([name, value]) => res.setHeader(name, value));
            next();
          });
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
        generateBundle(_, bundle) {
          const { dependencies } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
          const ids = shippedModuleIds(bundle, [...this.getModuleIds()], Object.keys(dependencies));
          const notices = licenseNotices(ids, env.VITE_DESKTOP === '1' ? ['ws'] : []);
          this.emitFile({ type: 'asset', fileName: 'licenses.json', source: JSON.stringify(notices) });
        },
      },
      {
        // The marketplace's /plugins.json, which the deploy writes: the development server answers with the test fixture's
        // list, and its plugins' files at /dev-raw/ (devRawFile), where the page asks for them with VITE_DEV_RAW, which
        // only this sets. Nothing of it goes into a build, and the tests' own config doesn't load this one.
        name: 'phosphor-plugin-list',
        apply: 'serve',
        config: () => ({ define: { 'import.meta.env.VITE_DEV_RAW': JSON.stringify('1') } }),
        configureServer(server) {
          server.middlewares.use('/plugins.json', (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(readFileSync(new URL('./tests/fixtures/plugin-list.json', import.meta.url)));
          });
          server.middlewares.use('/dev-raw', (req, res) => {
            const file = devRawFile(req.url);
            res.statusCode = file ? 200 : 404;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(file ? readFileSync(file) : 'Not found');
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

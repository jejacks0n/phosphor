import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// What a build is, baked into it (__BUILD__ in the app; a <meta name="phosphor-build"> in index.html):
// the version, package.json's major.minor with the day it was built (UTC) as the third number
// (0.1.20261024), and the commit it was built from (GitHub Actions' GITHUB_SHA when deploying;
// "-dirty" when built from uncommitted changes), which tells two builds on one day apart.
export function buildInfo() {
  const git = (cmd) => {
    try {
      return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return '';
    }
  };
  const sha = (process.env.GITHUB_SHA || git('git rev-parse HEAD')).slice(0, 7) || 'unknown';
  const dirty = !process.env.GITHUB_SHA && git('git status --porcelain') ? '-dirty' : '';
  const [major, minor] = JSON.parse(readFileSync(new URL('./package.json', import.meta.url))).version.split('.');
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return { version: `${major}.${minor}.${day}`, sha: sha + dirty };
}

// The built page's Content-Security-Policy, as a <meta> (GitHub Pages can't send headers): scripts only from here,
// Turnstile, and the page's own inline ones by hash; connections only to the SOCIAL server (both the one built in
// and the local one, as config.js picks by hostname) and Turnstile. Styles stay open to inline ones: the icons are
// SVG markup with style attributes. Not in development, where Vite's own client needs more.
const TURNSTILE = 'https://challenges.cloudflare.com';
export function contentSecurityPolicy(html, api) {
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(([, code]) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`);
  const servers = [...new Set([api, 'http://localhost:8787'])].flatMap((origin) => [origin, origin.replace(/^http/, 'ws')]);
  return [
    "default-src 'self'",
    `script-src 'self' ${TURNSTILE} ${inline.join(' ')}`,
    `connect-src 'self' ${servers.join(' ')} ${TURNSTILE}`,
    `frame-src ${TURNSTILE}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const build = buildInfo();

  return {
    base: '/',
    plugins: [
      vue(),
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
            attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy(html, env.VITE_SOCIAL_API || 'https://api.phosphor.work') },
            injectTo: 'head-prepend',
          }],
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

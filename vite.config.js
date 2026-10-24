import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

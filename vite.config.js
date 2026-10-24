import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// What a build is, baked into it (__BUILD__ in the app; a <meta name="phosphor-build"> in index.html):
// the package version, the commit it was built from (GitHub Actions' GITHUB_SHA when deploying;
// "-dirty" when built from uncommitted changes) and the day it was built (UTC).
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
  const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
  return { version, sha: sha + dirty, date: new Date().toISOString().slice(0, 10) };
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
        transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'phosphor-build', content: `v${build.version} ${build.sha} ${build.date}` }, injectTo: 'head' }],
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

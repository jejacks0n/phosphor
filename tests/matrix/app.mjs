// Opens Phosphor for a script: a dev server on its own port (5197), a page with the app booted, and `inPage`, which runs
// a function in the page with the app's own stores and modules (imported from the dev server, so the same instances
// the app uses). Close with `close()`.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PORT = 5197;

async function waitForServer(url, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`no server at ${url}`);
}

export async function openApp({ headless = true } = {}) {
  const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
  const url = `http://localhost:${PORT}/`;
  await waitForServer(url);
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#phosphor')?.__vue_app__);
  // window.__app: the stores, for every inPage call.
  await page.evaluate(() => {
    const pinia = document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia;
    window.__app = { project: pinia._s.get('project'), workspace: pinia._s.get('workspace'), pinia };
  });
  const close = async () => {
    await browser.close();
    try { process.kill(-server.pid); } catch { /* already gone */ }
  };
  const inPage = (fn, arg) => page.evaluate(fn, arg);
  return { page, inPage, close, url };
}

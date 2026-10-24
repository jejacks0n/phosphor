// Saves a project with the live site's code (the main branch, what GitHub Pages serves), so tests
// load what real users have on disk: builds main in a temporary worktree, serves it, draws a little
// through its store (paint, typed characters, a flipped cell) and saves. Run once; the result
// (projects/live-main.phosphor) is committed. Run: node tests/fixtures/capture-main.mjs
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const out = fileURLToPath(new URL('projects/live-main.phosphor', import.meta.url));
const dir = join(mkdtempSync(join(tmpdir(), 'phosphor-main-')), 'main');
const run = (cmd, cwd = dir) => execSync(cmd, { cwd, stdio: 'inherit' });

run(`git worktree add --detach ${dir} main`, repo);
let server;
try {
  run('npm ci --no-audit --no-fund');
  run('npm run build');
  server = spawn('npx', ['vite', 'preview', '--port', '4199', '--strictPort'], { cwd: dir, stdio: 'ignore' });
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const browser = await chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true });
  await page.addInitScript(() => { delete window.showSaveFilePicker; }); // save as a download
  await page.goto('http://localhost:4199/');
  await page.waitForFunction(() => document.querySelector('#phosphor')?.__vue_app__);
  const image = readFileSync(new URL('images/gradient.png', import.meta.url)).toString('base64');
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const pinia = document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia;
    const project = pinia._s.get('project');
    await project.setImageFromFile(new File([bytes], 'gradient.png', { type: 'image/png' }));
    project.aspectLock = false;
    project.cols = 24;
    project.rows = 24;
    project.seed = 'live-main';
    await new Promise((r) => setTimeout(r, 800));
    project.paintStroke(Array.from({ length: 12 }, (_, k) => ({ x: 4 + k, y: 10, alpha: 1 })));
    project.commitEdit();
    for (const [col, char] of [[2, 'P'], [3, 'h'], [4, '╬'], [5, '█']]) project.setCharEdit(col, 3, char);
    project.flipAnsiColors(8, 8);
    project.commitEdit?.();
    await new Promise((r) => setTimeout(r, 500));
  }, image);
  const download = page.waitForEvent('download');
  await page.evaluate(() => document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia._s.get('project').saveProject());
  copyFileSync(await (await download).path(), out);
  await browser.close();
  console.log(`saved ${out}`);
} finally {
  server?.kill();
  run(`git worktree remove --force ${dir}`, repo);
  rmSync(join(dir, '..'), { recursive: true, force: true });
}

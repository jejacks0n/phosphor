import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8');
const deploy = read('deploy.yml');
const refresh = read('plugin-list.yml');
const desktop = read('desktop.yml');

// The text of one top-level job (from its "  name:" line to the next job).
const job = (text, name) => {
  const start = text.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name}`).toBeGreaterThan(-1);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[\w-]+:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
};

describe('publishing the plugin list', () => {
  it('the deploy writes dist/plugins.json after the build and before the upload, with the token', () => {
    const build = job(deploy, 'build');
    const run = build.indexOf('npm run build');
    const list = build.indexOf('node scripts/plugin-list.mjs --out dist/plugins.json --commit ${{ github.sha }}');
    const upload = build.indexOf('upload-pages-artifact');
    expect(run).toBeGreaterThan(-1);
    expect(list).toBeGreaterThan(run);
    expect(upload).toBeGreaterThan(list);
    expect(build.slice(list, upload)).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(build).not.toContain('--refresh');
  });

  it('the refresh runs on wiki edits, daily and by hand, and shares the deploy concurrency group', () => {
    const on = refresh.slice(refresh.indexOf('\non:'), refresh.indexOf('\npermissions:'));
    expect(on).toMatch(/\n {2}gollum:/);
    expect(on).toMatch(/\n {2}schedule:\n\s+- cron: '\d+ \d+ \* \* \*'/);
    expect(on).toMatch(/\n {2}workflow_dispatch:/);
    expect(refresh).toMatch(/concurrency:\n {2}group: pages( #.*)?\n {2}cancel-in-progress: false/);
  });

  it('the refresh builds the last deployed commit and runs the script with --refresh on that commit', () => {
    const build = job(refresh, 'build');
    expect(build).toContain('environment=github-pages');
    expect(build).toContain('ref: ${{ steps.last.outputs.sha }}');
    expect(build).toContain('npm ci');
    expect(build).toContain('VITE_TURNSTILE_SITE_KEY: ${{ secrets.TURNSTILE_SITE_KEY }}');
    expect(build).toContain('node scripts/plugin-list.mjs --out dist/plugins.json --commit "$SHA" --refresh');
    expect(build).toContain('SHA: ${{ steps.last.outputs.sha }}');
    expect(build).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(build.indexOf('npm run build')).toBeLessThan(build.indexOf('plugin-list.mjs'));
    expect(build.indexOf('plugin-list.mjs')).toBeLessThan(build.indexOf('upload-pages-artifact'));
    expect(refresh).not.toMatch(/npm run (test|lint)/);
  });

  it('the refresh holds pages and id-token write only on its deploy job', () => {
    const top = refresh.slice(refresh.indexOf('\npermissions:'), refresh.indexOf('\njobs:'));
    expect(top).toContain('contents: read');
    expect(top).not.toMatch(/pages: write|id-token: write/);
    const build = job(refresh, 'build');
    expect(build).not.toMatch(/pages: write|id-token: write/);
    const dep = job(refresh, 'deploy');
    expect(dep).toContain('pages: write');
    expect(dep).toContain('id-token: write');
    expect(dep).toContain('actions/deploy-pages@v4');
  });

  it('the desktop workflow never runs the script', () => {
    expect(desktop).not.toContain('plugin-list');
    expect(desktop).not.toContain('plugins.json');
  });
});

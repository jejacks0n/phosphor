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

  it('the refresh runs on wiki edits, daily and by hand, in its own concurrency group (never cancelling a pending deploy)', () => {
    const on = refresh.slice(refresh.indexOf('\non:'), refresh.indexOf('\npermissions:'));
    expect(on).toMatch(/\n {2}gollum:/);
    expect(on).toMatch(/\n {2}schedule:\n\s+- cron: '\d+ \d+ \* \* \*'/);
    expect(on).toMatch(/\n {2}workflow_dispatch:/);
    expect(refresh).toMatch(/concurrency:\n {2}group: plugin-list( #.*)?\n {2}cancel-in-progress: false/);
    expect(refresh).not.toMatch(/group: pages/);
  });

  // A pull request's run of deploy.yml ends in success without deploying, and one from a fork's main has the head branch
  // main: only this repository's runs that weren't pull requests (pushes and runs by hand) count as deployed.
  const OURS = `OURS: '[.workflow_runs[] | select(.event != "pull_request" and .head_repository.full_name == $repo)]'`;
  const RUNS = 'gh api "repos/$GITHUB_REPOSITORY/actions/workflows/deploy.yml/runs?branch=main';
  const LAST = 'jq -r --arg repo "$GITHUB_REPOSITORY" "$OURS | .[0].head_sha // empty"';

  it('the last deployed commit is this repository\'s last successful deploy.yml run on main that was no pull request', () => {
    expect(refresh).toContain(OURS);
    const build = job(refresh, 'build');
    expect(build).toContain(`runs=$(${RUNS}&status=success&per_page=50")`);
    expect(build).toContain(`sha=$(${LAST} <<<"$runs")`);
    expect(build).not.toContain('gh run list');
    expect(build).toMatch(/outputs:\n\s+sha: \$\{\{ steps\.last\.outputs\.sha \}\}/);
  });

  it('the refresh publishes only when no deploy is on its way and the last deploy is still the commit it built', () => {
    const dep = job(refresh, 'deploy');
    expect(dep).toContain('actions: read');
    expect(dep).toContain('GH_TOKEN: ${{ github.token }}');
    expect(dep).toContain('SHA: ${{ needs.build.outputs.sha }}');
    const check = dep.indexOf('id: check');
    const publish = dep.indexOf('actions/deploy-pages@v4');
    expect(check).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(check);
    const checking = dep.slice(check, publish);
    expect(checking).toContain(`${RUNS}&per_page=50")`); // every status, to see a queued or running one
    expect(checking).toContain('jq --arg repo "$GITHUB_REPOSITORY" "$OURS | map(select(.status != \\"completed\\")) | length"');
    expect(checking).toContain(`${RUNS}&status=success&per_page=50")`);
    expect(checking).toContain(`last=$(${LAST} <<<"$deployed")`);
    expect(checking).toContain('[ "$last" != "$SHA" ]');
    expect(checking).toContain('::notice::');
    expect(checking).toContain('echo "publish=true" >> "$GITHUB_OUTPUT"');
    expect(dep.slice(0, publish)).toContain('ponytail:'); // the race left between the check and the publish
    expect(dep.slice(publish - 200, publish)).toContain("if: steps.check.outputs.publish == 'true'");
  });

  it('the refresh builds the last deployed commit and runs the script with --refresh on that commit', () => {
    const build = job(refresh, 'build');
    expect(build).toContain('actions/workflows/deploy.yml/runs?branch=main&status=success');
    expect(build).toContain('head_sha');
    expect(build).not.toContain('deployments');
    expect(build).toContain('::error::');
    expect(build).toContain('env -u GITHUB_SHA npm run build'); // the build names the checked-out commit, not main's head
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
    expect(top).toContain('actions: read');
    expect(top).not.toContain('deployments');
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

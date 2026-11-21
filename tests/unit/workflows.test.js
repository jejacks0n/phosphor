import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

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
  it('the deploy writes dist/plugins.json after the build and before the deploy, with the token', () => {
    const build = job(deploy, 'build');
    const run = build.indexOf('npm run build');
    const list = build.indexOf('node scripts/plugin-list.mjs --out dist/plugins.json --commit ${{ github.sha }}');
    const next = build.indexOf('node scripts/plugin-list.mjs --out dist/plugins.json --commit ${{ github.event.pull_request.head.sha }} --previous https://next.phosphor.work/plugins.json');
    const publish = build.indexOf('cloudflare/wrangler-action@v3');
    expect(run).toBeGreaterThan(-1);
    expect(list).toBeGreaterThan(run);
    expect(next).toBeGreaterThan(run);
    expect(publish).toBeGreaterThan(list);
    expect(publish).toBeGreaterThan(next);
    expect(build.slice(list, publish).match(/GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/g)).toHaveLength(2);
    expect(build.slice(list, next)).not.toContain('--previous'); // production keeps the script's default list
    expect(build).not.toContain('--refresh');
  });

  it('the refresh runs on wiki edits, daily and by hand, in its own concurrency group (never canceling a pending deploy)', () => {
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
    const publish = dep.indexOf('cloudflare/wrangler-action@v3');
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
    expect(build.indexOf('plugin-list.mjs')).toBeLessThan(build.indexOf('actions/upload-artifact@v4'));
    expect(refresh).not.toMatch(/npm run (test|lint)/);
  });

  it('the refresh deploys to Cloudflare Pages on main with the built site, and holds no Pages permissions', () => {
    expect(refresh).not.toMatch(/pages: write|id-token: write|github-pages|deploy-pages|upload-pages-artifact/);
    const top = refresh.slice(refresh.indexOf('\npermissions:'), refresh.indexOf('\njobs:'));
    expect(top).toContain('contents: read');
    expect(top).toContain('actions: read');
    const dep = job(refresh, 'deploy');
    expect(dep).toContain('actions/download-artifact@v4');
    expect(dep).toContain('cloudflare/wrangler-action@v3');
    expect(dep).toContain('apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(dep).toContain('accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}');
    expect(dep).toContain('pages deploy dist --project-name=phosphor --branch=main --commit-hash=${{ needs.build.outputs.sha }}');
  });

  it('the desktop workflow never runs the script', () => {
    expect(desktop).not.toContain('plugin-list');
    expect(desktop).not.toContain('plugins.json');
  });
});

describe('hosting on Cloudflare Pages', () => {
  it('has no GitHub Pages in its workflows, and no CNAME', () => {
    for (const text of [deploy, refresh]) expect(text).not.toMatch(/upload-pages-artifact|deploy-pages|pages: write|id-token: write|github-pages|GitHub Pages/);
    expect(existsSync(new URL('../../public/CNAME', import.meta.url))).toBe(false);
  });

  it('runs on pull requests as they open, change, reopen and are labeled', () => {
    expect(deploy).toMatch(/\n {2}pull_request:\n {4}types: \[opened, synchronize, reopened, labeled\]/);
  });

  it('builds for production on a push or a run by hand, and for next only on a label from this repository\'s own pull request', () => {
    const build = job(deploy, 'build');
    expect(build).toContain("if: (github.event_name != 'pull_request' && github.ref == 'refs/heads/main') || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository && contains(github.event.pull_request.labels.*.name, 'next'))");
    expect(build).toMatch(/needs: \[test, browser, e2e, desktop-e2e\]/);
    expect(build).toContain('ref: ${{ github.event.pull_request.head.sha || github.sha }}');
    expect(build).toContain('env -u GITHUB_SHA npm run build'); // the build id names the head commit, not a pull request's merge commit
    expect(build).toContain('VITE_TURNSTILE_SITE_KEY: ${{ secrets.TURNSTILE_SITE_KEY }}');
    expect(build).toContain("The TURNSTILE_SITE_KEY secret isn't set");
  });

  it('publishes with wrangler: main for production, next for a pull request, the commit it built', () => {
    const build = job(deploy, 'build');
    expect(build).toContain('cloudflare/wrangler-action@v3');
    expect(build).toContain('apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(build).toContain('accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}');
    expect(build).toContain("pages deploy dist --project-name=phosphor --branch=${{ github.event_name == 'pull_request' && 'next' || 'main' }} --commit-hash=${{ github.event.pull_request.head.sha || github.sha }}");
  });

  it('keeps production (main) alone in the pages group without canceling, a run by hand on another branch in a group of its own, and next in its own that the last label wins', () => {
    expect(deploy).toMatch(/\nconcurrency:\n {2}group: \$\{\{ github\.event_name == 'pull_request' && format\('test-\{0\}', github\.ref\) \|\| github\.ref == 'refs\/heads\/main' && 'pages' \|\| format\('branch-\{0\}', github\.ref\) \}\}\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
    const build = job(deploy, 'build');
    expect(build).toMatch(/concurrency:\n {6}group: \$\{\{ github\.event_name == 'pull_request' && 'next' \|\| github\.run_id \}\}\n {6}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  });

  it('holds no job permissions beyond reading the repository', () => {
    expect(deploy).not.toMatch(/pages: write|id-token: write/);
    expect(deploy).toMatch(/\npermissions:\n {2}contents: read\n/);
  });

  it('checks out the pull request\'s head in every test job, so what is tested is what reaches next', () => {
    for (const name of ['test', 'browser', 'e2e', 'desktop-e2e']) {
      expect(job(deploy, name), name).toMatch(/- uses: actions\/checkout@v4\n\s+with:\n\s+ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { outputs, SECRETS } from '../../scripts/release-tag.mjs';

const read = (name) => readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8');
const deploy = read('deploy.yml');
const refresh = read('plugin-list.yml');
const desktop = read('desktop.yml');

// The text of one top-level job (from its "  name:" line to the next job or the comment above it).
const job = (text, name) => {
  const start = text.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name}`).toBeGreaterThan(-1);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}([\w-]+:\n|# )/); // the next job, or the comment above it
  return next < 0 ? rest : rest.slice(0, next + 1);
};

describe('publishing the plugin list', () => {
  it('the deploy to next writes dist/plugins.json after the build and before the deploy, with the token, from next\'s own list', () => {
    const build = job(deploy, 'build');
    const run = build.indexOf('npm run build');
    const list = build.indexOf('node scripts/plugin-list.mjs --out dist/plugins.json --commit ${{ github.sha }} --previous https://next.phosphor.work/plugins.json');
    const publish = build.indexOf('cloudflare/wrangler-action@v3');
    expect(run).toBeGreaterThan(-1);
    expect(list).toBeGreaterThan(run);
    expect(publish).toBeGreaterThan(list);
    expect(build.slice(list, publish)).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(build.match(/plugin-list\.mjs/g)).toHaveLength(1);
    expect(build).not.toContain('--refresh');
  });

  it('the release writes production\'s dist/plugins.json after the web build and before the deploy, from the default list', () => {
    const site = job(desktop, 'site');
    const run = site.indexOf('npm run build');
    const list = site.indexOf('node scripts/plugin-list.mjs --out dist/plugins.json --commit ${{ github.sha }}\n');
    const publish = site.indexOf('cloudflare/wrangler-action@v3');
    expect(run).toBeGreaterThan(-1);
    expect(list).toBeGreaterThan(run);
    expect(publish).toBeGreaterThan(list);
    expect(site.slice(list, publish)).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(site).not.toContain('--previous'); // production keeps the script's default list
    expect(site).not.toContain('--refresh');
  });

  it('the refresh runs on wiki edits, daily and by hand, in its own concurrency group (never canceling a pending deploy)', () => {
    const on = refresh.slice(refresh.indexOf('\non:'), refresh.indexOf('\npermissions:'));
    expect(on).toMatch(/\n {2}gollum:/);
    expect(on).toMatch(/\n {2}schedule:\n\s+- cron: '\d+ \d+ \* \* \*'/);
    expect(on).toMatch(/\n {2}workflow_dispatch:/);
    expect(refresh).toMatch(/concurrency:\n {2}group: plugin-list( #.*)?\n {2}cancel-in-progress: false/);
    expect(refresh).not.toMatch(/group: pages/);
  });

  // Production is published by desktop.yml's runs for a release or beta tag pushed to this repository, never an alpha's
  // (whose site job is skipped) and never deploy.yml's (which publishes next).
  const TAGS = '^v[0-9]+\\\\.[0-9]+\\\\.[0-9]+(-beta(\\\\.[0-9]+)?)?$';
  const OURS = `OURS: '[.workflow_runs[] | select(.event == "push" and .head_repository.full_name == $repo and (.head_branch | test("${TAGS}")))]'`;

  it('the tags whose runs publish production are releases and betas, as the release workflow\'s tag check says', () => {
    const tags = new RegExp(TAGS.replaceAll('\\\\', '\\')); // as jq reads the string
    for (const tag of ['v1.0.0', 'v1.0.0-beta', 'v1.0.0-beta.2', 'v1.0.0-alpha', 'v1.0.0-alpha.2']) expect(tags.test(tag), tag).toBe(outputs(tag).prod);
    expect(tags.test('v1.0.0-rc.1')).toBe(false);
  });

  const RUNS = 'gh api "repos/$GITHUB_REPOSITORY/actions/workflows/desktop.yml/runs?event=push';
  const LAST = 'jq -r --arg repo "$GITHUB_REPOSITORY" "$OURS | .[0].head_sha // empty"';

  it('the last released commit is this repository\'s last successful desktop.yml run for a release tag', () => {
    expect(refresh).toContain(OURS);
    expect(refresh).not.toContain('deploy.yml/runs');
    const last = job(refresh, 'last');
    expect(last).toContain(`runs=$(${RUNS}&status=success&per_page=50")`);
    expect(last).toContain(`sha=$(${LAST} <<<"$runs")`);
    expect(last).not.toContain('gh run list');
    expect(last).toMatch(/outputs:\n\s+sha: \$\{\{ steps\.last\.outputs\.sha \}\}/);
  });

  it('before the first release the refresh says so and builds and publishes nothing, rather than failing', () => {
    const last = job(refresh, 'last');
    expect(last).toContain('::notice::No release has published phosphor.work yet');
    expect(last).not.toContain('exit 1');
    expect(job(refresh, 'build')).toContain("needs: last\n    if: needs.last.outputs.sha != ''");
    expect(job(refresh, 'deploy')).toContain('needs: [last, build]');
  });

  // The release's site job is what the refresh counts as published, so it must be the run's last job, after the builds.
  it('the release run publishes phosphor.work last, so its success means it published', () => {
    const site = job(desktop, 'site');
    expect(site).toContain('needs: [version, package]');
    const jobs = [...desktop.slice(desktop.indexOf('\njobs:')).matchAll(/\n {2}([\w-]+):\n {4}/g)].map((m) => m[1]);
    expect(jobs).toEqual(['version', 'library', 'package', 'site']); // site needs every other job, library through package
    expect(job(desktop, 'package')).toContain('needs: [version, library]');
    // The one run that ends without publishing, the library job's restart, cancels itself (the test below).
  });

  it('the refresh publishes only when no release is on its way and the last release is still the commit it built', () => {
    const dep = job(refresh, 'deploy');
    expect(dep).toContain('actions: read');
    expect(dep).toContain('GH_TOKEN: ${{ github.token }}');
    expect(dep).toContain('SHA: ${{ needs.last.outputs.sha }}');
    const check = dep.indexOf('id: check');
    const publish = dep.indexOf('cloudflare/wrangler-action@v3');
    expect(check).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(check);
    const checking = dep.slice(check, publish);
    expect(checking).toContain(`${RUNS}&per_page=50")`); // every status, to see a queued or running one
    expect(checking).toContain('jq --arg repo "$GITHUB_REPOSITORY" "$OURS | map(select(.status != \\"completed\\")) | length"');
    expect(checking).toContain(`${RUNS}&status=success&per_page=50")`);
    expect(checking).toContain(`last=$(${LAST} <<<"$released")`);
    expect(checking).toContain('[ "$last" != "$SHA" ]');
    expect(checking).toContain('::notice::');
    expect(checking).toContain('echo "publish=true" >> "$GITHUB_OUTPUT"');
    expect(dep.slice(0, publish)).toContain('ponytail:'); // the race left between the check and the publish
    expect(dep.slice(publish - 200, publish)).toContain("if: steps.check.outputs.publish == 'true'");
  });

  it('the refresh builds the last released commit and runs the script with --refresh on that commit', () => {
    const build = job(refresh, 'build');
    expect(job(refresh, 'last')).toContain('head_sha');
    expect(refresh).not.toContain('deployments');
    expect(build).toContain('::error::');
    expect(build).toContain('env -u GITHUB_SHA npm run build'); // the build names the checked-out commit, not main's head
    expect(build).toContain('ref: ${{ needs.last.outputs.sha }}');
    expect(build).toContain('npm ci');
    expect(build).toContain('VITE_TURNSTILE_SITE_KEY: ${{ secrets.TURNSTILE_SITE_KEY }}');
    expect(build).toContain('node scripts/plugin-list.mjs --out dist/plugins.json --commit "$SHA" --refresh');
    expect(build).toContain('SHA: ${{ needs.last.outputs.sha }}');
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
    expect(dep).toContain('pages deploy dist --project-name=phosphor --branch=main --commit-hash=${{ needs.last.outputs.sha }}');
  });

  it('the desktop builds never carry the list: only the release\'s site job runs the script', () => {
    for (const name of ['version', 'package']) {
      expect(job(desktop, name), name).not.toContain('plugin-list');
      expect(job(desktop, name), name).not.toContain('plugins.json');
    }
  });
});

describe('hosting on Cloudflare Pages', () => {
  it('has no GitHub Pages in its workflows, and no CNAME', () => {
    for (const text of [deploy, refresh, desktop]) expect(text).not.toMatch(/upload-pages-artifact|deploy-pages|pages: write|id-token: write|github-pages|GitHub Pages/);
    expect(existsSync(new URL('../../public/CNAME', import.meta.url))).toBe(false);
  });

  it('runs on pull requests as they open, change and reopen', () => {
    expect(deploy).toMatch(/\n {2}pull_request:\n {4}types: \[opened, synchronize, reopened\]\n/);
  });

  it('builds for next on a push to main or a run by hand on main, and never for a pull request', () => {
    const build = job(deploy, 'build');
    expect(build).toContain("if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'\n");
    expect(build).not.toContain('labels');
    expect(build).toMatch(/needs: \[test, browser, e2e, desktop-e2e\]/);
    expect(build).toContain('env -u GITHUB_SHA npm run build');
    expect(build).toContain('VITE_TURNSTILE_SITE_KEY: ${{ secrets.TURNSTILE_SITE_KEY }}');
    expect(build).toContain("The TURNSTILE_SITE_KEY secret isn't set");
  });

  it('publishes main to next with wrangler, the commit it built, and never to production', () => {
    const build = job(deploy, 'build');
    expect(build).toContain('cloudflare/wrangler-action@v3');
    expect(build).toContain('apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(build).toContain('accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}');
    expect(build).toContain('pages deploy dist --project-name=phosphor --branch=next --commit-hash=${{ github.sha }}');
    expect(deploy).not.toContain('--branch=main');
  });

  it('publishes production from a release or beta tag only: after the builds, not for an alpha, the tag\'s commit', () => {
    const site = job(desktop, 'site');
    expect(site).toContain("if: needs.version.outputs.prod == 'true'");
    expect(desktop).not.toContain("outputs.prerelease == 'false'");
    expect(site).toContain('VITE_TURNSTILE_SITE_KEY: ${{ secrets.TURNSTILE_SITE_KEY }}');
    expect(site).toContain("The TURNSTILE_SITE_KEY secret isn't set");
    expect(site).toContain('npm run build');
    expect(site).not.toContain('build:desktop');
    expect(site).toContain('apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(site).toContain('accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}');
    expect(site).toContain('pages deploy dist --project-name=phosphor --branch=main --commit-hash=${{ github.sha }}');
    expect(site).toMatch(/concurrency:\n {6}group: production\n {6}cancel-in-progress: false/);
  });

  it('releases only a commit main\'s tests passed on: this repository\'s successful deploy.yml run on main for it', () => {
    const version = job(desktop, 'version');
    expect(version).toContain('actions: read');
    expect(version).toContain('GH_TOKEN: ${{ github.token }}');
    expect(version).toContain('gh api "repos/$GITHUB_REPOSITORY/actions/workflows/deploy.yml/runs?branch=main&head_sha=$GITHUB_SHA"');
    expect(version).toContain(`select(.event != "pull_request" and .head_repository.full_name == $repo)`);
    expect(version).toContain('::error::$GITHUB_SHA has no successful deploy.yml run on main');
    // It waits for a run on its way: the library job's font commit starts one seconds before its moved tag starts this.
    // A success passes; none on its way (failed, or none made within 3 minutes) fails; at most 40 minutes.
    expect(version).toContain('map(select(.conclusion == "success")) | length');
    expect(version).toContain('map(select(.status != "completed")) | length');
    expect(version).toMatch(/for try in \$\(seq 1 80\)/);
    expect(version).toContain('sleep 30');
    expect(version).toContain('timeout-minutes: 45');
    for (const name of ['library', 'package', 'site']) expect(job(desktop, name), name).toMatch(/needs: (version|\[version, (library|package)\])\n/);
  });

  it('a run whose library job moved the tag cancels itself, so the refresh never takes it for a release that published', () => {
    const library = job(desktop, 'library');
    expect(library).toContain('actions: write');
    expect(library).toContain('gh run cancel "$GITHUB_RUN_ID"');
    expect(library.indexOf('git push -f origin "$GITHUB_REF_NAME"')).toBeLessThan(library.indexOf('gh run cancel'));
    expect(job(desktop, 'package')).toContain("if: needs.library.outputs.restarted != 'true'"); // before the cancel lands
    expect(refresh).toContain('desktop.yml/runs?event=push&status=success'); // a canceled run isn't one
  });

  it('keeps main\'s deploys to next in one group without canceling, a run by hand on another branch in a group of its own', () => {
    expect(deploy).toMatch(/\nconcurrency:\n {2}group: \$\{\{ github\.event_name == 'pull_request' && format\('test-\{0\}', github\.ref\) \|\| github\.ref == 'refs\/heads\/main' && 'next' \|\| format\('branch-\{0\}', github\.ref\) \}\}\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  });

  it('holds release write access only where the desktop builds publish to the GitHub Release', () => {
    expect(desktop).toMatch(/\npermissions:\n {2}contents: read\n/);
    expect(job(desktop, 'package')).toContain('contents: write');
    for (const name of ['version', 'site']) expect(job(desktop, name), name).not.toContain('contents: write');
  });

  it('holds no job permissions beyond reading the repository', () => {
    expect(deploy).not.toMatch(/pages: write|id-token: write/);
    expect(deploy).toMatch(/\npermissions:\n {2}contents: read\n/);
  });

  it('checks out the pull request\'s head in every test job, so what is tested is what was pushed', () => {
    for (const name of ['test', 'browser', 'e2e', 'desktop-e2e']) {
      expect(job(deploy, name), name).toMatch(/- uses: actions\/checkout@v4\n\s+with:\n\s+ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
    }
  });
});

// What a tag needs to be signed is scripts/release-tag.mjs's signing (desktop-release-tag.test.js); this is the
// workflow's side: the check told what's set, once and first, and what the builds do with it.
describe('signing the desktop app', () => {
  const NAMES = [...SECRETS.macOS, ...SECRETS.Windows];

  it('the tag check is told which signing secrets are set, by name and never by value, before the run waits or builds', () => {
    const version = job(desktop, 'version');
    const check = version.indexOf('run: node scripts/release-tag.mjs "$GITHUB_REF_NAME"\n');
    const wait = version.indexOf('for try in');
    expect(check).toBeGreaterThan(-1);
    expect(wait).toBeGreaterThan(check);
    const step = version.slice(check, wait);
    expect(step).toContain('SIGNING_SECRETS: >-\n');
    for (const name of NAMES) expect(step, name).toContain(`\${{ secrets.${name} != '' && '${name}' || '' }}\n`);
    expect(version).not.toMatch(/secrets\.\w+ \}\}/); // no secret's value reaches this job
  });

  it('the builds are handed each secret under the name the check knows it by, and check none themselves', () => {
    const pack = job(desktop, 'package');
    for (const name of NAMES) expect(pack, name).toContain(`      ${name}: \${{ secrets.${name} }}\n`);
    expect(pack).not.toContain("secrets aren't set");
    expect(pack).not.toContain('exit 1');
  });

  // An unset secret arrives as an empty CSC_LINK, which electron-builder takes for a certificate's path and fails on.
  it('macOS without its secrets, an alpha the check let by, is signed ad hoc with the empty CSC_LINK taken away', () => {
    const pack = job(desktop, 'package');
    expect(pack).toContain("      - if: runner.os != 'macOS' || env.CSC_LINK != ''\n        run: npx electron-builder --publish always\n");
    expect(pack).toContain("      - if: runner.os == 'macOS' && env.CSC_LINK == ''\n        run: env -u CSC_LINK npx electron-builder --publish always -c.mac.identity=-\n");
    expect(pack.match(/npx electron-builder/g)).toHaveLength(2);
  });

  it('each macOS app made is checked: its signature holds, and one signed with the secrets carries its notarization', () => {
    const pack = job(desktop, 'package');
    const check = pack.indexOf("      - if: runner.os == 'macOS'\n        run: |\n");
    expect(check).toBeGreaterThan(pack.lastIndexOf('npx electron-builder'));
    const step = pack.slice(check);
    expect(step).toContain('for app in release/mac*/Phosphor.app; do\n');
    expect(step).toContain('codesign --verify --deep --strict "$app"\n');
    expect(step).toContain('[ -z "$CSC_LINK" ] || xcrun stapler validate "$app"\n');
  });
});

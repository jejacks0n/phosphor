// Runs one CI shard of the end-to-end tests: `node tests/support/shard.mjs 2/6` (more arguments go to Playwright).
// Playwright's own --shard cuts the list into blocks, and the slow specs (the SOCIAL ones) sort together, so a few
// shards got most of the time. This takes every Nth test location of the whole list instead: each shard has a share
// of every spec.
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

const [current, total] = (process.argv[2] ?? '').split('/').map(Number);
if (!(total >= 1 && current >= 1 && current <= total)) throw new Error('Usage: node tests/support/shard.mjs <current>/<total>');

const report = JSON.parse(execFileSync('npx', ['playwright', 'test', '--list', '--reporter=json'], { encoding: 'utf8', maxBuffer: 64 << 20 }));
const locations = new Set(); // file:line, once each: tests made in a loop share a line, and a location runs all of them
const visit = (suite) => {
  for (const spec of suite.specs ?? []) locations.add(`${path.join('tests/e2e', spec.file)}:${spec.line}`);
  for (const child of suite.suites ?? []) visit(child);
};
report.suites.forEach(visit);

const mine = [...locations].filter((_, i) => i % total === current - 1);
const { status } = spawnSync('npx', ['playwright', 'test', ...mine, ...process.argv.slice(3)], { stdio: 'inherit' });
process.exit(status ?? 1);

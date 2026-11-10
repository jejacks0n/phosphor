// A QA session: one person's browser, kept open while an agent drops snippets into the run's inbox (with
// `npm run qa:send`) and reads what each did from its outbox. Start it with
// `QA_PERSONA=<name> [QA_SEED=<n>] npm run qa`, in the background; `npm run qa:send -- <name> --end`
// writes report.md and ends it.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import * as e2e from '../e2e/support.js';
import * as social from '../e2e/social-support.js';
import { drawTraits, runDirName, runSnippet } from './setup.js';
import { renderReport } from './report.js';
import { makeQa, newRun, qaContext, renderer } from './qa.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const runs = join(root, 'qa-runs');

// A whole number from the environment, or the fallback when it isn't set. Anything else is a mistake to
// stop on, never a silent 0.
function whole(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error(`${name} must be a whole number, not "${raw}"`);
  return Number(raw);
}

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim() || null;

// Written whole, so qa:send never reads half a file.
function writeWhole(path, text) {
  writeFileSync(`${path}.part`, text);
  renameSync(`${path}.part`, path);
}

// A run of the same seed on the same day gets a folder of its own.
function makeRunDir(persona, seed) {
  const base = join(runs, runDirName(new Date(), persona, seed));
  let dir = base;
  for (let n = 2; existsSync(dir); n++) dir = `${base}-${n}`;
  mkdirSync(join(dir, 'inbox'), { recursive: true });
  mkdirSync(join(dir, 'outbox'));
  return dir;
}

function asJson(result) {
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return JSON.stringify({ ...result, value: String(result.value) }, null, 2);
  }
}

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

test('a QA session', async ({ browser }) => {
  const seed = whole('QA_SEED', Math.floor(Math.random() * 2 ** 31));
  const traits = drawTraits(process.env.QA_PERSONA, seed);
  const snippetMs = whole('QA_SNIPPET_MS', 120_000);
  const idleMs = whole('QA_IDLE_MIN', 30) * 60_000;

  const runDir = makeRunDir(traits.persona, seed);
  writeFileSync(join(runs, `${traits.persona}.latest`), `${runDir}\n`);
  console.log(`QA run: ${runDir}`);

  const context = await qaContext(browser, traits);
  const run = newRun(traits);
  const qa = await makeQa({ context, runDir, run });
  const page = await context.newPage();
  await page.goto('/');

  run.commit = git('rev-parse', 'HEAD');
  run.scriptCommit = git('log', '-1', '--format=%H', '--', `docs/qa/personas/${traits.persona}.md`);
  run.machine = { os: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0].model, browser: browser.version(), renderer: await renderer(page) };
  qa.save();

  // Task 3 brings files and terminal.
  const namespaces = { e2e, social, files: null, terminal: null, expect };
  const inbox = join(runDir, 'inbox');
  const seen = new Set();
  let last = Date.now();
  let ended = false;
  while (!ended && Date.now() - last < idleMs) {
    const names = readdirSync(inbox).filter((name) => !name.startsWith('.') && !seen.has(name)).sort();
    for (const name of names) {
      seen.add(name);
      if (name === 'end') {
        ended = true;
        break;
      }
      const args = { page: qa.page, context, browser, qa, traits, ...namespaces };
      const result = await runSnippet(join(inbox, name), args, snippetMs);
      if (!result.ok) result.shot = await qa.shot(`failed ${name}`).catch(() => null);
      run.snippets.push({ file: name, ok: result.ok, ms: result.ms, error: result.error ?? null });
      qa.save();
      writeWhole(join(runDir, 'outbox', `${name}.json`), asJson(result));
      last = Date.now();
    }
    await pause(200);
  }

  qa.save();
  writeWhole(join(runDir, 'report.md'), renderReport(run));
  console.log(`QA report: ${join(runDir, 'report.md')}`);
  await context.close();
});

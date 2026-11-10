// What a QA run records as it goes: steps and their ratings, probes, timings, screenshots, memory and
// findings, written to the run's run.json after every call that records something.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedConsent } from '../e2e/support.js';
import { contextOptions, storageFor } from './setup.js';
import { BUDGETS, MARKS } from './score.js';
import { FINDING_KINDS, PROBES, SEVERITIES, slug } from './report.js';

// A run record with nothing recorded yet, in the shape renderReport reads.
export function newRun(traits) {
  const { persona, seed } = traits;
  return { persona, seed, traits, commit: null, scriptCommit: null, machine: {}, steps: [], findings: [], memory: [], snippets: [] };
}

// The drawn person's browser: their device, language and theme, and SOCIAL's first question answered. The
// language and theme are only set where the person hasn't chosen yet, so a choice they make survives a reload.
export async function qaContext(browser, traits) {
  const context = await browser.newContext(contextOptions(traits));
  await seedConsent(context);
  await context.addInitScript((storage) => {
    try {
      for (const [key, value] of Object.entries(storage)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    } catch { /* about:blank has no storage */ }
  }, storageFor(traits));
  return context;
}

// What WebGL says draws it, or null with no WebGL.
export function renderer(page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
  });
}

function oneOf(list, value, what) {
  if (!list.includes(value)) throw new Error(`${what} must be one of ${list.join(', ')}, not "${value}"`);
}

export async function makeQa({ context, runDir, run }) {
  mkdirSync(join(runDir, 'shots'), { recursive: true });
  let shots = 0;
  const open = () => run.steps.at(-1);
  const current = () => context.pages().at(-1);
  const save = () => writeFileSync(join(runDir, 'run.json'), JSON.stringify(run, null, 2));
  const record = (fn) => (...args) => {
    const value = fn(...args);
    save();
    return value;
  };

  // Keys and pointers the person's hardware would send (never ones a script dispatches), counted here in
  // Node so a reload or a new page doesn't lose them.
  await context.exposeBinding('__qaEvent', (source, kind) => {
    const events = open()?.events;
    if (events && kind === 'key') events.keys++;
    if (events && kind === 'pointer') events.pointers++;
  });
  await context.addInitScript(() => {
    addEventListener('keydown', (event) => event.isTrusted && window.__qaEvent('key'), true);
    addEventListener('pointerdown', (event) => event.isTrusted && window.__qaEvent('pointer'), true);
  });

  const qa = {
    run,
    get page() { return current(); },

    step: record((name, { rated = false, want = null } = {}) => {
      const last = open();
      if (last?.rated && !last.how) throw new Error(`step "${last.name}" is rated: qa.rate it before the next step`);
      run.steps.push({ name, rated, how: null, want, events: { keys: 0, pointers: 0 }, probes: [], timings: [], shots: [] });
    }),

    rate: record((how, want) => {
      oneOf(Object.keys(MARKS), how, 'a rating');
      const step = open();
      if (!step) throw new Error('qa.rate needs a step');
      Object.assign(step, { rated: true, how }, want === undefined ? {} : { want });
    }),

    probe: record((kind, note) => {
      oneOf(PROBES, kind, 'a probe');
      if (!open()) throw new Error('qa.probe needs a step');
      open().probes.push({ kind, note });
    }),

    async shot(name, { page = current(), fullPage = false } = {}) {
      const path = `shots/${String(++shots).padStart(3, '0')}-${slug(name)}.png`;
      await page.screenshot({ path: join(runDir, path), fullPage });
      open()?.shots.push(path);
      save();
      return path;
    },

    async time(name, fn, budget) {
      const limit = typeof budget === 'number' ? budget : BUDGETS[budget];
      if (limit === undefined) throw new Error(`a budget must be a number or one of ${Object.keys(BUDGETS).join(', ')}, not "${budget}"`);
      const start = performance.now();
      await fn();
      const ms = Math.round(performance.now() - start);
      open()?.timings.push({ name, ms, budget: limit, over: ms > limit });
      save();
      return ms;
    },

    // The intervals between animation frames while fn runs: the worst one, against the frame budget, and how
    // many were long.
    async frames(name, fn, page = current()) {
      await page.evaluate(() => {
        const frames = window.__qaFrames = { times: [], on: true };
        const tick = (time) => {
          frames.times.push(time);
          if (frames.on) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await fn();
      const times = await page.evaluate(() => {
        window.__qaFrames.on = false;
        return window.__qaFrames.times;
      });
      const gaps = times.slice(1).map((time, i) => time - times[i]);
      const worst = Math.round(Math.max(0, ...gaps));
      const long = gaps.filter((gap) => gap > BUDGETS.longFrame).length;
      open()?.timings.push({ name, ms: worst, budget: BUDGETS.frame, over: worst > BUDGETS.frame, long });
      save();
      return { worst, long };
    },

    async memory(page = current()) {
      const bytes = await page.evaluate(() => performance.memory.usedJSHeapSize);
      run.memory.push({ step: open()?.name ?? null, bytes });
      save();
      return bytes;
    },

    finding: record(({ kind, severity, expected, actual, repro, shot = null, step = open()?.name ?? null }) => {
      oneOf(FINDING_KINDS, kind, 'a finding\'s kind');
      oneOf(SEVERITIES, severity, 'a finding\'s severity');
      const id = `F${run.findings.length + 1}`;
      run.findings.push({ id, kind, severity, step, expected, actual, repro, shot });
      return id;
    }),

    save,
  };
  return qa;
}

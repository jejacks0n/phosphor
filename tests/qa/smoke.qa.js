// The QA harness itself: the GPU is real, the drawn person's browser is what they'd have, and what a
// run records lands in its folder. Run with `npm run qa:smoke`.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { DEVICES, drawTraits } from './setup.js';
import { PAGE_ERRORS_KEPT, makeQa, newRun, qaContext, renderer } from './qa.js';

const runDirs = [];
test.afterAll(() => runDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

// A qa on a fresh context and run folder, with the app open.
async function start(browser, traits) {
  const runDir = mkdtempSync(join(tmpdir(), 'phosphor-qa-smoke-'));
  runDirs.push(runDir);
  const context = await qaContext(browser, traits);
  const qa = await makeQa({ context, runDir, run: newRun(traits) });
  const page = await context.newPage();
  await page.goto('/');
  return { runDir, context, qa, page };
}

// Every binding call made before this one has reached Node once it answers.
const flush = (page) => page.evaluate(() => window.__qaEvent('flush'));

const maya = drawTraits('maya', 1);
const phone = drawTraits('maya', 4);

test('qa gets the real GPU', async ({ browser }) => {
  const { context, page } = await start(browser, maya);
  expect(await renderer(page)).not.toMatch(/swiftshader|llvmpipe|software/i);
  await context.close();
});

test('qa applies the drawn traits', async ({ browser }) => {
  const { context, page } = await start(browser, maya);
  const { width, height } = DEVICES[maya.device];
  expect(await page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]);
  expect(await page.evaluate(() => localStorage.getItem('phosphor.locale'))).toBe(maya.language);
  await context.close();
});

test('qa counts trusted keys and pointers across a reload', async ({ browser }) => {
  const { context, qa, page } = await start(browser, maya);
  qa.step('press and click');
  await page.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })));
  await page.keyboard.press('x');
  await page.reload();
  await page.keyboard.press('x');
  await page.mouse.click(5, 5);
  await flush(page);
  expect(qa.run.steps.at(-1).events).toEqual({ keys: 2, pointers: 1 });
  await context.close();
});

test('qa counts a tap on a touch device', async ({ browser }) => {
  expect(phone.device).toBe('phone');
  const { context, qa, page } = await start(browser, phone);
  qa.step('tap');
  await page.tap('body', { position: { x: 5, y: 5 } });
  await flush(page);
  expect(qa.run.steps.at(-1).events).toEqual({ keys: 0, pointers: 1 });
  await context.close();
});

test('qa writes what it records', async ({ browser }) => {
  const { runDir, context, qa } = await start(browser, maya);
  qa.step('Undo twice', { rated: true });
  qa.rate('mouse');
  qa.probe('again', 'undid twice more');
  const shot = await qa.shot('Undo / "twice"');
  const id = qa.finding({ kind: 'friction', severity: 'minor', expected: 'a key', actual: 'a menu', repro: 'undo twice' });

  const run = JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8'));
  const [step] = run.steps;
  expect(step).toMatchObject({ name: 'Undo twice', rated: true, how: 'mouse', probes: [{ kind: 'again', note: 'undid twice more' }] });
  expect(shot).toMatch(/^shots\/\d{3}-undo-twice\.png$/);
  expect(step.shots).toEqual([shot]);
  expect(existsSync(join(runDir, shot))).toBe(true);
  expect(run.findings).toEqual([expect.objectContaining({ id, kind: 'friction', step: 'Undo twice' })]);
  await context.close();
});

test('qa records the page\'s errors under their step, and cuts off the SOCIAL server', async ({ browser }) => {
  const { context, qa, page } = await start(browser, maya);
  qa.step('Break it');
  const failed = page.waitForEvent('requestfailed');
  await page.evaluate(() => {
    console.error('a console error');
    setTimeout(() => { throw new Error('a page error'); });
    fetch('http://localhost:8787/api/me').catch(() => {});
  });
  expect((await failed).failure().errorText).toMatch(/^net::ERR_BLOCKED_BY_CLIENT/); // cut off here, never reaching a server
  await expect.poll(() => qa.run.pageErrors).toEqual(expect.arrayContaining([
    { step: 'Break it', kind: 'console', text: 'a console error', count: 1 },
    { step: 'Break it', kind: 'error', text: 'a page error', count: 1 },
  ]));
  await flush(page);
  expect(qa.run.pageErrors.map((e) => e.text).join('\n')).not.toContain('BLOCKED_BY_CLIENT'); // the run's own cut-off
  await context.close();
});

test('qa keeps each page error once with a count, and only so many', async ({ browser }) => {
  const { context, qa, page } = await start(browser, maya);
  qa.step('Flood');
  await page.evaluate(() => {
    for (let i = 0; i < 3; i++) console.error('every frame');
    for (let i = 0; i < 250; i++) console.error(`error ${i}`);
  });
  await expect.poll(() => qa.run.droppedPageErrors).toBe(250 + 1 - PAGE_ERRORS_KEPT);
  expect(qa.run.pageErrors).toHaveLength(PAGE_ERRORS_KEPT);
  expect(qa.run.pageErrors[0]).toEqual({ step: 'Flood', kind: 'console', text: 'every frame', count: 3 });
  await context.close();
});

test('qa refuses a finding that leaves a part out, and ends a step left unrated with a warning', async ({ browser }) => {
  const { context, qa } = await start(browser, maya);
  qa.step('Forgot to rate', { rated: true });
  expect(() => qa.finding({ kind: 'bug', severity: 'minor', expected: 'a', actual: 'b' })).toThrow('a finding needs repro');
  qa.end();
  expect(qa.run.steps[0].rated).toBe(false);
  expect(qa.run.warnings).toEqual([{ step: 'Forgot to rate', text: expect.stringContaining('never rated') }]);
  await context.close();
});

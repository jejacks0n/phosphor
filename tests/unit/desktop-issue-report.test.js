// The desktop app's issue report (desktop/issueReport.js): the main process posts the form to the one address it has,
// never one the page hands it, with no Origin, no cookies and no Turnstile token, says the platform itself, and sends
// nothing at all for a report the server would turn away.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as main from '../../desktop/issueReport.js';
import * as page from '../../src/lib/issueReport.js';

const { sendIssueReport } = main;
const FIELDS = { doing: 'Painting a sky', wrong: 'The brush left a gap', packageVersion: '1.0.0-beta', build: '1.0.0-beta (f1bc75f)', platform: 'web', agent: 'Electron 45 on macOS' };
const PNG = new Uint8Array([137, 80, 78, 71]);
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const answering = (respond = () => json(201, { id: 'r_1', issue: 312 })) => {
  const calls = [];
  return { calls, fetch: async (url, options) => { calls.push({ url, options }); return respond(); } };
};

test('the main process posts the form to the server\'s issue-reports, with no Origin, no cookies and no token', async () => {
  const { calls, fetch } = answering();
  const sent = await sendIssueReport({ ...FIELDS, turnstile: 'a-token-from-the-page', origin: 'https://phosphor.work' }, { drawing: { name: 'sky.pho', bytes: PNG }, steps: 'Phosphor 1.0.0-beta (f1bc75f)\n+0.1s  project.undo' }, { fetch });
  assert.deepEqual(sent, { ok: true, issue: 312 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.phosphor.work/issue-reports');
  const { method, body, headers, redirect, credentials, signal } = calls[0].options;
  assert.deepEqual([method, headers, redirect, credentials], ['POST', undefined, 'error', 'omit']);
  assert.ok(signal instanceof AbortSignal); // it gives up on a server that never answers
  assert.ok(body instanceof FormData);
  assert.deepEqual([...body.keys()], ['doing', 'wrong', 'packageVersion', 'build', 'platform', 'agent', 'drawing', 'steps']); // only the fields it knows
  assert.equal(body.get('platform'), 'desktop'); // said here, whatever the page said
  assert.equal(body.get('wrong'), 'The brush left a gap');
  assert.deepEqual([body.get('drawing').name, body.get('drawing').type, body.get('drawing').size], ['sky.pho', 'image/png', 4]);
  assert.deepEqual([body.get('steps').name, body.get('steps').type], ['steps.txt', 'text/plain']);
  assert.match(await body.get('steps').text(), /^Phosphor 1\.0\.0-beta/);
});

test('with no drawing and no steps only what was written goes', async () => {
  const { calls, fetch } = answering(() => json(201, { id: 'r_2', issue: null }));
  assert.deepEqual(await sendIssueReport(FIELDS, { drawing: null, steps: null }, { fetch }), { ok: true, issue: null });
  assert.deepEqual([...calls[0].options.body.keys()], ['doing', 'wrong', 'packageVersion', 'build', 'platform', 'agent']);
  assert.deepEqual(await sendIssueReport({ ...FIELDS, doing: '' }, undefined, { fetch }), { ok: true, issue: null });
});

test('a report the server would turn away is refused here, and nothing is asked', async () => {
  const { calls, fetch } = answering();
  const bad = [
    [{ ...FIELDS, wrong: '' }], [{ ...FIELDS, wrong: '  \n ' }], [{ ...FIELDS, wrong: 'x'.repeat(4001) }], [{ ...FIELDS, wrong: `${'x\n'.repeat(2000)}x` }],
    [{ ...FIELDS, doing: 'x'.repeat(2001) }], [{ ...FIELDS, doing: null }], [{ ...FIELDS, wrong: ['x'] }], [{ ...FIELDS, agent: 'x'.repeat(81) }],
    [{ ...FIELDS, packageVersion: 'x'.repeat(101) }], [{ ...FIELDS, build: { toString: () => 'x' } }], [null], ['a report'], [undefined],
    [FIELDS, { drawing: 'sky.pho' }], [FIELDS, { drawing: { name: 'sky.pho', bytes: [1, 2, 3] } }], [FIELDS, { drawing: { name: 7, bytes: PNG } }], [FIELDS, { steps: 42 }],
    [FIELDS, 'files'],
  ];
  for (const [fields, files] of bad) assert.deepEqual(await sendIssueReport(fields, files, { fetch }), { ok: false, error: 'bad-request' }, JSON.stringify([fields, files])?.slice(0, 80));
  assert.deepEqual(await sendIssueReport({ ...FIELDS, wrong: 'x\n'.repeat(2000) }, null, { fetch }), { ok: true, issue: 312 }); // 4,000: a line break is one, as the server counts it
  assert.equal(calls.length, 1);
});

test('more than the request holds is too big, and nothing is asked', async () => {
  const { calls, fetch } = answering();
  const big = new Uint8Array(main.MOST_REQUEST_BYTES);
  assert.deepEqual(await sendIssueReport(FIELDS, { drawing: { name: 'big.pho', bytes: big }, steps: null }, { fetch }), { ok: false, error: 'too-big' });
  assert.deepEqual(await sendIssueReport(FIELDS, { drawing: null, steps: 'x'.repeat(main.MOST_REQUEST_BYTES) }, { fetch }), { ok: false, error: 'too-big' });
  assert.equal(calls.length, 0);
});

test('the server\'s answers are read as the page reads them', async () => {
  const answers = [
    () => json(201, { id: 'r', issue: 5 }), () => json(201, { id: 'r', issue: null }), () => json(201, { id: 'r', issue: 'x' }),
    () => json(400, { error: 'bad-request' }), () => json(403, { error: 'turnstile' }), () => json(413, { error: 'too-big' }),
    () => json(429, { error: 'rate-limited' }), () => new Response('<html>', { status: 413 }), () => json(500, { error: 'boom' }), () => json(200, { issue: 1 }),
    () => { throw new TypeError('fetch failed'); }, () => { throw new TypeError('unexpected redirect'); },
  ];
  for (const respond of answers) {
    const here = await sendIssueReport(FIELDS, null, answering(respond));
    const there = await page.sendIssueReport({ fields: FIELDS }, { fetch: answering(respond).fetch, origin: 'https://api.phosphor.work' });
    assert.deepEqual(here, there, respond.toString());
  }
  assert.deepEqual(await sendIssueReport(FIELDS, null, answering(() => json(429, { error: 'rate-limited' }))), { ok: false, error: 'rate-limited' });
});

test('its address and limits are the page\'s, so the two can\'t drift apart', () => {
  assert.equal(main.ISSUE_REPORTS_URL, `https://api.phosphor.work${page.ISSUE_REPORTS_PATH}`);
  for (const name of ['MOST_DOING', 'MOST_WRONG', 'MOST_AGENT', 'MOST_REQUEST_BYTES']) assert.equal(main[name], page[name], name);
});

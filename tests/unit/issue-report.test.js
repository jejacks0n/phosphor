// An issue report as it goes to the server (src/lib/issueReport.js): the browser and system as a short line, the form
// and its parts, what fits, and the server's answers read as sent or as an error to put in words.
import { expect, test, vi } from 'vitest';
import {
  ISSUE_REPORTS_PATH, MOST_AGENT, MOST_DOING, MOST_REQUEST_BYTES, MOST_WRONG, TURNSTILE_ACTION, agentLine, buildLine, drawingFits, reportForm,
  sendIssueReport,
} from '@/lib/issueReport.js';

const CHROME = 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

test('the browser and system are one short line', () => {
  const lines = {
    [`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${CHROME}`]: 'Chrome 142 on macOS',
    [`Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${CHROME} Edg/142.0.0.0`]: 'Edge 142 on Windows',
    [`Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${CHROME} OPR/115.0.0.0`]: 'Opera 115 on Windows',
    [`Mozilla/5.0 (X11; Linux x86_64) ${CHROME}`]: 'Chrome 142 on Linux',
    [`Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) ${CHROME}`]: 'Chrome 142 on ChromeOS',
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36': 'Chrome 142 on Android',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0': 'Firefox 132 on Windows',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15': 'Safari 18 on macOS',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1': 'Safari 18 on iOS',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.7444.77 Mobile/15E148 Safari/604.1': 'Chrome 142 on iOS',
    'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15': 'Firefox 132 on iOS',
    // The desktop app says what it's built on, not the Chrome inside it.
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Phosphor/1.0.0-beta Chrome/140.0.0.0 Electron/45.3.2 Safari/537.36': 'Electron 45 on macOS',
  };
  for (const [userAgent, line] of Object.entries(lines)) expect(agentLine(userAgent), userAgent).toBe(line);
});

test('a browser it doesn\'t know is its own words, cut to what the server takes, and a system it doesn\'t know is left out', () => {
  expect(agentLine('Lynx/2.9.2 libwww-FM/2.14')).toBe('Lynx/2.9.2 libwww-FM/2.14');
  expect(agentLine(`Odd/${'9'.repeat(200)}`)).toHaveLength(MOST_AGENT);
  expect(agentLine('Mozilla/5.0 (PlayStation 5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15')).toBe('Safari 17');
  expect(agentLine('')).toBe('unknown');
  expect(agentLine(undefined)).toBe('unknown');
});

test('the build is its full version and commit, as About has them', () => {
  expect(buildLine({ version: '1.0.20261124-beta', sha: 'f1bc75f' })).toBe('1.0.20261124-beta (f1bc75f)');
});

test('the fields\' limits and the Turnstile widget\'s action are the server\'s', () => {
  expect([MOST_DOING, MOST_WRONG, MOST_AGENT]).toEqual([2000, 4000, 80]);
  expect(TURNSTILE_ACTION).toBe('issue'); // a token solved for any other action is turned away
});

test('a drawing goes only if it fits the request with the steps and the text beside it', () => {
  expect(MOST_REQUEST_BYTES).toBe(25 * 1024 * 1024);
  expect(drawingFits(1024, 2048)).toBe(true);
  expect(drawingFits(24 * 1024 * 1024, 100_000)).toBe(true);
  expect(drawingFits(MOST_REQUEST_BYTES, 0)).toBe(false); // nothing left for the text
  expect(drawingFits(MOST_REQUEST_BYTES - 100_000, 100_000)).toBe(false);
  expect(drawingFits(26 * 1024 * 1024, 0)).toBe(false);
});

const FIELDS = { doing: 'Painting a sky', wrong: 'The brush left a gap', packageVersion: '1.0.0-beta', build: '1.0.20261124-beta (f1bc75f)', platform: 'web', agent: 'Chrome 142 on macOS' };
const drawing = () => new File([new Uint8Array([137, 80, 78, 71])], 'sky.pho', { type: 'image/png' });

test('the form holds the text, the build and the browser, and the drawing, the steps and the token only when there are any', async () => {
  const bare = reportForm(FIELDS);
  expect([...bare.keys()]).toEqual(['doing', 'wrong', 'packageVersion', 'build', 'platform', 'agent']);
  expect(Object.fromEntries(bare)).toEqual(FIELDS);

  const full = reportForm(FIELDS, { token: 'tok-1', drawing: drawing(), steps: 'Phosphor 1.0 (abc)\n+0.1s  workspace.setActiveTool ("brush")' });
  expect([...full.keys()]).toEqual(['doing', 'wrong', 'packageVersion', 'build', 'platform', 'agent', 'turnstile', 'drawing', 'steps']);
  expect(full.get('turnstile')).toBe('tok-1');
  expect([full.get('drawing').name, full.get('drawing').type, full.get('drawing').size]).toEqual(['sky.pho', 'image/png', 4]);
  expect([full.get('steps').name, full.get('steps').type]).toEqual(['steps.txt', 'text/plain']);
  expect(await full.get('steps').text()).toMatch(/^Phosphor 1\.0 \(abc\)\n\+0\.1s/);

  // No token (a build with no Turnstile) is no field: appended, null would go as the word.
  expect(reportForm(FIELDS, { token: null }).has('turnstile')).toBe(false);
  expect(reportForm({ ...FIELDS, doing: '' }).get('doing')).toBe(''); // nothing written there is still the field
});

const answering = (respond) => {
  const calls = [];
  return { calls, fetch: async (url, options) => { calls.push({ url, options }); return respond(); } };
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('a report is one POST of the form to the server\'s issue-reports, with no cookies and no headers of its own', async () => {
  const { calls, fetch } = answering(() => json(201, { id: 'r_1', issue: 312 }));
  const sent = await sendIssueReport({ fields: FIELDS, token: 'tok-1', drawing: drawing(), steps: 'steps' }, { fetch, origin: 'https://api.phosphor.work' });
  expect(sent).toEqual({ ok: true, issue: 312 });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe('https://api.phosphor.work/issue-reports');
  expect(ISSUE_REPORTS_PATH).toBe('/issue-reports');
  const { method, body, credentials, headers } = calls[0].options;
  expect([method, credentials, headers]).toEqual(['POST', 'omit', undefined]); // the browser writes the form's own content type
  expect(body).toBeInstanceOf(FormData);
  expect(body.get('wrong')).toBe('The brush left a gap');
  expect(body.get('drawing').name).toBe('sky.pho');
});

test('a report kept with no issue open yet is still sent', async () => {
  const { fetch } = answering(() => json(201, { id: 'r_2', issue: null }));
  expect(await sendIssueReport({ fields: FIELDS }, { fetch, origin: 'http://localhost:8787' })).toEqual({ ok: true, issue: null });
  const odd = answering(() => json(201, { id: 'r_3', issue: '312; drop' })); // only a whole number is an issue's
  expect(await sendIssueReport({ fields: FIELDS }, { fetch: odd.fetch, origin: 'http://localhost:8787' })).toEqual({ ok: true, issue: null });
});

test('the server\'s refusals are its error words, or its status when the answer isn\'t the server\'s own', async () => {
  const failed = async (respond) => (await sendIssueReport({ fields: FIELDS }, { fetch: answering(respond).fetch, origin: 'http://localhost:8787' }));
  expect(await failed(() => json(400, { error: 'bad-request' }))).toEqual({ ok: false, error: 'bad-request' });
  expect(await failed(() => json(403, { error: 'turnstile' }))).toEqual({ ok: false, error: 'turnstile' });
  expect(await failed(() => json(413, { error: 'too-big' }))).toEqual({ ok: false, error: 'too-big' });
  expect(await failed(() => json(429, { error: 'rate-limited' }))).toEqual({ ok: false, error: 'rate-limited' });
  // Something in front of the server answering for it: no JSON, so the status says which.
  expect(await failed(() => new Response('<html>Payload Too Large</html>', { status: 413 }))).toEqual({ ok: false, error: 'too-big' });
  expect(await failed(() => new Response('slow down', { status: 429 }))).toEqual({ ok: false, error: 'rate-limited' });
  expect(await failed(() => json(403, {}))).toEqual({ ok: false, error: 'turnstile' });
  // Anything else is a failure with no words of its own.
  expect(await failed(() => json(500, { error: 'boom' }))).toEqual({ ok: false, error: 'failed' });
  expect(await failed(() => json(400, { error: 'constructor' }))).toEqual({ ok: false, error: 'bad-request' });
  expect(await failed(() => json(200, { id: 'r_4', issue: 9 }))).toEqual({ ok: false, error: 'failed' }); // not the 201 that says it was kept
  expect(await failed(() => { throw new TypeError('Failed to fetch'); })).toEqual({ ok: false, error: 'network' });
});

test('the desktop app\'s report goes through its main process: the fields, the drawing as bytes and the steps as text', async () => {
  const fetch = vi.fn();
  const desktop = { sendIssueReport: vi.fn(async () => ({ ok: true, issue: 7 })) };
  const sent = await sendIssueReport({ fields: FIELDS, drawing: drawing(), steps: 'steps', token: null }, { fetch, origin: 'https://api.phosphor.work', desktop });
  expect(sent).toEqual({ ok: true, issue: 7 });
  expect(fetch).not.toHaveBeenCalled(); // the page reaches nothing but rooms
  const [fields, files] = desktop.sendIssueReport.mock.calls[0];
  expect(fields).toEqual(FIELDS);
  expect(files.steps).toBe('steps');
  expect(files.drawing.name).toBe('sky.pho');
  expect([...files.drawing.bytes]).toEqual([137, 80, 78, 71]);

  desktop.sendIssueReport.mockResolvedValueOnce({ ok: false, error: 'rate-limited' });
  expect(await sendIssueReport({ fields: FIELDS }, { fetch, desktop })).toEqual({ ok: false, error: 'rate-limited' });
  expect(desktop.sendIssueReport.mock.calls[1][1]).toEqual({ drawing: null, steps: null });
  desktop.sendIssueReport.mockRejectedValueOnce(new Error('no handler'));
  expect(await sendIssueReport({ fields: FIELDS }, { fetch, desktop })).toEqual({ ok: false, error: 'network' });
});

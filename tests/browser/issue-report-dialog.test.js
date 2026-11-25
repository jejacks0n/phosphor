// The issue report dialog (components/IssueReportDialog.vue), opened from the beta banner: what's asked, what its
// checkbox says will go, the form Send posts and nothing before it, and what the server's answer shows.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import IssueReportDialog from '@/components/IssueReportDialog.vue';
import { useRoomStore } from '@/store/RoomStore';
import { clearLog, record } from '@/dev/actionLog.js';
import { startsAsProject } from '@/document/projectIO';
import '@/assets/global.css';

// Turnstile's widget, stood in for: no token unless a test gives one (a build with no site key has none).
const turnstile = vi.hoisted(() => ({ token: null, mounted: [], removed: 0 }));
vi.mock('@/social/turnstile', () => ({
  mountTurnstile: async (...args) => {
    turnstile.mounted.push(args);
    return Object.assign(() => turnstile.token, { remove: () => { turnstile.removed++; } });
  },
}));

let app = null, host = null, closed = 0, project = null;
beforeEach(() => {
  Object.assign(turnstile, { token: null, mounted: [], removed: 0 });
  closed = 0;
});
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const answers = (status, body) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

// The dialog over a drawing named sky (or with none open), two steps taken, and the server answering as given.
async function open({ canvas = true, fetch = answers(201, { id: 'r_1', issue: 312 }), before = () => {} } = {}) {
  ({ project } = await createTestApp());
  if (canvas) {
    await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 8 });
    project.rename('sky');
  }
  await before();
  clearLog();
  record('workspace', 'setActiveTool', '("brush")');
  record('project', 'paintStroke', '([12], "#ff5555")');
  vi.stubGlobal('fetch', fetch);
  mountDialog();
  await nextTick();
  // A new report: what an earlier test left written is kept while the page is, as it is for a person.
  for (const id of ['doing', 'wrong']) {
    field(id).value = '';
    field(id).dispatchEvent(new Event('input'));
  }
  await nextTick();
  await ready(); // the drawing made: nothing of this dialog's is still at work when the test ends
  return fetch;
}
function mountDialog() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(IssueReportDialog, { onClose: () => { closed++; } }).use(getActivePinia()).use(i18n);
  app.mount(host);
}
const dialog = () => document.querySelector('dialog.modal-dialog');
const field = (id) => dialog().querySelector(`#issue-${id}`);
const sendButton = () => dialog().querySelector('button[type=submit]');
const what = () => dialog().querySelector('p.what').textContent.trim();
const typed = async (id, text) => { await userEvent.fill(field(id), text); };
// Once the drawing is ready: its line no longer says it's on its way. The first one of a run takes a second or more on
// a busy machine (the font's cells drawn for the first time), so the waits here are long ones.
const SOON = { timeout: 15_000 };
function ready() {
  return vi.waitFor(() => expect(what()).not.toMatch(/ready/), SOON);
}
const send = async () => {
  await userEvent.click(sendButton());
  await vi.waitFor(() => expect(sendButton()?.textContent.trim()).not.toBe('Sending…'), SOON);
};

test('it asks what you were doing and what went wrong, and Send waits for the second: nothing is sent before it', async () => {
  const fetch = await open();
  expect(dialog().querySelector('h2').textContent).toBe('Report an issue');
  expect([...dialog().querySelectorAll('label[for]')].map((label) => label.textContent.trim())).toEqual(['What were you doing?', 'What went wrong?']);
  expect(document.activeElement).toBe(field('doing')); // focus starts in the first field
  expect(field('wrong').required).toBe(true);
  expect(sendButton().disabled).toBe(true);
  await typed('doing', 'Painting a sky');
  expect(sendButton().disabled).toBe(true);
  await typed('wrong', '   ');
  expect(sendButton().disabled).toBe(true); // nothing but spaces is nothing
  await typed('wrong', 'The brush left a gap');
  expect(sendButton().disabled).toBe(false);
  await ready();
  expect(fetch).not.toHaveBeenCalled();
});

test('what you write becomes public, and the note above Send says so, with the build and browser that go with it', async () => {
  await open();
  expect(dialog().querySelector('p.public').textContent.trim()).toBe('What you write becomes a public issue on GitHub. Your drawing and steps go only to Phosphor\'s developer.');
  const { version, sha } = __BUILD__;
  expect(dialog().querySelector('p.with').textContent.trim()).toMatch(new RegExp(`^Sent with it: Phosphor ${version.replaceAll('.', '\\.')} \\(${sha}\\), Chrome \\d+ on \\w+\\.$`));
  const form = dialog().querySelector('form');
  expect(form.compareDocumentPosition(dialog().querySelector('p.public')) & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy();
  expect(dialog().querySelector('p.public').compareDocumentPosition(sendButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('each field counts what\'s written and stops at its most, a line break counting as one', async () => {
  await open();
  const count = (id) => dialog().querySelector(`#issue-${id}-count`);
  expect([count('doing').textContent, count('wrong').textContent]).toEqual(['0 / 2000', '0 / 4000']);
  expect([field('doing').maxLength, field('wrong').maxLength]).toEqual([2000, 4000]); // the browser stops typing and pasting there
  expect([field('doing').getAttribute('aria-describedby'), field('wrong').getAttribute('aria-describedby')]).toEqual(['issue-doing-count', 'issue-wrong-count']);
  await typed('wrong', 'one\ntwo');
  expect(count('wrong').textContent).toBe('7 / 4000');
  expect(count('wrong').classList.contains('full')).toBe(false);

  await typed('wrong', `${'x'.repeat(3999)}\n`);
  expect(count('wrong').textContent).toBe('4000 / 4000');
  expect(count('wrong').classList.contains('full')).toBe(true); // full, in its warning color
  await typed('wrong', 'x'.repeat(4000));
  expect(sendButton().disabled).toBe(false);

  // More than a field lets anyone type, put there some other way: Send holds rather than send what the server would refuse.
  const put = async (id, text) => {
    field(id).value = text;
    field(id).dispatchEvent(new Event('input'));
    await nextTick();
  };
  await put('wrong', 'x'.repeat(4001));
  expect(sendButton().disabled).toBe(true);
  await put('wrong', 'It broke');
  await put('doing', 'y'.repeat(2001));
  expect(sendButton().disabled).toBe(true);
  await put('doing', 'y'.repeat(2000));
  expect(sendButton().disabled).toBe(false);
});

test('the checkbox is on, and the line under it says what goes: the drawing\'s name and size and how many steps', async () => {
  await open();
  const box = dialog().querySelector('input[type=checkbox]');
  expect(box.checked).toBe(true);
  expect(box.closest('label').textContent.trim()).toBe('Send my drawing and this session\'s steps');
  expect(box.getAttribute('aria-describedby')).toBe('issue-what');
  await ready();
  expect(what()).toMatch(/^sky\.pho, \d+(\.\d)? (KB|MB) · 2 steps$/);
});

test('with no drawing open, only the steps go', async () => {
  const fetch = await open({ canvas: false });
  await ready();
  expect(what()).toBe('2 steps. No drawing is open.');
  await typed('wrong', 'The start screen flickers');
  await send();
  const form = fetch.mock.calls[0][1].body;
  expect(form.has('drawing')).toBe(false);
  expect(await form.get('steps').text()).toContain('workspace.setActiveTool ("brush")');
});

test('in a room the host\'s and an artist\'s line says it\'s the room\'s drawing; a watcher\'s own drawing is their own', async () => {
  await open({ before: () => { useRoomStore().role = 'host'; } });
  await ready();
  expect(what()).toMatch(/^This room's drawing, \d+(\.\d)? (KB|MB) · 2 steps$/);
  app.unmount();
  host.remove();

  await open({ before: () => { project._sharing = { role: 'artist' }; useRoomStore().role = 'watch'; } });
  await ready();
  expect(what()).toMatch(/^This room's drawing, /);
  app.unmount();
  host.remove();

  await open({ before: () => { useRoomStore().role = 'watch'; } });
  await ready();
  expect(what()).toMatch(/^sky\.pho, /);
});

test('Send posts one form to the server: what was written, the build, the browser, the drawing as a .pho and the steps as text', async () => {
  const fetch = await open();
  await typed('doing', '  Painting a sky\nwith the brush ');
  await typed('wrong', 'The brush left a gap');
  await ready();
  await send();
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, { method, body, credentials }] = fetch.mock.calls[0];
  expect([url, method, credentials]).toEqual(['http://localhost:8787/issue-reports', 'POST', 'omit']);
  const { version, sha, packageVersion } = __BUILD__;
  expect(Object.fromEntries([...body].filter(([, value]) => typeof value === 'string'))).toEqual({
    doing: 'Painting a sky\nwith the brush', wrong: 'The brush left a gap', packageVersion, build: `${version} (${sha})`, platform: 'web',
    agent: expect.stringMatching(/^Chrome \d+ on \w+$/),
  });
  expect(body.has('turnstile')).toBe(false); // this build has no Turnstile
  const drawing = body.get('drawing');
  expect([drawing.name, drawing.type]).toEqual(['sky.pho', 'image/png']);
  expect(startsAsProject(new Uint8Array(await drawing.arrayBuffer()))).toBe(true);
  const steps = body.get('steps');
  expect([steps.name, steps.type]).toEqual(['steps.txt', 'text/plain']);
  expect(await steps.text()).toMatch(new RegExp(`^Phosphor ${version.replaceAll('.', '\\.')} \\(${sha}\\)\\n.+\\n\\d+×\\d+\\n\\n\\+\\d+\\.\\ds {2}workspace\\.setActiveTool \\("brush"\\)\\n\\+\\d+\\.\\ds {2}project\\.paintStroke`));
});

test('unticked, only what was written goes', async () => {
  const fetch = await open();
  await typed('wrong', 'The brush left a gap');
  await userEvent.click(dialog().querySelector('input[type=checkbox]'));
  await send();
  const form = fetch.mock.calls[0][1].body;
  expect([...form.keys()]).toEqual(['doing', 'wrong', 'packageVersion', 'build', 'platform', 'agent']);
});

test('a drawing too big for a report isn\'t sent: its line says so, and the steps still go', async () => {
  const fetch = await open({ before: () => { project.projectFile = async () => new Blob([new Uint8Array(26 * 1024 * 1024)]); } });
  await ready();
  expect(what()).toBe('sky.pho is too big to send (26.0 MB; a report holds 25.0 MB). Only the 2 steps will go.');
  await typed('wrong', 'It is slow');
  await send();
  const form = fetch.mock.calls[0][1].body;
  expect(form.has('drawing')).toBe(false);
  expect(form.has('steps')).toBe(true);
});

test('the web build\'s Turnstile is asked for as the dialog opens, shown only when it needs the person, and its token goes with the form', async () => {
  turnstile.token = 'tok-1';
  const fetch = await open();
  expect(turnstile.mounted).toHaveLength(1);
  expect(turnstile.mounted[0][0]).toBe(dialog().querySelector('div.turnstile'));
  expect(turnstile.mounted[0].slice(1)).toEqual(['issue', { appearance: 'interaction-only' }]);
  await typed('wrong', 'It broke');
  await send();
  expect(fetch.mock.calls[0][1].body.get('turnstile')).toBe('tok-1');
  app.unmount();
  app = null;
  expect(turnstile.removed).toBe(1);
});

test('sent, it says thank you with the issue\'s number, a link to it on GitHub, and what was written is gone', async () => {
  await open();
  await typed('doing', 'Painting');
  await typed('wrong', 'It broke');
  await send();
  const status = dialog().querySelector('[role=status]');
  expect(status.textContent.replace(/\s+/g, ' ').trim()).toBe('Sent. Thank you. It\'s issue #312 on GitHub.');
  const link = status.querySelector('a');
  expect([link.textContent, link.href, link.target, link.rel]).toEqual(['issue #312', 'https://github.com/jejacks0n/phosphor/issues/312', '_blank', 'noopener']);
  expect(dialog().querySelector('form')).toBe(null);
  await userEvent.click(dialog().querySelector('button.primary'));
  expect(closed).toBe(1);

  app.unmount();
  host.remove();
  mountDialog(); // opened again: a new report
  await nextTick();
  expect([field('doing').value, field('wrong').value]).toEqual(['', '']);
  await ready();
});

test('a report kept with no issue open yet says only thank you', async () => {
  await open({ fetch: answers(201, { id: 'r_2', issue: null }) });
  await typed('wrong', 'It broke');
  await send();
  const status = dialog().querySelector('[role=status]');
  expect(status.textContent.trim()).toBe('Sent. Thank you.');
  expect(status.querySelector('a')).toBe(null);
});

test('a report that didn\'t go says why in plain words, and what was written stays', async () => {
  const fetch = answers(429, { error: 'rate-limited' });
  await open({ fetch });
  await typed('doing', 'Painting');
  await typed('wrong', 'It broke');
  const said = async (response) => {
    fetch.mockImplementationOnce(response);
    await send();
    return dialog().querySelector('p.error[role=alert]').textContent;
  };
  const json = (status, body) => async () => new Response(JSON.stringify(body), { status });
  expect(await said(json(429, { error: 'rate-limited' }))).toBe('Too many reports just now. Wait a while and try again.');
  expect(await said(json(413, { error: 'too-big' }))).toBe('That was too big to send. Untick the drawing and try again.');
  expect(await said(json(403, { error: 'turnstile' }))).toBe('Security verification failed. Please try again.');
  expect(await said(json(400, { error: 'bad-request' }))).toBe('Something went wrong. Try again.');
  expect(await said(async () => { throw new TypeError('Failed to fetch'); })).toBe('Couldn\'t reach Phosphor\'s server. Check your connection.');
  expect([field('doing').value, field('wrong').value]).toEqual(['Painting', 'It broke']);
  expect(dialog().querySelector('[role=status]').textContent.trim()).toBe('');

  fetch.mockImplementationOnce(json(201, { id: 'r_3', issue: 7 })); // and the next try can go
  await send();
  expect(dialog().querySelector('[role=status]').textContent).toContain('issue #7');
});

const cancelButton = () => [...dialog().querySelectorAll('button')].find((button) => button.textContent.trim() === 'Cancel');

test('Escape and Cancel close it, and what was written is there when it opens again', async () => {
  const fetch = await open();
  await typed('wrong', 'Half a thought');
  await userEvent.keyboard('{Escape}');
  expect(closed).toBe(1);
  app.unmount();
  host.remove();
  mountDialog();
  await nextTick();
  await ready();
  expect(field('wrong').value).toBe('Half a thought');
  await userEvent.click(cancelButton());
  expect(closed).toBe(2);
  expect(fetch).not.toHaveBeenCalled();
});

test('Cancel while it\'s sending stops waiting for a server that doesn\'t answer: the request is let go, it closes, and what was written is kept', async () => {
  let signal = null;
  const stalled = vi.fn((url, options) => new Promise((resolve, reject) => {
    signal = options.signal;
    signal.addEventListener('abort', () => reject(signal.reason));
  }));
  await open({ fetch: stalled });
  await typed('wrong', 'It never answers');
  await userEvent.click(sendButton());
  await vi.waitFor(() => expect(stalled).toHaveBeenCalledTimes(1), SOON);
  expect(sendButton().textContent.trim()).toBe('Sending…');
  expect(signal.aborted).toBe(false);
  expect(cancelButton().disabled).toBe(false);

  await userEvent.click(cancelButton());
  expect(closed).toBe(1);
  expect(signal.aborted).toBe(true);
  await nextTick();
  expect(dialog().querySelector('p.error')).toBe(null); // let go on purpose: not a failure to say
  app.unmount();
  host.remove();
  mountDialog();
  await nextTick();
  await ready();
  expect(field('wrong').value).toBe('It never answers');
});

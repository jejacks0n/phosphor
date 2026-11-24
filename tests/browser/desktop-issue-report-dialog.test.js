// The issue report in the desktop app (components/IssueReportDialog.vue, VITE_DESKTOP): its page reaches nothing but
// rooms, so Send hands the report to the main process (window.phosphorDesktop's sendIssueReport, faked here), never
// the page's fetch, with no Turnstile, and shows the answer as the web build does.
import { afterEach, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import IssueReportDialog from '@/components/IssueReportDialog.vue';
import { resetDesktop, useFakeDesktop } from '@/social/desktop';
import { startsAsProject } from '@/document/projectIO';
import '@/assets/global.css';

const turnstile = vi.hoisted(() => ({ mounted: 0 }));
vi.mock('@/social/turnstile', () => ({ mountTurnstile: async () => { turnstile.mounted++; return () => null; } }));

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
  resetDesktop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const dialog = () => document.querySelector('dialog.modal-dialog');

test('Send hands the report to the main process: the text, the drawing\'s bytes and the steps, and never the page\'s fetch or Turnstile', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 8 });
  project.rename('sky');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const sendIssueReport = vi.fn(async () => ({ ok: false, error: 'rate-limited' }));
  useFakeDesktop({ sendIssueReport });
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(IssueReportDialog).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  expect(dialog().querySelector('div.turnstile')).toBe(null);
  expect(turnstile.mounted).toBe(0);

  await userEvent.fill(dialog().querySelector('#issue-wrong'), 'The window went blank');
  await vi.waitFor(() => expect(dialog().querySelector('p.what').textContent).toMatch(/^sky\.pho, /));
  const send = async () => {
    await userEvent.click(dialog().querySelector('button[type=submit]'));
    await vi.waitFor(() => expect(dialog().querySelector('button[type=submit]')?.textContent.trim()).not.toBe('Sending…'));
  };
  await send();
  expect(dialog().querySelector('p.error[role=alert]').textContent).toBe('Too many reports just now. Wait a while and try again.');
  expect(sendIssueReport).toHaveBeenCalledTimes(1);
  const [fields, files] = sendIssueReport.mock.calls[0];
  const { version, sha, packageVersion } = __BUILD__;
  expect(fields).toEqual({ doing: '', wrong: 'The window went blank', packageVersion, build: `${version} (${sha})`, platform: 'desktop', agent: expect.stringMatching(/ on \w+$/) });
  expect(files.drawing.name).toBe('sky.pho');
  expect(files.drawing.bytes).toBeInstanceOf(Uint8Array);
  expect(startsAsProject(files.drawing.bytes)).toBe(true);
  expect(files.steps).toMatch(/^Phosphor /);

  sendIssueReport.mockResolvedValueOnce({ ok: true, issue: 9 });
  await send();
  expect(dialog().querySelector('[role=status]').textContent.replace(/\s+/g, ' ').trim()).toBe('Sent. Thank you. It\'s issue #9 on GitHub.');
  expect(fetch).not.toHaveBeenCalled();
});

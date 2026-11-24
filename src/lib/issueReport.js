// An issue report, from the beta banner's dialog (components/IssueReportDialog.vue) to the server: what someone wrote,
// which Phosphor and browser they have, and, if they said so, their drawing and the session's steps. Not a report of a
// person or a room, which is SOCIAL's (components/social/ReportDialog.vue). This is the whole of what the server is
// sent and answers:
//   POST {apiOrigin}/issue-reports, multipart/form-data, 25 MB at most
//     doing (0 to 2,000 characters), wrong (1 to 4,000), packageVersion, build, platform ('web' | 'desktop'), agent (80 at
//     most), turnstile (the web build's token), drawing (the .pho, image/png) and steps (the log's text, text/plain)
//   201 { id, issue }: issue is the public issue's number, or null while it isn't open yet
//   400 { error: 'bad-request' } · 403 { error: 'turnstile' } · 413 { error: 'too-big' } · 429 { error: 'rate-limited' }
// The text becomes a public issue; the drawing and the steps don't. Nothing is sent but by sendIssueReport, which the
// dialog calls on Send. The desktop app's page reaches nothing but rooms, so its report goes through the main process
// (desktop/issueReport.js), which checks it again and has its own copies of these limits.
import { apiOrigin } from '@/social/config.js';

export const ISSUE_REPORTS_PATH = '/issue-reports';
export const TURNSTILE_ACTION = 'issue-report'; // the widget's, as each form has its own (social/turnstile.js)
export const MOST_DOING = 2000;
export const MOST_WRONG = 4000;
export const MOST_AGENT = 80;
export const MOST_REQUEST_BYTES = 25 * 1024 * 1024;
const ROOM_FOR_TEXT = 64 * 1024; // of the request: what was written (6,000 characters, four bytes each at the most) and the form's own lines

const FIELDS = ['doing', 'wrong', 'packageVersion', 'build', 'platform', 'agent'];

// What was written as it's counted on its way: a form sends a line break as two characters.
export const sentLength = (text) => text.replace(/\r\n?|\n/g, '\r\n').length;

// Whether a drawing of that many bytes fits the request with the steps beside it.
export const drawingFits = (drawingBytes, stepsBytes) => drawingBytes + stepsBytes + ROOM_FOR_TEXT <= MOST_REQUEST_BYTES;

// The build as About has it: its full version and commit.
export const buildLine = ({ version, sha }) => `${version} (${sha})`;

// The browser and the system as a short line ("Chrome 142 on macOS") from the browser's own words. The first that
// matches is it: Edge, Opera and the desktop app's Electron say Chrome too, and every browser on iOS says Safari. A
// browser not known is its own words, cut to what the server takes; a system not known is left out.
const BROWSERS = [
  ['Edge', /Edg(?:e|A|iOS)?\/(\d+)/], ['Opera', /OPR\/(\d+)/], ['Electron', /Electron\/(\d+)/], ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
  ['Chrome', /(?:Chrome|CriOS)\/(\d+)/], ['Safari', /Version\/(\d+).*Safari\//],
];
const SYSTEMS = [['iOS', /iPhone|iPad|iPod/], ['Android', /Android/], ['ChromeOS', /CrOS/], ['Windows', /Windows/], ['macOS', /Macintosh|Mac OS X/], ['Linux', /Linux/]];
export function agentLine(userAgent) {
  const words = String(userAgent ?? '');
  const [name, found] = BROWSERS.map(([browser, pattern]) => [browser, pattern.exec(words)]).find(([, match]) => match) ?? [];
  if (!name) return words.slice(0, MOST_AGENT) || 'unknown';
  const system = SYSTEMS.find(([, pattern]) => pattern.test(words))?.[0];
  return `${name} ${found[1]}${system ? ` on ${system}` : ''}`;
}

// The form: the six text fields always, and the token, the drawing (a File, typed image/png) and the steps (text) only
// when there are any.
export function reportForm(fields, { token = null, drawing = null, steps = null } = {}) {
  const form = new FormData();
  for (const name of FIELDS) form.append(name, fields[name] ?? '');
  if (token) form.append('turnstile', token);
  if (drawing) form.append('drawing', drawing, drawing.name);
  if (steps) form.append('steps', new File([steps], 'steps.txt', { type: 'text/plain' }));
  return form;
}

// The server's answer as { ok: true, issue } (the issue's number, or null) or { ok: false, error }: one of the
// server's four, by its word or else by the status (something in front of the server can answer for it), or 'failed'.
const ERRORS = { 400: 'bad-request', 403: 'turnstile', 413: 'too-big', 429: 'rate-limited' };
async function answerOf(response) {
  const data = await response.json().catch(() => null);
  if (response.status === 201) return { ok: true, issue: Number.isInteger(data?.issue) && data.issue > 0 ? data.issue : null };
  return { ok: false, error: Object.values(ERRORS).includes(data?.error) ? data.error : ERRORS[response.status] ?? 'failed' };
}

// Sends it. Never throws: a server that can't be reached is { ok: false, error: 'network' }. No cookies go with it: a
// report is no one's account's. With `desktop` (window.phosphorDesktop) the main process posts it.
export async function sendIssueReport({ fields, token = null, drawing = null, steps = null }, { fetch = globalThis.fetch, origin = null, desktop = null } = {}) {
  try {
    if (desktop) {
      const bytes = drawing && new Uint8Array(await drawing.arrayBuffer());
      return await desktop.sendIssueReport(fields, { drawing: drawing && { name: drawing.name, bytes }, steps });
    }
    return await answerOf(await fetch((origin ?? apiOrigin()) + ISSUE_REPORTS_PATH, { method: 'POST', credentials: 'omit', body: reportForm(fields, { token, drawing, steps }) }));
  } catch {
    return { ok: false, error: 'network' };
  }
}

// An issue report from the desktop app (the beta banner's dialog), whose page reaches nothing but rooms: the form posted
// to Phosphor's server at the one address here, never one the page hands over, with no Origin, no cookies and no
// Turnstile token (the app has no Turnstile), following no redirect. What the page sends is checked as the server
// checks it, so a report it would turn away asks nothing, and only the fields known here go: the platform is said
// here. Nothing is sent but when the page's Send asks. The packaged app carries only desktop/, so the limits and the
// answers' reading are copies of the page's (src/lib/issueReport.js, which has the whole contract).
export const ISSUE_REPORTS_URL = 'https://api.phosphor.work/issue-reports';
export const MOST_DOING = 2000;
export const MOST_WRONG = 4000;
export const MOST_AGENT = 80;
export const MOST_REQUEST_BYTES = 25 * 1024 * 1024;
const MOST_LINE = 100; // of the version and the build
const MOST_NAME = 255; // of the drawing's file name
const TIMEOUT_MS = 60_000; // a drawing of 25 MB on a slow line

// What was written as it's counted on its way: a form sends a line break as two characters.
export const sentLength = (text) => text.replace(/\r\n?|\n/g, '\r\n').length;

const text = (value, most) => typeof value === 'string' && sentLength(value) <= most;
const goodFields = (fields) => !!fields && typeof fields === 'object'
  && text(fields.doing, MOST_DOING) && text(fields.wrong, MOST_WRONG) && fields.wrong.trim() !== ''
  && text(fields.packageVersion, MOST_LINE) && text(fields.build, MOST_LINE) && text(fields.agent, MOST_AGENT);
const goodFiles = ({ drawing = null, steps = null }) => (steps === null || typeof steps === 'string')
  && (drawing === null || (!!drawing && typeof drawing.name === 'string' && drawing.name.length <= MOST_NAME && drawing.bytes instanceof Uint8Array));

const ERRORS = { 400: 'bad-request', 403: 'turnstile', 413: 'too-big', 429: 'rate-limited' };
async function answerOf(response) {
  const data = await response.json().catch(() => null);
  if (response.status === 201) return { ok: true, issue: Number.isInteger(data?.issue) && data.issue > 0 ? data.issue : null };
  return { ok: false, error: Object.values(ERRORS).includes(data?.error) ? data.error : ERRORS[response.status] ?? 'failed' };
}

// { ok: true, issue } (the public issue's number, or null while it isn't open yet) or { ok: false, error }: the
// server's bad-request, turnstile, too-big or rate-limited (the first and third said here too, with nothing asked),
// network for a server that can't be reached, or failed.
export async function sendIssueReport(fields, files, { fetch }) {
  files ??= {};
  if (!goodFields(fields) || typeof files !== 'object' || !goodFiles(files)) return { ok: false, error: 'bad-request' };
  const { drawing = null, steps = null } = files;
  const form = new FormData();
  for (const name of ['doing', 'wrong', 'packageVersion', 'build']) form.append(name, fields[name]);
  form.append('platform', 'desktop');
  form.append('agent', fields.agent);
  if (drawing) form.append('drawing', new File([drawing.bytes], drawing.name, { type: 'image/png' }));
  if (steps) form.append('steps', new File([steps], 'steps.txt', { type: 'text/plain' }));
  const size = [...form.values()].reduce((sum, value) => sum + (typeof value === 'string' ? Buffer.byteLength(value) : value.size), 0);
  if (size > MOST_REQUEST_BYTES) return { ok: false, error: 'too-big' };
  try {
    return await answerOf(await fetch(ISSUE_REPORTS_URL, { method: 'POST', body: form, redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(TIMEOUT_MS) }));
  } catch {
    return { ok: false, error: 'network' };
  }
}

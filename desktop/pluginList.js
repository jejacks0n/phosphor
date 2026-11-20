// The marketplace's fetches for the page (docs/plugins.md): phosphor.work's plugin list and a listed plugin's files on
// raw GitHub, nothing else, following no redirect, and a body read no further than its cap. The page checks the hashes.
// The packaged app carries only desktop/, so the cap is its own copy of MOST_SCRIPT_BYTES (src/plugins/manifest.js).
export const LIST_URL = 'https://phosphor.work/plugins.json';
export const MOST_LIST_BYTES = 4 * 1024 * 1024;
export const MOST_FILE_BYTES = 1048576;
const RAW = 'https://raw.githubusercontent.com';
const TIMEOUT_MS = 15_000;

// The list, or a raw GitHub URL already in its plain form (no dot segments, escapes of them, backslashes or user).
export function allowedUrl(url) {
  if (typeof url !== 'string') return false;
  if (url === LIST_URL) return true;
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  return parsed.href === url && parsed.origin === RAW && !parsed.username && !parsed.password && !url.split(/[/?#]/).includes('..');
}

// A body of at most `most` bytes as text (a BOM dropped, as Response.text() does), or an Error: notAllowed, status N,
// tooBig.
export async function fetchText(url, { fetch, most }) {
  if (!allowedUrl(url)) throw new Error('notAllowed');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`status ${response.status}`);
  if (!response.body) return '';
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > most) {
      reader.cancel().catch(() => {});
      throw new Error('tooBig');
    }
    text += decoder.decode(value, { stream: true });
  }
}

// A file the page asks for, at most `most` bytes and never more than a script's cap, whatever it sends.
export const fetchFile = (url, most, { fetch }) => fetchText(url, {
  fetch, most: typeof most === 'number' && most >= 0 ? Math.min(most, MOST_FILE_BYTES) : MOST_FILE_BYTES,
});

// Lospec's palettes as this app reads them: the slug a typed link or name means, the page and the API address a slug
// has, an answer from the API read as a palette, and getPalette, the one request (in the desktop app, the main
// process's), made only when Get is pressed. The answer is a stranger's, so its size is capped, its colors checked
// and its words cut before anything shows them.
import { firstColors } from './colorList.js';

export const SLUG = /^[a-z0-9-]{1,100}$/;

export const pageOf = (slug) => `https://lospec.com/palette-list/${slug}`;
export const apiOf = (slug) => `${pageOf(slug)}.json`;

// The slug a link or a name means, or '' when it means none. A link counts only on lospec.com under /palette-list/;
// the rest of it (an extension, a trailing slash, a query, a hash) is dropped. Anything else is a name.
export function slugOf(typed) {
  const text = String(typed).trim();
  let slug;
  if (/^(https?:\/\/)?(www\.)?lospec\.com(\/|$)/i.test(text) || /^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    let url;
    try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`); } catch { return ''; }
    if (!/^(www\.)?lospec\.com$/.test(url.hostname)) return '';
    const m = /^\/palette-list\/([^/.]+)[^/]*\/?$/.exec(url.pathname);
    slug = m ? m[1] : '';
  } else {
    slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  return SLUG.test(slug) ? slug : '';
}

const words = (value, fallback) => (typeof value === 'string' && value ? value : fallback).slice(0, 100);

// An answer as { slug, name, author, colors, of }; `of` is how many colors there were when some were cut. Throws
// Error('notPalette') unless the answer holds a list of colors, each six hex digits.
export function readPalette(data, slug) {
  const list = data && typeof data === 'object' ? data.colors : null;
  if (!Array.isArray(list) || !list.length || !list.every((c) => typeof c === 'string' && /^[0-9a-f]{6}$/i.test(c))) {
    throw new Error('notPalette');
  }
  const { colors, of } = firstColors(list.map((c) => `#${c.toLowerCase()}`));
  return { slug, name: words(data.name, slug), author: words(data.author, ''), colors, of };
}

const MOST_BYTES = 64 * 1024;
const TIMEOUT_MS = 10_000;

// A body of at most `most` bytes as text, or Error('tooBig') once past it, read no further.
async function cappedText(response, most) {
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

// The palette a slug names on Lospec, asked of its API address alone (no redirect followed, no credentials sent), or an
// Error saying which way it failed: 'notFound' (a 404, or an answer saying error), 'unreachable' (no answer, or one
// cut off), 'notPalette' (a slug that isn't one, which asks nothing, or an answer that isn't a palette or is too big).
// `fetch` is passed in so a plain Node script and the tests can give their own. The desktop app passes `ask`, its main
// process (desktop/lospec.js), which fetches in the page's place and answers { text } or { failed }.
export async function getPalette(slug, { fetch = globalThis.fetch, ask } = {}) {
  if (typeof slug !== 'string' || !SLUG.test(slug)) throw new Error('notPalette');
  const text = ask ? await askedText(slug, ask) : await fetchedText(slug, fetch);
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('notPalette'); }
  if (data && typeof data === 'object' && 'error' in data) throw new Error('notFound');
  return readPalette(data, slug);
}

async function fetchedText(slug, fetch) {
  let response;
  try {
    response = await fetch(apiOf(slug), { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new Error('unreachable');
  }
  if (response.status === 404) throw new Error('notFound');
  if (!response.ok) throw new Error('unreachable');
  try {
    return await cappedText(response, MOST_BYTES);
  } catch (error) {
    throw new Error(error.message === 'tooBig' ? 'notPalette' : 'unreachable', { cause: error });
  }
}

// The main process's answer, whose failures are only the ones this file says; anything else it says, or the asking
// failing, is Lospec out of reach.
async function askedText(slug, ask) {
  let got;
  try { got = await ask(slug); } catch { throw new Error('unreachable'); }
  if (typeof got?.text === 'string') return got.text;
  throw new Error(got?.failed === 'notFound' || got?.failed === 'notPalette' ? got.failed : 'unreachable');
}

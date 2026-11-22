// Lospec's palettes as this app reads them: the slug a typed link or name means, the page and the API address a slug
// has, and an answer from the API read as a palette. Nothing here fetches; the answer is a stranger's, so its colors
// are checked and its words cut before anything shows them.
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

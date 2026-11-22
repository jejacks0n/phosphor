// The color layer's Get from Lospec in the desktop app, whose page reaches nothing but rooms: one palette asked of
// lospec.com by its slug, at the address built here from it and never one the page hands over, following no redirect,
// sending no credentials, and read no further than 64 KB. The page reads the answer as the web build does
// (src/lib/lospec.js). The packaged app carries only desktop/, so the pattern and the cap are copies of that file's.
import { cappedText } from './pluginList.js';

export const SLUG = /^[a-z0-9-]{1,100}$/;
const MOST_BYTES = 64 * 1024;
const TIMEOUT_MS = 10_000;

// The palette's answer as { text }, or { failed } (IPC keeps only an Error's message): notFound for a 404, notPalette
// for a slug that isn't one (which asks nothing) or a body past the cap, unreachable for anything else.
export async function fetchPalette(slug, { fetch }) {
  if (typeof slug !== 'string' || !SLUG.test(slug)) return { failed: 'notPalette' };
  try {
    const response = await fetch(`https://lospec.com/palette-list/${slug}.json`, {
      redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) return { failed: 'notFound' };
    if (!response.ok) return { failed: 'unreachable' };
    return { text: await cappedText(response, MOST_BYTES) };
  } catch (error) {
    return { failed: error.message === 'tooBig' ? 'notPalette' : 'unreachable' };
  }
}

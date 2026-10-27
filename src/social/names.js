// A name's swatch: a stable hash of the name to one of the CGA colors (black left out: it wouldn't show
// on the dark UI), so someone keeps their color in the lobby and in rooms.
import { CGA_COLORS_STR } from '@/lib/ColorUtils';

export const NAME_COLORS = CGA_COLORS_STR.split(' ').filter((c) => c !== '#000000');

// FNV-1a over the name's UTF-16 code units.
export function nameColor(name) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 0x01000193);
  return NAME_COLORS[(hash >>> 0) % NAME_COLORS.length];
}

// A username's problem, as the server checks it (length, then characters, then reserved): 'length',
// 'characters', 'reserved' (admin and the like, or three hyphen-joined words: a guest's nickname), or null.
const RESERVED = new Set(['admin', 'phosphor', 'guest', 'host', 'system']);

export function usernameProblem(name) {
  if (name.length < 3 || name.length > 24) return 'length';
  if (!/^[a-z0-9_-]+$/i.test(name)) return 'characters';
  if (RESERVED.has(name.toLowerCase()) || /^[a-z]+-[a-z]+-[a-z]+$/i.test(name)) return 'reserved';
  return null;
}

// A Discord or GitHub name as a first try at a username: lowercase, spaces to hyphens, the rest dropped.
export const cleanUsername = (name) => (name ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 24);

// The username onboarding starts from: the cleaned name if it would do, else its first word, else nothing
// (a guest-shaped or reserved name is never offered).
export function suggestedUsername(name) {
  const cleaned = cleanUsername(name);
  const first = cleaned.split('-')[0];
  return [cleaned, first].find((n) => !usernameProblem(n)) ?? '';
}

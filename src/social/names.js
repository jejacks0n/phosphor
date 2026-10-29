// A name's color and glyph: a stable hash of the name to one of the CGA colors (black left out: it wouldn't show
// on the dark UI), so someone keeps their color in the lobby and in rooms.
import { CGA_COLORS_STR } from '@/lib/ColorUtils';

export const NAME_COLORS = CGA_COLORS_STR.split(' ').filter((c) => c !== '#000000');

// FNV-1a over the name's UTF-16 code units.
function nameHash(name) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

export function nameColor(name) {
  return NAME_COLORS[nameHash(name) % NAME_COLORS.length];
}

// A name's glyph, drawn on its color: a CP437 symbol that can't be read as part of the name (no letters or
// digits), from the hash past what the color took, so two names of one color mostly differ in glyph.
export const NAME_GLYPHS = [...'☺☻♥♦♣♠♪♫☼►◄▲▼↑↓→←↔↕‼¶§◙⌂Ω∞≡±÷°√'];

export function nameGlyph(name) {
  return NAME_GLYPHS[Math.floor(nameHash(name) / NAME_COLORS.length) % NAME_GLYPHS.length];
}

// The words to put on a name's color: black on the light colors, white on the dark ones (by how bright
// the color looks to the eye).
export function nameInk(color) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#000000' : '#ffffff';
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

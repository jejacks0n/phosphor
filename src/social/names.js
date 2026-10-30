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
// 'characters', 'reserved', or null. Reserved names are written without their hyphens and underscores
// (`no-reply` is `noreply`).
const RESERVED = new Set([
  // Staff and authority.
  'admin', 'admins', 'administrator', 'administrators', 'root', 'sysop', 'sysadmin', 'superuser', 'superadmin',
  'moderator', 'moderators', 'mod', 'mods', 'staff', 'team', 'owner', 'founder', 'ceo', 'operator', 'ops',
  'official', 'verified', 'security', 'trust', 'safety', 'trustandsafety', 'abuse', 'legal', 'privacy',
  'compliance', 'support', 'help', 'helpdesk', 'service', 'customerservice', 'billing', 'contact', 'info',
  'feedback', 'report', 'reports', 'appeals',
  // The service and the people behind it.
  'phosphor', 'ishifishi', 'euphio',
  // Mailboxes and machinery.
  'postmaster', 'webmaster', 'hostmaster', 'noreply', 'donotreply', 'mailerdaemon', 'daemon', 'mail', 'email',
  'smtp', 'www', 'api', 'ftp', 'dns', 'cdn', 'server', 'localhost', 'bot', 'robot', 'automod', 'console', 'status',
  // Phosphor's own words: who's in a room, and who a message goes to.
  'guest', 'guests', 'host', 'system', 'lobby', 'room', 'rooms', 'everyone', 'here', 'all', 'channel',
  // Stand-ins a real person could be mistaken for, or that read as a missing or removed account.
  'null', 'undefined', 'nil', 'none', 'nobody', 'anyone', 'someone', 'unknown', 'anonymous', 'anon', 'deleted',
  'deleteduser', 'removed', 'banned', 'suspended', 'silenced', 'user', 'username', 'member', 'test', 'demo',
  'example',
  // Words the app and its pages use.
  'login', 'logout', 'signin', 'signout', 'signup', 'register', 'account', 'settings', 'profile', 'auth', 'oauth',
  'password', 'reset', 'verify', 'dashboard', 'home', 'about', 'terms',
]);
// A name that starts or ends with one of these, joined or not, passes for official (`phosphor_wren`, `realadmin`).
const OFFICIAL = [
  'admin', 'moderator', 'sysop', 'superuser', 'official', 'staff', 'support', 'phosphor', 'ishifishi', 'euphio',
  'postmaster', 'webmaster', 'hostmaster', 'noreply', 'trustandsafety',
];
// A name with one of these as a word of its own does too (`wren_mod`, `the-admin`).
const WORDS = new Set(['admin', 'admins', 'mod', 'mods', 'staff', 'sysop', 'root', 'official', 'bot']);
// Digits standing in for letters, so `adm1n` and `m0d` are read as `admin` and `mod`.
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b' };

// Read as typed, with its digits as letters, and with its digits dropped (`root99`).
function isReserved(name) {
  const lower = name.toLowerCase();
  return [lower, lower.replace(/\d/g, (d) => LEET[d] ?? d), lower.replace(/\d/g, '')].some((reading) => {
    const words = reading.split(/[-_\d]+/).filter(Boolean);
    const joined = words.join('');
    return RESERVED.has(joined) || words.some((w) => WORDS.has(w))
      || OFFICIAL.some((w) => joined.startsWith(w) || joined.endsWith(w));
  });
}

export function usernameProblem(name) {
  if (name.length < 3 || name.length > 24) return 'length';
  if (!/^[a-z0-9_-]+$/i.test(name)) return 'characters';
  // Three hyphen-joined words is a guest's nickname.
  if (isReserved(name) || /^[a-z]+-[a-z]+-[a-z]+$/i.test(name)) return 'reserved';
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

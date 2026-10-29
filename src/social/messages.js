// The server's error codes in plain words. `detail` is the rest of the reply (problem, until).
const day = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

const USERNAME = {
  length: 'Usernames are 3 to 24 characters',
  characters: 'Use only letters, numbers, underscores and hyphens',
  reserved: "That name is reserved: names can't be three words joined by hyphens, or admin, phosphor, guest, host or system",
};

// A room the server wouldn't make: the field it refused (the others only an app bug sends).
const INVALID = {
  name: 'Room names are 1 to 60 characters',
  password: 'A private room needs a password',
  max: 'Max watchers is 1 to 30',
};

const WORDS = {
  NETWORK: "Couldn't reach Phosphor's server. Check your connection.",
  TERMS_REQUIRED: 'Agree to the terms to continue',
  USERNAME: ({ problem }) => USERNAME[problem] ?? 'That username won\'t work',
  TAKEN: 'That username is taken',
  USERNAME_IS_ALREADY_TAKEN: 'That username is taken',
  TOO_SOON: ({ until }) => until ? `You can change your username again on ${day(until)}` : 'You changed your username recently. Try again later',
  ONBOARDING_REQUIRED: 'Pick a username to finish setting up your account',
  NEEDS_ONBOARDING: 'Pick a username to finish setting up your account',
  SUSPENDED: ({ until }) => until ? `This account is suspended until ${day(until)}` : 'This account is suspended for good',
  BANNED_USER: 'This account is suspended',   // the server's, when a suspended account signs in
  ACCOUNT_NOT_FOUND: "That way to sign in isn't connected",
  FAILED_TO_UNLINK_LAST_ACCOUNT: 'You need at least one way to sign in',
  INVALID: ({ field }) => INVALID[field],
  THROTTLED: 'Too many tries. Wait a moment and try again',
  TURNSTILE_FAILED: "We couldn't check that you're a person. Try again",
  PASSWORD_BREACHED: 'That password has appeared in a data breach. Choose another',
  PASSWORD_TOO_SHORT: 'Passwords need at least 10 characters',
  EMAIL_NOT_VERIFIED: 'Verify your email first. Check your inbox for the link',
  VERIFY_EMAIL: 'Check your inbox to verify your email',
  USE_RENAME: 'Use Change username to rename your account',
  SESSION_EXPIRED: 'Your session ended. Sign in again',
  INVALID_TOKEN: 'That link has expired or was already used. Ask for a new one.',   // an emailed link's
  TOKEN_EXPIRED: 'That link has expired or was already used. Ask for a new one.',
  INVALID_EMAIL_OR_PASSWORD: "That email or username and password don't match",
  INVALID_PASSWORD: "That password doesn't match",
  INVALID_USERNAME_OR_PASSWORD: "That email or username and password don't match",
  INVALID_CODE: "That code isn't right",
  INVALID_BACKUP_CODE: "That backup code isn't right, or it was already used",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'Too many wrong codes. Wait a few minutes, then sign in again',
  ACCOUNT_TEMPORARILY_LOCKED: 'Too many wrong codes. Wait a few minutes, then sign in again',
  INVALID_TWO_FACTOR_COOKIE: 'That took too long. Sign in again',
  USER_ALREADY_EXISTS: 'An account already uses that email',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'An account already uses that email',
};

export function messageFor(code, detail = {}) {
  const word = WORDS[code];
  return (typeof word === 'function' ? word(detail) : word) ?? 'Something went wrong. Try again.';
}

// Why a room's socket was turned away or kicked, in plain words: a refusal's reason, or ended,
// removed or replaced (the same account joined from another tab). A pass refused even when fresh
// (bad-pass) reads as a room that isn't there.
const ROOM_WORDS = {
  unavailable: "This room isn't available",
  'bad-pass': "This room isn't available",
  'signed-in-only': 'Signed-in users only',
  'wrong-password': 'Wrong password',
  full: 'Room is full',
  throttled: WORDS.THROTTLED,
  ended: 'The host ended the room',
  removed: 'The host removed you',
  replaced: "You're watching this room in another tab",
};

export const refusalWords = (reason) => (Object.hasOwn(ROOM_WORDS, reason) ? ROOM_WORDS[reason] : ROOM_WORDS.unavailable);

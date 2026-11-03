import { silencedWords } from './chat.js';
import { t } from '@/i18n/index.js';
import { formatMonthDay } from '@/i18n/format.js';

// The server's error codes in plain words. `detail` is the rest of the reply (problem, until).
const day = (ms) => formatMonthDay(ms);

// A code can come from a link's URL, so `constructor` isn't a word.
const own = (words, key) => (Object.hasOwn(words, key) ? words[key] : undefined);

const USERNAME = {
  length: () => t('social.errors.username.length'),
  characters: () => t('social.errors.username.characters'),
  reserved: () => t('social.errors.username.reserved'),
};

// A room the server wouldn't make: the field it refused (the others only an app bug sends).
const INVALID = {
  name: () => t('social.errors.invalidRoom.name'),
  password: () => t('social.errors.invalidRoom.password'),
  max: () => t('social.errors.invalidRoom.max'),
};

const WORDS = {
  NETWORK: () => t('social.errors.network'),
  TERMS_REQUIRED: () => t('social.errors.termsRequired'),
  USERNAME: ({ problem }) => own(USERNAME, problem)?.() ?? t('social.errors.username.generic'),
  // Sign-up's own refusals of a username: the form has already checked length and characters, so an invalid
  // one is reserved.
  INVALID_USERNAME: USERNAME.reserved,
  USERNAME_TOO_SHORT: USERNAME.length,
  USERNAME_TOO_LONG: USERNAME.length,
  INVALID_EMAIL: () => t('social.errors.invalidEmail'),
  EMAIL_RESERVED: () => t('social.errors.emailReserved'),
  EMAIL_SAME: () => t('social.errors.emailSame'),
  EMAIL_CHANGE_LIMIT: () => t('social.errors.emailChangeLimit'),
  SIGN_IN_TO_CONFIRM: () => t('social.errors.signInToConfirm'),
  NO_PASSWORD: () => t('social.errors.noPassword'),
  TAKEN: () => t('social.errors.taken'),
  USERNAME_IS_ALREADY_TAKEN: () => t('social.errors.taken'),
  TOO_SOON: ({ until }) => until ? t('social.errors.tooSoonDate', { date: day(until) }) : t('social.errors.tooSoonGeneric'),
  ONBOARDING_REQUIRED: () => t('social.errors.onboardingRequired'),
  NEEDS_ONBOARDING: () => t('social.errors.onboardingRequired'),
  SUSPENDED: ({ until }) => until ? t('social.errors.suspendedUntil', { date: day(until) }) : t('social.errors.suspendedForever'),
  BANNED_USER: () => t('social.errors.bannedUser'),   // the server's, when a suspended account signs in
  SILENCED: ({ until }) => silencedWords(until),   // the chat box's words
  ACCOUNT_NOT_FOUND: () => t('social.errors.accountNotFound'),
  FAILED_TO_UNLINK_LAST_ACCOUNT: () => t('social.errors.lastWay'),
  INVALID: ({ field }) => own(INVALID, field)?.(),
  THROTTLED: () => t('social.errors.throttled'),
  TURNSTILE_FAILED: () => t('social.errors.turnstileFailed'),
  PASSWORD_BREACHED: () => t('social.errors.passwordBreached'),
  PASSWORD_TOO_SHORT: () => t('social.errors.passwordTooShort'),
  EMAIL_NOT_VERIFIED: () => t('social.errors.emailNotVerified'),
  VERIFY_EMAIL: () => t('social.errors.verifyEmail'),
  USE_RENAME: () => t('social.errors.useRename'),
  SESSION_EXPIRED: () => t('social.errors.sessionExpired'),
  INVALID_TOKEN: () => t('social.errors.invalidToken'),   // an emailed link's
  TOKEN_EXPIRED: () => t('social.errors.invalidToken'),
  INVALID_EMAIL_OR_PASSWORD: () => t('social.errors.invalidEmailOrPassword'),
  INVALID_PASSWORD: () => t('social.errors.invalidPassword'),
  INVALID_USERNAME_OR_PASSWORD: () => t('social.errors.invalidEmailOrPassword'),
  INVALID_CODE: () => t('social.errors.invalidCode'),
  INVALID_BACKUP_CODE: () => t('social.errors.invalidBackupCode'),
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: () => t('social.errors.tooManyAttempts'),
  ACCOUNT_TEMPORARILY_LOCKED: () => t('social.errors.tooManyAttempts'),
  INVALID_TWO_FACTOR_COOKIE: () => t('social.errors.twoFactorExpired'),
  USER_ALREADY_EXISTS: () => t('social.errors.userAlreadyExists'),
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: () => t('social.errors.userAlreadyExists'),
};

export function messageFor(code, detail = {}) {
  const word = own(WORDS, code);
  return (typeof word === 'function' ? word(detail) : word) ?? t('social.errors.fallback');
}

// Why a room's socket was turned away or kicked, in plain words: a refusal's reason, or ended,
// removed or replaced (the same account joined from another tab). A pass refused even when fresh
// (bad-pass) reads as a room that isn't there.
const ROOM_WORDS = {
  unavailable: () => t('social.errors.room.unavailable'),
  'bad-pass': () => t('social.errors.room.unavailable'),
  'signed-in-only': () => t('social.errors.room.signedInOnly'),
  'wrong-password': () => t('social.errors.room.wrongPassword'),
  full: () => t('social.errors.room.full'),
  throttled: () => t('social.errors.throttled'),
  ended: () => t('social.errors.room.ended'),
  removed: () => t('social.errors.room.removed'),
  replaced: () => t('social.errors.room.replaced'),
};

export const refusalWords = (reason) => (Object.hasOwn(ROOM_WORDS, reason) ? ROOM_WORDS[reason]() : ROOM_WORDS.unavailable());

// What a host is told when the room it reloaded into is gone.
export const roomAwayWords = () => t('social.errors.roomAway');
export const ROOM_AWAY_WORDS = t('social.errors.roomAway');

// The room's host changed.
export const undoResetWords = () => t('social.errors.undoReset');
export const UNDO_RESET_WORDS = t('social.errors.undoReset');
// The stacks started over with the host still the host (a reload), or for someone who wasn't here to see why.
export const undoRestartWords = () => t('social.errors.undoRestart');
export const UNDO_RESTART_WORDS = t('social.errors.undoRestart');
export const newHostWords = ({ old, name, planned }) => t(planned ? 'social.errors.newHostPlanned' : 'social.errors.newHostLeft', { old, name });

// An undo or redo that can't be done.
export const REFUSED_WORDS = {
  get undo() { return t('social.errors.refusedUndo'); },
  get redo() { return t('social.errors.refusedRedo'); },
};

// A host cut off who's back as an artist, when the room's art replaces what they had open.
export const backAsArtistWords = (name) => t('social.errors.backAsArtist', { name });

// Going back to your room from a tab with art of its own open.
export const goingBackReplacesWords = () => t('social.errors.goingBackReplaces');
export const GOING_BACK_REPLACES_WORDS = t('social.errors.goingBackReplaces');

// The art of a room you're going back to, or that's come to you, won't open.
export const artNotOpenedWords = () => t('social.errors.artNotOpened');
export const ART_NOT_OPENED_WORDS = t('social.errors.artNotOpened');

// Going back didn't work, and that says nothing about whether the room is still there.
export const goingBackFailedWords = () => t('social.errors.goingBackFailed');
export const GOING_BACK_FAILED_WORDS = t('social.errors.goingBackFailed');

// What a host is told when another tab took its room (a copy of the tab hosts it too, and the older one is closed).
export const hostReplacedWords = () => t('social.errors.hostReplaced');
export const HOST_REPLACED_WORDS = t('social.errors.hostReplaced');

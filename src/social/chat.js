/**
 * Chat's pieces, for the host's browser and the watcher's: the text rule, a message's id and what it
 * signs, the host's kept log and its pages, and the one-a-second allowance. Chat goes browser to browser
 * (wire.js has the messages); none of it touches the server.
 */
import { toBase64url } from './base64url.js';
import { CHUNK_BYTES } from './wire.js';

export const MOST_CHARS = 300;
export const MOST_KEPT = 5000;
export const PAGE = 50;

export const clock = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });   // made once: building one per row is slow

export const dayAndTime = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const ID = /^[A-Za-z0-9_-]{16}$/;
export const isId = (id) => typeof id === 'string' && ID.test(id);

// The message as it will be sent: trimmed. Null for anything that isn't text, is empty or is too long.
export function chatText(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  return text && text.length <= MOST_CHARS ? text : null;
}

export const newId = () => toBase64url(crypto.getRandomValues(new Uint8Array(12)));

// What a message's signature covers.
export const signedText = (roomId, { id, ts, text }) => `chat:${roomId}:${id}:${ts}:${text}`;

// The last `most` messages, oldest first, found by id. A deleted one stays as { id, ts, deleted: true }.
export class ChatLog {
  constructor(most = MOST_KEPT) {
    this.most = most;
    this.list = [];
    this.ids = new Set();
  }

  add(entry) {
    if (this.ids.has(entry.id)) return false;
    this.list.push(entry);
    this.ids.add(entry.id);
    if (this.list.length > this.most) this.ids.delete(this.list.shift().id);
    return true;
  }

  delete(id) {
    const at = this.list.findIndex((m) => m.id === id);
    if (at < 0) return false;
    this.list[at] = { id, ts: this.list[at].ts, deleted: true };
    return true;
  }

  has(id) {
    return this.ids.has(id);
  }

  // The latest page, or the one before the message `before`. `more` says older ones remain.
  page(before, most = PAGE) {
    const end = before === undefined ? this.list.length : this.list.findIndex((m) => m.id === before);
    if (end < 0) return { messages: [], more: false };
    let start = Math.max(0, end - most);
    // Few long messages can still be over a chunk: drop the oldest until the reply fits.
    const size = () => new TextEncoder().encode(JSON.stringify({ t: 'history', messages: this.list.slice(start, end), more: true })).length;
    while (start < end - 1 && size() > CHUNK_BYTES) start++;
    return { messages: this.list.slice(start, end), more: start > 0 };
  }
}

// Why a person is reported, in the order the dialog lists them; the ids are what the Room takes.
export const REASONS = [
  { id: 'spam', label: 'Spam or flooding' },
  { id: 'harassment', label: 'Harassment or hate' },
  { id: 'sexual', label: 'Sexual or violent' },
  { id: 'other', label: 'Something else' },
];
export const CONTEXT = 5;   // the messages a report carries besides the one reported

// What a report carries, from the list's rows (oldest first) as each was sent: the reported message and the
// CONTEXT before it (anyone's), or without a messageId the person's last CONTEXT messages. Presence lines and
// deleted messages are skipped. Null for an id that isn't a message in the rows.
export function evidenceFor(rows, { sub, messageId = null }) {
  const messages = rows.filter((r) => !r.presence && !r.deleted);
  const kept = ({ pass, id, ts, text, sig }) => ({ pass, id, ts, text, sig });
  if (messageId === null) return messages.filter((r) => r.sub === sub).slice(-CONTEXT).map(kept);
  const at = messages.findIndex((r) => r.id === messageId);
  return at < 0 ? null : messages.slice(Math.max(0, at - CONTEXT), at + 1).map(kept);
}

// What a muted person is told: the time if it ends today, else the date too.
export function mutedWords(until, now = Date.now()) {
  const today = new Date(until).toDateString() === new Date(now).toDateString();
  return `You're muted until ${(today ? clock : dayAndTime).format(until)}.`;
}

// A bucket of `most`, refilled one every `everyMs`: take() says whether there's one to spend. The level is
// counted in milliseconds (a message costs everyMs), so there are no fractions to round.
export class Allowance {
  constructor(most = 3, everyMs = 1000) {
    this.cap = most * everyMs;
    this.cost = everyMs;
    this.level = this.cap;
    this.at = null;
  }

  take(now = Date.now()) {
    if (this.at !== null) this.level = Math.min(this.cap, this.level + Math.max(0, now - this.at));
    this.at = now;
    if (this.level < this.cost) return false;
    this.level -= this.cost;
    return true;
  }
}

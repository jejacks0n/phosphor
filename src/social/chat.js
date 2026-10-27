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

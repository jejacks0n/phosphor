// The lobby: the rooms and people the server reports, kept by a reducer over its messages
// (the server's API), and the websocket that says hello with a pass and reconnects.
import { proof } from './keys.js';

const FIRST_RETRY_MS = 1000;
const LAST_RETRY_MS = 30_000;
const LIVE_WITHIN_MS = 10_000;   // of the greeting
const PING_EVERY_MS = 30_000;
const PONG_WITHIN_MS = 10_000;

export function emptyLobby() {
  return { rooms: new Map(), people: new Map() };
}

const without = (map, key) => {
  const copy = new Map(map);
  copy.delete(key);
  return copy;
};

// The lobby after one server message: a new object when it changed (never mutated), the same one when
// it didn't. A state replaces everything, so nothing from before a reconnect is kept.
export function applyLobbyMessage(lobby, msg) {
  switch (msg.type) {
    case 'state':
      return { rooms: new Map(msg.rooms.map((r) => [r.id, r])), people: new Map(msg.people.map((p) => [p.sub, p])) };
    case 'room':
      return { ...lobby, rooms: new Map(lobby.rooms).set(msg.room.id, msg.room) };
    case 'room-gone':
      return lobby.rooms.has(msg.id) ? { ...lobby, rooms: without(lobby.rooms, msg.id) } : lobby;
    case 'person':
      return { ...lobby, people: new Map(lobby.people).set(msg.person.sub, msg.person) };
    case 'person-gone':
      return lobby.people.has(msg.sub) ? { ...lobby, people: without(lobby.people, msg.sub) } : lobby;
    default:
      return lobby;
  }
}

// Most watchers first, then the newest.
export function sortedRooms(lobby) {
  return [...lobby.rooms.values()].sort((a, b) => b.count - a.count || b.liveSince - a.liveSince);
}

// You first, then members, then guests, each by name.
export function sortedPeople(lobby, mySub) {
  const rank = (p) => (p.sub === mySub ? 0 : p.guest ? 2 : 1);
  return [...lobby.people.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

// The Join button: its label, and why it's disabled (a full room says so even when it's members only).
export function joinState(room, { signedIn }) {
  const reason = room.count >= room.max ? 'Room is full'
    : !signedIn && !room.allowGuests ? 'Signed-in users only'
      : null;
  return { enabled: !reason, label: `Join ${room.count}/${room.max}`, reason };
}

// A signal as the lobby says it.
export const signalWords = { feedback: 'Wants feedback', chat: 'Open to chat', 'heads-down': 'Heads down' };
export const signalWord = (signal) => (Object.hasOwn(signalWords, signal ?? '') ? signalWords[signal] : null);

// A card's picture as an image: a JPEG (from a browser that can't make WebP) starts /9j/, else it's WebP.
export const pictureUrl = (base64) => `data:image/${base64.startsWith('/9j/') ? 'jpeg' : 'webp'};base64,${base64}`;

// How long a room has been live: "live 42 min", then "live 1 hr 15 min".
export function liveFor(liveSince, now = Date.now()) {
  const min = Math.max(0, Math.floor((now - liveSince) / 60_000));
  return min < 60 ? `live ${min} min` : `live ${Math.floor(min / 60)} hr ${min % 60} min`;
}

// Sends at most one value per interval: a change goes at once if the interval has passed, else the
// latest waits for it. A value equal to the last one sent isn't sent again; a value sendFn didn't send
// (it returns false: the connection isn't live) doesn't count as sent.
export class Pacer {
  constructor(intervalMs, sendFn, now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id)) {
    Object.assign(this, { intervalMs, sendFn, now, setTimer, clearTimer, timer: null });
    this.reset();
  }

  push(value) {
    this.latest = value;
    if (this.timer) return;
    const wait = this.sentAt + this.intervalMs - this.now();
    if (wait <= 0) this.flush();
    else this.timer = this.setTimer(() => { this.timer = null; this.flush(); }, wait);
  }

  flush() {
    if (this.latest === this.sent) return;
    if (this.sendFn(this.latest)) Object.assign(this, { sent: this.latest, sentAt: this.now() });
  }

  // Drops what's waiting and forgets what was sent: for a new socket, which starts over.
  reset() {
    if (this.timer) this.clearTimer(this.timer);
    Object.assign(this, { latest: undefined, sent: undefined, sentAt: -Infinity, timer: null });
  }
}

// The lobby's websocket, which a room's socket is too. Every socket starts with a greeting: by default a
// hello (a pass from getPass, asked each time so a renewed one is used, and a proof over lobby:<ts>);
// a room gives its own `greet(pass, privateKey)`. A message in `liveOn` (the lobby's state) makes it
// live. A drop retries after 1 s, doubling to 30 s, until it's live; a message in `endOn` stops it, for
// good, after it goes to onMessage ('refused' for a refused, 'closed' for any other), and so does a close
// whose reason is in `endOn` (the server says why it closed a socket it sent no message on). A socket can go
// without a close (a laptop asleep, a dead Wi-Fi), so a quiet one counts as a drop: nothing in `liveOn`
// within 10 s of the greeting, or no "pong" within 10 s of the "ping" sent every 30 s while live.
// Status goes to onStatus: 'connecting', 'live', 'reconnecting', 'refused' or 'closed'.
export class LobbyConnection {
  constructor({
    url, getPass, onMessage, onStatus, WebSocketImpl = WebSocket,
    greet = async (pass, privateKey) => ({ type: 'hello', pass, ...await proof(privateKey, (ts) => `lobby:${ts}`) }),
    liveOn = ['state'], endOn = ['refused'],
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id),
  }) {
    Object.assign(this, { url, getPass, onMessage, onStatus, WebSocketImpl, greet, liveOn, endOn, wait, setTimer, clearTimer });
    this.status = null;
    this.socket = null;
    this.timer = null;   // the current socket's heartbeat: waiting to be live, its next ping, or its pong
    this.retryMs = FIRST_RETRY_MS;
    this.run = 0;   // bumped by open() and close(), so a retry waiting from before either is dropped
  }

  // Opening again (a new pass) closes the old socket first, so its hello'd visitor leaves the lobby.
  open() {
    this.detach()?.close();
    this.run++;
    this.retryMs = FIRST_RETRY_MS;
    this.setStatus('connecting');
    this.connect();
  }

  // Closes the socket and stops retrying; anything the old socket says after is ignored.
  close() {
    const socket = this.detach();
    this.run++;
    this.setStatus('closed');
    socket?.close();
  }

  // The socket, no longer current: whatever it says or does after is ignored, and its heartbeat stops.
  detach() {
    const socket = this.socket;
    this.socket = null;
    this.after(null);
    return socket;
  }

  // The heartbeat's one timer: fn in ms, in place of whatever was waiting (nothing, for null).
  after(ms, fn) {
    if (this.timer) this.clearTimer(this.timer);
    this.timer = fn ? this.setTimer(fn, ms) : null;
  }

  // Sent only while live (a message before the state would go before the hello's answer); true if sent.
  send(msg) {
    if (this.status !== 'live') return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  }

  setStatus(status) {
    if (status === this.status) return;
    this.status = status;
    this.onStatus?.(status);
  }

  connect() {
    let socket;
    try {
      socket = new this.WebSocketImpl(this.url);
    } catch {
      this.retry();   // a socket that can't be made is retried like a drop
      return;
    }
    this.socket = socket;
    const current = () => socket === this.socket;
    // Closed without waiting for the close (on a dead network it can take minutes), and retried.
    const quiet = () => {
      if (!current()) return;
      this.detach();
      socket.close();
      this.retry();
    };
    // The deadline goes first: a pong can come back before send() returns.
    const ping = () => {
      if (!current()) return;
      this.after(PONG_WITHIN_MS, quiet);
      socket.send('ping');
    };
    const end = (msg) => {
      this.detach();
      try {
        this.onMessage?.(msg);
      } finally {   // ended even when the handler throws
        this.setStatus(msg.type === 'refused' ? 'refused' : 'closed');
        socket.close();
      }
    };
    socket.onopen = async () => {
      try {
        const { pass, privateKey } = await this.getPass();
        const greeting = await this.greet(pass, privateKey);
        if (!current()) return;
        socket.send(JSON.stringify(greeting));
        this.after(LIVE_WITHIN_MS, quiet);
      } catch {
        if (current()) socket.close();   // no pass to give: retry as after a drop
      }
    };
    socket.onmessage = (event) => {
      if (!current()) return;
      if (event.data === 'pong') {   // the server's answer to a ping: plain text, not JSON
        this.after(PING_EVERY_MS, ping);
        return;
      }
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (typeof msg?.type !== 'string') return;
      if (this.endOn.includes(msg.type)) {
        end(msg);
        return;
      }
      if (this.liveOn.includes(msg.type)) {
        this.retryMs = FIRST_RETRY_MS;
        this.after(PING_EVERY_MS, ping);
        this.setStatus('live');
      }
      this.onMessage?.(msg);
    };
    socket.onclose = (event) => {
      if (!current()) return;
      if (this.endOn.includes(event.reason)) end({ type: event.reason });
      else this.retry();
    };
  }

  async retry() {
    this.detach();
    const run = this.run;   // before onStatus hears, which may close it
    this.setStatus('reconnecting');
    const waitMs = this.retryMs;
    this.retryMs = Math.min(waitMs * 2, LAST_RETRY_MS);
    await this.wait(waitMs);
    if (run === this.run) this.connect();
  }
}

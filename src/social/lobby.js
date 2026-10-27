// The lobby: the rooms and people the server's Lobby reports, kept by a reducer over its messages
// (the server's API), and the websocket that says hello with a pass and reconnects.
import { proof } from './keys.js';

const FIRST_RETRY_MS = 1000;
const LAST_RETRY_MS = 30_000;

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

  // Drops what's waiting and forgets what was sent: for a new socket, whose signal starts over.
  reset() {
    if (this.timer) this.clearTimer(this.timer);
    Object.assign(this, { latest: undefined, sent: undefined, sentAt: -Infinity, timer: null });
  }
}

// The lobby's websocket. Every socket starts with a hello (a pass from getPass, asked each time so a
// renewed one is used, and a proof over lobby:<ts>); the server's state makes it live. A drop retries
// after 1 s, doubling to 30 s, until a state comes; a refused pass stops it. Status goes to onStatus:
// 'connecting', 'live', 'reconnecting', 'refused' or 'closed'.
export class LobbyConnection {
  constructor({ url, getPass, onMessage, onStatus, WebSocketImpl = WebSocket, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
    Object.assign(this, { url, getPass, onMessage, onStatus, WebSocketImpl, wait });
    this.status = null;
    this.socket = null;
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

  // The socket, no longer current: whatever it says or does after is ignored.
  detach() {
    const socket = this.socket;
    this.socket = null;
    return socket;
  }

  // Sent only while live (a signal before the state would go before the hello's answer); true if sent.
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
    socket.onopen = async () => {
      try {
        const { pass, privateKey } = await this.getPass();
        const signed = await proof(privateKey, (ts) => `lobby:${ts}`);
        if (current()) socket.send(JSON.stringify({ type: 'hello', pass, ...signed }));
      } catch {
        if (current()) socket.close();   // no pass to give: retry as after a drop
      }
    };
    socket.onmessage = (event) => {
      if (!current()) return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (typeof msg?.type !== 'string') return;
      if (msg.type === 'refused') {
        this.detach();
        this.setStatus('refused');
        socket.close();
        return;
      }
      if (msg.type === 'state') {
        this.retryMs = FIRST_RETRY_MS;
        this.setStatus('live');
      }
      this.onMessage?.(msg);
    };
    socket.onclose = () => {
      if (current()) this.retry();
    };
  }

  async retry() {
    this.socket = null;
    this.setStatus('reconnecting');
    const run = this.run;
    const waitMs = this.retryMs;
    this.retryMs = Math.min(waitMs * 2, LAST_RETRY_MS);
    await this.wait(waitMs);
    if (run === this.run) this.connect();
  }
}

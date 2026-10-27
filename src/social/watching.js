// The watcher's side of a room: the connection the host offers (peer.js), and the art put back together
// from what comes over its channel (wire.js has the messages). The host is a stranger, so anything that
// doesn't fit (a snapshot too big or of the wrong size, a color or cell that isn't there, a room or view
// that isn't as the host's side sends it) is ignored, and however fast it sends, the art goes to onArt
// at most once a frame. States go to onState: 'connecting', 'live', then 'failed' if it never opened or
// 'lost' if it closed after. Chat comes the same way, and goes to onChat only as its sender sent it: a
// verified member's pass the server signed, and their signature over the message for this room, so a
// host can't put words in anyone's mouth.
import { openPeer } from './peer.js';
import { verifyPass } from './pass.js';
import { verifySignature } from './keys.js';
import { PAGE, chatText, isId, signedText } from './chat.js';
import { CHUNK_BYTES, MOST_SNAPSHOT_CHUNKS, decodeCells, unpackSnapshot } from './wire.js';

const MOST_NAME = 60;       // a room's name
const MOST_WELCOME = 200;

// A string, cut to most characters; null for anything else.
const text = (value, most) => (typeof value === 'string' ? value.slice(0, most) : null);
const place = (n) => Number.isInteger(n) && n >= 0;

export class Watch {
  constructor({ send, config, connectWithinMs, roomId, passKey, onRoom, onArt, onView, onState, onChat = () => {} }) {
    Object.assign(this, { send, config, connectWithinMs, roomId, passKey, onRoom, onArt, onView, onState, onChat });
    this.conn = null;
    this.channel = null;
    this.following = true;
    this.frame = null;   // the next frame's onArt, once asked for
  }

  // An offer starts a fresh connection, dropping any before; the rest goes to the current one.
  signalFrom(from, data) {
    if (from !== 'host') return;
    if (data?.sdp?.type === 'offer') this.connect();
    this.conn?.signal(data);
  }

  setFollowing(on) {
    this.following = on;
    this.post({ t: 'following', on });
  }

  // The watcher's own message, already signed. It shows when the host sends it back to everyone.
  say({ id, ts, text, sig }) {
    return this.post({ t: 'chat', id, ts, text, sig });
  }

  // The page before the oldest message the watcher has.
  earlier(before) {
    return this.post({ t: 'earlier', before });
  }

  // A message to the host; false when there's no open channel to send it on.
  post(msg) {
    if (this.channel?.readyState !== 'open') return false;
    try {
      this.channel.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  close() {
    const conn = this.conn;
    this.conn = this.channel = null;
    cancelAnimationFrame(this.frame);
    this.frame = null;
    conn?.close();
  }

  connect() {
    this.close();
    this.art = null;          // changes count only after this connection's first snapshot
    this.gathering = null;    // { want, chunks }: a snapshot's chunks as they come
    this.heard = Promise.resolve();   // messages are handled one at a time, in order
    this.passes = new Map();   // pass -> its claims: good ones only, checked once a connection
    this.histories = 0;
    const conn = this.conn = openPeer({
      initiator: false, config: this.config, connectWithinMs: this.connectWithinMs,
      sendSignal: (data) => this.send({ type: 'signal-to', to: 'host', data }),
      onOpen: (channel) => {
        this.channel = channel;
        channel.onmessage = ({ data }) => {
          this.heard = this.heard.then(() => this.conn === conn && this.handle(data)).catch(() => {});   // junk is ignored
        };
        this.onState('live');
        if (!this.following) this.setFollowing(false);
      },
      onClose: ({ failed }) => {
        if (this.conn !== conn) return;   // closed here
        this.conn = this.channel = null;
        this.onState(failed ? 'failed' : 'lost');
      },
    });
    this.onState('connecting');
  }

  async handle(data) {
    if (typeof data !== 'string') {
      const snapshot = this.gathering;
      if (!snapshot) return;
      if (data.byteLength > CHUNK_BYTES) {   // the whole snapshot goes
        this.gathering = null;
        return;
      }
      snapshot.chunks.push(data);
      if (snapshot.chunks.length < snapshot.want) return;
      this.gathering = null;
      this.art = await unpackSnapshot(snapshot.chunks);
      this.show();
      return;
    }
    const msg = JSON.parse(data);
    if (msg.t === 'room') this.room(msg);
    else if (msg.t === 'view') this.view(msg);
    else if (msg.t === 'snapshot') {
      const want = msg.chunks;
      this.gathering = Number.isInteger(want) && want >= 1 && want <= MOST_SNAPSHOT_CHUNKS ? { want, chunks: [] } : null;
    } else if (msg.t === 'cells' && this.art) this.change(msg);
    else if (msg.t === 'chat') await this.chat(msg);
    else if (msg.t === 'history') await this.history(msg);
    else if (msg.t === 'deleted' && isId(msg.id)) this.onChat({ type: 'deleted', id: msg.id });
    else if (msg.t === 'chat-no' && isId(msg.id) && msg.reason === 'too-fast') this.onChat({ type: 'refused', id: msg.id, reason: msg.reason });
  }

  async chat(msg) {
    const conn = this.conn;
    const checked = await this.checked(msg);
    if (checked && this.conn === conn) this.onChat({ type: 'chat', ...checked });
  }

  // A page of messages, oldest first: those that check out, and those deleted; the rest are left out.
  // The first on a connection is the latest page, and any after answer earlier().
  async history({ messages, more }) {
    if (!Array.isArray(messages) || messages.length > PAGE || typeof more !== 'boolean') return;
    const conn = this.conn;
    const shown = [];
    for (const m of messages) {
      if (m?.deleted === true) {
        if (isId(m.id) && Number.isFinite(m.ts)) shown.push({ id: m.id, ts: m.ts, deleted: true });
      } else {
        const checked = await this.checked(m);
        if (checked) shown.push(checked);
      }
    }
    if (this.conn !== conn) return;
    this.onChat({ type: 'history', messages: shown, more, earlier: this.histories++ > 0 });
  }

  // { entry, claims } for a message its sender sent: a verified member's pass, text as the composer
  // sends it, and their signature over it for this room. Null for anything else.
  async checked(m) {
    const { pass, id, ts, text, sig } = m ?? {};
    if (typeof pass !== 'string' || !isId(id) || !Number.isFinite(ts) || chatText(text) !== text || typeof sig !== 'string') return null;
    const claims = await this.claimsOf(pass);
    if (!claims || claims.guest || claims.verified !== true) return null;
    if (!await verifySignature(claims.key, signedText(this.roomId, { id, ts, text }), sig)) return null;
    return { entry: { pass, id, ts, text, sig }, claims };
  }

  // A pass's claims if the server signed it. Its expiry isn't held against it: a message keeps the pass
  // it was sent with, and a pass lasts an hour while a room's chat lasts as long as the room. Only a good
  // pass is kept, so a host sending junk can't make the list grow; a bad one is checked each time.
  async claimsOf(pass) {
    let claims = this.passes.get(pass);
    if (claims) return claims;
    try {
      claims = await verifyPass(pass, await this.passKey(), 0);
    } catch {
      return null;   // no key to check with
    }
    if (claims) this.passes.set(pass, claims);
    return claims;
  }

  // Who hosts it is the Room's word (joined), never the host's.
  room(msg) {
    const room = { name: text(msg.name, MOST_NAME), welcome: text(msg.welcome, MOST_WELCOME) };
    if (room.name !== null && room.welcome !== null) this.onRoom(room);
  }

  view({ col, row, cols, rows }) {
    if ([col, row, cols, rows].every(place)) this.onView({ col, row, cols, rows });
  }

  // The changed cells into the art, a copy of it once it's been given (the art given is never changed).
  change({ at, colors, cells }) {
    const changed = decodeCells({ colors, cells });
    const count = this.art.cells.length;
    if (!Array.isArray(at) || at.length !== changed.length || !at.every((i) => Number.isInteger(i) && i >= 0 && i < count)) return;
    if (this.given === this.art) this.art = { ...this.art, cells: this.art.cells.slice() };
    at.forEach((i, k) => { this.art.cells[i] = changed[k]; });
    this.show();
  }

  // The art to onArt at the next frame: every message before it goes as one.
  show() {
    this.frame ??= requestAnimationFrame(() => {
      this.frame = null;
      this.given = this.art;
      this.onArt(this.art);
    });
  }
}

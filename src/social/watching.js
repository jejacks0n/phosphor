// The watcher's side of a room: the connection the host offers (peer.js), and the art put back together
// from what comes over its channel (wire.js has the messages). The host is a stranger, so anything that
// doesn't fit (a snapshot too big or of the wrong size, a color or cell that isn't there, a room or view
// that isn't as the host's side sends it) is ignored, and however fast it sends, the art goes to onArt
// at most once a frame. States go to onState: 'connecting', 'live', then 'failed' if it never opened or
// 'lost' if it closed after.
import { openPeer } from './peer.js';
import { CHUNK_BYTES, MOST_SNAPSHOT_CHUNKS, decodeCells, unpackSnapshot } from './wire.js';

const MOST_NAME = 60;       // a room's name
const MOST_WELCOME = 200;

// A string, cut to most characters; null for anything else.
const text = (value, most) => (typeof value === 'string' ? value.slice(0, most) : null);
const place = (n) => Number.isInteger(n) && n >= 0;

export class Watch {
  constructor({ send, config, connectWithinMs, onRoom, onArt, onView, onState }) {
    Object.assign(this, { send, config, connectWithinMs, onRoom, onArt, onView, onState });
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
    if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify({ t: 'following', on }));
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

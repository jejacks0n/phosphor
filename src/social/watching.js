// The watcher's side of a room: the connection the host offers (peer.js), and the art put back together
// from what comes over its channel (wire.js has the messages). The host is a stranger, so anything that
// doesn't fit (a snapshot of the wrong size, a color or cell that isn't there) is ignored. States go to
// onState: 'connecting', 'live', then 'failed' if it never opened or 'lost' if it closed after.
import { openPeer } from './peer.js';
import { decodeCells, unpackSnapshot } from './wire.js';

export class Watch {
  constructor({ send, config, connectWithinMs, onRoom, onArt, onView, onState }) {
    Object.assign(this, { send, config, connectWithinMs, onRoom, onArt, onView, onState });
    this.conn = null;
    this.channel = null;
    this.following = true;
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
      snapshot.chunks.push(data);
      if (snapshot.chunks.length < snapshot.want) return;
      this.gathering = null;
      const art = await unpackSnapshot(snapshot.chunks);
      if (!Number.isInteger(art.cols) || !Number.isInteger(art.lines) || art.cells.length !== art.cols * art.lines) return;
      this.art = art;
      this.onArt(art);
      return;
    }
    const msg = JSON.parse(data);
    if (msg.t === 'room') this.onRoom({ name: msg.name, welcome: msg.welcome, host: msg.host });
    else if (msg.t === 'view') this.onView({ col: msg.col, row: msg.row, cols: msg.cols, rows: msg.rows });
    else if (msg.t === 'snapshot' && msg.chunks > 0) this.gathering = { want: msg.chunks, chunks: [] };
    else if (msg.t === 'cells' && this.art) this.change(msg);
  }

  // The changed cells into a copy of the art (the art already given isn't changed).
  change({ at, colors, cells }) {
    const changed = decodeCells({ colors, cells });
    const count = this.art.cells.length;
    if (!Array.isArray(at) || at.length !== changed.length || !at.every((i) => Number.isInteger(i) && i >= 0 && i < count)) return;
    const next = this.art.cells.slice();
    at.forEach((i, k) => { next[i] = changed[k]; });
    this.art = { ...this.art, cells: next };
    this.onArt(this.art);
  }
}

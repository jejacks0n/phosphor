// The host's side of a room: a connection to each watcher (peer.js), made only for a pass the server
// signed, and what each watcher is sent over its channel (wire.js has the messages): the room, a
// snapshot, then the changes as the art changes, and the part the host is looking at. The Room's socket
// carries the signals and hears when a watcher's connection ends (send). Chat goes through the host
// too (chat.js has its pieces): a watcher's message goes on to everyone only if it's theirs to send,
// signed by the key in their pass, and the host keeps the last of them for anyone who joins later.
import { openPeer } from './peer.js';
import { verifyPass } from './pass.js';
import { verifySignature } from './keys.js';
import { Allowance, ChatLog, chatText, isId, signedText } from './chat.js';
import { CHUNK_BYTES, changedCells, encodeCells, packSnapshot } from './wire.js';

const BACKED_UP_BYTES = 8 * 1024 * 1024;   // a channel further behind than this is sent no art until it drains
const DRAINED_BYTES = 1024 * 1024;           // to this, and then gets one fresh snapshot
const MOST_HEARD_BYTES = 2048;               // a watcher's message longer than this is ignored
const MOST_SKEW_MS = 120_000;                // a chat message's time, from the host's clock
const EARLIER_EVERY_MS = 500;                // a watcher's asks for earlier messages, at most
const MOST_CHECKING = 4;                     // a watcher's chat waiting to be checked; more is ignored

const sameView = (a, b) => a.col === b.col && a.row === b.row && a.cols === b.cols && a.rows === b.rows;

// The indexes that changed from one art to the next; null when a snapshot should go instead (nothing to
// change from, another size or font, or too much changed).
function changesFrom(prev, next) {
  if (!prev || prev.cols !== next.cols || prev.lines !== next.lines
    || prev.font?.id !== next.font?.id || prev.font?.size !== next.font?.size) return null;
  return changedCells(prev.cells, next.cells);
}

// The changed cells as one message; null when it's past CHUNK_BYTES (a channel takes 256 KB at most),
// and a snapshot goes instead.
function cellsMessage(art, at) {
  const message = JSON.stringify({ t: 'cells', at, ...encodeCells(at.map((i) => art.cells[i])) });
  return new TextEncoder().encode(message).length > CHUNK_BYTES ? null : message;
}

export class Host {
  constructor({ send, passKey, config, connectWithinMs, roomId, onWatchers = () => {}, onChat = () => {} }) {
    Object.assign(this, { send, passKey, config, connectWithinMs, roomId, onWatchers, onChat });
    // peer -> { peer, pass, claims, following, conn, channel, has (the art it has), packing, behind,
    // allowance, heard (its chat, checked one at a time), checking (how many wait), askedAt (its last ask
    // for earlier messages) }
    this.watchers = new Map();
    this.log = new ChatLog();
    this.room = null;
    this.art = null;
    this.view = null;
    this.packed = null;   // { art, chunks }: one snapshot for every watcher, packed again only for new art
  }

  // A watcher the Room let in. A pass that doesn't check out (or no key to check it with), or a
  // connection the browser won't make, is sent back as left, and nothing else happens; a good one gets
  // a connection, and once it opens, the room.
  async peer(peer, pass) {
    this.drop(peer);
    const w = {
      peer, pass, claims: null, following: true, conn: null, channel: null, has: null, packing: false, behind: false,
      allowance: new Allowance(), heard: Promise.resolve(), checking: 0, askedAt: -Infinity,
    };
    this.watchers.set(peer, w);
    let claims = null;
    try {
      claims = await verifyPass(pass, await this.passKey());
    } catch { /* no key, so no way to trust the pass */ }
    if (this.watchers.get(peer) !== w) return;   // gone, or met again, meanwhile
    w.claims = claims;
    try {
      if (claims) {
        w.conn = openPeer({
          initiator: true, config: this.config, connectWithinMs: this.connectWithinMs,
          sendSignal: (data) => this.send({ type: 'signal-to', to: peer, data }),
          onOpen: (channel) => this.opened(w, channel),
          onClose: () => {
            if (this.watchers.get(peer) !== w) return;   // closed here on purpose
            this.watchers.delete(peer);
            this.send({ type: 'left', peer });
            this.changed();
          },
        });
      }
    } catch { /* the browser won't make one (too many already): as if the pass hadn't checked out */ }
    if (!w.conn) {
      this.watchers.delete(peer);
      this.send({ type: 'left', peer });
      return;
    }
    this.changed();
  }

  // The host's socket (re)connected and the Room listed who's inside: those connected keep their
  // connections, anyone not listed is closed, and the rest are met, again for a connection still being
  // made (its signals may have been lost while the socket was down).
  async hosting(peers) {
    const listed = new Set(peers.map((p) => p.peer));
    for (const peer of [...this.watchers.keys()]) if (!listed.has(peer)) this.peerGone(peer);
    const meeting = (w) => !w || (w.conn && !w.channel);
    await Promise.all(peers.filter((p) => meeting(this.watchers.get(p.peer))).map((p) => this.peer(p.peer, p.pass)));
  }

  peerGone(peer) {
    if (this.drop(peer)) this.changed();
  }

  signalFrom(from, data) {
    this.watchers.get(from)?.conn?.signal(data);
  }

  setRoom({ name, welcome }) {
    this.room = { name, welcome };
    for (const w of this.open()) this.sendTo(w, { t: 'room', ...this.room });
  }

  // Watchers up to date get the changed cells (one message for them all), or a snapshot when too much
  // changed or the cells won't fit one message; anyone behind is brought up to this art when their
  // snapshot goes.
  setArt({ cells, cols, lines, font }) {
    const prev = this.art;
    const next = { cells, cols, lines, font };
    const at = changesFrom(prev, next);
    if (at?.length === 0) return;
    this.art = next;
    const changes = at && cellsMessage(next, at);
    for (const w of this.open()) {
      if (w.has !== prev || w.behind) this.update(w);
      else if (changes) this.sendArt(w, changes, next);
      else this.update(w, null);   // too much changed, or too big as cells: the snapshot
    }
  }

  setView({ col, row, cols, rows }) {
    const view = { col, row, cols, rows };
    if (this.view && sameView(this.view, view)) return;
    this.view = view;
    for (const w of this.open()) this.sendTo(w, { t: 'view', ...view });
  }

  // A message for everyone, the sender too (their echo): the host's own, already signed, or a
  // watcher's that checked out. Kept, unless its id is already.
  say({ pass, id, ts, text, sig }) {
    const entry = { pass, id, ts, text, sig };
    if (!this.log.add(entry)) return false;
    this.onChat({ type: 'chat', entry });
    for (const w of this.open()) this.sendTo(w, { t: 'chat', ...entry });
    return true;
  }

  // The host's Delete: the message stays in the log as deleted, and every watcher hears.
  deleteMessage(id) {
    if (!this.log.delete(id)) return false;
    this.onChat({ type: 'deleted', id });
    for (const w of this.open()) this.sendTo(w, { t: 'deleted', id });
    return true;
  }

  // The host's Remove: the Room puts the watcher out, and its connection closes here.
  remove(peer) {
    this.send({ type: 'remove', peer });
    this.peerGone(peer);
  }

  close() {
    for (const peer of [...this.watchers.keys()]) this.drop(peer);
  }

  // Closes a watcher's connection without telling the Room (it knows already, or is the one closing).
  drop(peer) {
    const w = this.watchers.get(peer);
    if (!w) return false;
    this.watchers.delete(peer);
    w.conn?.close();
    return true;
  }

  changed() {
    this.onWatchers([...this.watchers.values()].filter((w) => w.claims).map((w) => ({
      peer: w.peer, sub: w.claims.sub, name: w.claims.name, guest: w.claims.guest, following: w.following, connected: !!w.channel,
    })));
  }

  open() {
    return [...this.watchers.values()].filter((w) => w.channel?.readyState === 'open');
  }

  // The room, then the latest messages, then the art, then the view.
  async opened(w, channel) {
    w.channel = channel;
    channel.bufferedAmountLowThreshold = DRAINED_BYTES;
    channel.onbufferedamountlow = () => {
      if (!w.behind) return;
      w.behind = false;
      w.has = null;
      this.update(w);
    };
    channel.onmessage = ({ data }) => this.heard(w, data);
    this.changed();
    if (this.room) this.sendTo(w, { t: 'room', ...this.room });
    this.sendTo(w, { t: 'history', ...this.log.page() });
    await this.update(w);
    if (this.view && this.watchers.get(w.peer) === w && channel.readyState === 'open') this.sendTo(w, { t: 'view', ...this.view });
  }

  heard(w, data) {
    if (typeof data !== 'string' || data.length > MOST_HEARD_BYTES) return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg?.t === 'following') this.follow(w, msg.on);
    else if (msg?.t === 'chat') this.check(w, msg);
    else if (msg?.t === 'earlier') this.earlier(w, msg.before);
  }

  follow(w, on) {
    if (typeof on !== 'boolean' || on === w.following) return;
    w.following = on;
    this.changed();
  }

  // A watcher's chat in line to be checked. Bad messages don't spend the allowance, so it's the line
  // that's capped: past MOST_CHECKING waiting, one is ignored, and junk can't keep the host verifying.
  check(w, msg) {
    if (w.checking >= MOST_CHECKING) return;
    w.checking++;
    w.heard = w.heard.then(() => this.chat(w, msg)).catch(() => {}).finally(() => { w.checking--; });
  }

  // A watcher's message goes on only from a verified member, with text as the composer sends it, a
  // time near the host's, a new id and their own signature over it for this room; anything else is
  // dropped without a word. Past their allowance, they're told it was too fast.
  async chat(w, { id, ts, text, sig }) {
    const claims = w.claims;
    if (!claims || claims.guest || claims.verified !== true || !isId(id) || !Number.isFinite(ts)
      || Math.abs(ts - Date.now()) > MOST_SKEW_MS || chatText(text) !== text || typeof sig !== 'string') return;
    if (!await verifySignature(claims.key, signedText(this.roomId, { id, ts, text }), sig)) return;
    if (this.watchers.get(w.peer) !== w || this.log.has(id)) return;
    if (!w.allowance.take()) this.sendTo(w, { t: 'chat-no', id, reason: 'too-fast' });
    else this.say({ pass: w.pass, id, ts, text, sig });
  }

  // The page before a watcher's oldest message: at most one every EARLIER_EVERY_MS, sooner is ignored.
  earlier(w, before) {
    const now = Date.now();
    if (!isId(before) || now - w.askedAt < EARLIER_EVERY_MS) return;
    w.askedAt = now;
    this.sendTo(w, { t: 'history', ...this.log.page(before) });
  }

  sendTo(w, msg) {
    this.put(w, JSON.stringify(msg));
  }

  // One message down a watcher's channel. A channel that refuses it (closing, or a message too big)
  // ends that watcher's connection, and the Room hears it left. True when sent.
  put(w, data) {
    try {
      w.channel.send(data);
      return true;
    } catch {
      w.conn.close();
      return false;
    }
  }

  // Art to a watcher, unless its channel is backed up: then it's marked, and sent nothing more until
  // it drains. True when sent.
  sendArt(w, message, art) {
    if (w.channel.bufferedAmount > BACKED_UP_BYTES) {
      w.behind = true;
      return false;
    }
    const sent = Array.isArray(message)
      ? this.put(w, JSON.stringify({ t: 'snapshot', chunks: message.length })) && message.every((chunk) => this.put(w, chunk))
      : this.put(w, message);
    if (sent) w.has = art;
    return sent;
  }

  // Brings a watcher to the current art: the changes since what it has (`at`, null for none that will
  // do), or else the shared snapshot. A snapshot that fails to pack isn't kept, and the watcher waits
  // for the next art.
  async update(w, at = this.art && changesFrom(w.has, this.art)) {
    if (!this.art || w.packing || w.behind || at?.length === 0) return;
    const changes = at && cellsMessage(this.art, at);
    if (changes) {
      this.sendArt(w, changes, this.art);
      return;
    }
    const art = this.art;
    if (this.packed?.art !== art) this.packed = { art, chunks: packSnapshot(art) };
    const packed = this.packed;
    let chunks;
    w.packing = true;
    try {
      chunks = await packed.chunks;
    } catch {
      if (this.packed === packed) this.packed = null;
      return;
    } finally {
      w.packing = false;
    }
    if (this.watchers.get(w.peer) !== w || w.channel.readyState !== 'open') return;
    if (this.sendArt(w, chunks, art) && art !== this.art) this.update(w);   // it changed while packing
  }
}

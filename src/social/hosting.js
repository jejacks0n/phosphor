// The host's side of a room: a connection to each watcher (peer.js), made only for a pass the server
// signed, and what each watcher is sent over its channel (wire.js has the messages): the room, a
// snapshot, then the changes as the art changes, and the part the host is looking at. The server's socket
// carries the signals and hears when a watcher's connection ends (send). Chat goes through the host
// too (chat.js has its pieces): a watcher's message goes on to everyone only if it's theirs to send,
// signed by the key in their pass, and the host keeps the last of them for anyone who joins later,
// with who came and went among them.
import { openPeer } from './peer.js';
import { verifyPass } from './pass.js';
import { verifySignature } from './keys.js';
import { Allowance, ChatLog, chatText, isId, newId, signedText } from './chat.js';
import { CHUNK_BYTES, changedCells, encodeCells, packSnapshot } from './wire.js';

const BACKED_UP_BYTES = 8 * 1024 * 1024;   // a channel further behind than this is sent no art until it drains
const DRAINED_BYTES = 1024 * 1024;           // to this, and then gets one fresh snapshot
const MOST_HEARD_BYTES = 2048;               // a watcher's message longer than this is ignored
const MOST_SKEW_MS = 120_000;                // a chat message's time, from the host's clock
const EARLIER_EVERY_MS = 500;                // a watcher's asks for earlier messages, at most
const MOST_CHECKING = 4;                     // a watcher's chat waiting to be checked; more is ignored
const TRACKING_EVERY_MS = 250;              // who's here is redrawn for tracking toggles at most this often

const sameView = (a, b) => a.col === b.col && a.row === b.row && a.cols === b.cols && a.rows === b.rows && a.zoom === b.zoom;

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
    // peer -> { peer, pass, claims, tracking, conn, channel, has (the art it has), packing, behind,
    // allowance, heard (its chat, checked one at a time), checking (how many wait), askedAt (its last ask
    // for earlier messages), here (counted among those in the room) }
    this.watchers = new Map();
    this.here = new Map();   // sub -> their open connections: one person in two tabs comes and goes once
    this.silences = new Map();   // sub -> until (epoch ms), from 'silenced' since a pass was made (kept through a reconnect)
    this.removed = new Set();   // peers the host removed: not met again, and told to the server until it stops listing them
    this.muted = new Set();   // subs whose messages go to no one but them (and the host); they aren't told
    this.only = new Map();   // id -> sub: a message sent while they were muted, shown to them alone
    this.log = new ChatLog();
    this.room = null;
    this.art = null;
    this.view = null;
    this.packed = null;   // { art, chunks }: one snapshot for every watcher, packed again only for new art
  }

  // A watcher the server let in. A pass that doesn't check out (or no key to check it with), or a
  // connection the browser won't make, is sent back as left, and nothing else happens; a good one gets
  // a connection, and once it opens, the room.
  async peer(peer, pass) {
    if (this.removed.has(peer)) return;
    this.drop(peer);
    const w = {
      peer, pass, claims: null, tracking: true, conn: null, channel: null, has: null, packing: false, behind: false,
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
            this.went(w);
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

  // The host's socket (re)connected and the server listed who's inside: those connected keep their
  // connections, anyone not listed is closed, and the rest are met, again for a connection still being
  // made (its signals may have been lost while the socket was down).
  async hosting(peers) {
    const listed = new Set(peers.map((p) => p.peer));
    for (const peer of [...this.watchers.keys()]) if (!listed.has(peer)) this.peerGone(peer);
    for (const peer of this.removed) {   // its remove may have been lost with the socket
      if (listed.has(peer)) this.send({ type: 'remove', peer });
      else this.removed.delete(peer);
    }
    const meeting = (w) => !w || (w.conn && !w.channel);
    await Promise.all(peers.filter((p) => !this.removed.has(p.peer)).filter((p) => meeting(this.watchers.get(p.peer))).map((p) => this.peer(p.peer, p.pass)));
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

  setView({ col, row, cols, rows, zoom = 1 }) {
    const view = { col, row, cols, rows, zoom };
    if (this.view && sameView(this.view, view)) return;
    this.view = view;
    for (const w of this.open()) this.sendTo(w, { t: 'view', ...view });
  }

  // A message for everyone, the sender too (their echo): the host's own, already signed, or a
  // watcher's that checked out. Kept, unless its id is already.
  say({ pass, id, ts, text, sig }) {
    return this.post('chat', { pass, id, ts, text, sig });
  }

  // Who came and went, for everyone and kept like a message: a person's first open connection is their
  // joining, and their last one closing their leaving. Their pass names them.
  arrived(w) {
    if (this.watchers.get(w.peer) !== w) return;
    w.here = true;
    const n = this.here.get(w.claims.sub) ?? 0;
    this.here.set(w.claims.sub, n + 1);
    if (!n) this.post('presence', { pass: w.pass, id: newId(), ts: Date.now(), presence: 'joined' });
  }

  went(w) {
    if (!w.here) return;
    w.here = false;
    const n = this.here.get(w.claims.sub);
    if (!n) return;   // the room is closing
    if (n > 1) return void this.here.set(w.claims.sub, n - 1);
    this.here.delete(w.claims.sub);
    this.post('presence', { pass: w.pass, id: newId(), ts: Date.now(), presence: 'left' });
  }

  // `only`: the sub of a muted sender, who alone is sent it (the host's is marked).
  post(type, entry, only = null) {
    if (!this.log.add(entry)) return false;
    if (only) this.only.set(entry.id, only);
    this.onChat(only ? { type, entry, muted: true } : { type, entry });
    for (const w of this.open()) if (this.shown(entry.id, w)) this.sendTo(w, { t: type, ...entry });
    return true;
  }

  shown(id, w) {
    const only = this.only.get(id);
    return !only || only === w.claims.sub;
  }

  // The host's Delete: the message stays in the log as deleted, and every watcher hears.
  deleteMessage(id) {
    if (!this.log.delete(id)) return false;
    this.onChat({ type: 'deleted', id });
    for (const w of this.open()) this.sendTo(w, { t: 'deleted', id });
    return true;
  }

  // The host's Mute, for this session: what they say from now on reaches only them, and the host.
  mute(sub, on) {
    if (on) this.muted.add(sub);
    else this.muted.delete(sub);
  }

  // That person's chat is dropped until `until`, whatever their pass says.
  silence(sub, until) {
    this.silences.set(sub, until);
  }

  // The host's Remove: the server kicks the watcher, and its connection closes here.
  remove(peer) {
    this.removed.add(peer);
    this.send({ type: 'remove', peer });
    this.peerGone(peer);
  }

  close() {
    clearTimeout(this.redrawing);
    this.here.clear();
    for (const peer of [...this.watchers.keys()]) this.drop(peer);
  }

  // Closes a watcher's connection without telling the server (it knows already, or is the one closing).
  drop(peer) {
    const w = this.watchers.get(peer);
    if (!w) return false;
    this.watchers.delete(peer);
    this.went(w);
    w.conn?.close();
    return true;
  }

  changed() {
    this.onWatchers([...this.watchers.values()].filter((w) => w.claims).map((w) => ({
      peer: w.peer, sub: w.claims.sub, name: w.claims.name, guest: w.claims.guest, tracking: w.tracking, connected: !!w.channel,
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
    this.sendTo(w, { t: 'history', ...this.log.page(undefined, (m) => this.shown(m.id, w)) });
    this.arrived(w);
    await this.update(w);
    if (this.view && this.watchers.get(w.peer) === w && channel.readyState === 'open') this.sendTo(w, { t: 'view', ...this.view });
  }

  heard(w, data) {
    if (typeof data !== 'string' || data.length > MOST_HEARD_BYTES) return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg?.t === 'tracking') this.track(w, msg.on);
    else if (msg?.t === 'chat') this.check(w, msg);
    else if (msg?.t === 'earlier') this.earlier(w, msg.before);
  }

  track(w, on) {
    if (typeof on !== 'boolean' || on === w.tracking) return;
    w.tracking = on;
    this.redrawing ??= setTimeout(() => { this.redrawing = null; this.changed(); }, TRACKING_EVERY_MS);
  }

  // A watcher's chat in line to be checked. Bad messages don't spend the allowance, so it's the line
  // that's capped: past MOST_CHECKING waiting, one is ignored, and junk can't keep the host verifying.
  check(w, msg) {
    if (w.checking >= MOST_CHECKING) return;
    w.checking++;
    w.heard = w.heard.then(() => this.chat(w, msg)).catch(() => {}).finally(() => { w.checking--; });
  }

  // A watcher's message goes on only from a verified member, with text as the composer sends it, a
  // time near the host's, a new id and their own signature over it for this room; anything else, and
  // anything from someone silenced (by their pass, or by silence()), is dropped without a word. Past their
  // allowance, they're told it was too fast.
  async chat(w, { id, ts, text, sig }) {
    const claims = w.claims;
    if (!claims || claims.guest || claims.verified !== true || !isId(id) || !Number.isFinite(ts)
      || Math.abs(ts - Date.now()) > MOST_SKEW_MS || chatText(text) !== text || typeof sig !== 'string') return;
    if (Math.max(claims.silencedUntil ?? 0, this.silences.get(claims.sub) ?? 0) > Date.now()) return;
    if (!await verifySignature(claims.key, signedText(this.roomId, { id, ts, text }), sig)) return;
    if (this.watchers.get(w.peer) !== w || this.log.has(id)) return;
    if (!w.allowance.take()) this.sendTo(w, { t: 'chat-no', id, reason: 'too-fast' });
    else this.post('chat', { pass: w.pass, id, ts, text, sig }, this.muted.has(claims.sub) ? claims.sub : null);
  }

  // The page before a watcher's oldest message: at most one every EARLIER_EVERY_MS, sooner is ignored.
  earlier(w, before) {
    const now = Date.now();
    if (!isId(before) || now - w.askedAt < EARLIER_EVERY_MS) return;
    w.askedAt = now;
    this.sendTo(w, { t: 'history', ...this.log.page(before, (m) => this.shown(m.id, w)) });
  }

  sendTo(w, msg) {
    this.put(w, JSON.stringify(msg));
  }

  // One message down a watcher's channel. A channel that refuses it (closing, or a message too big)
  // ends that watcher's connection, and the server hears it left. True when sent.
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

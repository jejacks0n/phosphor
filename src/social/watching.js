// The watcher's side of a room: the connection the host offers (peer.js), and the art put back together
// from what comes over its channel (wire.js has the messages). The host is a stranger, so anything that
// doesn't fit (a snapshot too big or of the wrong size, a color or cell that isn't there, a room or view
// that isn't as the host's side sends it) is ignored, and however fast it sends, the art goes to onArt
// at most once a frame. States go to onState: 'connecting', 'live', then 'failed' if it never opened or
// 'lost' if it closed after (or the host said its page is going). Chat comes the same way, and goes to
// onChat only as its sender sent it: a verified member's pass the server signed, and their signature over
// the message for this room, so a host can't put words in anyone's mouth. For an artist, the drawing comes
// here too. A project's numbers aren't for anything until it's opened: those that come inside its chunks wait,
// and any it already holds go, and so does a check.
import { openPeer } from './peer.js';
import { verifyPass } from './pass.js';
import { verifySignature } from './keys.js';
import { PAGE, chatText, isId, signedText } from './chat.js';
import { BACKED_UP_BYTES, CHUNK_BYTES, MOST_NAME, MOST_PROJECT_BYTES, MOST_SNAPSHOT_CHUNKS, decodeChange, isStroke, isSub, isWhole, readNames, readView, readViews, unpackProject, unpackSnapshot } from './wire.js';

const MOST_HEARD_CHARS = 256 * 1024;   // a host's text message: what a channel carries
const MOST_WAITING = 1024;  // messages waiting to be handled: a whole snapshot's chunks and plenty more
const MOST_WAITING_DRAWING = 64 * 1024;   // for an artist from project-start: everything numbered waits here while it unpacks and opens
const MOST_WELCOME = 200;
const MOST_ARTISTS_LISTED = 64;   // the most a room's list holds
const MOST_PROJECT_CHUNKS = MOST_PROJECT_BYTES / CHUNK_BYTES;   // zipped, it's never more than unzipped
const NOTHING = () => {};

// A string, cut to most characters; null for anything else.
const text = (value, most) => (typeof value === 'string' ? value.slice(0, most) : null);

export class Watch {
  constructor({
    send, config, connectWithinMs, roomId, passKey, onRoom, onArt, onView, onState, onChat = NOTHING,
    onNumbered = NOTHING, onSettings = NOTHING, onBase = NOTHING, onProject = NOTHING, onCheck = NOTHING, onCaughtUp = NOTHING, onCursors = NOTHING, onViews = NOTHING, onInvite = NOTHING, onWithdrawn = NOTHING, onArtists = NOTHING, onHandOver = NOTHING, onCatchUp = NOTHING, onUndoReset = NOTHING, onRefused = NOTHING, onProjectFailed = NOTHING,
    takesProjects = () => false,
  }) {
    Object.assign(this, {
      send, config, connectWithinMs, roomId, passKey, onRoom, onArt, onView, onState, onChat,
      onNumbered, onSettings, onBase, onProject, onCheck, onCaughtUp, onCursors, onViews, onInvite, onWithdrawn, onArtists, onHandOver, onCatchUp, onUndoReset, onRefused, onProjectFailed, takesProjects,
    });
    this.mostWaiting = MOST_WAITING;
    this.conn = null;
    this.channel = null;
    this.tracking = true;
    this.following = null;   // a sub, or null for the host
    this.everyone = false;
    this.frame = null;   // the next frame's onArt, once asked for
  }

  // An offer starts a fresh connection, dropping any before; the rest goes to the current one.
  signalFrom(from, data) {
    if (from !== 'host') return;
    if (data?.sdp?.type === 'offer') this.connect();
    this.conn?.signal(data);
  }

  setTracking(on) {
    this.tracking = on;
    this.post({ t: 'tracking', on });
  }

  // Whose view is sent: an artist's by their sub, or the host's (null). Said again on every new connection.
  follow(sub) {
    this.following = sub;
    this.post({ t: 'follow', sub });
  }

  // Whether every artist's view is sent too, and the host's.
  showEveryone(on) {
    this.everyone = on;
    this.post({ t: 'show-everyone', on });
  }

  // The watcher's own message, already signed. It shows when the host sends it back to everyone.
  say({ id, ts, text, sig }) {
    return this.post({ t: 'chat', id, ts, text, sig });
  }

  // The page before the oldest message the watcher has.
  earlier(before) {
    return this.post({ t: 'earlier', before });
  }

  // An artist's: what's changed, as a change's message (wire.js), undo and redo of a whole stroke, and where they are.
  sendChange({ stroke, cells, runs }) {
    return this.post({ t: 'change', stroke, cells, runs });
  }

  sendUndo(stroke) {
    return this.post({ t: 'undo', stroke });
  }

  sendRedo(stroke) {
    return this.post({ t: 'redo', stroke });
  }

  sendCursor(at, view) {
    return this.post({ t: 'cursor', at, view });
  }

  // An answer to catch-up: its start, then its chunks at the pace the channel takes them. False if the channel went.
  async sendCatchUp({ n, epoch, kind, chunks }) {
    const channel = this.channel;
    if (!this.post({ t: 'catch-up-start', n, epoch, kind, chunks: chunks.length })) return false;
    for (const chunk of chunks) {
      while (channel.readyState === 'open' && channel.bufferedAmount > BACKED_UP_BYTES) await new Promise((resolve) => setTimeout(resolve, 20));
      if (channel.readyState !== 'open') return false;
      channel.send(chunk);
    }
    return true;
  }

  // Whether a message can go to the host now.
  get ready() {
    return this.channel?.readyState === 'open';
  }

  // A message to the host; false when there's no open channel to send it on.
  post(msg) {
    if (!this.ready) return false;
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
    this.project = null;      // project-start's fields, with its chunks and the numbers held till it's open
    this.handOver = null;     // hand-over's: how many chunks, and those in so far
    this.projectN = -1;       // numbers up to this are in the project opened
    this.heard = Promise.resolve();   // messages are handled one at a time, in order
    this.waiting = 0;                 // how many of them are still to be handled
    this.mostWaiting = MOST_WAITING;
    this.passes = new Map();   // pass -> its claims: good ones only, checked once a connection
    this.histories = 0;
    const conn = this.conn = openPeer({
      initiator: false, config: this.config, connectWithinMs: this.connectWithinMs,
      sendSignal: (data) => this.send({ type: 'signal-to', to: 'host', data }),
      onOpen: (channel) => {
        this.channel = channel;
        channel.onmessage = ({ data }) => this.hear(data, conn);
        this.onState('live');
        if (!this.tracking) this.setTracking(false);
        if (this.following !== null) this.follow(this.following);
        if (this.everyone) this.showEveryone(true);
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
      if (this.handOver) return this.handOverChunk(data);
      if (this.project) return this.projectChunk(data);
      const snapshot = this.gathering;
      if (!snapshot) return;
      if (data.byteLength > CHUNK_BYTES) {   // the whole snapshot goes
        this.gathering = null;
        return;
      }
      snapshot.chunks.push(new Uint8Array(data));
      if (snapshot.chunks.length < snapshot.want) return;
      this.gathering = null;
      this.art = await unpackSnapshot(snapshot.chunks);
      this.show();
      return;
    }
    const msg = JSON.parse(data);
    if (msg.t === 'room') this.room(msg);
    else if (msg.t === 'away') {   // the host's page is going: as a channel closing is, and its next offer connects again
      this.close();
      this.onState('lost');
    } else if (msg.t === 'view') this.view(msg);
    else if (msg.t === 'views') this.onViews(readViews(msg));
    else if (msg.t === 'snapshot') {
      const want = msg.chunks;
      this.gathering = Number.isInteger(want) && want >= 1 && want <= MOST_SNAPSHOT_CHUNKS ? { want, chunks: [] } : null;
    } else if (msg.t === 'cells' && this.art) this.change(msg);
    else if (msg.t === 'chat' || msg.t === 'presence') await this.chat(msg);
    else if (msg.t === 'history') await this.history(msg);
    else if (msg.t === 'deleted' && isId(msg.id)) this.onChat({ type: 'deleted', id: msg.id });
    else if (msg.t === 'chat-no' && isId(msg.id) && msg.reason === 'too-fast') this.onChat({ type: 'refused', id: msg.id, reason: msg.reason });
    else if (msg.t === 'numbered' || msg.t === 'settings' || msg.t === 'base' || msg.t === 'caught-up' || (msg.t === 'check' && Number.isInteger(msg.sum))) this.drawn(msg);
    else if (msg.t === 'project-start') this.projectStart(msg);
    else if (msg.t === 'project-failed') this.onProjectFailed();
    else if (msg.t === 'hand-over') this.handOverStart(msg);
    else if (msg.t === 'catch-up') this.onCatchUp({ has: msg.has, epoch: msg.epoch });
    else if (msg.t === 'undo-reset') this.onUndoReset();
    else if ((msg.t === 'undo-refused' || msg.t === 'redo-refused') && isStroke(msg.stroke)) this.onRefused(msg.t === 'undo-refused' ? 'undo' : 'redo', msg.stroke);
    else if (msg.t === 'cursors') this.onCursors(Object.fromEntries(Object.entries(msg).filter(([key]) => key !== 't')));
    else if (msg.t === 'invite') this.onInvite();
    else if (msg.t === 'withdrawn') this.onWithdrawn();
    else if (msg.t === 'artists' && Array.isArray(msg.subs) && msg.subs.length <= MOST_ARTISTS_LISTED && msg.subs.every((sub) => typeof sub === 'string')) this.onArtists(msg.subs, readNames(msg.names, msg.subs));
  }

  drawn(msg) {
    if (!isWhole(msg.n) || (msg.n <= this.projectN && msg.t !== 'caught-up')) return;   // nothing new can be at a project's number
    if (this.project) this.project.held.push(msg);
    else if (msg.t === 'numbered') this.onNumbered(msg);
    else if (msg.t === 'settings') this.onSettings(msg);
    else if (msg.t === 'check') this.onCheck(msg);
    else if (msg.t === 'caught-up') this.onCaughtUp();
    else this.onBase(msg);
  }

  projectStart({ n, epoch, bytes, chunks, took }) {
    const fits = isWhole(n) && typeof epoch === 'string' && isWhole(took) && Number.isInteger(chunks) && chunks >= 1 && chunks <= MOST_PROJECT_CHUNKS;
    this.project = fits ? { n, epoch, bytes, took, want: chunks, chunks: [], held: [] } : null;
    if (fits && this.takesProjects()) this.mostWaiting = MOST_WAITING_DRAWING;
  }

  // The host means this artist to be next. The ledger's only for someone drawing, and only until new-host.
  handOverStart({ chunks, room }) {
    const fits = this.takesProjects() && Number.isInteger(chunks) && chunks >= 1 && chunks <= MOST_PROJECT_CHUNKS;
    this.handOver = fits ? { want: chunks, chunks: [] } : null;
    if (fits && room) this.room(room);
  }

  async handOverChunk(data) {
    const handOver = this.handOver;
    if (data.byteLength > CHUNK_BYTES) {
      this.handOver = null;
      return;
    }
    handOver.chunks.push(new Uint8Array(data));
    if (handOver.chunks.length < handOver.want) return;
    this.handOver = null;
    await this.onHandOver(handOver.chunks);
  }

  // The chunks in, it's opened, and only then what waited behind it. A channel's order is what keeps
  // anything later behind that, since messages are handled one at a time.
  async projectChunk(data) {
    const project = this.project, conn = this.conn;
    if (data.byteLength <= CHUNK_BYTES) project.chunks.push(new Uint8Array(data));
    else project.want = -1;
    if (project.want !== -1 && project.chunks.length < project.want) return;
    this.project = null;
    const parts = project.want === -1 ? null : await unpackProject(project.chunks, { mostBytes: MOST_PROJECT_BYTES });
    if (this.conn !== conn) return;
    if (parts) {
      this.projectN = project.n;
      await this.onProject({ n: project.n, epoch: project.epoch, took: project.took, parts });
    } else this.onProjectFailed();
    if (this.conn === conn) for (const msg of project.held) this.drawn(msg);
  }

  // A message off the channel, queued unless it's past what a channel carries (not every browser holds a
  // stranger to that). A host sending faster than the queue empties is cut off: the queue is memory it fills.
  hear(data, conn) {
    if (typeof data === 'string' && data.length > MOST_HEARD_CHARS) return;
    if (this.waiting >= this.mostWaiting) {
      this.close();
      this.onState('lost');
      return;
    }
    this.waiting++;
    this.heard = this.heard.then(() => this.conn === conn && this.handle(data)).catch(() => {})   // junk is ignored
      .finally(() => { if (this.conn === conn) this.waiting--; });
  }

  async chat(msg) {
    const conn = this.conn;
    const checked = await this.checked(msg);
    if (checked && this.conn === conn) this.onChat({ type: checked.entry.presence ? 'presence' : 'chat', ...checked });
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
  // sends it, and their signature over it for this room. Who came or went is the host's word, but named
  // by a pass the server signed (a guest's too). Null for anything else, and for a
  // message sent while its pass's silencedUntil was still ahead.
  async checked(m) {
    const { pass, id, ts, text, sig, presence } = m ?? {};
    if (typeof pass !== 'string' || !isId(id) || !Number.isFinite(ts)) return null;
    if (presence === 'joined' || presence === 'left') {
      const claims = await this.claimsOf(pass);
      return claims && { entry: { pass, id, ts, presence }, claims };
    }
    if (chatText(text) !== text || typeof sig !== 'string') return null;
    const claims = await this.claimsOf(pass);
    if (!claims || claims.guest || claims.verified !== true || claims.silencedUntil > ts) return null;   // silenced when it was sent
    if (!await verifySignature(claims.key, signedText(this.roomId, claims.sub, { id, ts, text }), sig)) return null;
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

  // Who hosts it is the server's word (joined), never the host's.
  room(msg) {
    const room = { name: text(msg.name, MOST_NAME), welcome: text(msg.welcome, MOST_WELCOME) };
    if (room.name !== null && room.welcome !== null) this.onRoom(room);
  }

  // The host's view, or an artist's (who is their sub, and it names no one the watcher doesn't know: the store drops it).
  view(msg) {
    const view = readView(msg);
    if (view && (msg.who === undefined || isSub(msg.who))) this.onView(view, msg.who);
  }

  // The changed cells into the art, a copy of it once it's been given (the art given is never changed).
  change(msg) {
    const changed = decodeChange(msg, this.art.cells.length);
    if (!changed) return;
    if (this.given === this.art) this.art = { ...this.art, cells: this.art.cells.slice() };
    changed.at.forEach((i, k) => { this.art.cells[i] = changed.cells[k]; });
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

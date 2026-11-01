// The host's side of a room: a connection to each watcher (peer.js), made only for a pass the server
// signed, and what each watcher is sent over its channel (wire.js has the messages): the room, a
// snapshot, then the changes as the art changes, and the part the host is looking at. The server's socket
// carries the signals and hears when a watcher's connection ends (send). Chat goes through the host
// too (chat.js has its pieces): a watcher's message goes on to everyone only if it's theirs to send,
// signed by the key in their pass, and the host keeps the last of them for anyone who joins later,
// with who came and went among them. A room drawing together goes through here as well: artists' messages
// reach the callbacks, which the drawing store gives, and what's numbered goes back to them with sendAll, in place of
// the art: from their artist-hello until they're off the list, they're sent none.
import { openPeer } from './peer.js';
import { decodePass, verifyPass } from './pass.js';
import { verifySignature } from './keys.js';
import { Allowance, ChatLog, chatText, isId, newId, signedText } from './chat.js';
import { BACKED_UP_BYTES, CHUNK_BYTES, MOST_ARTIST_BYTES, MOST_PROJECT_BYTES, changedCells, encodeCells, isStroke, isSub, packSnapshot, readView, unpackProject, unpackValue } from './wire.js';

const DRAINED_BYTES = 1024 * 1024;           // a channel backed up is sent no art until it drains to this, and then gets one fresh snapshot
export const MOST_QUEUED_BYTES = 32 * 1024 * 1024;   // waiting for one artist's channel; past this it's discarded and they get the project
const MOST_HEARD_BYTES = 2048;               // a watcher's message longer than this is ignored, and an artist's, but for a change
const MOST_SKEW_MS = 120_000;                // a chat message's time, from the host's clock
const EARLIER_EVERY_MS = 500;                // a watcher's asks for earlier messages, at most
const MOST_CHECKING = 4;                     // a watcher's chat waiting to be checked; more is ignored
const VIEWS_EVERY_MS = 250;                  // an artist's view, or everyone's, to a watcher who follows: at most this often
const TRACKING_EVERY_MS = 250;              // who's here is redrawn for tracking toggles at most this often
export const KEPT_THROUGH_RELOAD = 1000;     // the newest messages kept() hands over, to be restored after the host's reload
export const RETURN_WITHIN_MS = 60_000;      // after a reload, those who were here have this long to come back before they're said to have left
const HAND_OVER_WITHIN_MS = 15_000;          // for the artist chosen to have the ledger and say so
const SERVER_ANSWERS_WITHIN_MS = 5000;       // for new-host after hand-over: the server says nothing if it won't
const GATHER_WITHIN_MS = 60_000;             // however it's going, long enough for a real catch-up's transfer
const CATCH_UP_QUIET_MS = 10_000;            // an artist asked to catch-up, going this long without a word, isn't going to
const MOST_CATCH_UP_CHUNKS = MOST_PROJECT_BYTES / CHUNK_BYTES;

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

// Nothing waiting for an artist's channel: a project holds all of it, and someone not drawing is owed none.
const nothingWaiting = () => ({ queue: [], queued: 0, again: false });
// A watcher who isn't drawing. This leaves projecting, as a project once started is finished (sendProject), and checked,
// so a new start at the same number is sent no check it's had.
const notDrawing = () => ({ drawing: false, took: 0, ...nothingWaiting() });

export class Host {
  // project(): the document as of now, { n, epoch, chunks (a promise) }. onChange gives back what it numbered,
  // or nothing when it's refused.
  constructor({
    send, passKey, config, connectWithinMs, roomId, returnWithinMs = RETURN_WITHIN_MS, onWatchers = () => {}, onChat = () => {},
    project = null, onChange = () => null, onUndo = () => {}, onRedo = () => {}, onCursor = () => {}, onHello = () => {}, onAnswer = () => {},
  }) {
    Object.assign(this, { send, passKey, config, connectWithinMs, roomId, returnWithinMs, onWatchers, onChat, project, onChange, onUndo, onRedo, onCursor, onHello, onAnswer });
    this.artists = new Set();   // the subs who may draw
    // peer -> { peer, pass, claims, tracking, conn, channel, has (the art it has), packing, behind,
    // allowance, heard (its chat, checked one at a time), following (the sub of the artist whose view it's sent, or
    // null for the host's), everyone (it asked for all of them), told (the last artist's view or everyone's it was
    // sent), checking (how many wait), askedAt (its last ask
    // for earlier messages), here (counted among those in the room), and for an artist drawing (said hello),
    // took (its changes handled on this connection, refused ones too), queue and queued (what's numbered for it,
    // waiting for its channel, and how much), projecting (a project is on its way, and the queue and any art wait
    // behind it), again (a project is owed, which will hold whatever would have been queued), checked (the last
    // number it was sent a check for), drained (ends the wait for its channel to drain), handedOver (ends the wait
    // for its hand-over-ok), catchUp (an answer to catch-up, coming in) }
    this.watchers = new Map();
    this.here = new Map();   // sub -> their open connections: one person in two tabs comes and goes once
    this.silences = new Map();   // sub -> until (epoch ms), from 'silenced' since a pass was made (kept through a reconnect)
    this.removed = new Set();   // peers the host removed: not met again, and told to the server until it stops listing them
    this.muted = new Set();   // subs whose messages go to no one but them (and the host); they aren't told
    this.only = new Map();   // id -> sub: a message sent while they were muted, shown to them alone
    this.log = new ChatLog();
    this.returning = new Map();   // sub -> the pass they had, for those who were here before a reload and haven't come back
    this.settled = true;   // false from restore() until the first hosting() says who of them is inside
    this.room = null;
    this.art = null;
    this.view = null;
    this.artistViews = {};   // sub -> view, from the artists' cursors
    this.packed = null;   // { art, chunks }: one snapshot for every watcher, packed again only for new art
    this.holding = null;   // [[w, msg]]: artists' changes that wait while nothing's being numbered
    this.holds = 0;   // how many are holding them: a merge can overlap a handover or a gather
    this.handOverWithinMs = HAND_OVER_WITHIN_MS;
    this.serverAnswersWithinMs = SERVER_ANSWERS_WITHIN_MS;
    this.gatherWithinMs = GATHER_WITHIN_MS;
    this.catchUpQuietMs = CATCH_UP_QUIET_MS;
  }

  // What the host keeps through a reload, for restore() to take back: the newest of the log, who was sent
  // what while muted, who's removed, and who is here (a pass each), those still awaited too.
  kept() {
    const log = this.log.list.slice(-KEPT_THROUGH_RELOAD);
    const ids = new Set(log.map((m) => m.id));
    const here = new Map(this.returning);
    for (const w of this.watchers.values()) if (w.here) here.set(w.claims.sub, w.pass);
    return {
      log,
      only: [...this.only].filter(([id]) => ids.has(id)),
      removed: [...this.removed],
      here: [...here].map(([sub, pass]) => ({ sub, pass })),
    };
  }

  // Takes back what kept() handed over (and `muted`, the store's subs), before the first hosting(). Those
  // who were here aren't said to join when they come back; hosting() says who isn't coming.
  restore({ log, only, removed, muted, here }) {
    for (const entry of log) this.log.add(entry);
    this.only = new Map(only);
    this.removed = new Set(removed);
    this.muted = new Set(muted);
    this.returning = new Map(here.map(({ sub, pass }) => [sub, pass]));
    this.settled = false;
  }

  // A watcher the server let in. A pass that doesn't check out (or no key to check it with), or a
  // connection the browser won't make, is sent back as left, and nothing else happens; a good one gets
  // a connection, and once it opens, the room.
  async peer(peer, pass) {
    if (this.removed.has(peer)) return;
    this.drop(peer);
    const w = {
      peer, pass, claims: null, tracking: true, following: null, everyone: false, told: null, owed: false, answeredAt: -Infinity, conn: null, channel: null, has: null, packing: false, behind: false,
      allowance: new Allowance(), heard: Promise.resolve(), checking: 0, askedAt: -Infinity,
      ...notDrawing(), projecting: false, checked: null, drained: null,
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
            w.drained?.();
            w.handedOver?.(false);
            w.catchUp?.done(null);
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
    if (!this.settled) this.settle(peers);
    const meeting = (w) => !w || (w.conn && !w.channel);
    await Promise.all(peers.filter((p) => !this.removed.has(p.peer)).filter((p) => meeting(this.watchers.get(p.peer))).map((p) => this.peer(p.peer, p.pass)));
  }

  // The first listing after restore(): those who were here and aren't inside are said to have left at once,
  // and the rest have returnWithinMs to connect before they are.
  settle(peers) {
    this.settled = true;
    const inside = new Set();
    for (const { pass } of peers) {
      try { inside.add(decodePass(pass).sub); } catch { /* a pass that can't be read names no one */ }
    }
    for (const sub of this.returning.keys()) if (!inside.has(sub)) this.leave(sub);
    if (this.returning.size) {
      this.returnTimer = setTimeout(() => { for (const sub of [...this.returning.keys()]) this.leave(sub); }, this.returnWithinMs);
    }
  }

  leave(sub) {
    const pass = this.returning.get(sub);
    this.returning.delete(sub);
    this.post('presence', { pass, id: newId(), ts: Date.now(), presence: 'left' });
    this.changed();
  }

  // After a reload: someone who may yet come back, so not being listed says nothing about them.
  awaited(sub) {
    return !this.settled || this.returning.has(sub);
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
      if (w.drawing) continue;
      if (w.has !== prev || w.behind) this.update(w);
      else if (changes) this.sendArt(w, changes, next);
      else this.update(w, null);   // too much changed, or too big as cells: the snapshot
    }
  }

  setView({ col, row, cols, rows, zoom = 1 }) {
    const view = { col, row, cols, rows, zoom };
    if (this.view && sameView(this.view, view)) return;
    this.view = view;
    for (const w of this.open()) if (this.seesHost(w)) this.sendTo(w, { t: 'view', ...view });
  }

  // Only a watcher looking at the host, or at everyone, is sent the host's view.
  seesHost(w) {
    return w.following === null || w.everyone;
  }

  // The artists' views, from their cursors: only those of artists are kept. They go to the watchers who follow an
  // artist or asked for everyone, at most every VIEWS_EVERY_MS, and only what has changed.
  setArtistViews(views) {
    this.artistViews = Object.fromEntries(Object.entries(views).filter(([sub]) => this.artists.has(sub)).map(([sub, view]) => [sub, readView(view)]).filter(([, view]) => view));
    this.scheduleViews();
  }

  // The artists' views to those who follow, and what is owed to a watcher who chose too soon after its last choice.
  scheduleViews() {
    this.viewsTimer ??= setTimeout(() => {
      this.viewsTimer = null;
      for (const w of this.open()) {
        if (!w.owed) this.sendViews(w);
        else this.answer(w, true);
      }
    }, VIEWS_EVERY_MS);
  }

  // What a watcher is sent of the artists: everyone's, or the one it follows, unless it's the same as it was sent.
  sendViews(w) {
    let msg = null;
    if (w.everyone) msg = { t: 'views', ...this.artistViews };
    else if (w.following !== null && Object.hasOwn(this.artistViews, w.following)) msg = { t: 'view', ...this.artistViews[w.following], who: w.following };
    const data = msg && JSON.stringify(msg);
    if (!data || data === w.told) return;
    w.told = data;
    this.sendTo(w, msg);
  }

  // A watcher's ask for the view of an artist (a sub), or of the host (null). A sub that is no artist is the host, and
  // anything that isn't a sub or null isn't an ask.
  follow(w, sub) {
    if (sub !== null && !isSub(sub)) return;
    const next = sub !== null && this.artists.has(sub) ? sub : null;
    if (next === w.following) return;
    w.following = next;
    this.answer(w);
  }

  showEveryone(w, on) {
    if (typeof on !== 'boolean' || on === w.everyone) return;
    w.everyone = on;
    this.answer(w);
  }

  // A watcher whose choice is back to the host without its asking.
  backToHost(w) {
    if (w.following === null) return;
    w.following = null;
    this.answer(w);
  }

  // What a new choice shows: at once, unless the last answer was less than VIEWS_EVERY_MS ago, and then with the
  // next views that go. The choice itself is made at once, so a flood of them costs a send a tick, not one each.
  answer(w, due = false) {
    w.owed = false;
    if (w.channel?.readyState !== 'open') return;
    if (!due && Date.now() - w.answeredAt < VIEWS_EVERY_MS) {
      w.owed = true;
      this.scheduleViews();
      return;
    }
    w.answeredAt = Date.now();
    w.told = null;
    this.sendNow(w);
  }

  // What a watcher's new choice shows now: the host's view if it's to see it, and the artists'.
  sendNow(w) {
    if (this.view && this.seesHost(w)) this.sendTo(w, { t: 'view', ...this.view });
    this.sendViews(w);
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
    if (!n && this.isArtist(w.claims.sub)) this.sendArtists(w);   // others hear the name of an artist who's come
    if (!n && !this.returning.delete(w.claims.sub)) this.post('presence', { pass: w.pass, id: newId(), ts: Date.now(), presence: 'joined' });
  }

  went(w) {
    if (!w.here) return;
    w.here = false;
    const n = this.here.get(w.claims.sub);
    if (!n) return;   // the room is closing
    if (n > 1) return void this.here.set(w.claims.sub, n - 1);
    this.here.delete(w.claims.sub);
    for (const other of this.watchers.values()) if (other.following === w.claims.sub) this.backToHost(other);   // gone: they hear it in 'left' too
    if (this.isArtist(w.claims.sub)) this.sendArtists();   // still listed, but no one to name or to follow
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
    clearTimeout(this.returnTimer);
    clearTimeout(this.viewsTimer);
    this.here.clear();
    for (const peer of [...this.watchers.keys()]) this.drop(peer);
  }

  // Closes a watcher's connection without telling the server (it knows already, or is the one closing).
  drop(peer) {
    const w = this.watchers.get(peer);
    if (!w) return false;
    this.watchers.delete(peer);
    this.went(w);
    w.drained?.();
    w.handedOver?.(false);
    w.catchUp?.done(null);
    w.conn?.close();
    return true;
  }

  // The page is going (a reload, or closed): each open channel hears it, and the watchers say the host is
  // reconnecting instead of finding out when their connection times out. The room itself isn't ended.
  goingAway() {
    for (const w of this.open()) this.sendTo(w, { t: 'away' });
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
      w.drained?.();
      if (w.projecting) return;
      if (w.again) {
        this.sendProject(w);
        return;
      }
      this.drain(w);
      if (!w.behind) return;
      w.behind = false;
      w.has = null;
      this.update(w);
    };
    channel.onmessage = ({ data }) => this.heard(w, data);
    this.changed();
    if (this.room) this.sendTo(w, { t: 'room', ...this.room });
    this.sendTo(w, { t: 'history', ...this.log.page(undefined, (m) => this.shown(m.id, w)) });
    this.sendTo(w, this.artistsMessage());   // empty too: someone put back while away hears it here
    this.arrived(w);
    await this.update(w);
    if (this.view && this.watchers.get(w.peer) === w && channel.readyState === 'open') this.sendTo(w, { t: 'view', ...this.view });
  }

  // Who it's from decides how long it may be, so that's looked at before anything is parsed.
  heard(w, data) {
    if (w.catchUp && typeof data !== 'string') return this.catchUpChunk(w, data);
    const artist = this.isArtist(w.claims?.sub);
    if (typeof data !== 'string' || data.length > (artist ? MOST_ARTIST_BYTES : MOST_HEARD_BYTES)) return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg?.t !== 'change' && data.length > MOST_HEARD_BYTES) return;
    if (msg?.t === 'tracking') this.track(w, msg.on);
    else if (msg?.t === 'chat') this.check(w, msg);
    else if (msg?.t === 'earlier') this.earlier(w, msg.before);
    else if (msg?.t === 'follow') this.follow(w, msg.sub);
    else if (msg?.t === 'show-everyone') this.showEveryone(w, msg.on);
    else if (msg?.t === 'accept' || msg?.t === 'decline' || artist) this.drawn(w, msg);
  }

  // A message about the drawing. Whatever it does, the room goes on, and a change that can't be taken is
  // refused: its sender has it on screen, so it's sent the project, which puts that right. An undo or redo
  // that can't be done has moved nothing, so it's only told.
  drawn(w, msg) {
    const { sub, name } = w.claims;
    if (this.holding && (msg?.t === 'change' || msg?.t === 'undo' || msg?.t === 'redo')) return void this.holding.push([w, msg]);
    try {
      if (msg?.t === 'hand-over-ok') w.handedOver?.(true);
      else if (msg?.t === 'catch-up-start') this.catchUpStart(w, msg);
      else if (msg?.t === 'accept' || msg?.t === 'decline') this.onAnswer(sub, msg.t === 'accept');
      else if (msg?.t === 'change') {
        w.took++;
        if (!this.onChange(sub, msg)) this.sendProject(w);
      } else if (msg?.t === 'undo') {
        if (!this.onUndo(sub, msg)) this.refuse(w, msg);
      } else if (msg?.t === 'redo') {
        if (!this.onRedo(sub, msg)) this.refuse(w, msg);
      } else if (msg?.t === 'cursor') this.onCursor(sub, msg, name);
      else if (msg?.t === 'artist-hello') {
        w.drawing = true;
        this.onHello(w, msg);
      }
    } catch (error) {
      console.warn('A message about the drawing failed.', error);
      if (msg?.t === 'change') this.sendProject(w);
      if (msg?.t === 'undo' || msg?.t === 'redo') this.refuse(w, msg);
    }
  }

  refuse(w, { t, stroke }) {
    if (isStroke(stroke)) this.sendTo(w, { t: `${t}-refused`, stroke });
  }

  // Nothing's being numbered for now: artists' changes wait here, in order, until every hold() has its release().
  hold() {
    this.holds++;
    this.holding ??= [];
  }

  release() {
    if (--this.holds > 0) return;
    this.holds = 0;
    const held = this.holding ?? [];
    this.holding = null;
    for (const [w, msg] of held) if (this.watchers.get(w.peer) === w && this.isArtist(w.claims.sub)) this.drawn(w, msg);
  }

  // The chunks to the artist named, behind whatever's already on its way to them, and true once they've said it's
  // in. False if they're not here to take it, or it's not said within handOverWithinMs.
  async handOver(sub, chunks) {
    const w = this.open().find(({ claims, drawing }) => claims.sub === sub && drawing);
    if (!w) return false;
    const giveUpAt = Date.now() + this.handOverWithinMs;
    while (w.projecting || w.again || w.queue.length) {
      if (Date.now() > giveUpAt || this.watchers.get(w.peer) !== w) return false;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const answer = new Promise((resolve) => {
      const timer = setTimeout(() => w.handedOver?.(false), Math.max(0, giveUpAt - Date.now()));
      w.handedOver = (yes) => {
        clearTimeout(timer);
        w.handedOver = null;
        resolve(yes);
      };
    });
    w.projecting = true;   // behind these chunks, as behind a project's
    this.sendTo(w, { t: 'hand-over', chunks: chunks.length, room: this.room });
    await this.putPaced(w, chunks);
    await this.sentWhole(w);
    return answer;
  }

  // A project or hand-over has gone: what waited behind it goes now.
  async sentWhole(w) {
    w.projecting = false;
    if (this.watchers.get(w.peer) !== w) return;
    this.drain(w);
    if (w.behind) {   // art that waited: this brings them up to the art there is now
      w.behind = false;
      w.has = null;
      this.update(w);
    }
    if (w.again) {
      w.again = false;
      await this.sendProject(w);
    }
  }

  // What an artist ahead of this host holds after has: { n, epoch, kind, tail or parts }, or null for no answer
  // that can be used.
  askCatchUp(w, { has, epoch }) {
    return new Promise((resolve) => {
      let timer = null;
      const catchUp = w.catchUp = {
        chunks: [], want: null, unpacking: false,
        done: (answer) => {
          clearTimeout(timer);
          if (w.catchUp === catchUp) w.catchUp = null;
          resolve(answer);
        },
        wait: () => {
          clearTimeout(timer);
          timer = setTimeout(() => catchUp.done(null), this.catchUpQuietMs);
        },
        quietOver: () => clearTimeout(timer),
      };
      catchUp.wait();
      this.sendTo(w, { t: 'catch-up', has, epoch });
    });
  }

  catchUpStart(w, { n, epoch, kind, chunks }) {
    const { catchUp } = w;
    if (!catchUp) return;
    if (!Number.isSafeInteger(n) || n < 0 || typeof epoch !== 'string' || (kind !== 'tail' && kind !== 'project') || !Number.isInteger(chunks) || chunks < 1 || chunks > MOST_CATCH_UP_CHUNKS) return catchUp.done(null);
    Object.assign(catchUp, { n, epoch, kind, want: chunks });
    catchUp.wait();
  }

  // All of it in, the artist has said what it has to: the unpack takes as long as it takes, and the gather's own
  // deadline is what limits that. Anything more they send while it does isn't part of it.
  async catchUpChunk(w, data) {
    const { catchUp } = w;
    if (catchUp.unpacking) return;
    if (catchUp.want === null || data.byteLength > CHUNK_BYTES) return catchUp.done(null);
    catchUp.chunks.push(new Uint8Array(data));
    catchUp.wait();
    if (catchUp.chunks.length < catchUp.want) return;
    catchUp.unpacking = true;
    catchUp.quietOver();
    const { n, epoch, kind, chunks } = catchUp;
    if (kind === 'tail') {
      const tail = await unpackValue(chunks, { mostBytes: MOST_PROJECT_BYTES });
      catchUp.done(Array.isArray(tail) ? { n, epoch, kind, tail } : null);
    } else {
      const parts = await unpackProject(chunks, { mostBytes: MOST_PROJECT_BYTES });
      catchUp.done(parts ? { n, epoch, kind, parts } : null);
    }
  }

  // Who may draw now, for everyone to hear. Someone taken off stops being sent the drawing, and a change of
  // theirs still on its way is someone else's message by the time it lands.
  setArtists(subs) {
    this.artists = new Set(subs);
    const back = [];
    for (const w of this.watchers.values()) {
      if (!w.claims || this.artists.has(w.claims.sub)) continue;
      if (w.drawing) back.push(w);
      Object.assign(w, notDrawing());
    }
    for (const w of this.watchers.values()) if (w.following !== null && !this.artists.has(w.following)) this.backToHost(w);   // put back to watching
    this.sendArtists();
    for (const w of back) {   // art again, now they've heard, and from scratch: what they had is from before they drew
      if (w.channel?.readyState !== 'open') continue;
      w.behind = false;
      w.has = null;
      this.update(w);
    }
  }

  // Who may draw, with the names of those here: a watcher can't ask anyone's name, and one it isn't told it can't show.
  artistsMessage() {
    const names = {};
    for (const w of this.watchers.values()) if (w.channel && w.claims && this.artists.has(w.claims.sub)) names[w.claims.sub] = w.claims.name;
    return { t: 'artists', subs: [...this.artists], names };
  }

  sendArtists(except = null) {
    const msg = this.artistsMessage();
    for (const w of this.open()) if (w !== except) this.sendTo(w, msg);
  }

  isArtist(sub) {
    return this.artists.has(sub);
  }

  // A message to someone by their sub, in every tab they're in; false if they can't be asked to draw.
  tell(sub, msg) {
    const tabs = this.open().filter((w) => w.claims.sub === sub);
    if (!tabs.length || tabs[0].claims.guest) return false;
    for (const w of tabs) this.sendTo(w, msg);
    return true;
  }

  // To every artist who has said hello, none skipped, in order.
  sendAll(msg) {
    const data = JSON.stringify(msg);
    for (const w of this.open()) if (w.drawing) this.deliver(w, data);
  }

  // The agreed picture's sum as of n, to each artist who has everything up to n on its way and hasn't been told
  // about this n. Anyone else would only skip it, and hears of a later one.
  sendCheck(n, sum) {
    const data = JSON.stringify({ t: 'check', n, sum });
    for (const w of this.open()) {
      if (!w.drawing || w.projecting || w.again || w.queue.length || w.checked === n) continue;
      w.checked = n;
      this.put(w, data);
    }
  }

  sendProjectToAll() {
    for (const w of this.open()) this.sendProject(w);
  }

  // Chunks at the pace the channel drains.
  async putPaced(w, chunks) {
    for (const chunk of chunks) {
      if (this.watchers.get(w.peer) !== w || !this.put(w, chunk)) return;
      if (w.channel.bufferedAmount <= BACKED_UP_BYTES) continue;
      await new Promise((resolve) => { w.drained = resolve; });
      w.drained = null;
    }
  }

  // What someone missed, from the ledger's tail, and that that's all of it (n, the last number): anything of
  // theirs they've heard no number for by then never got here.
  sendTail(w, items, n) {
    for (const item of items) this.deliver(w, JSON.stringify({ t: 'numbered', ...item }));   // settings and base have their own t
    this.deliver(w, JSON.stringify({ t: 'caught-up', n }));
  }

  // Straight down the channel, for anyone keeping up. Otherwise it waits in their queue, as a channel past what
  // it buffers closes (send throws), and past MOST_QUEUED_BYTES the queue goes: the project they're owed instead,
  // sent once they drain or when the one on its way ends, holds all of it, and all that comes before it's read.
  // A slow artist costs the host this array and that project, and no one else anything. The size is in
  // characters, which a multi-byte character undercounts: near enough for a limit.
  deliver(w, data) {
    if (w.again) return;
    if (!w.projecting && !w.queue.length && !(w.channel.bufferedAmount > BACKED_UP_BYTES)) {
      this.put(w, data);
      return;
    }
    w.queue.push(data);
    w.queued += data.length;
    if (w.queued <= MOST_QUEUED_BYTES) return;
    Object.assign(w, nothingWaiting(), { again: true });
  }

  // Their queue down the channel, as far as it'll take now; bufferedamountlow brings this back for the rest.
  drain(w) {
    let sent = 0;
    while (sent < w.queue.length && !(w.channel.bufferedAmount > BACKED_UP_BYTES) && this.put(w, w.queue[sent])) w.queued -= w.queue[sent++].length;
    w.queue.splice(0, sent);
  }

  // The whole document as of now, to one artist, then everything numbered since. What it's as of and what it
  // counts are read before the first wait, so what's queued already is in it and goes, and from there what's
  // numbered waits behind it, and art, since a snapshot's chunks would land among these. One at a time: a change
  // refused while one is on its way isn't in it, so another follows. Once started it's finished, whoever they
  // are by then, as their Watch is taking every chunk as its.
  // ponytail: each artist's is packed apart; share by n if several joining at once costs too much.
  async sendProject(w) {
    if (!w.drawing) return;
    if (w.projecting) {
      w.again = true;
      return;
    }
    Object.assign(w, nothingWaiting(), { projecting: true });
    const took = w.took;
    try {
      const { n, epoch, chunks: packing } = this.project();
      const chunks = await packing;
      if (this.watchers.get(w.peer) === w && w.drawing) {
        const bytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        this.sendTo(w, { t: 'project-start', n, epoch, bytes, chunks: chunks.length, took });
        await this.putPaced(w, chunks);
      }
    } catch (error) {
      console.warn('The art couldn\'t be packed for an artist.', error);
      this.sendTo(w, { t: 'project-failed' });
    }
    await this.sentWhole(w);
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
    if (!await verifySignature(claims.key, signedText(this.roomId, claims.sub, { id, ts, text }), sig)) return;
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
  // it drains. True when sent. Someone drawing has the document, and is sent none: they hear of it in setArtists.
  sendArt(w, message, art) {
    if (w.drawing) return false;
    if (w.projecting || w.channel.bufferedAmount > BACKED_UP_BYTES) {
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
    if (!this.art || w.drawing || w.packing || w.behind || at?.length === 0) return;
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

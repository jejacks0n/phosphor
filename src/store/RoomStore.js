import { defineStore } from 'pinia';
import { markRaw, shallowRef, watch } from 'vue';
import { apiOrigin, wsOrigin } from '@/social/config';
import { proof, sign } from '@/social/keys';
import { Allowance, MOST_KEPT, REASONS, chatText, evidenceFor, newId, signedText } from '@/social/chat';
import { LobbyConnection, Pacer } from '@/social/lobby';
import { refusalWords } from '@/social/messages';
import { decodePass, passKey } from '@/social/pass';
import { Host } from '@/social/hosting';
import { Watch } from '@/social/watching';
import { fontOnWire, fontFor } from '@/social/wire';
import { thumbnailOf } from '@/social/thumbnail';
import { newSession, sessionJoined, sessionLeft, sessionRemoved, sessionSaid, sessionSaw } from '@/social/session';
import { charRowsOf } from '@/lib/Cells';
import { useSocialStore } from '@/store/SocialStore';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

const SEND_EVERY_MS = 100;       // the art, as it changes (a stroke shows as it's drawn)
const VIEW_EVERY_MS = 250;       // the part of the art the host is looking at
const THUMBNAIL_FIRST_MS = 3000;      // the lobby's picture of a public room, soon after it goes live
const THUMBNAIL_EVERY_MS = 180_000;   // then at most this often (the server's own floor is 20 s), and only after a change
const SETTINGS_EVERY_MS = 1250;  // the server's 1 s, with slack: it measures when settings arrive
const ASK_FOR_MS = 3000;        // how long an earlier() waits for its page (the host may drop it unanswered)
const ROOM_ID = /^[a-z2-7]{10}$/;

// What's typed in Start a room and Room settings, kept here so it stays while you're on another tab (the
// SOCIAL tab isn't there then). Room settings also keeps what the room last said for each field (seen).
export const MAX_WATCHERS = 30;   // the Room's own limit; a higher number typed in comes back to it
// Who you reported, in which room and as which account, in localStorage: leaving a room and joining it again
// (or a reload) doesn't offer Report for them there again. Kept a day.
// ponytail: a room that runs longer than a day offers it again; key by the room's end if that matters.
const REPORTED = 'phosphor-reported', KEEP_REPORTED_MS = 86_400_000;
const keptReports = () => {
  try {
    const all = JSON.parse(localStorage.getItem(REPORTED) ?? '[]');
    return Array.isArray(all) ? all.filter((r) => Date.now() - r.at < KEEP_REPORTED_MS) : [];
  } catch {
    return [];
  }
};
const reportedIn = (room, by) => keptReports().filter((r) => r.room === room && r.by === by).map((r) => r.sub);
const keepReport = (room, by, sub) => {
  try {
    localStorage.setItem(REPORTED, JSON.stringify([...keptReports(), { room, by, sub, at: Date.now() }]));
  } catch { /* no storage: a rejoin offers Report again */ }
};

const newStartDraft = () => ({ name: '', welcome: '', isPublic: true, password: '', allowGuests: true, max: 12, signal: null });
const newSettingsDraft = () => ({ welcome: '', allowGuests: true, max: 12, signal: null, seen: {} });

// The room you host or watch: its socket (a LobbyConnection with the room's greeting), and the host's
// side (Host: your art to every watcher) or the watcher's (Watch: the host's art, never your own
// project). One room at a time; signing in or out closes it (SocialStore.becameSomeoneElse).
export const useRoomStore = defineStore('room', {
  state: () => ({
    role: null,          // null | 'host' | 'watch'
    id: null,
    link: null,          // the host's link to the room
    room: null,          // a host's: the Room's room and your welcome; a watcher's: { name, welcome, host, hostSub } (joined's host and its account)
    // a host's: 'connecting' | 'live' | 'reconnecting'; a watcher's: 'joining' | 'password' | 'waiting' |
    // 'connecting' | 'live' | 'failed'
    status: null,
    passwordWrong: false,
    hasPassword: false,  // a host's: the room was made with a password (it can't change)
    watchers: [],        // a host's: [{ peer, sub, name, guest, following, connected }]
    art: shallowRef(null),   // a watcher's: { cells, cols, lines, font }
    hostView: null,      // a watcher's: { col, row, cols, rows, zoom }
    following: true,
    artZoom: 1,          // a watcher's: the zoom the art is drawn at, the host's while following
    chat: [],            // [{ id, ts, text, sub, name, host, mine, deleted, pass, sig, presence?, silenced? }], oldest first, at most MOST_KEPT; presence is 'joined' or 'left'
    chatMore: false,     // the host has older messages to ask for (never once the list is full: it goes no further back)
    joinedAt: null,      // a watcher's: the id of the last message in its first history ("You joined" comes after it)
    chatRefused: null,   // 'too-fast' until the next message goes
    reported: [],        // the subs you reported in this room (Report is gone for them there, rejoining too)
    peopleOpen: false,   // a host's: the chat panel's "N here" list is open
    silenced: [],        // a host's: the subs it silenced in this room (their messages reach only them, and the host)
    lobbyPin: null,      // a host's (picked in Setup room, or while live): the top-left cell { col, row } the lobby picture uses; null while it follows the view
    session: newSession(),   // a host's: what this browser counted since the room started (social/session.js)
    startDraft: newStartDraft(),         // Start a room's form; empty again once a room is made
    settingsDraft: newSettingsDraft(),   // a host's Room settings form
    _connection: null,   // the room's LobbyConnection (markRaw)
    _host: null,         // Host (markRaw)
    _watch: null,        // Watch (markRaw)
    _allowance: null,    // the composer's Allowance (markRaw)
    _asking: false,      // a watcher's earlier() is waiting for its answer
    _askTimer: null,     // gives up on that answer after ASK_FOR_MS
    _settings: null,     // Pacer for the host's settings (markRaw)
    _stops: [],          // what close() undoes: the host's watches, timers and pagehide listener
    _password: undefined, // the password the join sent
    _refusedOnce: false, // the room refused a pass since it was last live: the next refusal stands
    _connectWithinMs: undefined,   // the peers' (tests make it short)
  }),

  getters: {
    inRoom: (state) => !!state.role,
    hereNow: (state) => state.watchers.filter((w) => w.connected).length,   // a host's: watchers connected now
    // Only a confirmed member sends; guests and unconfirmed members read.
    canChat() {
      const claims = useSocialStore().claims;
      return !!claims && !claims.guest && claims.verified;
    },
    // Reporting is for the same people (a guest can't chat, so can't be reported).
    canReport() {
      return this.canChat;
    },
    // When your mute ends (epoch ms), while your pass says you're muted.
    mutedUntil: () => useSocialStore().claims?.mutedUntil ?? null,
    // Where the lobby picture looks: the cell it's pinned to, else the middle of the shared view.
    lobbyPlace() {
      if (this.lobbyPin !== null) return { ...this.lobbyPin };
      const v = useWorkspaceStore().sharedView;
      return v ? { middleCol: v.col + v.cols / 2, middleRow: v.row + v.rows / 2 } : { middleCol: 0, middleRow: 0 };
    },
  },

  actions: {
    // A new room, live with your art: false (the server's words as the notice) if it wasn't made.
    // Only a public room sends its signal: the signal shows on its lobby card, and a link-only room has none.
    async startRoom({ name, welcome, isPublic, password, allowGuests, max, signal = null }) {
      const social = useSocialStore();
      const body = { name, public: isPublic, allowGuests, max, signal: isPublic ? signal : null, ...(!isPublic && password ? { password } : {}) };   // a private room's password is optional
      const { ok, data } = await social.request('/api/rooms', { method: 'POST', body });
      if (!ok) return false;
      const lobbyPin = isPublic ? this.lobbyPin : null;   // picked in Setup room, kept through close()
      this.close();
      Object.assign(this, {
        startDraft: newStartDraft(), settingsDraft: newSettingsDraft(), hasPassword: !isPublic && !!password, lobbyPin,
        role: 'host', id: data.id, link: data.link, status: 'connecting',
        room: { name, welcome: welcome ?? '', public: isPublic, allowGuests, max, signal: isPublic ? signal : null, count: 0 },
      });
      this._host = markRaw(new Host({
        send: (msg) => this._connection?.send(msg),
        passKey, connectWithinMs: this._connectWithinMs, roomId: this.id,
        onWatchers: (list) => { this.watchers = list; },
        onChat: (event) => this.chatHeard(event),
      }));
      this._settings = markRaw(new Pacer(SETTINGS_EVERY_MS, (msg) => this._connection?.send(msg) ?? false));
      this.share();
      this.connect({ type: 'host' }, { liveOn: ['hosting'], endOn: ['refused', 'ended'] });
      return true;
    },

    // The host's art to the Host as it changes, at most every SEND_EVERY_MS, and its view at most every
    // VIEW_EVERY_MS. Every change makes new cells (setCells), which the Host compares cell by cell
    // against what it sent. While a slider moves, nothing goes: its end goes as one change. A public
    // room's lobby picture goes once soon after it's live, then after a change, 3 minutes apart at least.
    share() {
      const project = useProjectStore(), workspace = useWorkspaceStore();
      let timer = null, pictureTimer = null, pictureAt = null;
      const artNow = () => ({ cells: project.cells, cols: project.cols, lines: charRowsOf(project.rows), font: fontOnWire(workspace.displayFontSpec) });
      const flush = () => {
        timer = null;
        if (project._sliderBefore) return schedule();
        const art = artNow();
        if (art.cells.length === art.cols * art.lines) this._host?.setArt(art);   // not a new size before its render
      };
      const picture = async () => {
        pictureTimer = null;
        pictureAt = Date.now();
        const art = artNow(), connection = this._connection;
        if (art.cells.length !== art.cols * art.lines) return changed();
        let webp = null;
        try {
          webp = await thumbnailOf({ ...art, font: fontFor(art.font) }, this.lobbyPlace);
        } catch (error) {
          console.warn('The room\'s lobby picture failed.', error);   // as if the browser couldn't make one
        }
        if (webp && connection === this._connection && !connection.send({ type: 'thumbnail', webp })) changed();   // not while reconnecting
      };
      const changed = () => {
        if (this.room.public && pictureAt !== null) pictureTimer ??= setTimeout(picture, Math.max(0, pictureAt + THUMBNAIL_EVERY_MS - Date.now()));
      };
      const schedule = () => { timer ??= setTimeout(flush, SEND_EVERY_MS); };
      const view = new Pacer(VIEW_EVERY_MS, (v) => {
        this._host?.setView(v);
        return true;
      });
      const pagehide = () => this._connection?.send({ type: 'end' });   // watchers hear at once, not in a minute
      addEventListener('pagehide', pagehide);
      this._stops = [
        watch([() => project.cells, () => project.cols, () => project.rows, () => workspace.displayFontSpec], () => { schedule(); changed(); }),
        watch(() => workspace.sharedView, (v) => { if (v) view.push(v); }, { immediate: true }),
        watch(() => JSON.stringify(this.lobbyPlace), changed, { immediate: true }),
        watch(() => this.hereNow, (here) => sessionSaw(this.session, here), { immediate: true }),
        watch(() => this.status, (status) => {
          if (status === 'live') this.session.liveSince ??= Date.now();   // a reconnect keeps it
          if (status === 'live' && this.room.public && pictureAt === null) pictureTimer ??= setTimeout(picture, THUMBNAIL_FIRST_MS);
        }),
        () => { clearTimeout(timer); clearTimeout(pictureTimer); view.reset(); removeEventListener('pagehide', pagehide); },
      ];
      flush();
    },

    // The welcome goes to watchers (never the server); guests, the max watchers and the signal go to the Room.
    changeSettings({ welcome, allowGuests, max, signal = this.room.signal ?? null }) {
      if (this.role !== 'host') return;
      const room = this.room;
      if (welcome !== room.welcome && this._host.room) this._host.setRoom({ ...this._host.room, welcome: welcome ?? '' });
      if (allowGuests !== room.allowGuests || max !== room.max || signal !== (room.signal ?? null)) this._settings.push({ type: 'settings', allowGuests, max, signal });
      this.room = { ...room, welcome: welcome ?? '', allowGuests, max, signal };
    },

    // Puts the host's link on the clipboard; false (and a notice) when the browser won't.
    async copyLink() {
      try {
        await navigator.clipboard.writeText(this.link);
        return true;
      } catch {
        useSocialStore().notice = 'Couldn\'t copy the link';
        return false;
      }
    },

    // End room: the Room hears end (close does it for a host), and watchers are kicked.
    endRoom() {
      this.leave();
    },

    // A room by its id (a lobby card's Join, or a ?room= link), with its password once it asks for one.
    join(id, { password } = {}) {
      const social = useSocialStore();
      if (!ROOM_ID.test(id)) {
        social.notice = refusalWords('unavailable');
        return;
      }
      this.close();
      Object.assign(this, { role: 'watch', id, status: 'joining', _password: password, reported: reportedIn(id, social.claims?.sub) });
      if (social.signedIn) social.loadBlocked();   // whose messages to hide
      this._watch = markRaw(new Watch({
        send: (msg) => this._connection?.send(msg),
        connectWithinMs: this._connectWithinMs, roomId: id, passKey,
        onChat: (event) => this.chatHeard(event),
        onRoom: ({ name, welcome }) => { this.room = { ...this.room, name, welcome }; },   // the host is joined's
        onArt: (art) => { this.art = art; },
        onView: (view) => {
          this.hostView = view;
          if (this.following) this.artZoom = view.zoom;
        },
        onState: (state) => this.watchState(state),
      }));
      this.connect({ type: 'join', ...(password === undefined ? {} : { password }) }, { liveOn: ['joined'], endOn: ['refused', 'removed', 'ended', 'replaced'] });
      // The host judges the pass this watcher joined with: confirming your email mid-room joins again, with the new one.
      this._stops.push(watch(() => social.claims?.verified, (now, was) => {
        if (was === false && now === true) this.join(this.id, { password: this._password });
      }));
    },

    // The room you're watching, to go back into after signing in: its id and password, or null.
    rejoinInfo() {
      return this.role === 'watch' ? { id: this.id, password: this._password } : null;
    },

    setFollowing(on) {
      this.following = on;
      if (on) this.artZoom = this.hostView?.zoom ?? 1;
      this._watch?.setFollowing(on);
    },

    // The lobby picture from this top-left cell ({ col, row }), or following the view's middle again.
    pinLobby(cell) {
      this.lobbyPin = cell;
    },
    followLobby() {
      this.lobbyPin = null;
    },

    // Out of the room, back to the lobby.
    leave() {
      this.close();
      useSocialStore().page = 'lobby';
    },

    // Everything stops, and nothing of the room is kept; a room you host is ended first.
    close() {
      if (this.role === 'host') this._connection?.send({ type: 'end' });
      const connection = this._connection;
      this._connection = null;
      connection?.close();
      this.stopAsking();
      this._host?.close();
      this._watch?.close();
      this._settings?.reset();
      for (const stop of this._stops) stop();
      Object.assign(this, {
        role: null, id: null, link: null, room: null, status: null, passwordWrong: false, hasPassword: false, watchers: [], art: null,
        hostView: null, following: true, artZoom: 1, chat: [], chatMore: false, joinedAt: null, chatRefused: null, reported: [], peopleOpen: false, silenced: [], lobbyPin: null, session: newSession(),
        _allowance: null, _asking: false, _askTimer: null, _host: null, _watch: null, _settings: null, _stops: [], _password: undefined,
        _refusedOnce: false,
      });
    },

    // The room's socket: a LobbyConnection greeting with a proof over room:<id>:<ts>.
    connect(greeting, { liveOn, endOn }) {
      const social = useSocialStore();
      const id = this.id;
      const connection = this._connection = markRaw(new LobbyConnection({
        url: `${wsOrigin(apiOrigin())}/api/rooms/${id}/ws`,
        getPass: () => social.getPass(),
        greet: async (pass, privateKey) => ({ ...greeting, pass, ...await proof(privateKey, (ts) => `room:${id}:${ts}`) }),
        liveOn, endOn,
        onMessage: (msg) => { if (connection === this._connection) this.heard(msg); },
        onStatus: (status) => {
          if (connection !== this._connection) return;
          if (this.role === 'host' && status !== 'refused' && status !== 'closed') this.status = status;
          // The Room kicked a watcher while its connection to the host was being made: the host gave up
          // on reaching it first, so joining again would only fail the same way.
          else if (this.role === 'watch' && status === 'reconnecting' && this.status === 'connecting') {
            this._watch.close();
            this.watchState('failed');
          }
        },
      }));
      connection.open();
    },

    // Your message: the text as the composer sends it, within your allowance, signed with this browser's key.
    // A host's shows at once (Host calls chatHeard with it); a watcher's shows when the host sends it back.
    async say(text) {
      const social = useSocialStore(), side = this._host ?? this._watch, body = chatText(text);
      if (!side || !body || !this.canChat || this.mutedUntil > Date.now() || (this.role === 'watch' && !side.ready)) return false;   // nothing spent on a message that can't go
      this._allowance ??= markRaw(new Allowance());
      if (!this._allowance.take()) {
        this.chatRefused = 'too-fast';
        return false;
      }
      this.chatRefused = null;
      const message = { id: newId(), ts: Date.now(), text: body };
      const sig = await sign(social._key.privateKey, signedText(this.id, message));
      if (side !== (this._host ?? this._watch)) return false;   // the room closed meanwhile
      return side.say(this.role === 'host' ? { pass: social.pass, ...message, sig } : { ...message, sig });
    },

    // The host's Delete: the message stays, as deleted, for everyone.
    deleteMessage(id) {
      return this._host?.deleteMessage(id) ?? false;
    },

    // A report of `sub`, for a message (messageId) or from the people list, with the messages as they came.
    // False, sending nothing, if you can't report, it's yourself, you reported them already in this room, the reason
    // isn't one or there's no socket.
    report({ sub, messageId = null, reason }) {
      if (!this.canReport || sub === useSocialStore().claims?.sub || this.reported.includes(sub) || !REASONS.some((r) => r.id === reason)) return false;
      const messages = evidenceFor(this.chat, { sub, messageId });
      if (!messages) return false;
      if (!this._connection?.send({ type: 'report', sub, reason, messages, ...(messageId ? { message: messageId } : {}) })) return false;
      this.reported.push(sub);
      keepReport(this.id, useSocialStore().claims.sub, sub);
      return true;
    },

    // A watcher asks for the page before its oldest message; one question at a time.
    earlier() {
      if (this.role !== 'watch' || !this.chatMore || this._asking || !this.chat.length) return false;
      if (!this._watch.earlier(this.chat[0].id)) return false;
      this._asking = true;
      this._askTimer = setTimeout(() => this.stopAsking(), ASK_FOR_MS);
      return true;
    },

    stopAsking() {
      clearTimeout(this._askTimer);
      this._askTimer = null;
      this._asking = false;
    },

    // The host's Remove: the watcher is kicked from the room.
    remove(peer) {
      if (this.role !== 'host') return;
      const watcher = this.watchers.find((w) => w.peer === peer);
      if (watcher) sessionRemoved(this.session, watcher.sub, Date.now());
      this._host.remove(peer);
    },

    // The host's Silence, for this room: what they say from now on reaches only them and the host. They aren't told.
    silence(sub, on) {
      if (this.role !== 'host' || on === this.silenced.includes(sub)) return;
      this.silenced = on ? [...this.silenced, sub] : this.silenced.filter((s) => s !== sub);
      this._host.silence(sub, on);
    },

    // The host's Block: the account can't join any room of yours, and they're kicked from this one.
    async block(watcher) {
      if (this.role !== 'host' || !await useSocialStore().block(watcher.name)) return false;
      sessionRemoved(this.session, watcher.sub, Date.now());   // counted even if they've left meanwhile
      this.remove(watcher.peer);
      return true;
    },

    // What Host and Watch hand over about chat: a message or who came or went, a page of them, a deletion or a refusal.
    chatHeard(event) {
      if (event.type === 'refused') {
        this.chatRefused = event.reason;
      } else if (event.type === 'deleted') {
        const shown = this.chat.find((m) => m.id === event.id);
        if (shown) Object.assign(shown, { deleted: true, text: '', pass: null, sig: null });
      } else if (event.type === 'chat' || event.type === 'presence') {
        if (!this.chat.some((m) => m.id === event.entry.id)) {
          const row = this.chatRow(event.entry, event.claims);
          this.keep([...this.chat, event.silenced ? { ...row, silenced: true } : row]);
          if (this.role === 'host') this.counted(event);
        }
      } else if (event.type === 'history') {
        const rows = event.messages.map((m) => (m.deleted ? { id: m.id, ts: m.ts, text: '', pass: null, sig: null, sub: null, name: null, host: false, mine: false, deleted: true } : this.chatRow(m.entry, m.claims)))
          .filter((r, at, all) => all.findIndex((o) => o.id === r.id) === at);   // an id twice in a page is shown once
        for (const r of rows) {   // a deletion made while this watcher was away
          const shown = r.deleted && this.chat.find((m) => m.id === r.id);
          if (shown) Object.assign(shown, { deleted: true, text: '', pass: null, sig: null });
        }
        const fresh = rows.filter((r) => !this.chat.some((m) => m.id === r.id));
        if (event.earlier && this._asking) {
          this.chatMore = event.more;
          this.keep([...fresh.slice(Math.max(0, fresh.length + this.chat.length - MOST_KEPT)), ...this.chat]);   // as much as fits, the nearest
        } else if (!this.chat.length) {
          Object.assign(this, { chatMore: event.more, joinedAt: rows.at(-1)?.id ?? null });
          this.keep(rows);
        } else if (rows.length) {
          // A page the connection gives again. The host's order is the truth (never the senders' clocks): a page
          // that shares an id with the list is contiguous with it, so what comes after its last shared entry
          // was missed while away. One that shares none follows a gap longer than a page: it replaces the
          // list, and scrolling up asks the host for the rest.
          const shared = rows.findLastIndex((r) => this.chat.some((m) => m.id === r.id));
          if (shared >= 0) {
            this.keep([...this.chat, ...rows.slice(shared + 1)]);
          } else {
            if (!rows.some((r) => r.id === this.joinedAt)) this.joinedAt = null;
            this.chatMore = event.more;
            this.keep(rows);
          }
        }
        this.stopAsking();
      }
    },

    // A host's session counts a message, or a person coming or going (the entry's pass has who).
    counted({ type, entry }) {
      const claims = decodePass(entry.pass);
      if (type === 'chat') sessionSaid(this.session, claims.sub);
      else if (entry.presence === 'joined') sessionJoined(this.session, claims, entry.ts);
      else sessionLeft(this.session, claims.sub, entry.ts);
    },

    // A message as the list shows it. A host's own claims come from its pass (the host checked every
    // watcher's pass when it joined); the host's mark is its own messages, or for a watcher the room's host (by account, so a rename keeps it).
    chatRow({ id, ts, text = '', pass, sig, presence }, claims = decodePass(pass)) {
      const mine = claims.sub === useSocialStore().claims?.sub;
      const row = { id, ts, text, sub: claims.sub, name: claims.name, host: this.role === 'host' ? mine : claims.sub === this.room?.hostSub, mine, deleted: false };
      return presence ? { ...row, presence } : { ...row, pass, sig };   // a report carries the message as it was signed
    },

    // The list holds the last MOST_KEPT at most, like the host's log, and goes no further back: once it's
    // full there is nothing more to ask for.
    keep(list) {
      if (list.length >= MOST_KEPT) this.chatMore = false;
      this.chat = list.slice(-MOST_KEPT);
    },

    // The Room's messages (the server's API).
    heard(msg) {
      switch (msg.type) {
        case 'hosting': {
          const chosen = this.room;
          this._refusedOnce = false;
          this.room = { ...msg.room, welcome: chosen.welcome };
          if (!this._host.room) this._host.setRoom({ name: msg.room.name, welcome: chosen.welcome });
          this._host.hosting(msg.peers);
          this.changeSettings(chosen);   // a change made while the socket was down goes now
          break;
        }
        case 'settings-now': {
          // The Room's word on the room, but a change still waiting to go stays shown (it would only flicker back).
          const waiting = this._settings.timer ? { allowGuests: this.room.allowGuests, max: this.room.max, signal: this.room.signal } : {};
          this.room = { ...msg.room, welcome: this.room.welcome, ...waiting };
          break;
        }
        case 'peer':
          this._host?.peer(msg.peer, msg.pass);
          break;
        case 'peer-gone':
          this._host?.peerGone(msg.peer);
          break;
        case 'signal-from':
          (this._host ?? this._watch)?.signalFrom(msg.from, msg.data);
          break;
        case 'joined':
          this._refusedOnce = false;
          this.status = 'waiting';
          this.room = { name: '', welcome: '', ...this.room, host: msg.hostName, hostSub: msg.hostSub };
          break;
        case 'refused':
          this.refused(msg.reason);
          break;
        case 'muted':   // a mute decided mid-room: yours gets a pass that says so, a host drops theirs
          if (typeof msg.sub !== 'string' || !Number.isFinite(msg.until)) break;
          if (msg.sub === useSocialStore().claims?.sub) useSocialStore().renewPass();
          else this._host?.mute(msg.sub, msg.until);
          break;
        case 'ended':
        case 'removed':
        case 'replaced':
          this.over(this.role === 'watch' ? refusalWords(msg.type) : null);
          break;
      }
    },

    // A refused pass is tried once more with a fresh one. A wrong password asks for it (wrong only when
    // one was sent: a link's first try goes without). Anything else is the end of it.
    refused(reason) {
      const connection = this._connection;
      if (reason === 'bad-pass' && !this._refusedOnce) {
        this._refusedOnce = true;
        useSocialStore().renewPass().then(() => { if (connection === this._connection) connection.open(); });
      } else if (reason === 'wrong-password') {
        Object.assign(this, { status: 'password', passwordWrong: this._password !== undefined });
      } else {
        this.over(refusalWords(reason));
      }
    },

    over(notice) {
      const social = useSocialStore();
      this._connection = null;   // it's ending itself: no end to send
      this.leave();
      if (notice) social.notice = notice;
    },

    // The watcher's connection to the host: lost goes back to waiting for its next offer. Failed stays
    // until Leave, so the socket closes (the host's next offer would fail the same way).
    watchState(state) {
      if (state === 'failed') {
        const connection = this._connection;
        this._connection = null;
        connection?.close();
      }
      this.stopAsking();   // an answer over a lost connection isn't coming
      this.status = state === 'lost' ? 'waiting' : state;
    },
  },
});

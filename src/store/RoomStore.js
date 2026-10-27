import { defineStore } from 'pinia';
import { markRaw, shallowRef, watch } from 'vue';
import { apiOrigin, wsOrigin } from '@/social/config';
import { proof } from '@/social/keys';
import { LobbyConnection, Pacer } from '@/social/lobby';
import { refusalWords } from '@/social/messages';
import { passKey } from '@/social/pass';
import { Host } from '@/social/hosting';
import { Watch } from '@/social/watching';
import { fontOnWire, fontFor } from '@/social/wire';
import { thumbnailOf } from '@/social/thumbnail';
import { charRowsOf } from '@/lib/Cells';
import { useSocialStore } from '@/store/SocialStore';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

const SEND_EVERY_MS = 100;       // the art, as it changes (a stroke shows as it's drawn)
const VIEW_EVERY_MS = 250;       // the part of the art the host is looking at
const THUMBNAIL_FIRST_MS = 3000;      // the lobby's picture of a public room, soon after it goes live
const THUMBNAIL_EVERY_MS = 180_000;   // then at most this often (the server's own floor is 20 s), and only after a change
const SETTINGS_EVERY_MS = 1250;  // the server's 1 s, with slack: it measures when settings arrive
const ROOM_ID = /^[a-z2-7]{10}$/;

// The room you host or watch: its socket (a LobbyConnection with the room's greeting), and the host's
// side (Host: your art to every watcher) or the watcher's (Watch: the host's art, never your own
// project). One room at a time; signing in or out closes it (SocialStore.becameSomeoneElse).
export const useRoomStore = defineStore('room', {
  state: () => ({
    role: null,          // null | 'host' | 'watch'
    id: null,
    link: null,          // the host's link to the room
    room: null,          // a host's: the Room's room and your welcome; a watcher's: { name, welcome, host }
    // a host's: 'connecting' | 'live' | 'reconnecting'; a watcher's: 'joining' | 'password' | 'waiting' |
    // 'connecting' | 'live' | 'failed'
    status: null,
    passwordWrong: false,
    watchers: [],        // a host's: [{ peer, sub, name, guest, following, connected }]
    art: shallowRef(null),   // a watcher's: { cells, cols, lines, font }
    hostView: null,      // a watcher's: { col, row, cols, rows }
    following: true,
    _connection: null,   // the room's LobbyConnection (markRaw)
    _host: null,         // Host (markRaw)
    _watch: null,        // Watch (markRaw)
    _settings: null,     // Pacer for the host's settings (markRaw)
    _stops: [],          // what close() undoes: the host's watches, timers and pagehide listener
    _password: undefined, // the password the join sent
    _refusedOnce: false, // the room refused a pass since it was last live: the next refusal stands
    _connectWithinMs: undefined,   // the peers' (tests make it short)
  }),

  getters: {
    inRoom: (state) => !!state.role,
  },

  actions: {
    // A new room, live with your art: false (the server's words as the notice) if it wasn't made.
    async startRoom({ name, welcome, isPublic, password, allowGuests, max }) {
      const social = useSocialStore();
      const body = { name, public: isPublic, allowGuests, max, signal: social.signal, ...(isPublic ? {} : { password }) };
      const { ok, data } = await social.request('/api/rooms', { method: 'POST', body });
      if (!ok) return false;
      this.close();
      Object.assign(this, {
        role: 'host', id: data.id, link: data.link, status: 'connecting',
        room: { name, welcome: welcome ?? '', public: isPublic, allowGuests, max, count: 0 },
      });
      this._host = markRaw(new Host({
        send: (msg) => this._connection?.send(msg),
        passKey, connectWithinMs: this._connectWithinMs,
        onWatchers: (list) => { this.watchers = list; },
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
        const webp = await thumbnailOf({ ...art, font: fontFor(art.font) }, { ...workspace.ansiViewOrigin, ...workspace.ansiViewSize });
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
        watch(() => ({ ...workspace.ansiViewOrigin, ...workspace.ansiViewSize }), (v) => { view.push(v); changed(); }, { immediate: true }),
        watch(() => this.status, (status) => {
          if (status === 'live' && this.room.public && pictureAt === null) pictureTimer ??= setTimeout(picture, THUMBNAIL_FIRST_MS);
        }),
        () => { clearTimeout(timer); clearTimeout(pictureTimer); view.reset(); removeEventListener('pagehide', pagehide); },
      ];
      flush();
    },

    // The welcome goes to watchers (never the server); guests and the most watchers go to the Room.
    changeSettings({ welcome, allowGuests, max }) {
      if (this.role !== 'host') return;
      const room = this.room;
      if (welcome !== room.welcome && this._host.room) this._host.setRoom({ ...this._host.room, welcome: welcome ?? '' });
      if (allowGuests !== room.allowGuests || max !== room.max) this._settings.push({ type: 'settings', allowGuests, max });
      this.room = { ...room, welcome: welcome ?? '', allowGuests, max };
    },

    // End room: the Room hears end (close does it for a host), and watchers are put out.
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
      Object.assign(this, { role: 'watch', id, status: 'joining', _password: password });
      this._watch = markRaw(new Watch({
        send: (msg) => this._connection?.send(msg),
        connectWithinMs: this._connectWithinMs,
        onRoom: (room) => { this.room = room; },
        onArt: (art) => { this.art = art; },
        onView: (view) => { this.hostView = view; },
        onState: (state) => this.watchState(state),
      }));
      this.connect({ type: 'join', ...(password === undefined ? {} : { password }) }, { liveOn: ['joined'], endOn: ['refused', 'removed', 'ended'] });
    },

    setFollowing(on) {
      this.following = on;
      this._watch?.setFollowing(on);
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
      this._host?.close();
      this._watch?.close();
      this._settings?.reset();
      for (const stop of this._stops) stop();
      Object.assign(this, {
        role: null, id: null, link: null, room: null, status: null, passwordWrong: false, watchers: [], art: null,
        hostView: null, following: true, _host: null, _watch: null, _settings: null, _stops: [], _password: undefined,
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
          if (connection === this._connection && this.role === 'host' && status !== 'refused' && status !== 'closed') this.status = status;
        },
      }));
      connection.open();
    },

    // The Room's messages (the server's API).
    heard(msg) {
      switch (msg.type) {
        case 'hosting':
          this._refusedOnce = false;
          this.room = { ...msg.room, welcome: this.room.welcome };
          if (!this._host.room) this._host.setRoom({ name: msg.room.name, welcome: this.room.welcome, host: msg.room.hostName });
          this._host.hosting(msg.peers);
          break;
        case 'settings-now':
          this.room = { ...msg.room, welcome: this.room.welcome };
          break;
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
          this.room = { name: '', welcome: '', ...this.room, host: msg.hostName };
          break;
        case 'refused':
          this.refused(msg.reason);
          break;
        case 'ended':
        case 'removed':
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
      this.status = state === 'lost' ? 'waiting' : state;
    },
  },
});

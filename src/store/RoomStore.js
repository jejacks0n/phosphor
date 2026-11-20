import { defineStore } from 'pinia';
import { markRaw, shallowRef, watch } from 'vue';
import { until } from '@vueuse/core';
import { apiOrigin, appOrigin, wsOrigin } from '@/social/config';
import { forgetHostCopy, forgetRoomLedger, hostCopies, keepHostCopy, readLatest, readRoomLedger } from '@/document/autosaveStore';
import { proof, sign } from '@/social/keys';
import { Allowance, MOST_KEPT, REASONS, chatText, evidenceFor, newId, signedText } from '@/social/chat';
import { LobbyConnection, Pacer } from '@/social/lobby';
import { roomAwayWords, hostReplacedWords, artNotOpenedWords, goingBackFailedWords, newHostWords, refusalWords, joinWords, versionWords, hostGoneWords, movedUnreachableWords } from '@/social/messages';
import { parseAddress, DEFAULT_PORT } from '@/social/address';
import { decodePass, passKey } from '@/social/pass';
import { Host, RETURN_WITHIN_MS } from '@/social/hosting';
import { forgetHostingRecord, holdHostingTab, hostingTabsGone, keepHostingRecord, keptHostingRecord } from '@/social/hostingRecord';
import { Watch } from '@/social/watching';
import { fontOnWire, fontFor } from '@/social/wire';
import { thumbnailOf } from '@/social/thumbnail';
import { newSession, sessionJoined, sessionLeft, sessionRemoved, sessionSaid, sessionSaw } from '@/social/session';
import { charRowsOf } from '@/lib/Cells';
import { clampAnsiZoom } from '@/lib/zoom';
import { toast } from '@/composables/useToast';
import { autosaveFailingWords, keepDocument } from '@/composables/useAutosave';
import { useSocialStore } from '@/store/SocialStore';
import { useProjectStore } from '@/store/ProjectStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { desktop } from '@/social/desktop';
import { TONE_GAP_MS, chatFocused, tone } from '@/social/tone';
import { t } from '@/i18n/index.js';
import { formatList } from '@/i18n/format.js';

// The desktop build has no server: a room is served by the room service on the host's computer (desktop/roomService.js),
// started through the desktop bridge, and reached on loopback with the secret it was started with.
const DESKTOP = import.meta.env.VITE_DESKTOP === '1';
const ROOM_PROTOCOL = 1;   // the room service's
const DESKTOP_PORT = 'phosphor-desktop-port';   // the port last chosen to host on, for Start a room's field
const ROOM_ID_LETTERS = 'abcdefghijklmnopqrstuvwxyz234567';   // ROOM_ID's: 32 of them, so a random byte's low 5 bits pick one evenly
const newRoomId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => ROOM_ID_LETTERS[b & 31]).join('');
const MOST_ASKS = 5;   // the service lets no more wait at once
const INFO_WITHIN_MS = 5000;   // what's at an address typed in answers /info within this, or nothing that answers is there
const QUIT_HAND_OVER_MS = 16_000;   // a quitting host's hand-over: within the main process's 20 s wait, with time to end the room
const MOVE_TRY_MS = 5000;   // a room that moved to another computer: each of its addresses goes live within this, or the next is tried
const STANDBY_ABOVE = 20;   // standby starts this far above the remembered port, past the ports a host there may take
// Where standby starts: above the ports a host at `port` may take, or as far below them when its own 20 would run
// past the last port.
const standbyPort = (port) => (port + 2 * STANDBY_ABOVE - 1 <= 65535 ? port + STANDBY_ABOVE : port - 2 * STANDBY_ABOVE);
const keptPort = () => {   // the port last hosted on, for this computer's service; none for the default
  try {
    return Number(localStorage.getItem(DESKTOP_PORT)) || undefined;
  } catch {
    return undefined;
  }
};

// What a room service at this address ('host:port') says it has: its info answer, or { error } with why there's none.
// Something else on that port either answers with something else or closes once it's open (not-phosphor); nothing
// there never opens (unreachable).
// A web server on that port refuses the socket before it opens, as nothing there does: a browser can't tell the two
// apart, so unreachable's words cover both (no Phosphor room answered).
function readInfo(address) {
  return new Promise((resolve) => {
    let socket, opened = false, done = false;
    const answer = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket?.close(); } catch { /* already gone */ }
      resolve(result);
    };
    const nothing = () => answer({ error: opened ? 'not-phosphor' : 'unreachable' });
    const timer = setTimeout(nothing, INFO_WITHIN_MS);
    try {
      socket = new WebSocket(`ws://${address}/info`);
    } catch {
      return nothing();
    }
    socket.onopen = () => { opened = true; };
    socket.onerror = socket.onclose = nothing;
    socket.onmessage = ({ data }) => {
      let info = null;
      try { info = JSON.parse(data); } catch { /* not JSON: not Phosphor */ }
      answer(info?.type === 'info' && Number.isInteger(info.protocol) ? info : { error: 'not-phosphor' });
    };
  });
}

const SEND_EVERY_MS = 100;       // the art, as it changes (a stroke shows as it's drawn)
const VIEW_EVERY_MS = 250;       // the part of the art the host is looking at
const THUMBNAIL_FIRST_MS = 3000;      // the lobby's picture of a public room, soon after it goes live
const THUMBNAIL_EVERY_MS = 180_000;   // then at most this often (the server's own floor is 20 s), and only after a change
const SETTINGS_EVERY_MS = 1250;  // the server's 1 s, with slack: it measures when settings arrive
const ASK_FOR_MS = 3000;        // how long an earlier() waits for its page (the host may drop it unanswered)
const KEEP_EVERY_MS = 1000;     // the host's resume record, as the room changes (and at once on pagehide)
// How often an idle host's copy of it says it's still here, or it would read as too old to come back to. A hidden tab's
// timers can run a minute apart once it has no one connected, so one closed unseen may not be offered.
const HOST_HERE_EVERY_MS = 15_000;
const GONE_FOR_MS = 1800;   // no tab holding a room's lock for this long before it's offered: two of SOCIAL's looks, 2 s apart, less their jitter
const ART_WRITTEN_WITHIN_MS = 3000;   // a document the host just opened has no first write for a second or so
const ART_LOOK_EVERY_MS = 250;
const RESUME_RETRY_MS = 3000;   // a host coming back asks again after this, then twice that, and so on, for a pass or a room that was too busy to answer
const DOCUMENT_BACK_WITHIN_MS = 5000;   // named host just after a reload: how long to wait for the art to open
const HAND_OVER_ANSWERED_WITHIN_MS = 5000;
const HOST_SOCKET = { liveOn: ['hosting'], endOn: ['refused', 'ended', 'replaced', 'new-host'] };
export const ROOM_ID = /^[a-z2-7]{10}$/;
// The wait before a returning host's next try (tries made so far): 3 s, 6 s, 12 s and on, no longer than
// what's left of RETURN_WITHIN_MS since it began; 0 once that's gone.
const retryIn = (tries, began) => Math.min(RESUME_RETRY_MS * 2 ** tries, Math.max(0, began + RETURN_WITHIN_MS - Date.now()));

// What's typed in Start a room and Room settings, kept here so it stays while you're on another tab (the
// SOCIAL tab isn't there then). Room settings also keeps what the room last said for each field (seen).
export const MAX_WATCHERS = 30;   // the server's own limit; a higher number typed in comes back to it
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
// The room itself, reported (from inside it or from the lobby), is kept the same way, as this sub.
const ROOM_REPORT = '*room';
export const hasReportedRoom = (room) => reportedIn(room, useSocialStore().claims?.sub).includes(ROOM_REPORT);
export const keepRoomReport = (room) => {
  const social = useSocialStore();
  keepReport(room, social.claims?.sub, ROOM_REPORT);
  social.roomReports.push({ room, by: social.claims?.sub });
};
// Every room reported in this browser and by which account ({ room, by }), for the lobby's cards.
export const keptRoomReports = () => keptReports().filter((r) => r.sub === ROOM_REPORT).map(({ room, by }) => ({ room, by }));
const REPORT_PICTURE = { width: 480, most: 96 * 1024 };   // the server's limit on a room report's picture, as base64 characters

// The rooms you left for good (Exit, End, removed, ended, another joined), in sessionStorage so a reload
// knows: Back or Forward onto their entries doesn't join them again. Only your own join forgets one.
const LEFT_ROOMS = 'phosphor-left-rooms';
const noteLeft = (id, left) => {
  try {
    const others = JSON.parse(sessionStorage.getItem(LEFT_ROOMS) ?? '[]').filter((other) => other !== id);
    sessionStorage.setItem(LEFT_ROOMS, JSON.stringify(left ? [...others, id] : others));
  } catch { /* no storage: where reads fail too, every room reads as left; a write alone failing loses this note */ }
};
export const hasLeftRoom = (id) => {
  try {
    return JSON.parse(sessionStorage.getItem(LEFT_ROOMS) ?? '[]').includes(id);
  } catch {
    return true;   // joining shows the host your IP address: not knowing means no
  }
};

// Whether autosave has this document, waiting a moment for one just opened; false if it can't be read.
async function artWritten(id) {
  const end = Date.now() + ART_WRITTEN_WITHIN_MS;
  try {
    while (!await readLatest(id)) {
      if (Date.now() >= end) return false;
      await new Promise((resolve) => setTimeout(resolve, ART_LOOK_EVERY_MS));
    }
    return true;
  } catch {
    return false;
  }
}

// The cell in the middle of a view ({ col, row, cols, rows }), or the top left without one.
const middleOf = (v) => (v ? { middleCol: v.col + v.cols / 2, middleRow: v.row + v.rows / 2 } : { middleCol: 0, middleRow: 0 });

// A row as a Host's log keeps it, for someone who takes the room over with the chat they've seen.
const logEntry = ({ id, ts, deleted, text, pass, sig, presence }) => (deleted ? { id, ts, deleted: true } : presence ? { pass, id, ts, presence } : { pass, id, ts, text, sig });

// A deleted message as the list shows it: nothing says whose it was.
const deletedRow = ({ id, ts }) => ({ id, ts, text: '', pass: null, sig: null, sub: null, name: null, host: false, mine: false, deleted: true });

// What's open, as a room's picture.
const artOf = (project, workspace) => ({ cells: project.cells, cols: project.cols, lines: charRowsOf(project.rows), font: fontOnWire(workspace.displayFontSpec) });
const newStartDraft = () => ({ name: '', welcome: '', isPublic: true, password: '', allowGuests: true, max: 12, signal: null, ...(DESKTOP ? { port: keptPort() ?? DEFAULT_PORT } : {}) });
const newSettingsDraft = () => ({ welcome: '', allowGuests: true, max: 12, signal: null, seen: {} });

// A host's side of a room, as no one has it: what becomeArtist leaves behind.
const hostFields = () => ({
  link: null,          // the host's link to the room
  hasPassword: false,  // a host's: the room was made with a password (it can't change)
  watchers: [],        // a host's: [{ peer, sub, name, guest, tracking, connected }]
  peopleOpen: false,   // a host's: the chat panel's "N here" list is open
  muted: [],           // a host's: the subs it muted in this room (their messages reach only them, and the host)
  lobbyPin: null,      // a host's (picked in Setup room, or while live): the top-left cell { col, row } the lobby picture uses; null while it follows the view
  session: newSession(),   // a host's: what this browser counted since the room started (social/session.js)
  _host: null,         // Host (markRaw)
  _settings: null,     // Pacer for the host's settings (markRaw)
  _keepTimer: null,    // the resume record's next write
  _resuming: false,    // a host's: back from a reload, and the room hasn't said hosting yet
  _refusedOnce: false, // the room refused a pass since it was last live: the next refusal stands
  _leaveKept: false,   // the copy and ledger in the browser aren't done with: another tab took the room, or this one couldn't open its art
  _letGoOfTab: null,   // lets go of the lock that says a tab is hosting this room
  _hostedBy: null,     // the account that took the role; another tab's sign-in can change who this tab's pass says it is
  ...(DESKTOP ? {
    addresses: [],     // where others on the network reach this computer's room service ('host:port')
    port: null,        // the port it listens on
    asks: [],          // joins waiting for the host's yes or no: [{ ask, sub, name }], at most MOST_ASKS
    hostable: {},      // sub -> addresses an artist's own room service answered at: they could host next
    _desktop: null,    // { secret, port }: the service's, for the host's own sockets to it
  } : {}),
});

// A watcher's side, the same: carryOn leaves this behind as well. Hosting doesn't touch it, so becomeArtist needn't.
const watcherFields = () => ({
  art: null,           // a watcher's: { cells, cols, lines, font }
  hostView: null,      // a watcher's: { col, row, cols, rows, zoom }
  lookingAt: null,     // a watcher's: the cell in the middle of the art in view { middleCol, middleRow } (RoomArt's looking-at)
  tracking: true,
  following: null,     // a watcher's: the sub of the host (it starts there) or of the artist whose view is the one tracked
  showEveryone: false, // a watcher's: the others' boxes and tags show too
  showBox: true,       // a watcher's: the followed one's box shows (false: just followed)
  artistViews: {},     // a watcher's: sub -> view, of the artists the host has sent
  artZoom: 1,          // a watcher's: the zoom the art is drawn at; while tracking, the host's, or less to fit their view
  artFit: 1,           // a watcher's: the biggest zoom that fits all of the host's view in the window
  joinedAt: null,      // a watcher's: the id of the last message in its first history ("You joined" comes after it)
  _watch: null,        // Watch (markRaw)
  _password: undefined, // the password the join sent
  ...(DESKTOP ? {
    _joinedAs: null,       // joined's { peer, token }: the channel to the host's service is theirs
    _handOverExtra: null,  // what the host's hand-over brought besides the ledger: the room's settings, for carryOn
    _standby: null,        // drawing: this computer's service is on standby, at these addresses ([] until it says), so the host knows where it could host next
    _moveTimer: null,      // the room moved to another computer: the wait for this address to go live before the next is tried
  } : {}),
});

// No room at all: what close() goes back to. The chat and what's reported go only here: a role changing hands keeps them.
const noRoom = () => ({
  role: null,          // null | 'host' | 'watch'
  id: null,
  room: null,          // a host's: the server's room and your welcome; a watcher's: { name, welcome, host, hostSub } (joined's host and its account)
  // a host's: 'connecting' | 'live' | 'reconnecting'; a watcher's: 'joining' | 'password' | 'asked' (desktop: the
  // host's yes still to come) | 'waiting' (for the host's art) | 'connecting' | 'live' | 'failed'
  status: null,
  passwordWrong: false,
  ...hostFields(),
  ...watcherFields(),
  chat: [],            // [{ id, ts, text, sub, name, host, mine, deleted, pass, sig, presence?, muted? }], oldest first, at most MOST_KEPT; presence is 'joined' or 'left'
  chatMore: false,     // the host has older messages to ask for (never once the list is full: it goes no further back)
  chatRefused: null,   // 'too-fast' until the next message goes
  reported: [],        // the subs you reported in this room (Report is gone for them there, rejoining too), and ROOM_REPORT once you reported the room
  _allowance: null,    // the composer's Allowance (markRaw)
  _asking: false,      // a watcher's earlier() is waiting for its answer
  _toneAt: -Infinity,  // when the last chat tone played (chime)
  _askTimer: null,     // gives up on that answer after ASK_FOR_MS
  _stops: [],          // what close() undoes: the host's watches, timers and pagehide listener
  _tookOver: false,    // named host by the room: the hosting that follows starts the Host off
  _named: null,        // named host, and not on with it yet: { planned, words, heard, passing, to, tried, timer } (markRaw)
});

// The room you host or watch: its socket (a LobbyConnection with the room's greeting), and the host's
// side (Host: your art to every watcher) or the watcher's (Watch: the host's art, never your own
// project). One room at a time; signing in or out closes it (SocialStore.becameSomeoneElse).
// The start pages keep Start off while a layer is on a plugin solver; called anyway, a start throws with why.
function refusePluginSolvers(room) {
  const why = room.pluginSolversWhy;
  if (why) throw Object.assign(new Error('pluginSolvers'), { userMessage: why });
}

export const useRoomStore = defineStore('room', {
  state: () => ({
    ...noRoom(),
    art: shallowRef(null),   // the art's cells aren't made reactive
    startDraft: newStartDraft(),         // Start a room's form; empty again once a room is made
    settingsDraft: newSettingsDraft(),   // a host's Room settings form
    _connection: null,   // the room's LobbyConnection (markRaw)
    _connectWithinMs: undefined,   // the peers' (tests make it short)
    _endAnswer: null,    // answers End the room? while Back past going live waits on it (markRaw)
    _resumeBegan: 0,     // when it began, which RETURN_WITHIN_MS counts from
    _throttled: 0,       // the room's refusals as too busy since then: the socket's retry steps on from each
    reclaimable: [],     // rooms of yours whose tab has gone, to go back to: [{ id, name }]
    goingBack: false,    // the page is reloading into one of them, with what's open kept: nothing to ask about leaving
    _seenGone: {},       // id -> when a look first found the room's tab gone, for as long as looks keep finding that (a reload's gap is shorter)
    ...(DESKTOP ? {
      needsPassword: null,   // joinAddress's room asks for a password: { address, name }, for the page to ask
      _address: null,        // the host's 'host:port' a watcher joined by: its room service's /room and /channel
    } : {}),
  }),

  getters: {
    inRoom: (state) => !!state.role,
    askingEnd: (state) => !!state._endAnswer,
    hereNow: (state) => state.watchers.filter((w) => w.connected).length,   // a host's: watchers connected now
    // Only a confirmed member sends; guests and unconfirmed members read.
    canChat() {
      const claims = useSocialStore().claims;
      return !!claims && !claims.guest && claims.verified;
    },
    // Reporting is for the same people (a guest can't chat, so can't be reported).
    // On desktop there's no one to report to.
    canReport() {
      return !DESKTOP && this.canChat;
    },
    // Why a room can't be hosted with this drawing: its layers on a plugin solver, a stand-in or not (the drawing holds
    // the choice), which rooms don't use; null when none is. The start pages show it and keep Start off.
    pluginSolversWhy() {
      const project = useProjectStore(), layers = project.pluginSolverLayers;
      const filters = Object.values(project.filterOptions).map(({ name }) => name); // on, here or not: the drawing holds them
      const why = [
        layers.length && t('room.pluginSolvers', { names: formatList(layers.map(({ name }) => name)) }, layers.length),
        filters.length && t('room.pluginFilters', { names: formatList(filters) }, filters.length),
      ].filter(Boolean);
      return why.length ? why.join(' ') : null;
    },
    // A watcher reported this room (Report room is gone).
    roomReported: (state) => state.reported.includes(ROOM_REPORT),
    // Going back replaces what's open, so it says so as Accept does.
    goingBackReplaces() {
      const project = useProjectStore();
      return !!project.image && (project.isDirty || !!project._stroke);
    },
    // Report room, for a watcher who can report, until they have; never in your own room (watched from a second tab).
    canReportRoom() {
      return !DESKTOP && this.role === 'watch' && this.canReport && !this.roomReported && this.room?.hostSub !== useSocialStore().claims?.sub;
    },
    // When your silence ends (epoch ms), while your pass says you're silenced.
    silencedUntil: () => useSocialStore().claims?.silencedUntil ?? null,
    // A watcher's: the view being followed, the host's or an artist's, or null while there's none yet. The host's sub is
    // read from the room each time: it can change.
    followedView() {
      if (!this.following || this.following === this.room?.hostSub) return this.hostView;
      return Object.hasOwn(this.artistViews, this.following) ? this.artistViews[this.following] : null;   // not an Object's method of that name
    },
    // A watcher's: who can be followed, the host and the artists the host has named.
    followable() {
      const drawing = useDrawingStore(), me = useSocialStore().claims?.sub;
      const host = this.room?.hostSub ? [{ sub: this.room.hostSub, name: this.room.host, host: true }] : [];
      return [...host, ...drawing.artists.filter((sub) => sub !== me && Object.hasOwn(drawing.artistNames, sub) && drawing.artistNames[sub]).map((sub) => ({ sub, name: drawing.artistNames[sub] }))];
    },
    // A watcher's: there is a list to choose from (more than the host, and not drawing yourself).
    canFollow() {
      return this.role === 'watch' && !useDrawingStore().mayDraw && this.followable.length > 1;
    },
    followedName() {
      return this.followable.find((p) => p.sub === (this.following ?? this.room?.hostSub))?.name ?? this.room?.host ?? null;
    },
    // A watcher's: the boxes of the others, with Show everyone on.
    otherBoxes() {
      if (!this.showEveryone) return [];
      const followed = this.following ?? this.room?.hostSub;
      return this.followable.filter((p) => p.sub !== followed).map((p) => ({ ...p, view: p.host ? this.hostView : Object.hasOwn(this.artistViews, p.sub) ? this.artistViews[p.sub] : null })).filter((p) => p.view);
    },

    // Whether this artist could take the room over: on desktop, only one whose own room service answered.
    canBeHost: (state) => (sub) => !DESKTOP || !!state.hostable[sub]?.length,

    // The names more than one person here goes by (you, the host, the watchers, the artists, who spoke, who asks to
    // join): on desktop anyone can pick any name, so these are told apart by their sub (UserName).
    sameNames() {
      const drawing = useDrawingStore(), subs = new Map();
      const people = [useSocialStore().claims, { sub: this.room?.hostSub, name: this.room?.host }, ...this.watchers, ...this.chat, ...this.asks,
        ...Object.entries(drawing.artistNames).map(([sub, name]) => ({ sub, name }))];
      for (const { sub, name } of people.filter(Boolean)) if (sub && name) subs.set(name, (subs.get(name) ?? new Set()).add(sub));
      return new Set([...subs].filter(([, held]) => held.size > 1).map(([name]) => name));
    },

    // Where the lobby picture looks: the cell it's pinned to, else the middle of the shared view.
    lobbyPlace() {
      if (this.lobbyPin !== null) return { ...this.lobbyPin };
      return middleOf(useWorkspaceStore().sharedView);
    },
  },

  actions: {
    // A new room, live with your art: false (the server's words as the notice) if it wasn't made.
    // Only a public room sends its signal: the signal shows on its lobby card, and a link-only room has none.
    async startRoom({ name, welcome, isPublic, password, allowGuests, max, signal = null, port }) {
      const project = useProjectStore();
      if (project.fontNotSetUp) {   // a room can't set up its blocks
        toast(project.fontNotSetUp);
        return false;
      }
      if (project.hasFrames) return false;   // frames never travel, so they'd be lost at a handover (StartRoomPage says why)
      refusePluginSolvers(this);
      const social = useSocialStore();
      if (DESKTOP) return this.startDesktopRoom({ name, welcome, password, max, port });
      const body = { name, public: isPublic, allowGuests, max, signal: isPublic ? signal : null, ...(!isPublic && password ? { password } : {}) };   // a private room's password is optional
      const { ok, data, code } = await social.request('/api/rooms', { method: 'POST', body });
      if (code === 'SILENCED') social.renewPass();   // a pass that says so, so Start a room is off now
      if (!ok) return false;
      social.notice = null;   // what it said was about somewhere else
      social.page = 'lobby';  // Start a room closes: the chat in the side panel is the room's now
      const lobbyPin = isPublic ? this.lobbyPin : null;   // picked in Setup room, kept through close()
      this.close();
      this.hostRoom({
        startDraft: newStartDraft(), settingsDraft: newSettingsDraft(), hasPassword: !isPublic && !!password, lobbyPin,
        id: data.id, link: `${appOrigin()}/?room=${data.id}`, status: 'connecting',
        room: { name, welcome: welcome ?? '', public: isPublic, allowGuests, max, signal: isPublic ? signal : null, count: 0 },
      });
      this.share();
      this.connect({ type: 'host' }, HOST_SOCKET);
      return true;
    },

    // startRoom on desktop: this computer's room service in place of the server, with no lobby, link or guests. Every
    // join waits for the host's yes, and the password goes only to the service.
    async startDesktopRoom({ name, welcome, password, max, port }) {
      refusePluginSolvers(this);
      const social = useSocialStore();
      // One service: a room hosted here ends, or standby stops, before a room starts on it (else close() below would stop it).
      if (this.role === 'host' || this._standby) this.close();
      let service;
      try {
        await social.getPass();   // whose service it is (the sub)
        service = await desktop.startService({ port, mode: 'host', sub: social.claims.sub });
      } catch (error) {
        console.warn('The room service didn\'t start.', error);
        social.notice = t('social.notices.serviceFailed');
        return false;
      }
      if (port !== undefined) {
        try {
          localStorage.setItem(DESKTOP_PORT, String(port));
        } catch { /* no storage: the field starts at the default */ }
      }
      social.notice = null;
      social.page = 'lobby';
      this.close();
      const id = newRoomId();
      this.hostRoom({
        startDraft: newStartDraft(), settingsDraft: newSettingsDraft(), hasPassword: !!password, lobbyPin: null,
        id, link: null, status: 'connecting', addresses: service.addresses, port: service.port, _desktop: { secret: service.secret, port: service.port },
        room: { name, welcome: welcome ?? '', max, count: 0 },
        _password: password || undefined,   // in memory alone, for the next host (handOverExtra)
      });
      this.share();
      this.connect(this.desktopGreeting(password), HOST_SOCKET);
      return true;
    },

    // A desktop host's greeting: the service's secret and the room. A later greeting (a reload) is the room the service
    // already has, so it needn't bring the password again.
    // ponytail: a reload before the first greeting reached the service makes the room again without its password;
    // ask the service's /info first if that window matters.
    desktopGreeting(password = null) {
      const { name, welcome, max } = this.room;
      return { type: 'host', secret: this._desktop.secret, room: { id: this.id, name, welcome, password: password || null, max, approved: [] } };
    },

    // You're this room's host: these fields, and a Host (with what it kept, for a room coming back). What
    // was kept is taken first, so one that can't be taken throws with nothing changed.
    hostRoom(fields, kept = null) {
      const drawing = useDrawingStore(), project = useProjectStore();
      project._hosting = true;   // a room is a still, with or without anyone drawing (frames never travel)
      project.setAnimate(false);
      const host = markRaw(new Host({
        ...drawing.hostCallbacks(),
        send: (msg) => this._connection?.send(msg),
        passKey, connectWithinMs: this._connectWithinMs, roomId: fields.id,
        // A watcher's channel through the service, which pairs it with theirs; _desktop read then, as a reload sets it later.
        // The next host's room is made from this room's settings, with everyone here already let in.
        ...(DESKTOP ? {
          config: { channelUrl: (peer) => `ws://127.0.0.1:${this._desktop.port}/channel?peer=${encodeURIComponent(peer)}&secret=${encodeURIComponent(this._desktop.secret)}` },
          // Its artists go on being them there, this host among them, as the web's room keeps them through a hand-over.
          handOverExtra: () => {
            const { name, welcome, max } = this.room, me = useSocialStore().claims?.sub;
            return {
              password: this._password ?? null, max, welcome, name,
              approved: [...new Set([me, ...this.watchers.map((w) => w.sub)])].filter(Boolean),
              artists: [...new Set([me, ...drawing.artists])].filter(Boolean),
            };
          },
        } : {}),
        onWatchers: (list) => {
          this.watchers = list;
          drawing.peopleHere(list);
          this.keepSoon();
        },
        onChat: (event) => {
          this.chatHeard(event);
          this.keepSoon();
        },
      }));
      if (kept) host.restore(kept);
      drawing.hosted(host, { me: () => useSocialStore().claims?.sub, name: () => useSocialStore().claims?.name });
      Object.assign(this, { ...fields, role: 'host', _host: host, _hostedBy: fields._hostedBy ?? useSocialStore().claims?.sub ?? null, _letGoOfTab: holdHostingTab(fields.id), _settings: markRaw(new Pacer(SETTINGS_EVERY_MS, (msg) => this._connection?.send(msg) ?? false)) });
    },

    // The room this tab was hosting before a reload, from its record: in place at once, for the router's
    // first look and the Host page; the socket waits for you and the art (comeBack). A record that can't
    // be read changes nothing, and one that can't be restored is forgotten as well.
    resume() {
      if (DESKTOP) this.stopStrayStandby();
      const record = keptHostingRecord();
      if (!ROOM_ID.test(record?.id) || !record.sub || !record.room || !Array.isArray(record.session?.people)) return;
      const { id, link, room, hasPassword, session, lobbyPin, peopleOpen, muted, view } = record;
      try {
        const { col, row } = !view ? {} : view.viewTab === 'input' ? view.inputView : view.ansiViewOrigin;
        this.hostRoom({ id, link, room, hasPassword, session, lobbyPin, peopleOpen, muted, status: 'reconnecting', _hostedBy: record.sub, _resuming: true, _resumeBegan: Date.now(), _throttled: 0 }, { ...record.host, muted });
        if (view) Object.assign(useWorkspaceStore(), view, { viewToRestore: { tab: view.viewTab, col, row } });   // here, so watchers are shown it whichever tab this lands on
      } catch {
        forgetHostingRecord();
        forgetHostCopy(record.id).catch(() => {});
        return;
      }
      useSocialStore()._roomGoesOn = true;
      this.comeBack(record).catch((error) => {
        console.warn('The room couldn\'t come back.', error);
        if (this.id === id) this.over(goingBackFailedWords());
      });
    },

    // The rest of resume(): only for the account that hosted, and only with the art to show. Its pass is
    // renewed here if it ran out. A pass that can't be had says nothing about who you are, so it's asked for
    // again until those who were here would have stopped waiting.
    // ponytail: End room in that moment has no socket to send end on, so the room's wait ends it instead.
    async comeBack(record) {
      const social = useSocialStore(), project = useProjectStore(), workspace = useWorkspaceStore();
      const gone = () => this.id !== record.id;
      const askForPass = () => social.getPass().catch(() => {});
      await social.boot();
      if (gone()) return;
      if (DESKTOP) {   // the service outlives a reload, not a relaunch
        const service = await desktop.serviceInfo().catch(() => null);
        if (gone()) return;
        if (service?.mode !== 'host') return this.over(roomAwayWords());
        // The password in memory again (never the record), for the next host.
        Object.assign(this, { addresses: service.addresses, port: service.port, _desktop: { secret: service.secret, port: service.port }, _password: service.password || undefined });
      }
      await askForPass();
      const late = !social.claims;
      for (let tries = 0; !gone() && !social.claims; tries++) {
        const wait = retryIn(tries, this._resumeBegan);
        if (!wait) return this.over(roomAwayWords());
        await new Promise((resolve) => setTimeout(resolve, wait));
        if (!gone()) await askForPass();
      }
      if (gone()) return;
      if (social.claims.sub !== record.sub) return this.close();
      if (late && !social.me && !DESKTOP) {   // boot's ask failed the same way
        await social.refreshMe();
        if (gone()) return;
      }
      const only = new Set(record.host.only.map(([id]) => id));
      this.chat = record.host.log.map((entry) => {
        if (entry.deleted) return deletedRow(entry);
        const row = this.chatRow(entry);
        return only.has(entry.id) ? { ...row, muted: true } : row;
      });
      await until(() => !!project.image || workspace.documentAnswered).toBe(true, { timeout: Math.max(0, this._resumeBegan + RETURN_WITHIN_MS - Date.now()) });   // a database that never answers is the room gone
      if (gone()) return;
      if (!project.image && !workspace.documentAnswered) return this.over(roomAwayWords());
      if (!project.image) {   // the room is still waiting, and another try may open it
        this._leaveKept = true;
        return this.over(artNotOpenedWords());
      }
      const kept = await readRoomLedger(record.id).catch(() => null);
      if (gone()) return;
      useDrawingStore().resumeHosting(record, kept);
      this.share();
      this.connect(DESKTOP ? this.desktopGreeting() : { type: 'host' }, HOST_SOCKET);
    },

    // What this tab keeps of the room you host, for resume().
    // ponytail: host.kept() is the newest KEPT_THROUGH_RELOAD (1000) entries of the chat, to fit sessionStorage; IndexedDB if a whole log should come back.
    keepRecord() {
      if (this.role !== 'host') return;
      const { id, link, room, hasPassword, session, lobbyPin, peopleOpen, muted } = this;
      const { viewTab, ansiZoom, editZoom, ansiViewOrigin, ansiViewSize, ansiViewZoom, inputView } = useWorkspaceStore();
      const view = { viewTab, ansiZoom, editZoom, ansiViewOrigin, ansiViewSize, ansiViewZoom, inputView };
      const { artists, invited } = useDrawingStore();
      this._hostedBy ??= useSocialStore().claims?.sub ?? null;   // a room can be made before the pass is back
      const record = { sub: this._hostedBy, documentId: useProjectStore().documentId, id, link, room, hasPassword, session, lobbyPin, peopleOpen, muted, artists, invited, host: this._host.kept(), view };
      keepHostingRecord(record);
      if (record.sub === useSocialStore().claims?.sub) keepHostCopy(record).catch(() => {});   // on pagehide this may not land: the last one is at most a second behind what changed
    },

    // This tab is done hosting, and what was kept for coming back goes with it.
    doneHosting() {
      useProjectStore()._hosting = false;
      forgetHostingRecord();
      if (!this._leaveKept) {
        forgetRoomLedger(this.id).catch(() => {});
        forgetHostCopy(this.id).catch(() => {});
      }
      this._letGoOfTab?.();
    },

    // SOCIAL looks every so often for a room of yours whose tab has gone: its copy is here, and no tab has held its lock
    // at any look for about 2 s. A lobby card naming someone else means the role has moved, and the copy goes.
    async lookForOwnRooms() {
      if (DESKTOP) return;   // a desktop room doesn't outlive the app
      const social = useSocialStore(), sub = social.claims?.sub;
      const mine = sub && !this.role ? (await hostCopies().catch(() => [])).filter((copy) => copy.sub === sub) : [];
      const here = mine.filter((copy) => {
        const card = social.lobby.rooms.get(copy.id);
        if (!card || !copy.hostName || card.host === copy.hostName) return true;
        forgetHostCopy(copy.id).catch(() => {});
        return false;
      });
      const gone = await hostingTabsGone(here.map((copy) => copy.id));
      const now = Date.now(), seen = Object.fromEntries(gone.map((id) => [id, this._seenGone[id] ?? now]));
      this.reclaimable = this.role || social.claims?.sub !== sub ? [] : here.filter((copy) => now - (seen[copy.id] ?? now) >= GONE_FOR_MS).map(({ id, name }) => ({ id, name }));
      this._seenGone = seen;
    },

    // SOCIAL isn't showing: what the last looks saw says nothing about when it's back.
    stopLooking() {
      this._seenGone = {};
      this.reclaimable = [];
    },

    // Back to a room of yours from another tab: a reload that comes back to it, with its record and document put where a
    // reload looks for them. What's open goes into the browser's own list first, as it would for Accept. The rest is
    // resume() and comeBack(), with what they do about a room that's over or a role that's moved.
    async goBackToRoom(id, { reload = () => location.reload() } = {}) {
      if (DESKTOP) return;
      const social = useSocialStore(), project = useProjectStore();
      const notOffered = () => { this.reclaimable = this.reclaimable.filter((room) => room.id !== id); };
      const copy = (await hostCopies().catch(() => [])).find((row) => row.id === id && row.sub === social.claims?.sub);
      if (!copy) {
        notOffered();
        social.notice = goingBackFailedWords();
        return;
      }
      if (!(await hostingTabsGone([id])).length) return notOffered();   // its tab is back, or another went back first
      const record = JSON.parse(copy.record);
      if (!await artWritten(record.documentId)) {
        notOffered();
        forgetHostCopy(id).catch(() => {});
        social.notice = artNotOpenedWords();
        return;
      }
      project.commitPending();
      if (project.image && !await useDrawingStore().autosaved()) {
        social.notice = autosaveFailingWords();
        return;
      }
      if (!(await hostingTabsGone([id])).length) return notOffered();   // it came back while that was going on
      if (!keepHostingRecord(record)) {
        social.notice = goingBackFailedWords();
        return;
      }
      keepDocument(record.documentId);
      this.goingBack = true;
      reload();
    },

    keepSoon() {
      this._keepTimer ??= setTimeout(() => {
        this._keepTimer = null;
        this.keepRecord();
      }, KEEP_EVERY_MS);
    },

    // The host's art to the Host as it changes, at most every SEND_EVERY_MS, and its view at most every
    // VIEW_EVERY_MS. Every change makes new cells (setCells), which the Host compares cell by cell
    // against what it sent. While a slider moves, nothing goes: its end goes as one change. A public
    // room's lobby picture goes once soon after it's live, then after a change, 3 minutes apart at least.
    share() {
      const project = useProjectStore(), workspace = useWorkspaceStore(), drawing = useDrawingStore();
      let timer = null, pictureTimer = null, pictureAt = null;
      const artNow = () => artOf(project, workspace);
      const flush = () => {
        timer = null;
        if (project._sliderBefore || project._charsBefore) return schedule();
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
      const pagehide = () => {   // a reload isn't the room's end: what comes back reads this, and watchers are told
        this.keepRecord();
        this._host?.goingAway();
      };
      addEventListener('pagehide', pagehide);
      this._stops = [
        watch([() => project.cells, () => project.cols, () => project.rows, () => workspace.displayFontSpec], () => { schedule(); changed(); }),
        watch(() => workspace.displayFontLoaded && workspace.sharedView, (v) => { if (v) view.push(v); }, { immediate: true }),   // PIXEL's zoom is against the font's width: not before it's in
        watch(() => JSON.stringify(this.lobbyPlace), changed, { immediate: true }),
        watch(() => this.hereNow, (here) => sessionSaw(this.session, here), { immediate: true }),
        watch(() => project.documentId, () => {
          workspace.viewToRestore = null;   // another document isn't where the old one was scrolled to
          this.keepRecord();   // at once: a tab closed now must not bring the old document back to the room
        }),
        watch([() => this.room, () => this.lobbyPin, () => this.peopleOpen, () => this.muted, () => drawing.artists, () => drawing.invited, () => workspace.sharedView], () => this.keepSoon()),
        ((here) => () => clearInterval(here))(setInterval(() => this.keepRecord(), HOST_HERE_EVERY_MS)),
        watch(() => this.status, (status) => {
          if (status === 'live') this.session.liveSince ??= Date.now();   // a reconnect keeps it
          if (status === 'live') this.keepSoon();
          if (status === 'live' && this.room.public && pictureAt === null) pictureTimer ??= setTimeout(picture, THUMBNAIL_FIRST_MS);
        }),
        () => { clearTimeout(timer); clearTimeout(pictureTimer); clearTimeout(this._keepTimer); view.reset(); removeEventListener('pagehide', pagehide); },
      ];
      this.keepRecord();
      flush();
    },

    // The welcome goes to watchers (never the server); guests, the max watchers and the signal go to the server.
    changeSettings({ welcome, allowGuests, max, signal = this.room.signal ?? null }) {
      if (this.role !== 'host') return;
      const room = this.room;
      if (welcome !== room.welcome && this._host.room) this._host.setRoom({ ...this._host.room, welcome: welcome ?? '' });
      if (allowGuests !== room.allowGuests || max !== room.max || signal !== (room.signal ?? null)) this._settings.push({ type: 'settings', allowGuests, max, signal });
      this.room = { ...room, welcome: welcome ?? '', allowGuests, max, signal };
    },

    // Puts the host's link on the clipboard; false (and a notice) when the browser won't.
    // On desktop there's no link: the first address others can join at, or this computer's own with none.
    async copyLink() {
      try {
        await navigator.clipboard.writeText(DESKTOP ? this.addresses[0] ?? `127.0.0.1:${this.port}` : this.link);
        return true;
      } catch {
        useSocialStore().notice = t('social.notices.copyLinkFailed');
        return false;
      }
    },

    // End room: the server hears end (close does it for a host), and watchers are kicked.
    endRoom() {
      this.leave();
    },

    // End the room?, for Back past going live (App shows it): true to end it.
    askToEnd() {
      return new Promise((resolve) => { this._endAnswer = markRaw(resolve); });
    },
    answerEnd(yes) {
      const answer = this._endAnswer;
      this._endAnswer = null;
      answer?.(yes);
    },

    // A room by its id (a lobby card's Join, or a ?room= link), with its password once it asks for one.
    // keepNotice: this comes with what the notice says (signing in, a link back from confirming an email). show: the
    // ROOM tab is shown (a join you asked for; not your own room coming back, or a rejoin in place).
    join(id, { password, keepNotice = false, show = false } = {}) {
      const social = useSocialStore();
      if (!ROOM_ID.test(id)) {
        social.notice = refusalWords('unavailable');
        return;
      }
      if (!keepNotice && id !== this.id) social.notice = null;   // what it said was about somewhere else
      this.close({ spent: this.id !== id });   // the same room again (its password, say): still in it, as an artist too
      noteLeft(id, false);
      this.watchRoom(id, { password });
      if (show) useWorkspaceStore().editorTab = 'room';
    },

    // Desktop: a room by the address typed in (Join), asked what's there first. False with a notice when it isn't a room
    // to join, and false with needsPassword set when it asks for a password that wasn't given.
    async joinAddress(text, { password } = {}) {
      const social = useSocialStore(), at = parseAddress(text);
      this.needsPassword = null;
      const info = at.error ? at : await readInfo(at.address);
      if (info.error) {
        social.notice = joinWords(info.error);
        return false;
      }
      if (info.protocol !== ROOM_PROTOCOL) {
        social.notice = versionWords(info.protocol, ROOM_PROTOCOL);
        return false;
      }
      if (info.id === null || !ROOM_ID.test(info.id)) {
        social.notice = joinWords(info.id === null ? 'no-room' : 'not-phosphor');
        return false;
      }
      const name = typeof info.name === 'string' ? info.name : '';
      if (info.password && !password) {
        this.needsPassword = { address: at.address, name };
        return false;
      }
      this._address = at.address;
      this.join(info.id, { password: info.password ? password : undefined, show: true });
      this.room = { name, welcome: '' };   // until the host's own word on it
      return true;
    },

    // In as a watcher: a Watch, and the socket's join. The chat stays with someone who was already in.
    watchRoom(id, { password } = {}) {
      const social = useSocialStore();
      Object.assign(this, { role: 'watch', id, status: 'joining', _password: password, reported: reportedIn(id, social.claims?.sub) });
      if (social.signedIn) social.loadBlocked();   // whose messages to hide
      const drawing = useDrawingStore();
      this._watch = markRaw(new Watch({
        ...drawing.watchCallbacks(),
        send: (msg) => this._connection?.send(msg),
        connectWithinMs: this._connectWithinMs, roomId: id, passKey,
        // The channel to the host through its service, as joined's peer: read then, as a rejoin changes it.
        ...(DESKTOP ? {
          config: { channelUrl: () => `ws://${this._address}/channel?peer=${encodeURIComponent(this._joinedAs?.peer)}&token=${encodeURIComponent(this._joinedAs?.token)}` },
          onHandOverExtra: (extra) => { this._handOverExtra = extra && typeof extra === 'object' ? extra : null; },
        } : {}),
        onChat: (event) => this.chatHeard(event),
        onRoom: ({ name, welcome }) => { this.room = { ...this.room, name, welcome }; },   // the host is joined's
        onArt: (art) => { if (!drawing.mayDraw) this.art = art; },   // one that crossed their yes: they have the document
        onView: (view, who) => {
          if (who === undefined) this.hostView = view;
          else if (drawing.artists.includes(who)) this.artistViews = { ...this.artistViews, [who]: view };   // the host's word on who, from a stranger
          else return;
          if (who === undefined ? this.followedView === this.hostView : who === this.following) this.refit();
        },
        onViews: (views) => {
          this.artistViews = Object.fromEntries(Object.entries(views).filter(([sub]) => drawing.artists.includes(sub)));
          this.refit();
        },
        onState: (state) => this.watchState(state),
      }));
      drawing.watching(this._watch, { me: () => social.claims?.sub, roomId: id, roomName: () => this.room?.name, hostName: () => this.room?.host });
      this._stops.push(watch(() => social.claims?.sub, () => drawing.knownNow()));
      this._stops.push(this.showOwnDocument());
      this._stops.push(watch(() => drawing.artists, (list) => {
        this.artistViews = Object.fromEntries(Object.entries(this.artistViews).filter(([sub]) => list.includes(sub)));
      }));
      if (DESKTOP) this._stops.push(watch(() => drawing.mayDraw, (draws) => (draws ? this.standBy() : this.standDown())));
      // Not named any more (put back to watching, or gone): the host's view is the one to follow.
      this._stops.push(watch(() => this.followable, (list) => {
        if (this.following && this.following !== this.room?.hostSub && !list.some((p) => p.sub === this.following)) this.follow(this.room?.hostSub);
      }));
      // With no list to choose from there's nothing to change them back with: the host's box shows, alone.
      this._stops.push(watch(() => this.canFollow, (can) => {
        if (can) return;
        this.showBox = true;
        if (this.showEveryone) this.setShowEveryone(false);
      }));
      // On desktop the service is one room's, named in the greeting, and a join can wait long for the host's yes.
      this.connect({ type: 'join', ...(DESKTOP ? { room: id } : {}), ...(password === undefined ? {} : { password }) }, { liveOn: DESKTOP ? ['joined', 'waiting'] : ['joined'], endOn: ['refused', 'removed', 'ended', 'replaced'] });
      // The host judges the pass this watcher joined with: confirming your email mid-room joins again, with the new one.
      this._stops.push(watch(() => social.claims?.verified, (now, was) => {
        if (was === false && now === true) this.join(this.id, { password: this._password });
      }));
    },

    // An artist is sent no art, and the room's page still shows some: their own document, as the host's is its own.
    showOwnDocument() {
      const project = useProjectStore(), workspace = useWorkspaceStore(), drawing = useDrawingStore();
      return watch([() => drawing.mayDraw, () => project.cells, () => project.cols, () => project.rows, () => workspace.displayFontSpec], () => {
        const art = drawing.mayDraw && artOf(project, workspace);
        if (art && art.cells.length === art.cols * art.lines) this.art = art;   // not a new size before its render
      }, { immediate: true });
    },

    // The room you're watching, to go back into after signing in: its id and password, or null.
    rejoinInfo() {
      return this.role === 'watch' ? { id: this.id, password: this._password } : null;
    },

    setTracking(on) {
      this.tracking = on;
      this.refit();
      this._watch?.setTracking(on);
    },

    fitArt(fit) {
      this.artFit = fit;
      this.refit();
    },

    // While tracking, the zoom of the view followed, or less to fit all of it in the window.
    refit() {
      if (this.tracking) this.artZoom = Math.min(this.followedView?.zoom ?? 1, this.artFit);
    },

    // A watcher follows the host (their sub) or an artist, and tracks them. Anyone else is the host.
    follow(sub) {
      const host = this.room?.hostSub;
      this.following = sub === host || useDrawingStore().artists.includes(sub) ? sub : host;
      this._watch?.follow(this.following === host ? null : this.following);
      this.setTracking(true);
    },

    setShowEveryone(on) {
      this.showEveryone = on;
      this.artistViews = Object.fromEntries(Object.entries(this.artistViews).filter(([sub]) => sub === this.following));   // the rest are the host's to send again
      this._watch?.showEveryone(on);
    },

    setShowBox(on) {
      this.showBox = on;
    },

    // A watcher's own zoom: the art stops following the host's until they track again.
    setArtZoom(zoom) {
      if (this.tracking) this.setTracking(false);
      this.artZoom = clampAnsiZoom(zoom);
    },

    // The lobby picture from this top-left cell ({ col, row }), or tracking the view's middle again.
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

    // Everything stops, and nothing of the room is kept; a room you host is ended first. It's spent, unless
    // Back past the join is why: Forward can undo that.
    // passRole: signing out of a room with artists in it. They go on without you, as if the tab had closed.
    close({ spent = true, passRole = false } = {}) {
      this.answerEnd(true);   // a question still open: there's nothing left to keep, and Back can finish
      if (spent && this.id) noteLeft(this.id, true);
      if (this.role === 'host') {
        if (!passRole || !useDrawingStore().artists.length) this._connection?.send({ type: 'end' });
        this.doneHosting();
      }
      if (DESKTOP && (this.role === 'host' || this._standby)) desktop.stopService().catch(() => {});   // the room's service goes with it, or standby's
      clearTimeout(this._moveTimer);
      const connection = this._connection;
      this._connection = null;
      connection?.close();
      this.stopAsking();
      clearTimeout(this._named?.timer);
      useDrawingStore().close({ spent });
      this._host?.close();
      this._watch?.close();
      this._settings?.reset();
      for (const stop of this._stops) stop();
      useWorkspaceStore().viewToRestore = null;   // it was this room's: the next art opens as usual
      Object.assign(this, noRoom());
    },

    // The room's socket: a LobbyConnection greeting with a proof over room:<id>:<ts>.
    connect(greeting, { liveOn, endOn }) {
      const social = useSocialStore();
      const id = this.id;
      // On desktop, the host's own service on loopback, or the host's address for a guest.
      const url = !DESKTOP ? `${wsOrigin(apiOrigin())}/api/rooms/${id}/ws` : this.role === 'host' ? `ws://127.0.0.1:${this._desktop.port}/room` : `ws://${this._address}/room`;
      const protocol = DESKTOP ? { protocol: ROOM_PROTOCOL } : {};
      let hostGone = null;   // desktop: a watcher's wait for the host's service to answer again
      const connection = this._connection = markRaw(new LobbyConnection({
        url,
        getPass: () => social.getPass(),
        greet: async (pass, privateKey) => ({ ...connection.greeting, pass, ...await proof(privateKey, (ts) => `room:${id}:${ts}`), ...protocol }),
        liveOn, endOn,
        onMessage: (msg) => { if (connection === this._connection) this.heard(msg); },
        onStatus: (status) => {
          if (status !== 'reconnecting') {
            clearTimeout(hostGone);
            hostGone = null;
          }
          if (connection !== this._connection) return;
          if (DESKTOP && status === 'live') {   // the room that moved is here
            clearTimeout(this._moveTimer);
            this._moveTimer = null;
          }
          // A desktop room's service is on the host's computer: gone longer than a reload takes, the host has gone.
          // Its socket stops retrying first: over() leaves it running, and a room back at that address would hear a join.
          if (DESKTOP && this.role === 'watch' && status === 'reconnecting') {
            hostGone ??= setTimeout(() => {
              if (connection !== this._connection) return;
              connection.close();
              this.over(hostGoneWords());
            }, desktop?.returnWithinMs ?? RETURN_WITHIN_MS);   // shorter only in the end-to-end tests
          }
          if (this.role === 'host' && status !== 'refused' && status !== 'closed') this.status = status;
          // The server kicked a watcher while its connection to the host was being made: the host gave up
          // on reaching it first, so joining again would only fail the same way.
          else if (this.role === 'watch' && status === 'reconnecting' && this.status === 'connecting') {
            this._watch.close();
            this.watchState('failed');
          }
        },
      }));
      connection.greeting = greeting;
      connection.open();
    },

    // The room named a new host (or `joined` says it did, while this socket was down: no planned then).
    // On desktop the room is on the new host's own service now, at its addresses: everyone else joins again there.
    heardNewHost({ name, sub, planned, addresses }) {
      const me = useSocialStore().claims?.sub, old = this.role === 'host' ? useSocialStore().claims?.name : this.room?.host;
      const words = old && name && old !== name ? newHostWords({ old, name, planned }) : null;
      if (sub === me) return this.takeOver({ planned, words });
      if (this._named) {   // passed on: this socket is on its way out, and the list says if they're still an artist
        clearTimeout(this._named.timer);
        this._named = null;
        this._connection?.close();
        return this.backAsArtist();
      }
      const where = DESKTOP && Array.isArray(addresses) ? addresses.filter((a) => typeof a === 'string').map((a) => parseAddress(a)).filter((a) => !a.error).map((a) => a.address) : [];
      if (DESKTOP && !where.length) return this.moveTo(where, name);   // nowhere to go
      if (this.role === 'host') return this.becomeArtist({ planned, name, sub, words, where });
      this.room = { ...this.room, host: name, hostSub: sub };
      this.chat = this.chat.map((row) => (row.host === (row.sub === sub) ? row : { ...row, host: row.sub === sub }));
      this.artistViews = {};
      this.hostView = null;
      // The artist or old host they followed is out of it, unless they're looking around on their own.
      this.following = sub;
      this._watch.follow(null);
      this._watch.close();
      this.watchState('lost');
      useDrawingStore().hostChanged({ planned, words });
      if (DESKTOP) this.moveTo(where, name);
    },

    // Desktop: the room moved to another computer's service. Its addresses are tried in turn on the room's socket, each
    // given MOVE_TRY_MS to go live; none of them answering ends it.
    moveTo(addresses, name, at = 0) {
      const old = this._connection;
      this._connection = null;
      old?.close();   // the old socket would try its old address again
      if (at >= addresses.length || !old) return this.over(movedUnreachableWords(name));
      this._address = addresses[at];
      this.connect(old.greeting, { liveOn: old.liveOn, endOn: old.endOn });
      this._moveTimer = setTimeout(() => this.moveTo(addresses, name, at + 1), MOVE_TRY_MS);
    },

    // Named by the room: this socket is the host's now, and hosting comes next. A document on its way back (a reload)
    // is waited for, with what the socket says kept. Then, with the room's art, on as host; without it, passOn.
    async takeOver({ planned, words }) {
      const project = useProjectStore(), workspace = useWorkspaceStore();
      if (this._named) return;
      const named = this._named = markRaw({ planned, words, heard: [], passing: false, to: null, tried: new Set(), timer: null });
      const back = () => !!project.image || workspace.documentAnswered;
      if (!back()) await until(back).toBe(true, { timeout: DOCUMENT_BACK_WITHIN_MS });
      if (this._named !== named) return;
      if (!useDrawingStore().holdsTheArt()) {
        named.passing = true;
        named.timer = setTimeout(() => this.passOn(true), HAND_OVER_ANSWERED_WITHIN_MS);
        return this.passOn();
      }
      this._named = null;
      this.carryOn(named);
      for (const msg of named.heard) this.heard(msg);
    },

    tookItBack() {
      this.takeOver({ planned: false, words: null });
      this._connection.open();
    },

    // Named while away, and what's open isn't back yet: they watch until it is, and then look again.
    async takeItBackWhenSettled(sub) {
      const project = useProjectStore(), workspace = useWorkspaceStore(), connection = this._connection;
      const back = () => !!project.image || workspace.documentAnswered;
      if (back()) return;
      await until(back).toBe(true);
      if (this._connection === connection && this.room?.hostSub === sub && useDrawingStore().holdsTheArt()) this.tookItBack();
    },

    // Named with none of the room's art to carry on with: the role goes to someone listed who's here, since they
    // may have it. No answer means it didn't happen, so it's the next one's; with no one left, the room ends.
    passOn(answerLate = false) {
      const named = this._named;
      if (!named?.passing) return;
      const hosting = named.heard.find((msg) => msg.type === 'hosting');
      const now = named.heard.findLast((msg) => msg.type === 'artists-now'), list = now?.subs;
      if (!answerLate && (named.to || !hosting || !list)) return;
      clearTimeout(named.timer);
      const me = useSocialStore().claims?.sub, here = new Set();
      for (const { pass } of [...hosting?.peers ?? [], ...named.heard.filter((msg) => msg.type === 'peer')]) {
        try {
          here.add(decodePass(pass).sub);
        } catch { /* a pass that can't be read names no one */ }
      }
      const canHost = (sub) => !DESKTOP || !!now.hostable?.[sub]?.length;   // on desktop, only one whose own service answered
      named.to = (list ?? []).find((sub) => sub !== me && here.has(sub) && !named.tried.has(sub) && canHost(sub)) ?? null;
      if (!named.to) return void this._connection?.send({ type: 'end' });
      named.tried.add(named.to);
      this._connection?.send({ type: 'hand-over', to: named.to });
      named.timer = setTimeout(() => this.passOn(true), HAND_OVER_ANSWERED_WITHIN_MS);
    },

    // On as host. On desktop the room goes on from this computer's own service, made from the old host's settings
    // (the hand-over's extra); on the web the same socket greets again as host.
    carryOn({ planned, words }) {
      const drawing = useDrawingStore(), connection = this._connection;
      for (const stop of this._stops) stop();
      this.stopAsking();
      this._watch?.close();
      const { id, room, _password: password, _handOverExtra: extra } = this;
      this.hostRoom({
        ...hostFields(), ...watcherFields(),
        id, link: DESKTOP ? null : `${appOrigin()}/?room=${id}`, status: 'reconnecting', hasPassword: DESKTOP ? !!extra?.password : password !== undefined,
        room: { ...room, hostSub: useSocialStore().claims.sub, hostName: useSocialStore().claims.name },
        _tookOver: true,
        ...(DESKTOP ? { _password: extra?.password || undefined } : {}),   // for the host after this one
      });
      drawing.takeOver(this._host, { planned, words });
      this.chat = this.chat.map((row) => ({ ...row, host: row.mine }));
      if (DESKTOP) this.hostOwnService(id, { name: room?.name ?? '', welcome: room?.welcome ?? '', ...extra, id });
      else if (connection) Object.assign(connection, { greeting: { type: 'host' }, ...HOST_SOCKET });
      this.share();
    },

    // Desktop carryOn: this computer's service (on standby until now) takes the room, and the host's socket to it on
    // loopback greets with the room (what the service makes it from), in place of the old host's.
    async hostOwnService(id, room) {
      const old = this._connection;
      this._connection = null;
      old?.close();
      let service;
      try {
        service = await desktop.startService({ mode: 'host', sub: useSocialStore().claims.sub });
      } catch (error) {
        console.warn('The room service didn\'t start.', error);
        if (this.id === id && this.role === 'host') this.over(t('social.notices.serviceFailed'));
        return;
      }
      if (this.id !== id || this.role !== 'host') return;
      Object.assign(this, { addresses: service.addresses, port: service.port, _desktop: { secret: service.secret, port: service.port } });
      this.connect({ type: 'host', secret: service.secret, room }, HOST_SOCKET);
    },

    // The role moved on, by this host's Make host or while it was away: back in on a new socket, with the document
    // and chat as they are. Refused (full, or no longer welcome), it's left with them, as anyone leaving is.
    // On desktop the room is at the new host's addresses (where).
    becomeArtist({ planned, name, sub, words, where }) {
      const drawing = useDrawingStore();
      for (const stop of this._stops) stop();
      this._connection = null;   // ending itself
      this._host?.close();
      this._settings?.reset();
      this.doneHosting();
      const { id, room } = this;
      Object.assign(this, {
        ...hostFields(),
        joinedAt: this.chat.at(-1)?.id ?? null, room: { name: room.name, welcome: room.welcome, host: name, hostSub: sub }, following: sub,
        _stops: [],
      });
      this.chat = this.chat.map((row) => ({ ...row, host: row.sub === sub }));
      if (DESKTOP) this._address = where[0];
      this.watchRoom(id);
      if (DESKTOP) this._moveTimer = setTimeout(() => this.moveTo(where, name, 1), MOVE_TRY_MS);
      drawing.becomeArtist({ planned });
      drawing.hostChanged({ planned, words });
    },

    // The answer to last-change?, from someone drawing. Anyone else has nothing to say.
    answerLastChange() {
      const n = useDrawingStore().lastChange();
      if (n !== null) this._connection?.send({ type: 'last-change', n });
    },

    // Your message: the text as the composer sends it, within your allowance, signed with this browser's key.
    // A host's shows at once (Host calls chatHeard with it); a watcher's shows when the host sends it back.
    async say(text) {
      const social = useSocialStore(), side = this._host ?? this._watch, body = chatText(text);
      if (!side || !body || !this.canChat || this.silencedUntil > Date.now() || (this.role === 'watch' && !side.ready)) return false;   // nothing spent on a message that can't go
      this._allowance ??= markRaw(new Allowance());
      if (!this._allowance.take()) {
        this.chatRefused = 'too-fast';
        return false;
      }
      this.chatRefused = null;
      const message = { id: newId(), ts: Date.now(), text: body };
      const sig = await sign(social._key.privateKey, signedText(this.id, social.claims.sub, message));
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

    // A watcher's report of the room itself, with a picture of what they see now: the view followed while tracking,
    // else their own. False, sending nothing, if you can't report the room (canReportRoom) or the reason isn't one;
    // also when the socket isn't open or the connection ends while the picture is made, and then it isn't kept as
    // reported.
    async reportRoom(reason) {
      if (!this.canReportRoom || !REASONS.some((r) => r.id === reason)) return false;
      this.reported.push(ROOM_REPORT);   // a second Report while the picture is made sends nothing
      const connection = this._connection, art = this.art, id = this.id;
      let picture = null;
      try {
        if (art) picture = await thumbnailOf({ ...art, font: fontFor(art.font) }, (!this.tracking && this.lookingAt) || middleOf(this.followedView), REPORT_PICTURE);
      } catch (error) {
        console.warn('The room report\'s picture failed.', error);   // it goes without one
      }
      // The connection ended meanwhile (the room closed, or the one to the host failed) or won't send.
      if (connection !== this._connection || !connection?.send({ type: 'report-room', reason, ...(picture ? { picture } : {}) })) {
        if (this.id === id) this.reported = this.reported.filter((s) => s !== ROOM_REPORT);
        return false;
      }
      keepRoomReport(this.id);
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
      if (watcher) useDrawingStore().backToWatching(watcher.sub);
      this._host.remove(peer);
    },

    // A desktop host's answer to a join waiting for it (asks): in, or turned away.
    letIn(ask, yes = true) {
      if (this.role === 'host' && this._connection?.send({ type: 'answer', ask, yes })) this.asks = this.asks.filter((a) => a.ask !== ask);
    },
    turnAway(ask) {
      this.letIn(ask, false);
    },

    // Desktop: drawing, this window's service waits on standby, and the host hears its addresses, to know it could
    // hand the room here. It stops when drawing does, unless this window is hosting by then. It waits above the ports
    // hosts take (below them, near the last port), so leaving the port off still reaches the room hosted here.
    async standBy() {
      this._standby = [];   // close() stops it from now on, started or not
      let service;
      try {
        service = await desktop.startService({ port: standbyPort(keptPort() ?? DEFAULT_PORT), mode: 'standby', sub: useSocialStore().claims?.sub });
      } catch (error) {
        console.warn('The room service didn\'t start.', error);   // the room goes on: this one can't be its next host
        this._standby = null;
        return;
      }
      if (!this._standby) return;   // stopped meanwhile
      this._standby = service.addresses;
      this._connection?.send({ type: 'addresses', list: service.addresses });
    },
    standDown() {
      if (!this._standby || this.role === 'host') return;
      this._standby = null;
      desktop.stopService().catch(() => {});
    },
    // At launch or after a reload: standby left running by an artist before the reload, with nothing here drawing now.
    async stopStrayStandby() {
      const service = await desktop.serviceInfo().catch(() => null);
      if (service?.mode === 'standby' && !this.role && !this._standby) desktop.stopService().catch(() => {});
    },

    // Desktop: the app is quitting (desktop.onQuit). A host hands the room to a connected artist whose own service
    // answered (or waits on a Make host already on its way), or ends it with no one to, when that doesn't happen, or
    // when it hasn't within QUIT_HAND_OVER_MS; then the app can go. quitReady is said once, whatever happens, before the
    // main process stops waiting (20 s).
    async quitting() {
      let timer = null;
      try {
        const drawing = useDrawingStore();
        const to = this.role === 'host' && drawing.artists.find((sub) => drawing.connected.includes(sub) && this.canBeHost(sub));
        const handing = this.role === 'host' && (drawing.handingOver() ?? (to && drawing.makeHost(to)));
        if (handing) await Promise.race([handing, new Promise((resolve) => { timer = setTimeout(resolve, QUIT_HAND_OVER_MS); })]);
      } catch (error) {
        console.warn('The room couldn\'t be handed over.', error);
      }
      clearTimeout(timer);
      try {
        if (this.role === 'host') this.close();   // not a host now: the window's question is about the drawing alone
      } finally {
        desktop.quitReady();
      }
    },

    // The host's Mute, for this room: what they say from now on reaches only them and the host. They aren't told.
    mute(sub, on) {
      if (this.role !== 'host' || on === this.muted.includes(sub)) return;
      this.muted = on ? [...this.muted, sub] : this.muted.filter((s) => s !== sub);
      this._host.mute(sub, on);
    },

    // The host's Block: the account can't join any room of yours, and they're kicked from this one.
    async block(watcher) {
      if (DESKTOP || this.role !== 'host' || !await useSocialStore().block(watcher.name)) return false;
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
          if (this.role === 'watch' && row.presence === 'left' && row.sub === this.following && row.sub !== this.room?.hostSub) this.follow(this.room?.hostSub);   // the artist followed has gone
          this.keep([...this.chat, event.muted ? { ...row, muted: true } : row]);
          if (this.role === 'host') this.counted(event);
          if (event.type === 'chat' && !event.muted) this.chime(row);
        }
      } else if (event.type === 'history') {
        const rows = event.messages.map((m) => (m.deleted ? deletedRow(m) : this.chatRow(m.entry, m.claims)))
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

    // Someone else's message as it comes (never a history's), while you aren't in the chat: a tone, unless it's
    // turned off or they're blocked. One in TONE_GAP_MS at most, so a burst is one tone.
    chime(row) {
      const now = Date.now();
      if (row.mine || !useWorkspaceStore().chatTone || useSocialStore().blocked.some((b) => b.id === row.sub)) return;
      if (chatFocused() || now - this._toneAt < TONE_GAP_MS) return;
      this._toneAt = now;
      tone.play();
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
      return presence ? { ...row, presence, pass } : { ...row, pass, sig };   // a report carries the message as it was signed, and a new host the rest
    },

    // The list holds the last MOST_KEPT at most, like the host's log, and goes no further back: once it's
    // full there is nothing more to ask for.
    keep(list) {
      if (list.length >= MOST_KEPT) this.chatMore = false;
      this.chat = list.slice(-MOST_KEPT);
    },

    // The server's messages (the server's API).
    heard(msg) {
      if (this._named && !['new-host', 'ended', 'refused', 'removed', 'replaced'].includes(msg.type)) {
        this._named.heard.push(msg);
        return this.passOn();
      }
      switch (msg.type) {
        case 'hosting': {
          if (!this._host) return;
          const tookOver = this._tookOver, chosen = tookOver ? { ...msg.room, welcome: this.room.welcome } : this.room;
          this._refusedOnce = false;
          this._resuming = false;
          this._tookOver = false;
          this.room = { ...msg.room, welcome: chosen.welcome };
          if (DESKTOP) this.asks = [];   // the service sends each waiting ask again after this
          if (tookOver) this.status = 'live';
          if (!this._host.room) this._host.setRoom({ name: msg.room.name, welcome: chosen.welcome });
          if (tookOver) this.carryOnFrom(msg.peers);
          this._host.hosting(msg.peers);
          useDrawingStore().hostingAgain({ tookOver });
          this.changeSettings(chosen);   // a change made while the socket was down goes now
          break;
        }
        case 'new-host':
          this.heardNewHost(msg);
          break;
        case 'artists-now':
          useDrawingStore().artistsNow(msg.subs, msg.tag);
          if (DESKTOP) this.hostable = msg.hostable && typeof msg.hostable === 'object' ? msg.hostable : {};
          break;
        case 'asking': {   // desktop: a join waiting for the host's answer
          if (!DESKTOP || this.role !== 'host') break;
          let claims;
          try {
            claims = decodePass(msg.pass);
          } catch {
            break;   // a pass that can't be read names no one
          }
          this.asks = [...this.asks.filter((a) => a.ask !== msg.ask), { ask: msg.ask, sub: claims.sub, name: claims.name }].slice(-MOST_ASKS);
          break;
        }
        case 'ask-gone':
          if (DESKTOP) this.asks = this.asks.filter((a) => a.ask !== msg.ask);
          break;
        case 'last-change?':
          this.answerLastChange();
          break;
        case 'settings-now': {
          // The server's word on the room, but a change still waiting to go stays shown (it would only flicker back).
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
          // The room moved on to this person while their socket was down, and this is their way back in: it's theirs,
          // or will be if what's coming back (a reload) is the room's art.
          if (msg.hostSub === useSocialStore().claims?.sub && this.room?.hostSub !== msg.hostSub) {
            if (useDrawingStore().holdsTheArt()) {
              this.tookItBack();
              break;
            }
            this.takeItBackWhenSettled(msg.hostSub);
          }
          if (Array.isArray(msg.artists) && !useDrawingStore().mayDraw) useDrawingStore().artists = msg.artists;
          this._refusedOnce = false;
          this.status = 'waiting';
          if (DESKTOP) this._joinedAs = { peer: msg.peer, token: msg.token };
          if (DESKTOP && this._standby?.length) this._connection?.send({ type: 'addresses', list: this._standby });   // a new socket: the host's service hears them again
          this.room = { name: '', welcome: '', ...this.room, host: msg.hostName, hostSub: msg.hostSub };
          this.following ??= msg.hostSub;
          break;
        case 'waiting':   // desktop: the join waits for the host's yes
          if (DESKTOP && this.role === 'watch') this.status = 'asked';
          break;
        case 'refused':
          this.refused(msg.reason, msg.protocol);
          break;
        // Yours (decided in this room or elsewhere): a new pass that says so. A host drops that watcher's chat; the
        // silences decided while it was away come again after hosting.
        case 'silenced':
          if (typeof msg.sub !== 'string' || !Number.isFinite(msg.until)) break;
          if (msg.sub === useSocialStore().claims?.sub) useSocialStore().renewPass();
          else this._host?.silence(msg.sub, msg.until);
          break;
        case 'ended':
        case 'removed':
        case 'replaced':
          if (this.role === 'watch') this.over(refusalWords(msg.type));
          else if (msg.type === 'replaced') {   // sent as the socket's close, not a message
            this._leaveKept = true;
            this.over(hostReplacedWords());
          } else this.over(this._resuming ? roomAwayWords() : null);
          break;
      }
    },

    // A refused pass is tried once more with a fresh one. A wrong password asks for it (wrong only when
    // one was sent: a link's first try goes without); on desktop the try ends, and Join asks. Anything else is the end
    // of it. A desktop room's service refuses another version with its own (protocol).
    refused(reason, protocol) {
      const connection = this._connection;
      if (reason === 'not-host' && this.role === 'host') return this.backAsArtist();
      const wait = reason === 'throttled' && this._resuming ? retryIn(this._throttled++, this._resumeBegan) : null;
      // A room that moved: the new host's service may not have taken it up yet. MOVE_TRY_MS decides when to give up.
      if (DESKTOP && reason === 'unavailable' && this._moveTimer) {
        setTimeout(() => { if (connection === this._connection) connection.open(); }, 1000);
      } else if (wait) {   // too busy to say: the room may well be there
        setTimeout(() => { if (connection === this._connection) connection.open(); }, wait);
      } else if (reason === 'bad-pass' && !this._refusedOnce) {
        this._refusedOnce = true;
        useSocialStore().renewPass().then(() => { if (connection === this._connection) connection.open(); });
      } else if (reason === 'wrong-password' && DESKTOP) {
        const again = { address: this._address, name: this.room?.name ?? '' };
        this.over(refusalWords(reason));
        this.needsPassword = again;
      } else if (reason === 'wrong-password') {
        Object.assign(this, { status: 'password', passwordWrong: this._password !== undefined });
      } else {
        this.over(this._resuming ? roomAwayWords() : DESKTOP && reason === 'version' ? versionWords(protocol, ROOM_PROTOCOL) : refusalWords(reason));
      }
    },

    // A host back too late: the role has moved on, and what it kept goes. It joins like anyone, and the list says if
    // it's still an artist. What it had unnumbered went with the old page.
    backAsArtist() {
      const id = this.id;
      this._connection = null;   // it's ending itself: no end to send
      this.join(id);
      useDrawingStore().noteFormerHost();
    },

    // Someone new to hosting: what they've seen of the chat is the log, and who's here is who the room lists, none
    // of them arriving. Whoever else is yet to connect is someone to wait for, as after a reload.
    carryOnFrom(peers) {
      const here = [];
      for (const { pass } of peers) {
        try {
          const claims = decodePass(pass);
          here.push({ sub: claims.sub, pass });
          sessionJoined(this.session, claims, Date.now());
        } catch { /* a pass that can't be read names no one */ }
      }
      this._host.restore({ log: this.chat.map(logEntry), only: [], removed: [], muted: [], here });
    },

    over(notice) {
      const social = useSocialStore();
      this._connection = null;   // it's ending itself: no end to send
      this.leave();
      if (notice) social.notice = notice;
      if (notice) toast(notice);   // and in the lobby, which the side panel shows in place of the chat
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
      useDrawingStore().connection(state);
      this.status = state === 'lost' ? 'waiting' : state;
    },
  },
});

import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { settingsJson } from '@/store/project/shared';
import { Pacer } from '@/social/lobby';
import { readCursor, readCursors } from '@/social/wire';

const CURSORS_EVERY_MS = 100;
export const CHECK_EVERY_MS = 2000;
const ONLY_THE_HOST = 'Only the host can do this.';
const NOT_WITH_OTHERS = 'Not while others are drawing.';
export const MERGE_WARNING = 'Strokes merged into the image can\'t be undone by anyone.';

// The people drawing in the room you're in, and the invitations to: who's an artist, who's asked, and the
// cursors, kept out of the room store. The drawing itself is the project store's (sharing.js), which this
// connects to the room's Host (hostCallbacks, hosted) or Watch (watchCallbacks, watching). A setup store, so
// that it keeps to its own project store.
export const useDrawingStore = defineStore('drawing', () => {
  const project = useProjectStore(), workspace = useWorkspaceStore();
  const artists = ref([]);        // the subs who may draw: everyone in the room hears this
  const invited = ref([]);        // a host's: the subs asked, who haven't answered
  const invitation = ref(false);  // a watcher's: the host has asked
  const paused = ref(false);      // an artist's: no host to number anything
  const waiting = ref([]);        // an artist's, while paused: a box in grid pixels for each stroke with no number
  const connected = ref([]);      // a host's: the subs with a connection now (an artist can have dropped out)
  const cursors = ref({});        // sub -> { at, view, name }
  const showCursors = ref(true);
  const notice = ref(null);
  const mayDraw = computed(() => project._sharing?.role === 'artist');
  // Other artists here now: when the host's undo and its document aren't only its own.
  const othersHere = computed(() => artists.value.some((sub) => sub !== me() && connected.value.includes(sub)));
  // Why a control is off, or null: the host's alone, and those a host can't use under others either.
  const hostOnly = computed(() => (mayDraw.value ? ONLY_THE_HOST : null));
  const offWithOthers = computed(() => hostOnly.value ?? (othersHere.value ? NOT_WITH_OTHERS : null));
  // The cursors to draw: anyone else's on the art.
  const others = computed(() => Object.fromEntries(Object.entries(cursors.value).filter(([sub, { at }]) => at && sub !== me())));

  let host = null, room = null;    // the Host, or the Watch
  let me = () => null, myName = () => null, roomId = null, roomName = () => null;
  let saidHello = false;
  let awaitingList = false;        // accepted, and the host's list may not have me on it yet
  let goToArt = false;             // accepted just now: the next project closes the watcher's view
  let catchingUp = false;          // a new connection: no drawing until the host has said what it numbered
  let flushAutosave = async () => {};
  let stops = [], cursorTimer = null;
  let peersOn = new Set();         // a host's: who peopleHere last saw connected
  const myCursor = new Pacer(CURSORS_EVERY_MS, (cursor) => {
    if (!host) return room?.post({ t: 'cursor', ...cursor }) ?? false;
    noteCursor(me(), cursor, myName());
    return true;
  });

  // Having said yes is what lets a host replace your open document, and a reload still has to know it. By sub,
  // since it's this person in this tab.
  const acceptedKey = () => `phosphor-artist:${roomId}:${me()}`;
  // Once the art's open, what's kept is its documentId: a reload's project opens as that one, not a copy.
  const accepted = () => {
    try {
      return sessionStorage.getItem(acceptedKey());
    } catch {
      return null;
    }
  };
  const hasAccepted = () => !!accepted();
  const noteAccepted = (yes) => {
    try {
      if (yes) sessionStorage.setItem(acceptedKey(), yes === true ? '1' : yes);
      else sessionStorage.removeItem(acceptedKey());
    } catch { /* no storage: a reload joins as a watcher */ }
  };

  // The host's side. The list going from empty is when a stroke can start to have others under it, so
  // that's when whole-layer undo goes; the list emptying changes nothing about the undo that's left.
  function setArtists(list) {
    const first = !artists.value.length && list.length;
    artists.value = list;
    forgetCursors();
    if (first) startHostSharing();
    host.setArtists(list);
    if (!list.length) stopHostSharing();
  }

  // Someone gone takes their invitation and their cursor with them (one the host's still waiting for after a
  // reload isn't gone yet). Someone invited who's just connected may know nothing of it, so they're told.
  function peopleHere(list) {
    const on = list.filter((w) => w.connected);
    connected.value = on.map((w) => w.sub);
    invited.value = invited.value.filter((sub) => list.some((w) => w.sub === sub) || host?.awaited(sub));
    for (const { peer, sub } of on) if (!peersOn.has(peer) && invited.value.includes(sub)) host.tell(sub, { t: 'invite' });
    peersOn = new Set(on.map((w) => w.peer));
    forgetCursors();
  }

  function forgetCursors() {
    const stays = ([sub]) => sub === me() || (artists.value.includes(sub) && connected.value.includes(sub));
    if (Object.entries(cursors.value).every(stays)) return;
    cursors.value = Object.fromEntries(Object.entries(cursors.value).filter(stays));
    sendCursorsSoon();
  }

  function noteCursor(sub, { at, view }, name) {
    cursors.value = { ...cursors.value, [sub]: { at, view, name } };
    sendCursorsSoon();
  }

  function sendCursorsSoon() {
    cursorTimer ??= setTimeout(() => {
      cursorTimer = null;
      host?.sendAll({ t: 'cursors', ...cursors.value });
    }, CURSORS_EVERY_MS);
  }

  // Back from a reload, with the document open again (the room's record): as they were.
  function resumeHosting({ artists: list, invited: asked }) {
    if (Array.isArray(asked)) invited.value = asked;
    if (Array.isArray(list) && list.length) setArtists(list);
  }

  function startHostSharing() {
    project.startSharing({ send: (msg) => host.sendAll(msg), sendDocument: () => host.sendProjectToAll(), role: 'host', me: me() });
    project.dropOldUndo();
    stops.push(watch(() => project._document, () => setArtists([])));   // something else opened, with only those who've dropped out listed
    const checks = setInterval(() => host.sendCheck(project._ledger.n, project._ledger.sum), CHECK_EVERY_MS);
    stops.push(() => clearInterval(checks));
    let sent = settingsJson(project), grid = `${project.cols},${project.rows}`;
    stops.push(watch(() => [settingsJson(project), project._sliderBefore], () => {   // a slider's end goes as one change
      const now = settingsJson(project), gridNow = `${project.cols},${project.rows}`;
      if (project._sliderBefore || now === sent) return;
      sent = now;
      if (gridNow === grid) project.sendSettings();
      else project.shareWholeDocument();
      grid = gridNow;
    }));
  }

  function stopHostSharing() {
    for (const stop of stops) stop();
    stops = [];
    project.stopSharing();
  }

  function hostCallbacks() {
    const take = (sub, msg) => project.takeFromArtist(sub, msg);
    return {
      project: () => project.projectNow(),
      onChange: take, onUndo: take, onRedo: take,
      onCursor: (sub, { at, view }, name) => {
        const cursor = readCursor({ at, view, name });
        if (cursor) noteCursor(sub, cursor, name);
      },
      // The tail if it reaches from what they have, in this epoch, to the last number (one taken for a project
      // of a base edit isn't in it), or else the project.
      onHello: (w, { has, epoch: theirs }) => {
        const { n, epoch: ours, tail: kept } = project._ledger;
        const tail = Number.isInteger(has) && theirs === ours ? kept.since(has) : null;
        if (tail && (has === n || tail.at(-1)?.n === n)) host.sendTail(w, tail, n);
        else host.sendProject(w);
      },
      onAnswer: (sub, yes) => {
        if (!yes && artists.value.includes(sub)) return backToWatching(sub);   // on the list from before, and asked again on coming back
        if (!invited.value.includes(sub)) {   // no longer asked: they're waiting on an answer
          if (yes && !artists.value.includes(sub)) host.tell(sub, { t: 'withdrawn' });
          return;
        }
        invited.value = invited.value.filter((other) => other !== sub);
        if (yes) setArtists([...artists.value, sub]);
      },
    };
  }

  function hosted(theHost, { me: whoAmI, name = () => null }) {
    host = theHost;
    me = whoAmI;
    myName = name;
  }

  // Where this person's pointer is on the art, a cell or null: for others to see.
  function pointAt(at) {
    if (project._sharing && !paused.value) myCursor.push({ at, view: workspace.sharedView });
  }

  // How the document being replaced is written out first (autosave's).
  function autosavedBy(flush) {
    flushAutosave = flush;
  }

  // Guests can't draw (tell refuses them), and the host already does.
  function invite(sub) {
    if (!host || sub === me() || artists.value.includes(sub) || !host.tell(sub, { t: 'invite' })) return false;
    if (!invited.value.includes(sub)) invited.value = [...invited.value, sub];
    return true;
  }

  function withdraw(sub) {
    invited.value = invited.value.filter((other) => other !== sub);
    host?.tell(sub, { t: 'withdrawn' });
  }

  function backToWatching(sub) {
    if (artists.value.includes(sub)) setArtists(artists.value.filter((other) => other !== sub));
  }

  // The watcher's side.
  function watchCallbacks() {
    const heard = (msg) => { if (mayDraw.value) project.hearDrawing(msg); };
    const takesProjects = () => artists.value.includes(me()) && hasAccepted();
    return {
      takesProjects,
      onNumbered: heard, onSettings: heard, onBase: heard, onCheck: heard,
      onCaughtUp: () => {
        project.flushHeard();   // what came before this has landed: its echoes are heard
        caughtUp();
      },
      onProject: async ({ n, epoch, took, parts }) => {
        if (!takesProjects()) return;
        if (!project._sharing) {   // the last of what's open goes out under its own id
          project.commitPending();
          await flushAutosave();
          if (!takesProjects()) return;
        }
        const documentId = accepted() === '1' ? undefined : accepted() ?? undefined;
        if (!await project.takeProject(parts, { n, epoch, took, documentId, filename: roomName(), send: (msg) => room?.post(msg), me: me() })) {
          notice.value = 'The room\'s art couldn\'t be opened.';
          return;
        }
        noteAccepted(project.documentId);
        if (goToArt && workspace.editorTab === 'social') workspace.editorTab = 'output';
        goToArt = false;
        caughtUp();
      },
      onCursors: (all) => { cursors.value = readCursors(all); },
      onInvite: () => { invitation.value = true; },
      onWithdrawn: () => {
        invitation.value = false;
        awaitingList = goToArt = false;
        noteAccepted(false);   // one crossing an accept: the host won't list them on it
      },
      onArtists: heardArtists,
    };
  }

  function watching(theWatch, { me: whoAmI, roomId: id, roomName: name }) {
    room = theWatch;
    me = whoAmI;
    roomId = id;
    roomName = name;
  }

  // On the list, and having said yes: hello, first thing, and then the project or what's missed. Off it, the
  // art stays open as an ordinary document, unless this list simply left the host before my yes reached it.
  function heardArtists(subs) {
    artists.value = subs;
    const mine = subs.includes(me());
    if (mine) awaitingList = false;
    if (mine && hasAccepted()) sayHello();
    else if (mine) invitation.value = true;   // come back after leaving: still theirs, if they still want it
    else if (!awaitingList && hasAccepted()) {
      if (mayDraw.value) notice.value = 'You\'re back to watching.';
      stopDrawing();
    }
  }

  function sayHello() {
    if (saidHello) return;
    saidHello = true;
    project.flushHeard();   // the number it says is the last that landed
    room.post({ t: 'artist-hello', has: project._sharing?.pending.n ?? -1, epoch: project._sharing?.epoch ?? null });
    if (catchingUp) project.waitForAnswer();
  }

  // The host has said everything it numbered. What it didn't, it gets now, and then drawing goes on.
  function caughtUp() {
    if (!catchingUp) return;
    catchingUp = false;
    project.resendPending();
    goOn();
  }

  function goOn() {
    paused.value = false;
    waiting.value = [];
    if (mayDraw.value) project.setPaused(false);
  }

  function pause() {
    paused.value = true;   // first: a press held down ends now, while its stroke can still go in
    project.setPaused(true);
    waiting.value = project.waitingBoxes();
  }

  function stopDrawing({ keepAccepted = false } = {}) {
    saidHello = catchingUp = goToArt = false;
    if (!keepAccepted) noteAccepted(false);
    paused.value = false;
    waiting.value = [];
    cursors.value = {};
    myCursor.reset();
    project.dropWaiting();
    project.stopSharing();
  }

  // On the list already (they'd left, and came back): nothing to ask, only to say hello.
  function accept() {
    invitation.value = false;
    goToArt = true;
    noteAccepted(true);
    if (artists.value.includes(me())) return sayHello();
    awaitingList = true;
    room?.post({ t: 'accept' });
  }

  function decline() {
    invitation.value = false;
    room?.post({ t: 'decline' });
  }

  // The channel to the host, as Watch says it: gone, an artist waits; a new one, which may come with no word
  // of the last one going, gets the artists message first thing, and they say hello again.
  function connection(state) {
    if (state !== 'live') awaitingList = false;   // the next list is that connection's, and answers for the accept
    if (state === 'connecting') {
      saidHello = false;
      invitation.value = false;   // the last connection's: a host who still means it says so on this one
      catchingUp = mayDraw.value;
      project.newConnection();
    } else if (state === 'live') {
      if (!catchingUp) goOn();
      else if (!paused.value) pause();
    } else if (state === 'lost' || state === 'failed') {
      saidHello = false;
      if (mayDraw.value) pause();
    }
  }

  // The room's over, for you. What's on screen stays. Not spent: Back past the join, and Forward picks it up.
  function close({ spent = true } = {}) {
    clearTimeout(cursorTimer);
    cursorTimer = null;
    myCursor.reset();
    if (host) stopHostSharing();
    else if (room) stopDrawing({ keepAccepted: !spent });
    host = room = null;
    awaitingList = goToArt = false;
    artists.value = [];
    invited.value = [];
    connected.value = [];
    peersOn = new Set();
    cursors.value = {};
    invitation.value = false;
    notice.value = null;
  }

  return {
    artists, invited, invitation, paused, waiting, connected, cursors, showCursors, notice, mayDraw, othersHere, hostOnly, offWithOthers, others,
    hostCallbacks, hosted, invite, withdraw, backToWatching, peopleHere, resumeHosting, pointAt, autosavedBy,
    watchCallbacks, watching, heardArtists, accept, decline, connection, close,
  };
});

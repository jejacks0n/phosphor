import { computed, nextTick, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { settingsJson } from '@/store/project/shared';
import { Pacer } from '@/social/lobby';
import { readCursor, readCursors } from '@/social/wire';
import { UNDO_RESET_WORDS } from '@/social/messages';

const CURSORS_EVERY_MS = 100;
export const CHECK_EVERY_MS = 2000;
const KEEP_LEDGER_EVERY_MS = 2000;   // written for a reload that can't stop to write anything on its way out
const HELLOS_WITHIN_MS = 5000;       // a host back from a reload waits this long to hear who's ahead of it
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
  const artistNames = ref({});    // a watcher's: sub -> name, of those of them the host says are here
  const invited = ref([]);        // a host's: the subs asked, who haven't answered
  const invitation = ref(false);  // a watcher's: the host has asked
  const paused = ref(false);      // an artist's: no host to number anything
  const waiting = ref([]);        // an artist's, while paused: a box in grid pixels for each stroke with no number
  const connected = ref([]);      // a host's: the subs with a connection now (an artist can have dropped out)
  const cursors = ref({});        // sub -> { at, view, name }
  const showCursors = ref(true);
  const notice = ref(null);
  const hostChanging = ref(false); // paused for a handover, not for a host who's away
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
  let handed = null;               // an artist's: the ledger an old host sent, for when the server names me
  let handingOver = null;          // a host's, in makeHost: ends its wait for the server
  let gathering = null;            // a host's, without knowing all that's numbered: { hellos, timer, finishing, waiting }
  let listAsked = 0;               // a host's: how many artists-now are still owed for artists sent
  let listHeard = null;            // a host's: the list as the room last said it
  let adopting = false;            // a host's: a document coming from an artist is still this one
  let undoFor = new Set();         // a host's: artists whose undo this ledger can't answer, to be told at their hello
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
  function setArtists(list, { tell = true } = {}) {
    const first = !stops.length && list.length;
    artists.value = list;
    forgetCursors();
    if (first) startHostSharing();
    host.setArtists(list);
    if (tell && host.send({ type: 'artists', subs: list }) !== false) listAsked++;
    if (!list.length) stopHostSharing();
  }

  // The room's own word on the list. Only the answer to the last list sent says anything: the ones before it
  // are about lists that have since changed.
  function artistsNow(subs) {
    if (!host || !Array.isArray(subs) || !subs.every((sub) => typeof sub === 'string')) return;
    listHeard = subs;
    if (listAsked > 0 && --listAsked > 0) return;
    const list = subs.filter((sub) => sub !== me());
    if (list.length !== artists.value.length || list.some((sub) => !artists.value.includes(sub))) setArtists(list, { tell: false });
  }

  // The host's socket says hosting. A list the room doesn't have yet goes now (a reload, or a change while the
  // socket was down); one who took over hears the room's, the only one that knows the old host. A room with a
  // list says it first, unasked. What it's waiting to hear from those it's asked starts its clock now.
  function hostingAgain({ tookOver = false } = {}) {
    if (gathering) gathering.timer ??= setTimeout(finishGathering, HELLOS_WITHIN_MS);
    const same = listHeard?.length === artists.value.length && artists.value.every((sub) => listHeard.includes(sub));
    listAsked = 0;
    if (tookOver || same || (!artists.value.length && !listHeard?.length)) return;
    if (host.send({ type: 'artists', subs: artists.value }) !== false) listAsked = listHeard?.length ? 2 : 1;
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
      host?.setArtistViews(Object.fromEntries(Object.entries(cursors.value).filter(([sub, { view }]) => view && sub !== me()).map(([sub, { view }]) => [sub, view])));
    }, CURSORS_EVERY_MS);
  }

  // Back from a reload, with the document open again (the room's record): as they were.
  // kept: what keepLedger wrote (autosaveStore's row), or null. Nothing's numbered until the artists have said what
  // they have: one ahead of what was kept is who the rest comes from.
  function resumeHosting({ artists: list, invited: asked }, kept = null) {
    if (Array.isArray(asked)) invited.value = asked;
    if (!Array.isArray(list) || !list.length) return;
    const whole = project.restoreLedger(kept, me());
    setArtists(list);
    if (!whole) {
      notice.value = UNDO_RESET_WORDS;
      undoFor = new Set(list);
    }
    startGathering();
  }

  // Nothing's numbered until the artists have said what they have. waiting: this person's own strokes with no number
  // yet, which take the first ones after that.
  function startGathering(waiting = []) {
    if (gathering) return;
    gathering = { hellos: [], timer: null, finishing: false, waiting };
    pause();
    host.hold();
  }

  // The most advanced artist is asked for what this host doesn't have (the next, if they've nothing to show for their
  // claim), then everyone's answered as usual, and only then is anything numbered: everyone's up to the same number.
  async function finishGathering() {
    const now = gathering;
    if (!now || now.finishing) return;
    now.finishing = true;
    clearTimeout(now.timer);
    for (let next; (next = mostAhead(now));) {
      await catchUpFrom(...next);
      if (gathering !== now) return;
    }
    gathering = null;
    goOn();
    for (const [w, msg] of now.hellos) answerHello(w, msg);
    project.numberWaiting(now.waiting);
    host.release();
  }

  function mostAhead({ hellos }) {
    const n = project._ledger.n;
    return hellos.reduce((most, [w, { has }]) => (Number.isSafeInteger(has) && has > (most?.[1] ?? n) && !w.askedCatchUp ? [w, has] : most), null);
  }

  async function catchUpFrom(w, has) {
    const theHost = host;
    const answer = await theHost.askCatchUp(w, { has: project._ledger.n, epoch: project._ledger.epoch });
    if (!answer || host !== theHost) return;
    adopting = answer.kind === 'project';
    try {
      if (await project.takeCatchUp(answer, has) && adopting) {
        notice.value = UNDO_RESET_WORDS;
        undoFor = new Set(artists.value);
      }
    } catch (error) {
      console.warn('What an artist had couldn\'t be taken.', error);
    }
    await nextTick();   // past the watch on project._document
    adopting = false;
  }

  // Over before it's finished (no one left to ask, or the room's moved on): whatever it was holding goes on.
  function stopGathering() {
    const now = gathering;
    if (!now) return;
    clearTimeout(now.timer);
    gathering = null;
    project.numberWaiting(now.waiting);
    host?.release();
    goOn();
  }

  // The tail if it reaches from what they have, in this epoch, to the last number (one taken for a project
  // of a base edit isn't in it), or else the project. That goes for someone who says they're ahead, too: it's only
  // while gathering that anyone's asked what they have.
  function answerHello(w, { has, epoch: theirs }) {
    const { n, epoch: ours, tail: kept } = project._ledger;
    if (undoFor.delete(w.claims.sub)) host.sendTo(w, { t: 'undo-reset' });
    const tail = Number.isInteger(has) && theirs === ours ? kept.since(has) : null;
    if (tail && (has === n || tail.at(-1)?.n === n)) host.sendTail(w, tail, n);
    else host.sendProject(w);
  }

  function startHostSharing() {
    project.startSharing({ send: (msg) => host.sendAll(msg), sendDocument: () => host.sendProjectToAll(), role: 'host', me: me(), roomId: host.roomId });
    project.dropOldUndo();
    stops.push(watch(() => project._document, () => { if (!adopting) setArtists([]); }));   // something else opened, with only those who've dropped out listed
    const checks = setInterval(() => { if (!gathering) host.sendCheck(project._ledger.n, project._ledger.sum); }, CHECK_EVERY_MS);
    stops.push(() => clearInterval(checks));
    const keeps = setInterval(() => project.keepLedger(), KEEP_LEDGER_EVERY_MS);
    stops.push(() => clearInterval(keeps));
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
    stopGathering();
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
      // A host back from a reload or new to it: they wait until all of them have said, or the time's up.
      onHello: (w, msg) => {
        if (!gathering) return answerHello(w, msg);
        gathering.hellos.push([w, msg]);
        const said = new Set(gathering.hellos.map(([{ claims }]) => claims.sub));
        if (artists.value.every((sub) => said.has(sub))) finishGathering();
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

  // Where this person's pointer is on the art, a cell or null: for others to see. Their view goes with it, and by
  // itself when it moves without the pointer (a wheel, a scrollbar, the window): someone may be following it.
  let pointedAt = null;
  function pointAt(at) {
    pointedAt = at;
    if (project._sharing && !paused.value) myCursor.push({ at, view: workspace.sharedView });
  }
  function viewMoved() {
    if (mayDraw.value && !paused.value) myCursor.push({ at: pointedAt, view: workspace.sharedView });
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

  // A host's Make host: nothing more's numbered, the artist is sent the ledger, and on their word the server is
  // asked. False, with the room as it was, if that doesn't happen: new-host (becomeArtist) ends it otherwise.
  async function makeHost(sub) {
    if (!host || handingOver || !artists.value.includes(sub) || !connected.value.includes(sub)) return false;
    const theHost = host;
    hostChanging.value = true;
    pause();
    host.hold();
    let done = false;
    const ended = new Promise((resolve) => { handingOver = resolve; });
    try {
      if (await theHost.handOver(sub, await project.keptForHandOver()) && host === theHost && theHost.send({ type: 'hand-over', to: sub }) !== false) {
        done = await Promise.race([ended, new Promise((resolve) => setTimeout(() => resolve(false), theHost.serverAnswersWithinMs))]);
      }
    } catch (error) {
      console.warn('The room couldn\'t be handed over.', error);
    }
    handingOver = null;
    if (done || host !== theHost) return true;
    theHost.release();
    goOn();
    return false;
  }

  // The server named me. What's on screen goes on as the room's art, as host: the old host's ledger if it's the
  // one that fits, or what I've heard of the numbering, and my own strokes that have no number take the first ones.
  function takeOver(hosting, { planned = false, words = null } = {}) {
    const kept = planned ? handed : null;
    const left = project.leavePending();
    const whoIs = me();
    handed = null;
    host = hosting;
    room = null;
    saidHello = catchingUp = awaitingList = goToArt = false;
    paused.value = false;
    waiting.value = [];
    invitation.value = false;
    cursors.value = {};
    listHeard = null;
    listAsked = 0;
    noteAccepted(false);
    const taken = project.takeLedger(kept, left);
    notice.value = [words, taken ? null : UNDO_RESET_WORDS].filter(Boolean).join(' ') || null;
    artists.value = artists.value.filter((sub) => sub !== whoIs);
    startHostSharing();
    host.setArtists(artists.value);
    undoFor = new Set(taken ? [] : artists.value);
    hostChanging.value = !taken && !!artists.value.length;
    // Artists reach this at different numbers: the old host's channels can outlive its socket.
    if (hostChanging.value) startGathering(left?.waiting ?? []);
    else project.numberWaiting(left?.waiting ?? []);
  }

  // The server named someone else, with me here. A planned handover moved the undo with it; a sudden one couldn't,
  // and what I've drawn is all still here.
  function hostChanged({ planned = false, words = null } = {}) {
    handed = null;
    cursors.value = {};
    hostChanging.value = mayDraw.value;
    const sayUndo = !planned && mayDraw.value;
    if (sayUndo) project.clearHistory();
    const said = [words, sayUndo ? UNDO_RESET_WORDS : null].filter(Boolean).join(' ');
    if (said) notice.value = said;
  }

  // I was the host, and now the room's Watch is set up (watching): on as anyone else, keeping the document.
  function becomeArtist({ planned = true } = {}) {
    handingOver?.(true);
    stopGathering();
    for (const stop of stops) stop();
    stops = [];
    host = null;
    connected.value = [];
    invited.value = [];
    peersOn = new Set();
    cursors.value = {};
    listHeard = null;
    listAsked = 0;
    noteAccepted(project.documentId);
    project.continueAsArtist({ send: (msg) => room?.post(msg), me: me() });
    if (!planned) project.clearHistory();
    hostChanging.value = true;
    pause();
  }

  // The answer to last-change?: the last number heard, flushed so it's the last that landed. Null if not drawing.
  function lastChange() {
    if (!project._sharing?.pending) return null;
    project.flushHeard();
    return project._sharing.pending.n;
  }

  // Whether this tab has the room's art open, to carry on with if the room names me.
  function holdsTheArt() {
    return !!project._sharing?.pending || (!!project.image && accepted() === project.documentId);
  }

  // Someone back after the role moved on: said yes once, and the list decides if it still stands. What's open may
  // hold what they drew while away, so the room's art opens as a document of its own.
  function noteFormerHost() {
    noteAccepted(true);
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
      onHandOver: async (chunks) => {
        handed = await project.readHandOver(chunks);
        if (handed) room?.post({ t: 'hand-over-ok' });
      },
      onCatchUp: async (asked) => {
        const answer = await project.catchUpFor(asked);
        if (answer) await room?.sendCatchUp(answer);
      },
      onUndoReset: () => {
        if (!mayDraw.value) return;
        project.clearHistory();
        if (!notice.value?.includes(UNDO_RESET_WORDS)) notice.value = [notice.value, UNDO_RESET_WORDS].filter(Boolean).join(' ');
      },
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
  function heardArtists(subs, names = {}) {
    artists.value = subs;
    artistNames.value = names;
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
    hostChanging.value = false;
    paused.value = false;
    waiting.value = [];
    if (project._sharing) project.setPaused(false);
  }

  function pause() {
    paused.value = true;   // first: a press held down ends now, while its stroke can still go in
    project.setPaused(true);
    waiting.value = project.waitingBoxes();
  }

  function stopDrawing({ keepAccepted = false } = {}) {
    saidHello = catchingUp = goToArt = false;
    if (!keepAccepted) noteAccepted(false);
    hostChanging.value = false;
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
    handingOver?.(true);
    if (host) stopHostSharing();
    else if (room) stopDrawing({ keepAccepted: !spent });
    host = room = handed = null;
    awaitingList = goToArt = false;
    hostChanging.value = false;
    paused.value = false;
    undoFor = new Set();
    listAsked = 0;
    listHeard = null;
    artists.value = [];
    artistNames.value = {};
    invited.value = [];
    connected.value = [];
    peersOn = new Set();
    cursors.value = {};
    invitation.value = false;
    notice.value = null;
  }

  return {
    artists, artistNames, invited, invitation, paused, hostChanging, waiting, connected, cursors, showCursors, notice, mayDraw, othersHere, hostOnly, offWithOthers, others,
    hostCallbacks, hosted, invite, withdraw, backToWatching, peopleHere, resumeHosting, pointAt, viewMoved, autosavedBy,
    watchCallbacks, watching, heardArtists, accept, decline, connection, close,
    makeHost, takeOver, hostChanged, becomeArtist, artistsNow, hostingAgain, lastChange, holdsTheArt, noteFormerHost,
  };
});

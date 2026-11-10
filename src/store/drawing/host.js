// A host's side of the store: who's asked and listed, the cursors, and the document's numbering when it can't go on
// until the artists have said what they have, or while it's going to someone else. takeOver and becomeArtist, the two
// ends of being host, are here too, and go to the artist's side (artist.js) for what they leave or come back to.
//
// A host has one phase, as these never overlap: idle; gathering, without knowing all that's numbered; or handing-over,
// in makeHost. Each only ever goes back to idle, and a move outside HOST_MOVES warns. adopting isn't part of gathering,
// though only gathering starts it: a project still opening outlives a gather that's stopped. What's left is data, not
// state: listTag and listAsked (the tag of the list on its way), listHeard, peersOn, undoTold (those told).
import { nextTick, watch } from 'vue';
import { settingsJson } from '@/store/project/shared';
import { readCursor } from '@/social/wire';
import { undoResetWords } from '@/social/messages';

export const CURSORS_EVERY_MS = 100;
// How many can draw in a room, the host among them: what docs/investigations/drawing-together.md measured.
export const MOST_ARTISTS = 7;
export const CHECK_EVERY_MS = 2000;
const KEEP_LEDGER_EVERY_MS = 10_000; // written for a reload that can't stop to write anything on its way out; a large one stalls the tab (docs/investigations/drawing-together.md), and autosave writes it too
const HELLOS_WITHIN_MS = 5000;       // a host without all that's numbered (a reload, a new host) waits this long to hear who's ahead of it
// What a host is busy with, and what can follow what. Neither starts during the other, and each ends in idle.
const HOST_IDLE = Object.freeze({ phase: 'idle' });
const HOST_MOVES = { idle: ['gathering', 'handing-over'], gathering: ['idle'], 'handing-over': ['idle'] };

export function hostSide({ project, me, artist, artists, invited, invitation, paused, waiting, connected, cursors, notice, hostChanging, artistsFull, pause, goOn, sayUndoRestarts, noteUndoSaid }) {
  let host = null;                 // the Host
  let stops = [], cursorTimer = null;
  let peersOn = new Set();         // who peopleHere last saw connected
  // idle; gathering, without knowing all that's numbered, { hellos, timer, finishing, waiting, asked, asking, deadline };
  // or handing-over, in makeHost, { end } ending its wait for the server.
  let hostPhase = HOST_IDLE;
  let listTag = 0;                 // the last tag put on a list
  let listAsked = null;            // the tag of the list on its way, until its answer
  let listHeard = null;            // the list as the room last said it
  let adopting = false;            // a document coming from an artist is still this one
  let undoTold = null;             // one whose ledger can't answer anyone's undo from before it: those told, at their hello

  function moveHost(next) {
    if (!HOST_MOVES[hostPhase.phase].includes(next.phase)) console.warn(`A host going from ${hostPhase.phase} to ${next.phase}.`);
    hostPhase = next;
  }

  const gathering = () => (hostPhase.phase === 'gathering' ? hostPhase : null);

  // The host's side. The list going from empty is when a stroke can start to have others under it, so
  // that's when whole-layer undo goes; the list emptying changes nothing about the undo that's left.
  function setArtists(list, { tell = true } = {}) {
    const first = !stops.length && list.length;
    artists.value = list;
    const asking = gathering()?.asking;
    if (asking && !list.includes(asking.claims.sub)) asking.catchUp?.done(null);
    forgetCursors();
    if (first) startHostSharing();
    host.setArtists(list);
    if (tell) sendList(list);
    if (!list.length) stopHostSharing();
  }

  function sendList(list) {
    const tag = ++listTag;
    if (host.send({ type: 'artists', subs: list, tag }) !== false) listAsked = tag;
  }

  // The room's own word on the list. While one of ours is on its way, only the answer to it says anything, and that
  // takes in whatever else has changed there. An answer to one before it is about a list that has since changed, and
  // one the room says unasked may not have ours in it yet. With none on its way, an unasked one is the list.
  function artistsNow(subs, tag) {
    if (!host || !Array.isArray(subs) || !subs.every((sub) => typeof sub === 'string')) return;
    listHeard = subs;
    if (listAsked === null ? tag !== undefined : tag !== listAsked) return;
    listAsked = null;
    const list = subs.filter((sub) => sub !== me());
    if (list.length !== artists.value.length || list.some((sub) => !artists.value.includes(sub))) setArtists(list, { tell: false });
  }

  // The host's socket says hosting. A list the room doesn't have yet goes now (a reload, or a change while the
  // socket was down); one who took over hears the room's, the only one that knows the old host. A room with a
  // list says it first, unasked. What it's waiting to hear from those it's asked starts its clock now.
  function hostingAgain({ tookOver = false } = {}) {
    const now = gathering();
    if (now) now.timer ??= setTimeout(finishGathering, HELLOS_WITHIN_MS);
    const same = listHeard?.length === artists.value.length && artists.value.every((sub) => listHeard.includes(sub));
    listAsked = null;   // that socket's: its answer isn't coming
    if (tookOver || same || (!artists.value.length && !listHeard?.length)) return;
    sendList(artists.value);
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

  // The first to step into an art layer has it: someone else inside it too, who stepped in before hearing, is inside
  // none here, and hearing that steps them out (DrawingStore).
  function noteCursor(sub, { at, view, inside = null }, name) {
    const taken = inside && Object.entries(cursors.value).some(([other, cursor]) => other !== sub && cursor.inside === inside);
    cursors.value = { ...cursors.value, [sub]: { at, view, name, inside: taken ? null : inside } };
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
      sayUndoRestarts();
      undoTold = new Set();
    }
    startGathering();
  }

  // Nothing's numbered until the artists have said what they have. waiting: this person's own strokes with no number
  // yet, which take the first ones after that.
  function startGathering(waiting = []) {
    if (gathering()) return;
    const now = { phase: 'gathering', hellos: [], timer: null, finishing: false, waiting, asked: new Set(), asking: null, deadline: null };
    moveHost(now);
    now.deadline = setTimeout(() => {   // what it has by then is what it has
      now.asked = null;
      now.asking?.catchUp?.done(null);
      finishGathering();
    }, host.gatherWithinMs);
    pause();
    host.hold();
  }

  // The most advanced artist is asked for what this host doesn't have (the next, if they've nothing to show for their
  // claim), then everyone's answered as usual, and only then is anything numbered: everyone's up to the same number.
  async function finishGathering() {
    const now = gathering();
    if (!now || now.finishing) return;
    now.finishing = true;
    clearTimeout(now.timer);
    for (let next; (next = mostAhead(now));) {
      await catchUpFrom(...next);
      if (hostPhase !== now) return;
    }
    clearTimeout(now.deadline);
    moveHost(HOST_IDLE);
    settleNumber();
    goOn();
    for (const [w, msg] of now.hellos) if (w.drawing && host.open().includes(w)) answerHello(w, msg);
    project.numberWaiting(now.waiting);
    host.release();
  }

  // A gather can end with no number heard from anyone (-1), which no project or hand-over can carry.
  function settleNumber() {
    project._ledger.n = Math.max(project._ledger.n, 0);
  }

  // Who to ask next: once each, by who they are, as a new connection is still them, and only someone listed and here.
  function mostAhead({ hellos, asked }) {
    if (!asked) return null;
    const n = project._ledger.n, here = host.open();
    return hellos.reduce((most, [w, { has }]) => (Number.isSafeInteger(has) && has > (most?.[1] ?? n) && !asked.has(w.claims.sub) && artists.value.includes(w.claims.sub) && here.includes(w) ? [w, has] : most), null);
  }

  async function catchUpFrom(w, has) {
    const theHost = host, now = gathering();
    now.asked.add(w.claims.sub);
    now.asking = w;
    const answer = await theHost.askCatchUp(w, { has: project._ledger.n, epoch: project._ledger.epoch });
    now.asking = null;
    if (!answer || hostPhase !== now || !now.asked) return;
    adopting = answer.kind === 'project';
    try {
      if (await project.takeCatchUp(answer, has) && adopting) {
        sayUndoRestarts();
        undoTold = new Set();
      }
    } catch (error) {
      console.warn('What an artist had couldn\'t be taken.', error);
    }
    await nextTick();   // past the watch on project._document
    adopting = false;
  }

  // Over before it's finished (no one left to ask, or the room's moved on): whatever it was holding goes on.
  function stopGathering() {
    const now = gathering();
    if (!now) return;
    clearTimeout(now.timer);
    clearTimeout(now.deadline);
    now.asking?.catchUp?.done(null);
    moveHost(HOST_IDLE);
    settleNumber();
    project.numberWaiting(now.waiting);
    host?.release();
    goOn();
  }

  // The tail if it reaches from what they have, in this epoch, to the last number (one taken for a project
  // of a base edit isn't in it), or else the project. That goes for someone who says they're ahead, too: it's only
  // while gathering that anyone's asked what they have.
  function answerHello(w, { has, epoch: theirs }) {
    const { n, epoch: ours, tail: kept } = project._ledger;
    if (undoTold && !undoTold.has(w.claims.sub)) {
      undoTold.add(w.claims.sub);
      host.sendTo(w, { t: 'undo-reset' });
    }
    const tail = Number.isInteger(has) && theirs === ours ? kept.since(has) : null;
    if (tail && (has === n || tail.at(-1)?.n === n)) host.sendTail(w, tail, n);
    else host.sendProject(w);
  }

  function startHostSharing() {
    const theHost = host;
    project.startSharing({ send: (msg) => host.sendAll(msg), sendDocument: () => host.sendProjectToAll(), hold: () => theHost.hold(), release: () => theHost.release(), role: 'host', me: me(), roomId: host.roomId });
    project.dropOldUndo();
    stops.push(watch(() => project._document, () => { if (!adopting) setArtists([]); }));   // something else opened, with only those who've dropped out listed
    const checks = setInterval(() => { if (!gathering()) host.sendCheck(project._ledger.n, project._ledger.sum); }, CHECK_EVERY_MS);
    stops.push(() => clearInterval(checks));
    const keeps = setInterval(() => project.keepLedger(), KEEP_LEDGER_EVERY_MS);
    stops.push(() => clearInterval(keeps));
    let sent = settingsJson(project), grid = `${project.cols},${project.rows}`;
    stops.push(watch(() => [settingsJson(project), project._sliderBefore, project._charsBefore], () => {   // a slider's end goes as one change
      const now = settingsJson(project), gridNow = `${project.cols},${project.rows}`;
      if (project._sliderBefore || project._charsBefore || now === sent) return;
      sent = now;
      if (gathering()) {   // from a catch-up, and everyone hears it in what they're answered
        grid = gridNow;
        return;
      }
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
      onCursor: (sub, { at, view, inside }, name) => {
        const cursor = readCursor({ at, view, name, inside });
        if (cursor) noteCursor(sub, cursor, name);
      },
      // A host back from a reload or new to it: they wait until all of them have said, or the time's up. Whoever says
      // hello hears the cursors, and with them who's drawing in which art layer.
      onHello: (w, msg) => {
        sendCursorsSoon();
        const now = gathering();
        if (!now) return answerHello(w, msg);
        now.hellos.push([w, msg]);
        const said = new Set(now.hellos.map(([{ claims }]) => claims.sub));
        if (artists.value.every((sub) => said.has(sub))) finishGathering();
      },
      onAnswer: (sub, yes) => {
        if (!yes && artists.value.includes(sub)) return backToWatching(sub);   // on the list from before, and asked again on coming back
        if (!invited.value.includes(sub)) {   // no longer asked: they're waiting on an answer
          if (yes && !artists.value.includes(sub)) host.tell(sub, { t: 'withdrawn' });
          return;
        }
        invited.value = invited.value.filter((other) => other !== sub);
        if (!yes) return;
        if (1 + artists.value.length < MOST_ARTISTS) setArtists([...artists.value, sub]);
        else host.tell(sub, { t: 'withdrawn' });   // asked before the room was full, say, as a reload brings back
      },
    };
  }

  // Guests can't draw (tell refuses them), and the host already does.
  function invite(sub) {
    const asked = invited.value.includes(sub);
    if (!host || sub === me() || artists.value.includes(sub) || (artistsFull.value && !asked) || !host.tell(sub, { t: 'invite' })) return false;
    if (!asked) invited.value = [...invited.value, sub];
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
    if (!host || hostPhase !== HOST_IDLE || !artists.value.includes(sub) || !connected.value.includes(sub)) return false;
    const theHost = host;
    hostChanging.value = true;
    pause();
    host.hold();
    let done = false;
    const ended = new Promise((end) => moveHost({ phase: 'handing-over', end }));
    const mine = hostPhase;
    try {
      if (await theHost.handOver(sub, await project.keptForHandOver()) && host === theHost && theHost.send({ type: 'hand-over', to: sub }) !== false) {
        done = await Promise.race([ended, new Promise((resolve) => setTimeout(() => resolve(false), theHost.serverAnswersWithinMs))]);
      }
    } catch (error) {
      console.warn('The room couldn\'t be handed over.', error);
    }
    if (hostPhase === mine) moveHost(HOST_IDLE);
    if (done || host !== theHost) return true;
    theHost.release();
    goOn();
    return false;
  }

  // new-host, or the room's over: makeHost's wait is done, whatever else it's still waiting on.
  function handOverEnded() {
    if (hostPhase.phase !== 'handing-over') return;
    hostPhase.end(true);
    moveHost(HOST_IDLE);
  }

  // The server named me. What's on screen goes on as the room's art, as host: the old host's ledger if it's the
  // one that fits, or what I've heard of the numbering, and my own strokes that have no number take the first ones.
  function takeOver(hosting, { planned = false, words = null } = {}) {
    const kept = planned ? artist.handed() : null;
    artist.artCame();
    const left = project.leavePending();   // first: the last slice goes out through the room it leaves
    const whoIs = me();
    artist.leaveRoom();
    host = hosting;
    paused.value = false;
    waiting.value = [];
    invitation.value = false;
    cursors.value = {};
    listHeard = listAsked = null;
    artist.noteAccepted(false);
    const taken = project.takeLedger(kept, left);
    noteUndoSaid(!taken);
    notice.value = [words, taken ? null : undoResetWords()].filter(Boolean).join(' ') || null;
    artists.value = artists.value.filter((sub) => sub !== whoIs);
    startHostSharing();
    host.setArtists(artists.value);
    undoTold = taken ? null : new Set();
    // Artists reach this at different numbers: the old host's channels can outlive its socket. With no list and no
    // number of its own (a reload named by joined), the list is on its way and they're who has the numbers.
    hostChanging.value = !taken && (!!artists.value.length || !left);
    if (hostChanging.value) startGathering(left?.waiting ?? []);
    else project.numberWaiting(left?.waiting ?? []);
  }

  // I was the host, and now the room's Watch is set up (watching): on as anyone else, keeping the document.
  function becomeArtist({ planned = true } = {}) {
    handOverEnded();
    stopGathering();
    for (const stop of stops) stop();
    stops = [];
    host = null;
    connected.value = [];
    invited.value = [];
    peersOn = new Set();
    cursors.value = {};
    listHeard = listAsked = null;
    artist.noteAccepted(project.documentId);
    project.continueAsArtist({ send: (msg) => artist.post(msg), me: me() });
    if (!planned) project.clearHistory();
    hostChanging.value = true;
    pause();
  }

  function hosted(theHost) {
    host = theHost;
  }

  // The room's over, for you. Whether this was the host.
  function leaveHosting() {
    clearTimeout(cursorTimer);
    cursorTimer = null;
    handOverEnded();
    const wasHost = !!host;
    if (host) stopHostSharing();
    host = undoTold = listHeard = listAsked = null;
    peersOn = new Set();
    return wasHost;
  }

  return {
    hosted, hosting: () => !!host, leaveHosting, noteCursor,
    hostCallbacks, invite, withdraw, backToWatching, peopleHere, resumeHosting,
    makeHost, takeOver, becomeArtist, artistsNow, hostingAgain,
  };
}

// An artist's side of the store, and a watcher's until they are one: the invitation, hello, what's coming, what's
// lost. A host back as an artist ends up here too, and a new host leaves from here (DrawingStore.js).
//
// An artist has no single phase, as these come in any combination, so each stays a flag of its own:
//   saidHello     hello has gone on this connection; a lost or new connection clears it
//   catchingUp    a new connection while drawing, before or after hello, until the host has said what it numbered
//   awaitingList  accepted, and a list without me says nothing yet; ends with a list that has me, a withdrawal, or any state but live
//   goToArt       accepted: the next project closes the watcher's view, however long it takes after the list
//   formerHost    the next project also says I'm back as an artist
//   gettingArt    back from a reload with no document to draw on; the room's project, or nothing coming, ends it
import { readCursors } from '@/social/wire';
import { ART_NOT_OPENED_WORDS, UNDO_RESET_WORDS, backAsArtistWords } from '@/social/messages';
import { LONG_TOAST_MS, toast } from '@/composables/useToast';

export function artistSide({ project, workspace, me, artists, artistNames, invitation, paused, waiting, cursors, notice, hostChanging, gettingArt, mayDraw, myCursor, pause, goOn, sayUndoRestarts }) {
  let room = null;                 // the Watch
  let roomId = null, roomName = () => null, hostName = () => null;
  let saidHello = false;
  let awaitingList = false;        // accepted, and the host's list may not have me on it yet
  let goToArt = false;             // accepted just now: the next project closes the watcher's view
  let catchingUp = false;          // a new connection: no drawing until the host has said what it numbered
  let connections = 0;             // how many have begun: a project that outlasts one doesn't answer for the next
  let flushAutosave = async () => {};
  let handed = null;               // the ledger an old host sent, for when the server names me
  let formerHost = false;          // back after the role moved on, and the room's art hasn't replaced what's open

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

  function forgetArtistFlags() {
    saidHello = catchingUp = awaitingList = goToArt = formerHost = false;
  }

  // How the document being replaced is written out first (autosave's).
  function autosavedBy(flush) {
    flushAutosave = flush;
  }

  // Everything open is written; whether it worked.
  const autosaved = () => flushAutosave();

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
    formerHost = true;
  }

  // The watcher's side.
  function watchCallbacks() {
    const heard = (msg) => { if (mayDraw.value) project.hearDrawing(msg); };
    const takesProjects = () => artists.value.includes(me()) && hasAccepted();
    // Their project came to nothing. Anyone drawing has what they have, and a check will ask again. Anyone else has no
    // document to draw on and is sent no art for having said hello, so they go back to watching, and can be asked again.
    const projectFailed = () => {
      if (!takesProjects()) return;
      notice.value = ART_NOT_OPENED_WORDS;
      artCame();
      if (!project._sharing) decline();
    };
    return {
      takesProjects,
      onProjectFailed: projectFailed,
      onNumbered: heard, onSettings: heard, onBase: heard, onCheck: heard,
      onCaughtUp: () => {
        project.flushHeard();   // what came before this has landed: its echoes are heard
        caughtUp();
      },
      onProject: async ({ n, epoch, took, parts }) => {
        if (!takesProjects()) return;
        const onConnection = connections;
        if (!project._sharing) {   // the last of what's open goes out under its own id
          project.commitPending();
          await flushAutosave();
          if (!takesProjects()) return;
        }
        const documentId = accepted() === '1' ? undefined : accepted() ?? undefined;
        if (!await project.takeProject(parts, { n, epoch, took, documentId, filename: roomName(), send: (msg) => room?.post(msg), me: me() })) {
          projectFailed();
          return;
        }
        noteAccepted(project.documentId);
        artCame();
        if (formerHost) {
          formerHost = false;
          const words = backAsArtistWords(hostName() ?? 'Someone else');
          notice.value = [notice.value, words].filter(Boolean).join(' ');   // what undo did is still so
          toast(words, LONG_TOAST_MS);
        }
        if (goToArt && workspace.editorTab === 'social') workspace.editorTab = 'output';
        goToArt = false;
        if (connections === onConnection) caughtUp();   // a newer one has its own host to hear from, and its own resend
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
        sayUndoRestarts();
      },
      onRefused: (kind, stroke) => { if (mayDraw.value) project.strokeRefused(kind, stroke); },
      onInvite: () => { invitation.value = true; },
      onWithdrawn: () => {
        invitation.value = false;
        awaitingList = goToArt = false;
        noteAccepted(false);   // one crossing an accept: the host won't list them on it
      },
      onArtists: heardArtists,
    };
  }

  function watching(theWatch, { roomId: id, roomName: name, hostName: host = () => null }) {
    room = theWatch;
    roomId = id;
    roomName = name;
    hostName = host;
    gettingArt.value = false;
    knownNow();
  }

  // A reload joins before it knows who's signed in, so this comes again when it does. A documentId kept under that
  // name: this art is on its way.
  function knownNow() {
    if (gettingArt.value || project._sharing || !accepted() || accepted() === '1') return;
    gettingArt.value = true;
    pause();
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

  // The wait for a reload's project is over, for whatever reason.
  function artCame() {
    if (!gettingArt.value) return;
    gettingArt.value = false;
    paused.value = false;
    project.setPaused(false);
  }

  function stopDrawing({ keepAccepted = false } = {}) {
    artCame();
    forgetArtistFlags();
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
    notice.value = null;   // what it said (back to watching, say) is over
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
      connections++;
      saidHello = false;
      invitation.value = false;   // the last connection's: a host who still means it says so on this one
      catchingUp = mayDraw.value;
      project.newConnection();
    } else if (state === 'live') {
      if (gettingArt.value) return;
      if (!catchingUp) goOn();
      else if (!paused.value) pause();
    } else if (state === 'lost' || state === 'failed') {
      saidHello = false;
      if (state === 'failed') artCame();   // nothing's coming now, and failed stays until they leave
      if (mayDraw.value) pause();
    }
  }

  // Leaving as an artist, for hosting or for good.
  function leaveRoom() {
    room = handed = null;
    forgetArtistFlags();
  }

  return {
    post: (msg) => room?.post(msg), inRoom: () => !!room, handed: () => handed, leaveRoom,
    noteAccepted, artCame, stopDrawing,
    autosavedBy, autosaved, hostChanged, lastChange, holdsTheArt, noteFormerHost,
    watchCallbacks, watching, knownNow, heardArtists, accept, decline, connection,
  };
}

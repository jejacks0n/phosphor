import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';
import { settingsJson } from '@/store/project/shared';

const CURSORS_EVERY_MS = 100;

// The people drawing in the room you're in, and the invitations to: who's an artist, who's asked, and the
// cursors, kept out of the room store. The drawing itself is the project store's (sharing.js), which this
// connects to the room's Host (hostCallbacks, hosted) or Watch (watchCallbacks, watching). A setup store, so
// that it keeps to its own project store.
export const useDrawingStore = defineStore('drawing', () => {
  const project = useProjectStore();
  const artists = ref([]);        // the subs who may draw: everyone in the room hears this
  const invited = ref([]);        // a host's: the subs asked, who haven't answered
  const invitation = ref(false);  // a watcher's: the host has asked
  const paused = ref(false);      // an artist's: no host to number anything
  const cursors = ref({});        // sub -> { at, view, name }
  const showCursors = ref(true);
  const notice = ref(null);
  const mayDraw = computed(() => project._sharing?.role === 'artist');

  let host = null, room = null;    // the Host, or the Watch
  let me = () => null, roomId = null, roomName = () => null;
  let epoch = null;                // an artist's: the project's
  let saidHello = false;
  let stops = [], cursorTimer = null;

  // Having said yes is what lets a host replace your open document, and a reload still has to know it. By sub,
  // since it's this person in this tab.
  const acceptedKey = () => `phosphor-artist:${roomId}:${me()}`;
  const hasAccepted = () => {
    try {
      return !!sessionStorage.getItem(acceptedKey());
    } catch {
      return false;
    }
  };
  const noteAccepted = (yes) => {
    try {
      if (yes) sessionStorage.setItem(acceptedKey(), '1');
      else sessionStorage.removeItem(acceptedKey());
    } catch { /* no storage: a reload joins as a watcher */ }
  };

  // The host's side. The list going from empty is when a stroke can start to have others under it, so
  // that's when whole-layer undo goes; the list emptying changes nothing about the undo that's left.
  function setArtists(list) {
    const first = !artists.value.length && list.length;
    artists.value = list;
    if (first) startHostSharing();
    host.setArtists(list);
    if (!list.length) stopHostSharing();
  }

  function startHostSharing() {
    project.startSharing({ send: (msg) => host.sendAll(msg), sendDocument: () => host.sendProjectToAll(), role: 'host', me: me() });
    project.dropOldUndo();
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
        cursors.value = { ...cursors.value, [sub]: { at, view, name } };
        cursorTimer ??= setTimeout(() => {
          cursorTimer = null;
          host?.sendAll({ t: 'cursors', ...cursors.value });
        }, CURSORS_EVERY_MS);
      },
      // The tail if it reaches back to what they have in this epoch, or else the project.
      onHello: (w, { has, epoch: theirs }) => {
        const tail = Number.isInteger(has) && theirs === project._ledger.epoch ? project._ledger.tail.since(has) : null;
        if (tail) host.sendTail(w, tail);
        else host.sendProject(w);
      },
      onAnswer: (sub, yes) => {
        if (!invited.value.includes(sub)) return;
        invited.value = invited.value.filter((other) => other !== sub);
        if (yes) setArtists([...artists.value, sub]);
      },
    };
  }

  function hosted(theHost, { me: whoAmI }) {
    host = theHost;
    me = whoAmI;
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
    return {
      onNumbered: heard, onSettings: heard, onBase: heard,
      onProject: async ({ n, epoch: its, parts }) => {
        if (!artists.value.includes(me()) || !hasAccepted()) return;
        if (await project.takeProject(parts, { n, filename: roomName(), send: (msg) => room?.post(msg), me: me() })) epoch = its;
        else notice.value = 'The room\'s art couldn\'t be opened.';
      },
      onCursors: (all) => { cursors.value = all; },
      onInvite: () => { invitation.value = true; },
      onWithdrawn: () => { invitation.value = false; },
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
  // art stays open as an ordinary document.
  function heardArtists(subs) {
    artists.value = subs;
    const mine = subs.includes(me());
    if (mine && hasAccepted() && !saidHello) {
      saidHello = true;
      room.post({ t: 'artist-hello', has: project._sharing?.pending.n ?? -1, epoch });
    } else if (!mine && hasAccepted()) stopDrawing();
  }

  function stopDrawing() {
    saidHello = false;
    epoch = null;
    noteAccepted(false);
    paused.value = false;
    cursors.value = {};
    project.stopSharing();
  }

  function accept() {
    invitation.value = false;
    noteAccepted(true);
    room?.post({ t: 'accept' });
  }

  function decline() {
    invitation.value = false;
    room?.post({ t: 'decline' });
  }

  // The channel to the host, as Watch says it: gone, an artist waits; back, the artists message that comes
  // first on any connection has them say hello again.
  function connection(state) {
    if (state === 'live') {
      paused.value = false;
      if (mayDraw.value) project.setPaused(false);
    } else if (state === 'lost' || state === 'failed') {
      saidHello = false;
      if (mayDraw.value) {
        paused.value = true;
        project.setPaused(true);
      }
    }
  }

  // The room's over, for you. What's on screen stays.
  function close() {
    clearTimeout(cursorTimer);
    cursorTimer = null;
    if (host) stopHostSharing();
    else if (room) stopDrawing();
    host = room = null;
    artists.value = [];
    invited.value = [];
    invitation.value = false;
    notice.value = null;
  }

  return {
    artists, invited, invitation, paused, cursors, showCursors, notice, mayDraw,
    hostCallbacks, hosted, invite, withdraw, backToWatching,
    watchCallbacks, watching, heardArtists, accept, decline, connection, close,
  };
});

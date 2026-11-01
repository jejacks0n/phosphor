import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { Pacer } from '@/social/lobby';
import { UNDO_RESTART_WORDS } from '@/social/messages';
import { artistSide } from '@/store/drawing/artist';
import { CURSORS_EVERY_MS, MOST_ARTISTS, hostSide } from '@/store/drawing/host';

export { CHECK_EVERY_MS, MOST_ARTISTS } from '@/store/drawing/host';

const ROOM_FULL = 'This room has as many artists as it can take.';
const ONLY_THE_HOST = 'Only the host can do this.';
const NOT_WITH_OTHERS = 'Not while others are drawing.';
export const MERGE_WARNING = 'Strokes merged into the image can\'t be undone by anyone.';
export const BAKE_WARNING = 'A bake can\'t be undone by anyone.';

// The people drawing in the room you're in, and the invitations to: who's an artist, who's asked, and the
// cursors, kept out of the room store. The drawing itself is the project store's (sharing.js), which this
// connects to the room's Host (hostCallbacks, hosted) or Watch (watchCallbacks, watching). A setup store, so
// that it keeps to its own project store.
//
// What state there is: a host has one phase and an artist has none (the maps are at the top of drawing/host.js and
// drawing/artist.js). paused goes across both sides and all of those: an artist can be paused catching up or not, and
// hostChanging and gettingArt only say which words go with it.
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
  const gettingArt = ref(false);   // back from a reload: no drawing on what's open until the room's replaces it
  const mayDraw = computed(() => project._sharing?.role === 'artist');
  // Other artists here now: when the host's undo and its document aren't only its own.
  const othersHere = computed(() => artists.value.some((sub) => sub !== me() && connected.value.includes(sub)));
  // Why a control is off, or null: the host's alone, and those a host can't use under others either.
  const hostOnly = computed(() => (mayDraw.value ? ONLY_THE_HOST : null));
  const offWithOthers = computed(() => hostOnly.value ?? (othersHere.value ? NOT_WITH_OTHERS : null));
  // Why no one more can be asked, or null. A place is the host's, or a listed artist's, here or not (their place waits
  // for them to come back), or held by someone asked, as their yes has to find one.
  const artistsFull = computed(() => (1 + artists.value.length + invited.value.length >= MOST_ARTISTS ? ROOM_FULL : null));
  // The cursors to draw: anyone else's on the art.
  const others = computed(() => Object.fromEntries(Object.entries(cursors.value).filter(([sub, { at }]) => at && sub !== me())));

  let me = () => null, myName = () => null;
  const myCursor = new Pacer(CURSORS_EVERY_MS, (cursor) => {
    if (!host.hosting()) return artist.post({ t: 'cursor', ...cursor }) ?? false;
    host.noteCursor(me(), cursor, myName());
    return true;
  });

  const artist = artistSide({ project, workspace, me: () => me(), artists, artistNames, invitation, paused, waiting, cursors, notice, hostChanging, gettingArt, mayDraw, myCursor, pause, goOn, sayUndoRestarts });
  const { autosavedBy, hostChanged, lastChange, holdsTheArt, noteFormerHost, watchCallbacks, knownNow, heardArtists, accept, decline, connection } = artist;
  const host = hostSide({ project, me: () => me(), artist, artists, invited, invitation, paused, waiting, connected, cursors, notice, hostChanging, artistsFull, pause, goOn, sayUndoRestarts });
  const { hostCallbacks, invite, withdraw, backToWatching, peopleHere, resumeHosting, makeHost, takeOver, becomeArtist, artistsNow, hostingAgain } = host;

  // Who this person is comes with the room's Host, or its Watch.
  function watching(theWatch, { me: whoAmI, ...room }) {
    me = whoAmI;
    artist.watching(theWatch, room);
  }

  // Undo has started over, and that's said unless it has been: "The host changed" only where it did.
  function sayUndoRestarts() {
    if (!notice.value?.includes('undo starts over')) notice.value = [notice.value, UNDO_RESTART_WORDS].filter(Boolean).join(' ');
  }

  function hosted(theHost, { me: whoAmI, name = () => null }) {
    host.hosted(theHost);
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

  // The room's over, for you. What's on screen stays. Not spent: Back past the join, and Forward picks it up.
  function close({ spent = true } = {}) {
    myCursor.reset();
    if (!host.leaveHosting() && artist.inRoom()) artist.stopDrawing({ keepAccepted: !spent });
    artist.leaveRoom();
    hostChanging.value = false;
    paused.value = false;
    artists.value = [];
    artistNames.value = {};
    invited.value = [];
    connected.value = [];
    cursors.value = {};
    invitation.value = false;
    notice.value = null;
  }

  return {
    artists, artistNames, invited, invitation, paused, hostChanging, gettingArt, waiting, connected, cursors, showCursors, notice, mayDraw, othersHere, hostOnly, offWithOthers, artistsFull, others,
    hostCallbacks, hosted, invite, withdraw, backToWatching, peopleHere, resumeHosting, pointAt, viewMoved, autosavedBy,
    watchCallbacks, watching, knownNow, heardArtists, accept, decline, connection, close,
    makeHost, takeOver, hostChanged, becomeArtist, artistsNow, hostingAgain, lastChange, holdsTheArt, noteFormerHost,
  };
});

import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { t } from '@/i18n';
import { toast } from '@/composables/useToast';
import { anyoneInside, lockedAmong } from '@/store/project/shared';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { Pacer } from '@/social/lobby';
import { undoResetWords, undoRestartWords } from '@/social/messages';
import { artistSide } from '@/store/drawing/artist';
import { CURSORS_EVERY_MS, MOST_ARTISTS, hostSide } from '@/store/drawing/host';

export { CHECK_EVERY_MS, MOST_ARTISTS } from '@/store/drawing/host';

export const mergeWarning = () => t('toolbar.mergeDialog.warning');
export const bakeWarning = () => t('toolbar.bakeDialog.warning');
export const MERGE_WARNING = mergeWarning();
export const BAKE_WARNING = bakeWarning();

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
  const cursors = ref({});        // sub -> { at, view, name, inside }: inside, the art layer they're drawing in, or null
  const showCursors = ref(true);
  const notice = ref(null);
  let undoSaid = false;
  const noteUndoSaid = (said) => { undoSaid = Boolean(said); };
  watch(notice, (val) => { if (!val) undoSaid = false; }, { flush: 'sync' });
  const hostChanging = ref(false); // paused for a handover, not for a host who's away
  const gettingArt = ref(false);   // back from a reload: no drawing on what's open until the room's replaces it
  const mayDraw = computed(() => project._sharing?.role === 'artist');
  // Other artists here now: when the host's undo and its document aren't only its own.
  const othersHere = computed(() => artists.value.some((sub) => sub !== me() && connected.value.includes(sub)));
  // Why a control is off, or null: the host's alone, and those a host can't use under others either.
  const hostOnly = computed(() => (mayDraw.value ? t('social.drawing.onlyHost') : null));
  const offWithOthers = computed(() => hostOnly.value ?? (othersHere.value ? t('social.drawing.notWithOthers') : null));
  // Why no one more can be asked, or null. A place is the host's, or a listed artist's, here or not (their place waits
  // for them to come back), or held by someone asked, as their yes has to find one.
  const artistsFull = computed(() => (1 + artists.value.length + invited.value.length >= MOST_ARTISTS ? t('social.drawing.roomFull') : null));
  // The cursors to draw: anyone else's on the art.
  const others = computed(() => Object.fromEntries(Object.entries(cursors.value).filter(([sub, { at }]) => at && sub !== me())));

  let me = () => null, myName = () => null;
  const myCursor = new Pacer(CURSORS_EVERY_MS, (cursor) => {
    if (!hostParts.hosting()) return artistParts.post({ t: 'cursor', ...cursor }) ?? false;
    hostParts.noteCursor(me(), cursor, myName());
    return true;
  });

  const artistParts = artistSide({ project, workspace, me: () => me(), artists, artistNames, invitation, paused, waiting, cursors, notice, hostChanging, gettingArt, mayDraw, myCursor, pause, goOn, sayUndoRestarts, noteUndoSaid });
  const { autosavedBy, autosaved, hostChanged, lastChange, holdsTheArt, noteFormerHost, watchCallbacks, knownNow, heardArtists, accept, decline, connection } = artistParts;
  const hostParts = hostSide({ project, me: () => me(), artist: artistParts, artists, invited, invitation, paused, waiting, connected, cursors, notice, hostChanging, artistsFull, pause, goOn, sayUndoRestarts, noteUndoSaid });
  const { hostCallbacks, invite, withdraw, backToWatching, peopleHere, resumeHosting, makeHost, takeOver, becomeArtist, artistsNow, hostingAgain } = hostParts;

  // Who this person is comes with the room's Host, or its Watch.
  function watching(theWatch, { me: whoAmI, ...room }) {
    me = whoAmI;
    artistParts.watching(theWatch, room);
  }

  // Undo has started over, and that's said unless it has been: "The host changed" only where it did.
  function sayUndoRestarts() {
    const restart = undoRestartWords(), reset = undoResetWords();
    if (undoSaid || notice.value?.includes(restart) || notice.value?.includes(reset)) return;
    undoSaid = true;
    notice.value = [notice.value, restart].filter(Boolean).join(' ');
  }

  function hosted(theHost, { me: whoAmI, name = () => null }) {
    hostParts.hosted(theHost);
    me = whoAmI;
    myName = name;
  }

  // Where this person's pointer is on the art, a cell or null: for others to see. Their view goes with it, and by
  // itself when it moves without the pointer (a wheel, a scrollbar, the window): someone may be following it. So
  // does the art layer they're drawing in, and stepping in or out sends it at once: until it's heard, others could
  // change the layer under them.
  let pointedAt = null;
  const cursorNow = () => ({ at: pointedAt, view: workspace.sharedView, inside: project.artInside });
  function pointAt(at) {
    pointedAt = at;
    if (project._sharing && !paused.value) myCursor.push(cursorNow());
  }
  function viewMoved() {
    if (mayDraw.value && !paused.value) myCursor.push(cursorNow());
  }
  // A host's own goes with no room to send it to as well (the last artist gone), or it would stay behind for the next.
  const sendNow = () => {
    myCursor.push(cursorNow());
    myCursor.flush();
  };
  watch(() => project.artInside, () => {
    if (project._sharing || hostParts.hosting()) sendNow();
  }, { flush: 'sync' });

  // Who's drawing in an art layer: their sub, mine while I'm in it, or null. The project keeps who's in which, as the
  // cursors say, for what it refuses (an edit to a layer someone else is in, stepping into one). The host keeps the
  // first to step into a layer (noteCursor), so someone who stepped in too, before hearing of it, hears it held by
  // someone else: they're stepped out, and told who has it.
  // Someone heard as inside none while I'm in a layer no one else has (the one who had it stepped out as I was turned
  // away, in one broadcast) sends it again, and has it.
  watch(cursors, (all) => {
    const named = (sub, name) => name || artistNames.value[sub] || t('social.drawing.someoneElse');
    project._locks = Object.fromEntries(Object.entries(all).filter(([, { inside }]) => inside).map(([sub, { inside, name }]) => [sub, { key: inside, name: named(sub, name) }]));
    const inside = project.artInside, holder = inside && Object.keys(all).find((sub) => sub !== me() && all[sub].inside === inside);
    if (holder) {
      project.leaveArt();
      workspace.editorTab = 'vector';
      toast(t('art.lockedBy', { name: project._locks[holder].name }));
    } else if (inside && project._sharing && all[me()] && all[me()].inside !== inside) sendNow();
  }, { flush: 'sync', immediate: true });
  const lockedBy = (key) => project.lockedBy(key);
  // What a layer someone else is drawing in says, or null; and anyone else in any layer, for what that turns off.
  const lockedWords = (key) => lockedAmong(project, [key]);
  const someoneInside = computed(() => anyoneInside(project));

  // Drawing again, after a pause, a reconnect or the host's reload: what's sent while there's no one to hear it is lost,
  // so the art layer I'm in (or that I've stepped out of it meanwhile) goes again.
  function goOn() {
    hostChanging.value = false;
    paused.value = false;
    waiting.value = [];
    if (!project._sharing) return;
    project.setPaused(false);
    sendNow();
  }

  function pause() {
    paused.value = true;   // first: a press held down ends now, while its stroke can still go in
    project.setPaused(true);
    waiting.value = project.waitingBoxes();
  }

  // The room's over, for you. What's on screen stays. Not spent: Back past the join, and Forward picks it up.
  function close({ spent = true } = {}) {
    myCursor.reset();
    if (!hostParts.leaveHosting() && artistParts.inRoom()) artistParts.stopDrawing({ keepAccepted: !spent });
    artistParts.leaveRoom();
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
    hostCallbacks, hosted, invite, withdraw, backToWatching, peopleHere, resumeHosting, pointAt, viewMoved, lockedBy, lockedWords, someoneInside, autosavedBy, autosaved,
    watchCallbacks, watching, knownNow, heardArtists, accept, decline, connection, close,
    makeHost, takeOver, hostChanged, becomeArtist, artistsNow, hostingAgain, lastChange, holdsTheArt, noteFormerHost,
  };
});

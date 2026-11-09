// The address and the stores, kept in step both ways. The stores are the truth while you work: the
// address follows them (reconcile), and they follow it on a landing, Back or Forward (applyPlace).
import { nextTick, watch } from 'vue';
import { NavigationFailureType, START_LOCATION, createRouter, createWebHashHistory, createWebHistory, isNavigationFailure } from 'vue-router';
import { PLACES, arrivalPage, pathOf } from '@/lib/addresses';
import { desktopQuery } from '@/social/config';
import { useProjectStore } from '@/store/ProjectStore';
import { hasLeftRoom, useRoomStore } from '@/store/RoomStore';
import { ERROR_PARAMS, RETURN_PARAMS, useSocialStore } from '@/store/SocialStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

const Empty = { render: () => null };   // the stores decide what shows

export function defaultHistory() {
  return import.meta.env.VITE_ADDRESSES === 'path' ? createWebHistory() : createWebHashHistory();
}

// With path addresses a return from the server shares the query. A computer has read it (readReturn takes it off
// the URL, which the route doesn't hear), so a step doesn't carry it along; a phone keeps it for a computer.
const withoutReturn = (query) => Object.fromEntries(Object.entries(query).filter(([name]) => ![...RETURN_PARAMS, ...ERROR_PARAMS].includes(name)));

export function createAddressRouter(history = defaultHistory()) {
  return createRouter({
    history,
    routes: [
      { path: '/', component: Empty },
      ...PLACES.map(([path, place]) => ({ path, component: Empty, meta: place })),
      { path: '/:unknown(.*)*', redirect: '/' },
    ],
  });
}

export function followAddress(router) {
  const workspace = useWorkspaceStore(), social = useSocialStore(), room = useRoomStore(), project = useProjectStore();
  let pending = false, ours = false, landing = true, replaceNext = false, joining = false;
  let artTab = workspace.editorTab === 'room' ? workspace.viewTab : workspace.editorTab;   // the art tab ROOM goes back to

  // What decides which SOCIAL pages can be arrived at.
  function known() {
    const { signedIn, me, resetToken, _codePending } = social;
    return { signedIn, needsOnboarding: me?.needsOnboarding, resetToken, codePending: _codePending, canStart: signedIn && me?.emailVerified !== false };
  }

  // The room a place names, on an entry of yours or not. A link from outside asks, with the lobby open behind.
  function enterRoomOf(to, from) {
    const id = to.query.room == null ? null : String(to.query.room), mark = router.options.history.state.inRoom;
    const hostGone = mark === 'host' && !(room.role === 'host' && room.id === id);   // a reload that kept no record, or a room since ended
    const spent = !!id && ((mark && hasLeftRoom(id)) || hostGone);                   // same place, no room; a link from outside asks
    const here = spent ? null : id;
    joining = joining && here === (room.id ?? social.roomGoingTo);
    if (room.role === 'watch' && room.id !== here) room.close({ spent: false });   // Back past the join: Forward can undo it
    if (social.roomGoingTo !== null && social.roomGoingTo !== here) social._roomLink = null;   // gone by before it joined
    if (from !== START_LOCATION && !here && !social.allowed) social._roomLink = null;   // gone by while SOCIAL's question was up (with path addresses, a landing has read its link already)
    if (!here || room.role) return;
    if (mark !== 'watch') {
      social.followRoomLink(id);
      return;
    }
    joining = true;
    social.rejoin(id);
  }

  async function applyPlace(to, from) {
    // / is the start screen: the art tabs with nothing open, on the art tab you're on. A landing there leaves the tab
    // to autosave, unless it's your own room's entry (a reload in it).
    const { tab, page, lobby } = to.meta, start = !tab && !page && !lobby;
    if (start && from === START_LOCATION && !router.options.history.state.inRoom) return;
    if (landing && tab) workspace.tabAddressed = true;
    const computer = matchMedia(desktopQuery).matches;
    if (computer) enterRoomOf(to, from);
    if (tab || start) {
      social.page = 'lobby';   // Back past a page closes it
      // The ROOM tab only while you watch (or your room is coming back): the art tab you were on otherwise.
      const watching = computer && (room.role === 'watch' || joining);
      workspace.editorTab = tab === 'room' && !watching ? artTab : tab ?? artTab;
      if (tab && workspace.editorTab !== tab) replaceNext = true;
      return;
    }
    // A phone has no SOCIAL (a link stays, for a computer). The lobby opens in the side panel, and the tab's address
    // takes the place of its own.
    if (!computer || lobby) {
      social.page = 'lobby';
      if (lobby && computer) workspace.showSocial();
      replaceNext = true;
      return;
    }
    social.page = page;
    await social.boot();   // who you are decides which pages can be shown
    if (social.page !== page) return;
    const shown = arrivalPage(page, known());
    if (shown === page) return;
    replaceNext = true;
    social.page = shown;
  }

  // The one place that navigates.
  function reconcile() {
    if (pending) return;
    const current = router.currentRoute.value, was = current.query.room ?? null, going = room.id ?? social.roomGoingTo;
    // Nothing open, the start screen. Till autosave has answered that isn't known, so an address with no tab
    // stays as it is (a document coming back moves it once, to its tab).
    const empty = workspace.documentSettled ? !project.image : !current.meta.tab;
    const path = pathOf({ tab: workspace.editorTab, page: social.page, empty });
    const computer = matchMedia(desktopQuery).matches;
    const wanted = going ?? (computer ? null : was);   // a phone has no rooms: a link stays, for a computer
    if (path === current.path && wanted === was) {
      replaceNext = false;
      return;
    }
    // Exit, End, removal, the room ending, a spent entry or a link that asks. (Back past a join never gets here: its address is right.)
    const lost = was !== null && wanted === null;
    // A page you can no longer arrive at (signed in, say) would bounce a Back that lands on it. So would the
    // Sign in under a two-factor code, and the name page has no way back.
    const spentPage = current.meta.page && arrivalPage(current.meta.page, known()) !== current.meta.page;
    const noStep = path === '/social/name' || (path === '/social/two-factor' && current.meta.page === 'sign-in');
    // The art opening or closing, between an art tab and /, is no step, and nor is the lobby's own address (it opens in
    // the side panel). A page opening over the start screen is a step, and so is a join from it.
    const start = current.meta.lobby || (!current.meta.tab && !current.meta.page && workspace.editorTab !== 'room' && !(workspace.documentSettled && social.page !== 'lobby'));   // or a landing at / (or an unknown path); ROOM's entry is a step
    const closed = path === '/' && !current.meta.page && current.meta.tab !== 'room';   // leaving ROOM for it is a step
    const replace = (landing && !room.role) || replaceNext || lost || spentPage || noStep || start || closed;
    replaceNext = false;
    ours = true;
    pending = true;   // beforeEach is a few promises off, and a second call before it would navigate again
    router[replace ? 'replace' : 'push']({
      path, query: { ...(computer ? withoutReturn(current.query) : current.query), room: wanted ?? undefined },
      state: { inRoom: going ? room.role ?? 'watch' : null },   // a phone's kept link is no room of yours
    });
  }

  // Back past going live asks. Our own navigations carry the room, so this is only Back and Forward. While it
  // asks the router hears nothing else (a second navigation would cancel this one), and a Back or Forward
  // pressed then is undone here: the one the question is about is the one the router puts back, or finishes.
  // A landing has nothing to leave, and App isn't mounted to ask: the plain address in a hosting tab stays.
  async function askBeforeLeavingHost(to, from) {
    if (from === START_LOCATION || room.role !== 'host' || String(to.query.room) === room.id) return true;
    const at = router.options.history.state.position;
    const stay = ({ state }) => { if (state && state.position !== at) history.go(at - state.position); };
    router.listening = false;
    addEventListener('popstate', stay);
    const end = await room.askToEnd();
    removeEventListener('popstate', stay);
    router.listening = true;
    if (!end) return false;   // the router puts the address back, without a navigation
    room.close();
    return true;
  }

  const stops = [
    router.beforeEach(() => { pending = true; }),
    router.beforeEach(askBeforeLeavingHost),   // after the one above: pending stays true while it asks
    router.afterEach((to, from, failure) => {
      const own = ours;
      ours = false;
      // Cancelled by a newer navigation (a Back as the address moves, or the other way): that one's end reconciles.
      // Reconciling now would start a third that cancels it, whose end would do the same, without end.
      if (isNavigationFailure(failure, NavigationFailureType.cancelled)) return;
      pending = false;   // (not after the navigation's promise: reconcile below may have started the next by then)
      if (!failure && !own) applyPlace(to, from);
      nextTick(reconcile);
    }),
    watch(() => workspace.editorTab, (tab) => { if (tab !== 'room') artTab = tab; }, { flush: 'sync' }),
    // A page SOCIAL's question was asked over, declined, leaves no entry for Back to land on.
    watch(() => social.page, (page, was) => {
      if (page === 'lobby' && was !== 'lobby' && !social.allowed) replaceNext = true;
    }, { flush: 'sync' }),
    // A join the address started can need its password form (the ROOM tab) or its refusal words (the lobby).
    watch(() => [room.status, room.role], ([status, role], [, was]) => {
      if (!joining || status === 'joining') return;
      joining = false;
      if (status === 'password') {
        replaceNext = workspace.editorTab !== 'room';   // the same entry, on the tab that asks
        workspace.editorTab = 'room';
      } else if (was && !role && social.notice) workspace.showSocial();
    }),
    // Host to artist or back, in one room: same address, and it's the new role that a reload's first look should read.
    // Out of a room you watched (Exit, its end, a join refused, Back past it), the ROOM tab goes: the art view you
    // were on, in the same step.
    watch(() => room.role, (role, was) => {
      if (role && was && router.options.history.state.inRoom) router.options.history.replace(router.options.history.location, { inRoom: role });
      if (was === 'watch' && role !== 'watch' && workspace.editorTab === 'room') workspace.editorTab = artTab;
    }),
    // default flush: changes in one tick are one step. The art opening or closing moves between the start
    // screen and the tab chosen underneath it (a room's art that comes after an artist's reload, say).
    watch(() => [workspace.editorTab, social.page, room.role, room.id, social.roomGoingTo, workspace.documentSettled, !!project.image], reconcile),
    watch(() => workspace.documentSettled, () => { landing = false; }),
  ];
  return () => stops.forEach((stop) => stop());
}

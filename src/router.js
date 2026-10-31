// The address and the stores, kept in step both ways. The stores are the truth while you work: the
// address follows them (reconcile), and they follow it on a landing, Back or Forward (applyPlace).
import { nextTick, watch } from 'vue';
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import { PLACES, arrivalPage, pathOf } from '@/lib/addresses';
import { desktopQuery } from '@/social/config';
import { useProjectStore } from '@/store/ProjectStore';
import { hasLeftRoom, useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

const Empty = { render: () => null };   // the stores decide what shows

export function defaultHistory() {
  return import.meta.env.VITE_ADDRESSES === 'path' ? createWebHistory() : createWebHashHistory();
}

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

  // What decides which SOCIAL pages can be arrived at.
  function known() {
    const { signedIn, me, resetToken, _codePending } = social;
    return { signedIn, needsOnboarding: me?.needsOnboarding, resetToken, codePending: _codePending, canStart: signedIn && me?.emailVerified !== false };
  }

  // ANSI and SAUCE need an image, and only once autosave has answered do we know there isn't one.
  function leaveIfNoImage() {
    if (!workspace.documentSettled || project.image || !['output', 'sauce'].includes(workspace.editorTab)) return;
    workspace.editorTab = 'input';
    replaceNext = true;
  }

  // The room a place names, on an entry of yours or not. True when it's a link, which asks on SOCIAL.
  function enterRoomOf(to) {
    const id = to.query.room == null ? null : String(to.query.room), mark = router.options.history.state.inRoom;
    const hostGone = mark === 'host' && !(room.role === 'host' && room.id === id);   // a host's reload, or a room since ended
    const spent = !!id && (hasLeftRoom(id) || hostGone);                             // same place, no room
    const here = spent ? null : id;
    joining = joining && here === (room.id ?? social.roomGoingTo);
    if (room.role === 'watch' && room.id !== here) room.close({ spent: false });   // Back past the join: Forward can undo it
    if (social.roomGoingTo !== null && social.roomGoingTo !== here) social._roomLink = null;   // gone by before it joined
    if (!here || room.role) return false;
    if (mark !== 'watch') {
      social.followRoomLink(id);
      return true;
    }
    joining = true;
    social.rejoin(id);
    return false;
  }

  async function applyPlace(to) {
    const { tab, page } = to.meta;
    if (!tab) return;
    if (landing) workspace.tabAddressed = true;
    if (page) social.page = page;
    workspace.editorTab = matchMedia(desktopQuery).matches && enterRoomOf(to) ? 'social' : tab;
    if (tab === 'social' && !matchMedia(desktopQuery).matches) {
      workspace.editorTab = 'input';
      replaceNext = true;
    }
    leaveIfNoImage();
    if (workspace.editorTab !== 'social' || !page) return;
    await social.boot();   // who you are decides which pages can be shown
    if (workspace.editorTab !== 'social' || social.page !== page) return;
    const shown = arrivalPage(page, known());
    if (shown === page) return;
    replaceNext = true;
    social.page = shown;
  }

  // The one place that navigates.
  function reconcile() {
    if (pending) return;
    const current = router.currentRoute.value, was = current.query.room ?? null, going = room.id ?? social.roomGoingTo;
    const path = pathOf({ tab: workspace.editorTab, page: social.page, role: room.role });
    const wanted = going ?? (matchMedia(desktopQuery).matches ? null : was);   // a phone has no rooms: a link stays, for a computer
    if (path === current.path && wanted === was) {
      replaceNext = false;
      return;
    }
    // Exit, End, removal, the room ending, a spent entry or a link that asks. (Back past a join never gets here: its address is right.)
    const lost = was !== null && wanted === null;
    // A page you can no longer arrive at (signed in, say) would bounce a Back that lands on it. So would the
    // Sign in under a two-factor code, and the name page has no way back.
    const spentPage = current.meta.page && arrivalPage(current.meta.page, known()) !== current.meta.page;
    const noStep = ['/social/name', '/social/two-factor'].includes(path);
    const replace = landing || replaceNext || lost || spentPage || noStep || !current.meta.tab;   // / is never a step
    replaceNext = false;
    ours = true;
    pending = true;   // beforeEach is a few promises off, and a second call before it would navigate again
    router[replace ? 'replace' : 'push']({
      path, query: { ...current.query, room: wanted ?? undefined },
      state: { inRoom: going ? room.role ?? 'watch' : null },   // a phone's kept link is no room of yours
    });
  }

  // Back past going live asks. Our own navigations carry the room, so this is only Back and Forward. While it
  // asks the router hears nothing else (a second navigation would cancel this one), and a Back or Forward
  // pressed then is undone here: the one the question is about is the one the router puts back, or finishes.
  async function askBeforeLeavingHost(to) {
    if (room.role !== 'host' || String(to.query.room) === room.id) return true;
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
      pending = ours = false;   // (not after the navigation's promise: reconcile below may have started the next by then)
      if (!failure && !own) applyPlace(to);
      nextTick(reconcile);
    }),
    // A join the address started can need SOCIAL, the only place its password form and refusal words show.
    watch(() => [room.status, room.role], ([status, role], [, was]) => {
      if (!joining || status === 'joining') return;
      joining = false;
      if (status === 'password' || (was && !role && social.notice)) {
        replaceNext = workspace.editorTab !== 'social';   // with no move, nothing would navigate and clear it
        workspace.editorTab = 'social';
      }
    }),
    watch(() => [workspace.editorTab, social.page, room.role, room.id, social.roomGoingTo], reconcile),   // default flush: changes in one tick are one step
    watch(() => workspace.documentSettled, () => {
      landing = false;
      leaveIfNoImage();
    }),
  ];
  return () => stops.forEach((stop) => stop());
}

// The address and the stores, kept in step both ways. The stores are the truth while you work: the
// address follows them (reconcile), and they follow it on a landing, Back or Forward (applyPlace).
import { nextTick, watch } from 'vue';
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import { PLACES, arrivalPage, pathOf } from '@/lib/addresses';
import { desktopQuery } from '@/social/config';
import { useProjectStore } from '@/store/ProjectStore';
import { useRoomStore } from '@/store/RoomStore';
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
  let pending = false, ours = false, landing = true, replaceNext = false;

  // ANSI and SAUCE need an image, and only once autosave has answered do we know there isn't one.
  function leaveIfNoImage() {
    if (!workspace.documentSettled || project.image || !['output', 'sauce'].includes(workspace.editorTab)) return;
    workspace.editorTab = 'input';
    replaceNext = true;
  }

  async function applyPlace(to) {
    const { tab, page } = to.meta;
    if (!tab) return;
    if (landing) workspace.tabAddressed = true;
    if (page) social.page = page;
    workspace.editorTab = tab;
    if (tab === 'social' && !matchMedia(desktopQuery).matches) {
      workspace.editorTab = 'input';
      replaceNext = true;
    }
    leaveIfNoImage();
    if (workspace.editorTab !== 'social' || !page) return;
    await social.boot();   // who you are decides which pages can be shown
    if (workspace.editorTab !== 'social' || social.page !== page) return;
    const { signedIn, me, resetToken, _codePending } = social;
    const shown = arrivalPage(page, {
      signedIn, needsOnboarding: me?.needsOnboarding, resetToken, codePending: _codePending, canStart: signedIn && me?.emailVerified !== false,
    });
    if (shown === page) return;
    replaceNext = true;
    social.page = shown;
  }

  // The one place that navigates.
  function reconcile() {
    if (pending) return;
    const path = pathOf({ tab: workspace.editorTab, page: social.page, role: room.role });
    if (path === router.currentRoute.value.path) return;   // later tasks compare the query too
    const replace = landing || replaceNext || path === '/social/name' || !router.currentRoute.value.meta.tab;   // / is never a step
    replaceNext = false;
    ours = true;
    pending = true;   // beforeEach is a few promises off, and a second call before it would navigate again
    router[replace ? 'replace' : 'push']({ path, query: router.currentRoute.value.query }).finally(() => { ours = false; });
  }

  const stops = [
    router.beforeEach(() => { pending = true; }),
    router.afterEach((to, from, failure) => {
      pending = false;
      if (!failure && !ours) applyPlace(to);
      nextTick(reconcile);
    }),
    watch(() => [workspace.editorTab, social.page, room.role, room.id], reconcile),   // default flush: changes in one tick are one step
    watch(() => workspace.documentSettled, () => {
      landing = false;
      leaveIfNoImage();
    }),
  ];
  return () => stops.forEach((stop) => stop());
}

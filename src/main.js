import './assets/global.css';
import './assets/fonts.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { i18n, initLocale } from './i18n';
import { createAddressRouter, followAddress, hashAddresses } from './router';
import { fromHashAddress } from './lib/addresses';
import { useSocialStore } from './store/SocialStore';
import { useRoomStore } from './store/RoomStore';
import { useWorkspaceStore, followLayerPick } from './store/WorkspaceStore';
import { useProjectStore } from './store/ProjectStore';
import { useDrawingStore } from './store/DrawingStore';
import { hostCopies } from './document/autosaveStore';
import { desktop } from './social/desktop';
import { useDesktopMenu } from './composables/useDesktopMenu';
import { installActionLog } from './dev/actionLog.js';
import { NAMES_ONLY, SKIPPED } from './dev/skipped.js';
import { installHistoryCommand } from './dev/historyTab.js';

// An old hash address (/#/social?room=x) is the path address it means, in its place, before anything reads it.
const pathAddress = !hashAddresses() && fromHashAddress(location.href);
if (pathAddress) history.replaceState(history.state, '', pathAddress);

const pinia = createPinia();
// Every build logs the steps taken this session (src/dev/actionLog.js), but for what skipped.js names, and the SOCIAL
// stores' by name alone: an issue report can carry them, and the side panel's HISTORY tab shows them, in development or
// once phosphor.history(true) is run in the console.
installActionLog(pinia, SKIPPED, NAMES_ONLY);
installHistoryCommand();

const app = createApp(App);
app.use(pinia);
app.use(i18n);
initLocale();

// SOCIAL: a link back from the server is read at load; the rest waits for the tab (a server that can't
// be reached leaves the editor be). Before the router's made, which keeps what the URL has then.
useSocialStore().start();
useRoomStore().resume();   // a room this tab hosts: the router must see it on its first look
desktop?.onQuit(() => useRoomStore().quitting());   // the desktop app asks before it quits: a room hosted here is handed over or ended
hostCopies().catch(() => {});   // a tab that closed never says it's done with its copy, and looking drops an old one

// The stores are placed from the address before App's setup, and autosave's start reads them.
const router = createAddressRouter();
app.use(router);
followAddress(router);
followLayerPick({ workspace: useWorkspaceStore(), project: useProjectStore(), drawing: useDrawingStore() });
router.isReady().finally(() => {
  app.mount('#phosphor');
  if (import.meta.env.VITE_DESKTOP === '1') useDesktopMenu();   // once mounted: the files it's asked to open go to EditWorkspace
});

// iOS Safari shows a button's :active (pressed) look on a tap only when the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true });

// Double-tap zoom is stopped by touch-action: manipulation (global.css), not by canceling touchends: a canceled touchend sends no click, so a quick second tap was lost.

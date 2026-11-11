import './assets/global.css';
import './assets/fonts.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { i18n, initLocale } from './i18n';
import { createAddressRouter, followAddress } from './router';
import { useSocialStore } from './store/SocialStore';
import { useRoomStore } from './store/RoomStore';
import { useWorkspaceStore, followLayerPick } from './store/WorkspaceStore';
import { useProjectStore } from './store/ProjectStore';
import { useDrawingStore } from './store/DrawingStore';
import { hostCopies } from './document/autosaveStore';

const pinia = createPinia();

const app = createApp(App);
app.use(pinia);
app.use(i18n);
initLocale();

// SOCIAL: a link back from the server is read at load; the rest waits for the tab (a server that can't
// be reached leaves the editor be). Before the router's made, which keeps what the URL has then.
useSocialStore().start();
useRoomStore().resume();   // a room this tab hosts: the router must see it on its first look
hostCopies().catch(() => {});   // a tab that closed never says it's done with its copy, and looking drops an old one

// The stores are placed from the address before App's setup, and autosave's start reads them.
const router = createAddressRouter();
app.use(router);
followAddress(router);
followLayerPick({ workspace: useWorkspaceStore(), project: useProjectStore(), drawing: useDrawingStore() });
router.isReady().finally(() => app.mount('#phosphor'));

// iOS Safari shows a button's :active (pressed) look on a tap only when the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true });

// Double-tap zoom is stopped by touch-action: manipulation (global.css), not by canceling touchends: a canceled touchend sends no click, so a quick second tap was lost.

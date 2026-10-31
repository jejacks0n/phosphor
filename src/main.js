import './assets/global.css';
import './assets/fonts.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { createAddressRouter, followAddress } from './router';
import { useSocialStore } from './store/SocialStore';

const pinia = createPinia();

const app = createApp(App);
app.use(pinia);

// SOCIAL: a link back from the server is read at load; the rest waits for the tab (a server that can't
// be reached leaves the editor be). Before the router's made, which keeps what the URL has then.
useSocialStore().start();

// The stores are placed from the address before App's setup, and autosave's start reads them.
const router = createAddressRouter();
app.use(router);
followAddress(router);
router.isReady().finally(() => app.mount('#phosphor'));

// iOS Safari shows a button's :active (pressed) look on a tap only when the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true });

// Disable double-tap to zoom on iOS Safari
let lastTouchEnd = 0;
document.addEventListener('touchend', (event) => {
  const now = (new Date()).getTime();
  if (now - lastTouchEnd <= 400) {
    event.preventDefault();
  }
  lastTouchEnd = now;
}, false);


import './assets/global.css';
import './assets/fonts.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

const pinia = createPinia();

const app = createApp(App);
app.use(pinia);
app.mount('#phosphor');

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


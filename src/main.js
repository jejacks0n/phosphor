import './assets/global.css';
import './assets/simple_console.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

const pinia = createPinia();

const app = createApp(App);
app.use(pinia);
app.mount('#phosphor');

app.config.errorHandler = (err) => {
  console.error(err);
};

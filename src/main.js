import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { PiniaUndo } from 'pinia-undo';
import App from './App.vue';

const pinia = createPinia();
pinia.use(PiniaUndo);

const app = createApp(App);
app.use(pinia);
app.mount('main');

app.config.errorHandler = (err) => {
  console.error(err);
};

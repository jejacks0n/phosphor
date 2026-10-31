<script setup>
import { ref, computed, nextTick, useTemplateRef, watch } from 'vue';
import { useRoomStore } from '@/store/RoomStore';
import { ANSI_ZOOM_MAX, ANSI_ZOOM_MIN } from '@/lib/zoom';
import RoomArt from './RoomArt.vue';

// The room you watch: the host's art with the part they're looking at (tracked until you look around;
// the tag on the host's box tracks again). Its name, who hosts it, their welcome and Exit are at the
// top of the chat panel. Until the
// room's name comes from the host, the heading says how joining is going; once it's the name it's for
// screen readers only (the panel shows it). A status region always there says how joining is going for
// screen readers. A private room asks for its password here. With the host's art already on the page,
// waiting and connecting mean the host is coming back (a reload of theirs), and the art stays, dimmed.
const room = useRoomStore();

const STATUS = {
  joining: 'Joining…', connecting: 'Joining…', waiting: 'Waiting for the host…',
  password: 'This room needs a password', failed: 'Couldn\'t reach this host',
};
const coming = computed(() => !!room.art && (room.status === 'waiting' || room.status === 'connecting'));
const said = computed(() => (coming.value ? 'The host is reconnecting…' : STATUS[room.status] ?? null));
const name = computed(() => room.room?.name || null);

// A try takes the form (and the focused Join) away: focus waits on the heading, and goes back to the
// password, selected, if it was wrong.
const password = ref('');
const headingRef = useTemplateRef('heading'), passwordRef = useTemplateRef('passwordInput');
const join = () => {
  headingRef.value.focus();
  room.join(room.id, { password: password.value });
};
watch(() => room.status === 'password' && room.passwordWrong, async (wrong) => {
  if (!wrong) return;
  await nextTick();
  passwordRef.value?.focus();
  passwordRef.value?.select();
});
const lookAround = () => { if (room.tracking) room.setTracking(false); };
// The zoom's buttons go by quarters, from wherever a pinch left it.
const zoomOut = () => room.setArtZoom((Math.ceil(room.artZoom * 4) - 1) / 4);
const zoomIn = () => room.setArtZoom((Math.floor(room.artZoom * 4) + 1) / 4);
</script>

<template>
  <div class="watch-room">
    <h2 ref="heading" tabindex="-1" :class="{ unseen: name }">{{ name ?? said }}</h2>
    <p class="status" :class="{ unseen: !name || !said }" role="status">{{ said }}</p>
    <form v-if="room.status === 'password'" @submit.prevent="join">
      <label>Password <input ref="passwordInput" v-model="password" type="password" autocomplete="off" required></label>
      <p v-if="room.passwordWrong" class="error" role="alert">Wrong password</p>
      <button class="primary" type="submit">Join</button>
    </form>
    <div v-if="room.art" class="art" :class="{ stale: coming }">
      <RoomArt :art="room.art" :host-view="room.hostView" :tracking="room.tracking" :zoom="room.artZoom" :host="room.room?.host || null" @zoom="room.setArtZoom" @fit="room.fitArt" @look-around="lookAround" @track="room.setTracking(true)" @looking-at="room.lookingAt = $event" />
      <div class="zoom" role="group" aria-label="Zoom">
        <button aria-label="Zoom out" :disabled="room.artZoom <= ANSI_ZOOM_MIN" @click="zoomOut">−</button>
        <span>{{ Math.round(room.artZoom * 100) }}%</span>
        <button aria-label="Zoom in" :disabled="room.artZoom >= ANSI_ZOOM_MAX" @click="zoomIn">+</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
div.watch-room {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  padding: 16px;
  font-size: 12px;
  color: var(--text-dim);
}

h2 {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
p.status {
  margin: 0;
  color: var(--text-muted);
}
.unseen {   /* for screen readers only */
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 300px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-weight: 500;
}
p.error {
  margin: 0;
  color: var(--danger);
}
form button {
  align-self: flex-start;
}

div.art {
  position: relative;
  user-select: none;
  -webkit-user-select: none;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
div.art.stale {   /* the host's art as it was: nothing new until they're back */
  opacity: 0.5;
}
div.zoom {   /* past the art's scrollbars */
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-1);
  font: 11px ui-monospace, Menlo, monospace;
}
div.zoom span {
  width: 4ch;
  text-align: center;
}
div.zoom button {
  width: 22px;
  height: 22px;
  padding: 0;
}
</style>

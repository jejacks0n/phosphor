<script setup>
import { ref, computed, nextTick, useTemplateRef, watch } from 'vue';
import { useRoomStore } from '@/store/RoomStore';
import RoomArt from './RoomArt.vue';

// The room you watch: the host's art with the part they're looking at (followed until you look around).
// Its name, who hosts it, their welcome, Follow and Leave are at the top of the chat panel. Until the
// room's name comes from the host, the heading says how joining is going; once it's the name it's for
// screen readers only (the panel shows it). A status region always there says how joining is going for
// screen readers. A private room asks for its password here.
const room = useRoomStore();

const STATUS = {
  joining: 'Joining…', connecting: 'Joining…', waiting: 'Waiting for the host…',
  password: 'This room needs a password', failed: 'Couldn\'t reach this host',
};
const said = computed(() => STATUS[room.status] ?? null);
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
const lookAround = () => { if (room.following) room.setFollowing(false); };
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
    <div v-if="room.art" class="art" :class="{ stale: room.status === 'waiting' }">
      <RoomArt :art="room.art" :host-view="room.hostView" :following="room.following" @look-around="lookAround" />
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
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
div.art.stale {   /* the host's art as it was: nothing new until they're back */
  opacity: 0.5;
}
</style>

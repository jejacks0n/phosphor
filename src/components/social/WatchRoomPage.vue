<script setup>
import { ref, computed } from 'vue';
import { useRoomStore } from '@/store/RoomStore';
import RoomArt from './RoomArt.vue';

// The room you watch: its name, who hosts it and their welcome, the host's art with the part they're
// looking at (followed until you look around), Leave. Until the room's name comes from the host, the
// heading says how joining is going; a private room asks for its password here.
const room = useRoomStore();

const STATUS = {
  joining: 'Joining…', connecting: 'Joining…', waiting: 'Waiting for the host…',
  password: 'This room needs a password', failed: 'Couldn\'t reach this host',
};
const said = computed(() => STATUS[room.status] ?? null);
const name = computed(() => room.room?.name || null);
const host = computed(() => room.room?.host || null);

const password = ref('');
const join = () => room.join(room.id, { password: password.value });
const lookAround = () => { if (room.following) room.setFollowing(false); };
</script>

<template>
  <div class="watch-room">
    <header>
      <h2>{{ name ?? said }}</h2>
      <span v-if="host" class="host">hosted by {{ host }}</span>
      <div class="buttons">
        <button v-if="room.art" @click="room.setFollowing(!room.following)">{{ room.following ? 'Following' : `Follow ${host}` }}</button>
        <button @click="room.leave()">Leave</button>
      </div>
    </header>
    <p v-if="room.room?.welcome" class="welcome">{{ room.room.welcome }}</p>
    <p v-if="name && said" class="status" role="status">{{ said }}</p>
    <form v-if="room.status === 'password'" @submit.prevent="join">
      <label>Password <input v-model="password" type="password" autocomplete="off" required></label>
      <p v-if="room.passwordWrong" class="error" role="alert">Wrong password</p>
      <button class="primary" type="submit">Join</button>
    </form>
    <div v-if="room.art" class="art">
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

header {
  display: flex;
  align-items: baseline;
  gap: 8px;
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
span.host {
  color: var(--text-muted);
  white-space: nowrap;
  font-family: 'JetBrains Mono', monospace;
}
div.buttons {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
p.welcome, p.status {
  margin: 0;
  color: var(--text-muted);
}
p.welcome {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
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
</style>

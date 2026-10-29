<script setup>
import { computed, useId } from 'vue';
import { useNow } from '@vueuse/core';
import { useRoomStore } from '@/store/RoomStore';
import { joinState, liveFor, pictureUrl, signalWords } from '@/social/lobby';
import UserName from './UserName.vue';

const props = defineProps({
  room: { type: Object, required: true },
  signedIn: { type: Boolean, required: true },
});

const roomStore = useRoomStore();
const now = useNow({ interval: 60_000 });   // "live 42 min" moves on while the lobby is shown
const join = computed(() => joinState(props.room, { signedIn: props.signedIn }));
const meta = computed(() => {
  const signal = signalWords[props.room.signal];
  return liveFor(props.room.liveSince, now.value.getTime()) + (signal ? `, ${signal.toLowerCase()}` : '');
});
const reasonId = useId();
</script>

<template>
  <article class="room-card">
    <div class="thumb">
      <img v-if="room.thumbnail" :src="pictureUrl(room.thumbnail)" alt="">
    </div>
    <div class="info">
      <div class="name" :title="room.name">{{ room.name }}</div>
      <UserName class="host" :name="room.host" />
      <div class="meta">{{ meta }}</div>
      <div v-if="room.blockedInside" class="blocked">Someone you blocked is here</div>
      <div class="foot">
        <span v-if="join.reason" :id="reasonId" class="reason">{{ join.reason }}</span>
        <button class="join" :disabled="!join.enabled" :aria-describedby="join.reason ? reasonId : undefined" @click="roomStore.join(room.id)">{{ join.label }}</button>
      </div>
    </div>
  </article>
</template>

<style scoped>
article.room-card {
  display: flex;
  flex-direction: column;
  background: var(--surface-0);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.2s;
}
article.room-card:hover {
  border-color: var(--accent);
}

div.thumb {
  aspect-ratio: 2 / 1;
  background: var(--black);
}
div.thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
}

div.info {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 9px 10px 10px;
  font-size: 11px;
  color: var(--text-muted);
}

div.name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

span.host {
  display: block;
  margin-top: 4px;
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
}

div.meta {
  margin-top: 2px;
}

div.blocked {
  margin-top: 4px;
  font-size: 10px;
  color: var(--text-faint);
}

div.foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
}

span.reason {
  color: var(--text-faint);
}

button.join {
  padding: 5px 10px;
  font-size: 11px;
}
</style>

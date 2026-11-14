<script setup>
import { useI18n } from 'vue-i18n';
import { useRoomStore } from '@/store/RoomStore';
import UserName from './UserName.vue';

// A desktop host's joins waiting for a yes or no (room.asks, at most five): "{name} wants to join", with Turn away and
// Let in. In the chat panel, and in Settings and stats.
const room = useRoomStore();
const { t } = useI18n();
</script>

<template>
  <ul class="asks" :aria-label="t('social.desktop.asksAria')" aria-live="polite">
    <li v-for="a in room.asks" :key="a.ask">
      <i18n-t keypath="social.desktop.wantsToJoin" tag="p">
        <template #name><UserName class="person" :name="a.name" :sub="a.sub" /></template>
      </i18n-t>
      <div class="answers">
        <button @click="room.turnAway(a.ask)">{{ t('social.desktop.turnAway') }}</button>
        <button class="primary" @click="room.letIn(a.ask)">{{ t('social.desktop.letIn') }}</button>
      </div>
    </li>
  </ul>
</template>

<style scoped>
/* As an invitation to draw is, in the chat panel. */
ul.asks {
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-0);
  color: var(--text);
}
p {
  margin: 0;
}
div.answers {
  display: flex;
  gap: 8px;
}
div.answers button {
  flex: 1 1 0;
}
</style>

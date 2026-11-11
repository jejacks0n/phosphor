<script setup>
// What a narrow screen says in place of rooms. A watcher gets the room's own Exit; a host's room goes on (ending it is
// a choice for the room's menu, which a narrow screen doesn't show).
import { useI18n } from 'vue-i18n';
import { useRoomStore } from '@/store/RoomStore';

const { t } = useI18n();
const room = useRoomStore();
</script>

<template>
  <div class="narrow-rooms" role="status">
    <span>{{ t('social.narrow') }}</span>
    <button v-if="room.role === 'watch'" @click="room.leave()">{{ t('social.chat.exit') }}</button>
  </div>
</template>

<style scoped>
div.narrow-rooms {
  position: fixed;
  left: 50%;
  top: 12px;
  z-index: 10002;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  border-radius: 6px;
  background: #e0b050;
  color: var(--black);
  font-size: 12px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
}
</style>

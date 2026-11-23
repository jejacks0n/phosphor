<script setup>
import { ref, nextTick, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomStore } from '@/store/RoomStore';
import ModalDialog from '@/components/ModalDialog.vue';
import EndRoomDialog from './EndRoomDialog.vue';
import HostRoomPage from './HostRoomPage.vue';

// The host's tools in the chat panel's header: a gear that opens Settings and stats (the room's dashboard, in a box,
// where the link is copied and the welcome is edited; room.statsOpen, so the command list opens it too), and End room
// (which asks first). Closing the box puts focus back on the gear.
const room = useRoomStore();
const { t } = useI18n();

const gear = useTemplateRef('gear');
const ending = ref(false);   // End room asking
watch(() => room.askingEnd, (asking) => { if (asking) ending.value = false; });   // Back asks the same question: one is enough

async function closeStats() {
  room.statsOpen = false;
  await nextTick();
  gear.value.focus();
}
</script>

<template>
  <div class="room-menu">
    <button ref="gear" class="gear" :aria-label="t('social.menu.settingsAndStats')" :title="t('social.menu.settingsAndStats')" @click="room.statsOpen = true">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><path d="M495.9 166.6c3.2 8.7.5 18.4-6.4 24.6l-43.3 39.4c1.1 8.3 1.7 16.8 1.7 25.4s-.6 17.1-1.7 25.4l43.3 39.4c6.9 6.2 9.6 15.9 6.4 24.6-4.4 11.9-9.7 23.3-15.8 34.3l-4.7 8.1c-6.6 11-14 21.4-22.1 31.2-5.9 7.2-15.7 9.6-24.5 6.8l-55.7-17.7c-13.4 10.3-28.2 18.9-44 25.4l-12.5 57.1c-2 9.1-9 16.3-18.2 17.8-13.8 2.3-28 3.5-42.5 3.5s-28.7-1.2-42.5-3.5c-9.2-1.5-16.2-8.7-18.2-17.8l-12.5-57.1c-15.8-6.5-30.6-15.1-44-25.4L83.1 425.9c-8.8 2.8-18.6.3-24.5-6.8-8.1-9.8-15.5-20.2-22.1-31.2l-4.7-8.1c-6.1-11-11.4-22.4-15.8-34.3-3.2-8.7-.5-18.4 6.4-24.6l43.3-39.4C64.6 273.1 64 264.6 64 256s.6-17.1 1.7-25.4L22.4 191.2c-6.9-6.2-9.6-15.9-6.4-24.6 4.4-11.9 9.7-23.3 15.8-34.3l4.7-8.1c6.6-11 14-21.4 22.1-31.2 5.9-7.2 15.7-9.6 24.5-6.8l55.7 17.7c13.4-10.3 28.2-18.9 44-25.4l12.5-57.1c2-9.1 9-16.3 18.2-17.8C227.3 1.2 241.5 0 256 0s28.7 1.2 42.5 3.5c9.2 1.5 16.2 8.7 18.2 17.8l12.5 57.1c15.8 6.5 30.6 15.1 44 25.4l55.7-17.7c8.8-2.8 18.6-.3 24.5 6.8 8.1 9.8 15.5 20.2 22.1 31.2l4.7 8.1c6.1 11 11.4 22.4 15.8 34.3zM256 336a80 80 0 1 0 0-160 80 80 0 1 0 0 160z"/></svg>
    </button>
    <button class="danger end" @click="ending = true">{{ t('social.host.endRoom') }}</button>
    <EndRoomDialog v-if="ending" @end="room.endRoom()" @cancel="ending = false" />

    <ModalDialog v-if="room.statsOpen" wide closable :label="t('social.menu.settingsAndStats')" @cancel="closeStats">
      <div class="people-forms">
        <HostRoomPage />
      </div>
    </ModalDialog>
  </div>
</template>

<style scoped>
div.room-menu {
  display: flex;
  align-items: center;
  gap: 6px;
}
button.gear {   /* as tall as End room beside it */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 4px;
  color: var(--text-muted);
}
button.gear:hover {
  color: var(--text);
}
button.gear svg {
  width: 14px;
  height: 14px;
  fill: currentColor;
}
button.end {   /* as Exit, in its place for a watcher */
  height: 26px;
  white-space: nowrap;   /* a long room name wraps instead */
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
</style>

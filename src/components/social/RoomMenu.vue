<script setup>
import { ref, nextTick, onBeforeUnmount, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomStore } from '@/store/RoomStore';
import DropdownMenu from '@/components/DropdownMenu.vue';
import ModalDialog from '@/components/ModalDialog.vue';
import EndRoomDialog from './EndRoomDialog.vue';
import HostRoomPage from './HostRoomPage.vue';

// The host's tools in the chat panel's header: End room (which asks first), and the room menu: Copy link and
// Settings and stats (the room's dashboard, in a box, where the welcome is edited too). Escape puts focus back on the
// menu's button.
const room = useRoomStore();
const { t } = useI18n();

const root = useTemplateRef('root');
const stats = ref(false);    // Settings and stats open
const ending = ref(false);   // End room asking
watch(() => room.askingEnd, (asking) => { if (asking) ending.value = false; });   // Back asks the same question: one is enough
const copied = ref(false);
let copiedTimer = null;
onBeforeUnmount(() => clearTimeout(copiedTimer));

const trigger = () => root.value.querySelector('.dropdown-trigger');
async function closeStats() {
  stats.value = false;
  await nextTick();
  trigger().focus();
}

async function copyLink() {
  if (!await room.copyLink()) return;
  copied.value = true;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { copied.value = false; }, 2000);
}
</script>

<template>
  <div ref="root" class="room-menu">
    <span class="copied" role="status">{{ copied ? t('common.copied') : '' }}</span>
    <DropdownMenu :label="t('social.menu.label')">
      <template #trigger><span aria-hidden="true">⋯</span></template>
      <button @click="copyLink">{{ t('common.copyLink') }}</button>
      <button @click="stats = true">{{ t('social.menu.settingsAndStats') }}</button>
    </DropdownMenu>
    <button class="danger end" @click="ending = true">{{ t('social.host.endRoom') }}</button>
    <EndRoomDialog v-if="ending" @end="room.endRoom()" @cancel="ending = false" />

    <ModalDialog v-if="stats" wide :label="t('social.menu.settingsAndStats')" @cancel="closeStats">
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
button.end {   /* as Exit, in its place for a watcher */
  height: 26px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
span.copied {
  font-size: 11px;
  color: var(--text-muted);
}
</style>

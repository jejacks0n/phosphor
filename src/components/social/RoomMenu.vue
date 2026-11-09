<script setup>
import { ref, nextTick, onBeforeUnmount, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomStore } from '@/store/RoomStore';
import DropdownMenu from '@/components/DropdownMenu.vue';
import ModalDialog from '@/components/ModalDialog.vue';
import EndRoomDialog from './EndRoomDialog.vue';
import HostRoomPage from './HostRoomPage.vue';

// The host's tools in the chat panel's header: End room (which asks first), and the room menu: Copy link, Edit
// welcome and Settings and stats (the room's dashboard, in a box). Edit welcome is also the pinned welcome's Edit
// (the panel calls editWelcome with its link); Save is the settings change that sends only the welcome. Cancel
// (or Escape) puts focus back where the box came from, or on the menu's button if that has gone.
const room = useRoomStore();
const { t } = useI18n();

const root = useTemplateRef('root');
const welcome = ref(null);   // the text while the Edit welcome box is open
const stats = ref(false);    // Settings and stats open
const ending = ref(false);   // End room asking
watch(() => room.askingEnd, (asking) => { if (asking) ending.value = false; });   // Back asks the same question: one is enough
const copied = ref(false);
let opener = null, copiedTimer = null;
onBeforeUnmount(() => clearTimeout(copiedTimer));

const trigger = () => root.value.querySelector('.dropdown-trigger');
async function backToOpener() {
  await nextTick();
  (opener?.isConnected ? opener : trigger()).focus();
}

function editWelcome(from) {
  opener = from ?? trigger();
  welcome.value = room.room.welcome ?? '';
}
defineExpose({ editWelcome });

function saveWelcome() {
  room.changeSettings({ welcome: welcome.value, allowGuests: room.room.allowGuests, max: room.room.max });
  welcome.value = null;
  backToOpener();
}
function cancelWelcome() {
  welcome.value = null;
  backToOpener();
}
function openStats() {
  opener = trigger();
  stats.value = true;
}
function closeStats() {
  stats.value = false;
  backToOpener();
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
      <button @click="editWelcome()">{{ t('social.menu.editWelcome') }}</button>
      <button @click="openStats">{{ t('social.menu.settingsAndStats') }}</button>
    </DropdownMenu>
    <button class="danger end" @click="ending = true">{{ t('social.host.endRoom') }}</button>
    <EndRoomDialog v-if="ending" @end="room.endRoom()" @cancel="ending = false" />

    <ModalDialog v-if="stats" wide :label="t('social.menu.settingsAndStats')" @cancel="closeStats">
      <div class="people-forms">
        <HostRoomPage />
      </div>
    </ModalDialog>

    <ModalDialog v-if="welcome !== null" :title="t('social.menu.editWelcome')" @cancel="cancelWelcome">
      <form @submit.prevent="saveWelcome">
        <label>{{ t('social.start.welcomeMessage') }} <textarea v-model="welcome" maxlength="200" rows="3"></textarea></label>
        <div class="actions">
          <button type="button" @click="cancelWelcome">{{ t('common.cancel') }}</button>
          <button type="submit">{{ t('common.save') }}</button>
        </div>
      </form>
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
form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-weight: 500;
}
textarea {
  height: auto;
  min-height: calc(3lh + 18px);   /* 3 lines, the padding and the border; it grows to fit the message */
  field-sizing: content;
  resize: vertical;
}
div.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

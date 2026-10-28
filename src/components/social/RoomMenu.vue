<script setup>
import { ref, nextTick, onBeforeUnmount, useTemplateRef } from 'vue';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import DropdownMenu from '@/components/DropdownMenu.vue';
import ModalDialog from '@/components/ModalDialog.vue';
import EndRoomDialog from './EndRoomDialog.vue';

// The host's room menu in the chat panel's header: Copy link, Edit welcome, Settings and stats (the
// SOCIAL tab) and End room, which asks first. Edit welcome is also the pinned welcome's Edit (the panel
// calls editWelcome with its link); Save is the settings change that sends only the welcome. Cancel
// (or Escape) puts focus back where the box came from, or on the menu's button if that has gone.
const room = useRoomStore(), workspace = useWorkspaceStore();

const root = useTemplateRef('root');
const welcome = ref(null);   // the text while the Edit welcome box is open
const ending = ref(false);
const copied = ref('');
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

async function copyLink() {
  try {
    await navigator.clipboard.writeText(room.link);
  } catch {
    useSocialStore().notice = 'Couldn\'t copy the link';
    return;
  }
  copied.value = 'Copied';
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { copied.value = ''; }, 2000);
}

const endRoom = () => {
  ending.value = false;
  room.endRoom();
};
const cancelEnd = () => {
  ending.value = false;
  opener = null;
  backToOpener();
};
</script>

<template>
  <div ref="root" class="room-menu">
    <span class="copied" role="status">{{ copied }}</span>
    <DropdownMenu label="Room">
      <template #trigger><span aria-hidden="true">⋯</span></template>
      <button @click="copyLink">Copy link</button>
      <button @click="editWelcome()">Edit welcome</button>
      <button @click="workspace.editorTab = 'social'">Settings and stats</button>
      <button class="danger" @click="ending = true">End room</button>
    </DropdownMenu>

    <ModalDialog v-if="welcome !== null" title="Edit welcome" @cancel="cancelWelcome">
      <form @submit.prevent="saveWelcome">
        <label>Welcome message <textarea v-model="welcome" maxlength="200" rows="3"></textarea></label>
        <div class="actions">
          <button type="submit">Save</button>
          <button type="button" @click="cancelWelcome">Cancel</button>
        </div>
      </form>
    </ModalDialog>
    <EndRoomDialog v-if="ending" @end="endRoom" @cancel="cancelEnd" />
  </div>
</template>

<style scoped>
div.room-menu {
  display: flex;
  align-items: center;
  gap: 6px;
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

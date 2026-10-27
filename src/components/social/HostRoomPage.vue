<script setup>
import { ref, computed, watch, useId, useTemplateRef, onBeforeUnmount } from 'vue';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { charRowsOf } from '@/lib/Cells';
import { fontOnWire } from '@/social/wire';
import { nameColor } from '@/social/names';
import DropdownMenu from '@/components/DropdownMenu.vue';
import ModalDialog from '@/components/ModalDialog.vue';
import RoomArt from './RoomArt.vue';

// The room you host: its link, your art as watchers see it, who's watching (a watcher counts once
// connected), its settings, End room. One status region, always there, says Reconnecting… (seen) and
// Copied or Saved (which their buttons show).
const room = useRoomStore(), project = useProjectStore(), workspace = useWorkspaceStore();

const art = computed(() => (project.cells.length
  ? { cells: project.cells, cols: project.cols, lines: charRowsOf(project.rows), font: fontOnWire(workspace.displayFontSpec) }
  : null));

const watching = computed(() => room.watchers.filter((w) => w.connected).length);

// Copied or Saved, on its button and in the status region, for 2 s.
const done = ref(null);
let doneTimer = null;
const say = (word) => {
  done.value = word;
  clearTimeout(doneTimer);
  doneTimer = setTimeout(() => { done.value = null; }, 2000);
};
onBeforeUnmount(() => clearTimeout(doneTimer));
const said = computed(() => (room.status === 'reconnecting' ? 'Reconnecting…' : done.value ?? ''));

async function copyLink() {
  try {
    await navigator.clipboard.writeText(room.link);
  } catch {
    useSocialStore().notice = 'Couldn\'t copy the link';
    return;
  }
  say('Copied');
}

// Room settings follow the room as it is (the Room's word on it included): each field only when its
// value changes, so a room given again as it was (hosting after a reconnect) leaves what's typed.
const welcome = ref(''), allowGuests = ref(true), max = ref(12);
watch(() => room.room?.welcome, (v) => { if (v !== undefined) welcome.value = v; }, { immediate: true });
watch(() => room.room?.allowGuests, (v) => { if (v !== undefined) allowGuests.value = v; }, { immediate: true });
watch(() => room.room?.max, (v) => { if (v !== undefined) max.value = v; }, { immediate: true });
const countId = useId();

// A member's ⋯ menu: Remove for this session, or Block from my rooms, which asks first. Cancel (or Escape)
// puts focus back on the ⋯ button the menu came from, or on the Watching heading when that member has left.
const blocking = ref(null);   // { watcher, trigger }
const askToBlock = (watcher, event) => {
  blocking.value = { watcher, trigger: event.currentTarget.closest('.dropdown').querySelector('.dropdown-trigger') };
};
const heading = useTemplateRef('heading');
const cancelBlock = () => {
  (blocking.value.trigger.isConnected ? blocking.value.trigger : heading.value).focus();
  blocking.value = null;
};
const confirmBlock = async () => {
  const { watcher } = blocking.value;
  blocking.value = null;
  await room.block(watcher);
};
const save = () => {
  room.changeSettings({ welcome: welcome.value, allowGuests: allowGuests.value, max: max.value });
  say('Saved');
};
</script>

<template>
  <div class="host-room">
    <section class="main">
      <header>
        <h2>{{ room.room.name }}</h2>
        <span class="count">{{ watching }} watching</span>
      </header>
      <p class="status" :class="{ unseen: room.status !== 'reconnecting' }" role="status">{{ said }}</p>
      <div class="link-row">
        <span class="link-text">{{ room.link }}</span>
        <button @click="copyLink">{{ done === 'Copied' ? 'Copied' : 'Copy link' }}</button>
      </div>
      <p v-if="!room.room.public" class="help">Send the link and the password to anyone you want in.</p>
      <div class="preview">
        <RoomArt v-if="art" :art="art" />
      </div>
    </section>

    <aside class="side">
      <h3 ref="heading" class="watching" tabindex="-1">Watching</h3>
      <ul aria-label="Watching">
        <li v-for="watcher in room.watchers" :key="watcher.peer">
          <span class="swatch" :style="{ background: nameColor(watcher.name) }"></span>
          <span class="name">{{ watcher.name }}</span>
          <span v-if="watcher.guest" class="tag">guest</span>
          <span class="what">{{ !watcher.connected ? 'connecting…' : watcher.following ? 'following' : 'looking around' }}</span>
          <DropdownMenu v-if="!watcher.guest" :label="`More for ${watcher.name}`">
            <template #trigger><span aria-hidden="true">⋯</span></template>
            <button @click="room.remove(watcher.peer)">Remove for this session</button>
            <button @click="askToBlock(watcher, $event)">Block from my rooms</button>
          </DropdownMenu>
        </li>
      </ul>

      <details>
        <summary>Room settings</summary>
        <form @submit.prevent="save">
          <label>Welcome message <textarea v-model="welcome" maxlength="200" rows="3" :aria-describedby="countId"></textarea></label>
          <p :id="countId" class="help count">{{ welcome.length }}/200</p>
          <label class="choice"><input v-model="allowGuests" type="checkbox"> Allow guests</label>
          <label>Most watchers <input v-model.number="max" type="number" min="1" max="24" required></label>
          <button type="submit">{{ done === 'Saved' ? 'Saved' : 'Save' }}</button>
        </form>
      </details>

      <button class="end danger" @click="room.endRoom()">End room</button>
    </aside>

    <ModalDialog v-if="blocking" :title="`Block ${blocking.watcher.name}?`"
        sub="They can't join any room you host, and they leave this one now. Unblock them from Account." @cancel="cancelBlock">
      <div class="actions">
        <button class="danger" @click="confirmBlock">Block</button>
        <button autofocus @click="cancelBlock">Cancel</button>
      </div>
    </ModalDialog>
  </div>
</template>

<style scoped>
div.host-room {
  display: flex;
  height: 100%;
  min-height: 0;
  font-size: 12px;
  color: var(--text-dim);
}

section.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
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
span.count {
  color: var(--text-muted);
  white-space: nowrap;
}
p.status, p.help {
  margin: 0;
  color: var(--text-muted);
}
div.link-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
span.link-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text);
  user-select: all;
}
p.status.unseen {   /* for screen readers only: the button says it */
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
div.preview {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

aside.side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 280px;
  flex-shrink: 0;
  padding: 14px;
  overflow: auto;
  border-left: 1px solid var(--border);
  background: var(--surface-0);
}
h3.watching {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: normal;
  text-transform: none;
  color: var(--text-dim);
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
}
span.swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  flex-shrink: 0;
}
span.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text);
}
span.tag {
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
  color: var(--text-muted);
  border: 1px solid var(--border-light);
}
span.what {
  color: var(--text-faint);
  white-space: nowrap;
}

summary {
  cursor: pointer;
  font-weight: 500;
}
form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-weight: 500;
}
label.choice {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  font-weight: 400;
}
textarea {
  resize: vertical;
}
p.count {
  margin-top: -4px;
  font-size: 11px;
  text-align: right;
}
button.end {
  margin-top: auto;
}
div.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

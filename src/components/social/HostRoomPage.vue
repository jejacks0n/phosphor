<script setup>
import { ref, computed, watch, useId, onBeforeUnmount } from 'vue';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { charRowsOf } from '@/lib/Cells';
import { fontOnWire } from '@/social/wire';
import RoomArt from './RoomArt.vue';

// The room you host: its link, your art as watchers see it, how many are watching (a watcher counts once
// connected; who they are is in the chat panel), its settings, End room. One status region, always there,
// says Reconnecting… (seen) and Copied or Saved (which their buttons show).
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
// value changes, so a room given again as it was (hosting after a reconnect) leaves what's typed. The
// form is kept in the store, with what the room last said, so it stays while you're on another tab and
// a change made meanwhile shows when you're back.
const draft = room.settingsDraft;
for (const key of ['welcome', 'allowGuests', 'max']) {
  watch(() => room.room?.[key], (v) => {
    if (v !== undefined && v !== draft.seen[key]) draft[key] = draft.seen[key] = v;
  }, { immediate: true });
}
const countId = useId();

const save = () => {
  room.changeSettings({ welcome: draft.welcome, allowGuests: draft.allowGuests, max: draft.max });
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
      <p v-if="!room.room.public" class="help">{{ room.hasPassword ? 'Send the link and the password to anyone you want in.' : 'Send the link to anyone you want in.' }}</p>
      <div class="preview">
        <RoomArt v-if="art" :art="art" />
      </div>
    </section>

    <aside class="side">
      <details :open="draft.open" @toggle="draft.open = $event.target.open">
        <summary>Room settings</summary>
        <form @submit.prevent="save">
          <label>Welcome message <textarea v-model="draft.welcome" maxlength="200" rows="3" :aria-describedby="countId"></textarea></label>
          <p :id="countId" class="help count">{{ draft.welcome.length }}/200</p>
          <label class="choice"><input v-model="draft.allowGuests" type="checkbox"> Allow guests</label>
          <label>Most watchers <input v-model.number="draft.max" type="number" min="1" max="24" required></label>
          <button type="submit">{{ done === 'Saved' ? 'Saved' : 'Save' }}</button>
        </form>
      </details>

      <button class="end danger" @click="room.endRoom()">End room</button>
    </aside>
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
  height: auto;
  min-height: calc(3lh + 18px);   /* 3 lines, the padding and the border; it grows to fit the message */
  field-sizing: content;
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
</style>

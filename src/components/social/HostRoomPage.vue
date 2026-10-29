<script setup>
import { ref, computed, watch, useId, onBeforeUnmount, nextTick, useTemplateRef } from 'vue';
import { useRoomStore, MAX_WATCHERS } from '@/store/RoomStore';
import { removedCount } from '@/social/session';
import EndRoomDialog from './EndRoomDialog.vue';
import LobbyPicture from './LobbyPicture.vue';
import CameBy from './CameBy.vue';

// The room you host, as a dashboard: its name and how long it's been live, Copy link and End room (which
// asks first), the session's five numbers, its settings with the facts that can't change, and who came by. One status
// region, always there, says Reconnecting… (seen) and Copied or Saved (which their buttons show).
const room = useRoomStore();

// Once a second, for Live for and for what else on this page counts time: `now` is passed down to it.
const now = ref(Date.now());
const tick = setInterval(() => { now.value = Date.now(); }, 1000);
onBeforeUnmount(() => clearInterval(tick));

const liveFor = computed(() => {
  const s = Math.max(0, Math.floor((now.value - room.session.liveSince) / 1000));
  const two = (n) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
});

const numbers = computed(() => [
  ['Here now', room.hereNow],
  ['Most at once', room.session.most],
  ['Came by', room.session.people.length],
  ['Messages', room.session.messages],
  ['Removed', removedCount(room.session)],
]);

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
  if (await room.copyLink()) say('Copied');
}

const endButton = useTemplateRef('endButton');
const ending = ref(false);
const cancelEnd = async () => {
  ending.value = false;
  await nextTick();
  endButton.value.focus();
};

// Room settings follow the room as it is (the Room's word on it included): each field only when its
// value changes, so a room given again as it was (hosting after a reconnect) leaves what's typed. A field
// the user has typed in keeps their typing when the room's value changes underneath (the welcome edited
// from the chat panel); one they haven't touched follows it. The form is kept in the store, with what the
// room last said (seen), so it stays while you're on another tab and a change made meanwhile shows when
// you're back.
const draft = room.settingsDraft;
watch(() => draft.max, (max) => { if (max > MAX_WATCHERS) draft.max = MAX_WATCHERS; });
for (const key of ['welcome', 'allowGuests', 'max']) {
  watch(() => room.room?.[key], (v) => {
    if (v === undefined || v === draft.seen[key]) return;
    if (draft.seen[key] === undefined || draft[key] === draft.seen[key]) draft[key] = v;
    draft.seen[key] = v;
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
    <header>
      <h2>{{ room.room.name }}</h2>
      <span v-if="room.session.liveSince" class="live">Live for {{ liveFor }}</span>
      <span class="actions">
        <button @click="copyLink">{{ done === 'Copied' ? 'Copied' : 'Copy link' }}</button>
        <button ref="endButton" class="danger" @click="ending = true">End room</button>
      </span>
    </header>
    <p class="status" :class="{ unseen: room.status !== 'reconnecting' }" role="status">{{ said }}</p>
    <p class="link"><span class="link-text">{{ room.link }}</span></p>
    <p v-if="!room.room.public" class="help">{{ room.hasPassword ? 'Send the link and the password to anyone you want in.' : 'Send the link to anyone you want in.' }}</p>

    <dl class="numbers">
      <div v-for="[label, value] in numbers" :key="label">
        <dt>{{ label }}</dt>
        <dd>{{ value }}</dd>
      </div>
    </dl>

    <div class="columns">
      <LobbyPicture v-if="room.room.public" />
      <section class="settings">
        <h3>Room settings</h3>
        <form @submit.prevent="save">
          <label>Welcome message <textarea v-model="draft.welcome" maxlength="200" rows="3" :aria-describedby="countId"></textarea></label>
          <p :id="countId" class="help count">{{ draft.welcome.length }}/200</p>
          <label class="choice"><input v-model="draft.allowGuests" type="checkbox"> Allow guests</label>
          <label>Max watchers <input v-model.number="draft.max" type="number" min="1" :max="MAX_WATCHERS" required></label>
          <button type="submit">{{ done === 'Saved' ? 'Saved' : 'Save' }}</button>
        </form>
        <div class="facts">
          <p class="help">Set when the room started</p>
          <p>{{ room.room.public ? 'Listed in the lobby' : 'Only with the link' }}</p>
          <p v-if="room.hasPassword">Password set</p>
        </div>
      </section>
    </div>
    <CameBy v-if="room.session.people.length" :people="room.session.people" :now="now" />

    <EndRoomDialog v-if="ending" @end="room.endRoom()" @cancel="cancelEnd" />
  </div>
</template>

<style scoped>
div.host-room {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
  padding: 16px;
  overflow: auto;
  font-size: 12px;
  color: var(--text-dim);
}

header {
  display: flex;
  align-items: baseline;
  gap: 12px;
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
span.live {
  color: var(--text-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
span.actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
p.status, p.help, p.link, div.facts p {
  margin: 0;
  color: var(--text-muted);
}
p.status.unseen {   /* for screen readers only: the button says it */
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
span.link-text {
  font-family: 'JetBrains Mono', monospace;
  color: var(--text);
  overflow-wrap: anywhere;
  user-select: all;
}

dl.numbers {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}
dl.numbers div {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-0);
}
dt {
  color: var(--text-muted);
}
dd {
  margin: 2px 0 0;
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

div.columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  align-items: start;
}
section.settings {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-0);
}
h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
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
div.facts {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
div.facts p:first-child {
  font-size: 11px;
}
</style>

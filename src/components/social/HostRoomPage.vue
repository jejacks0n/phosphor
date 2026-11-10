<script setup>
import { ref, computed, watch, useId, onBeforeUnmount, nextTick, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomStore, MAX_WATCHERS } from '@/store/RoomStore';
import { removedCount } from '@/social/session';
import { signalWords } from '@/social/lobby';
import EndRoomDialog from './EndRoomDialog.vue';
import LobbyPicture from './LobbyPicture.vue';
import CameBy from './CameBy.vue';

// The room you host, as a dashboard: its name and how long it's been live, Copy link and End room (which
// asks first), the session's five numbers, its settings with the facts that can't change, and who came by. One status
// region, always there, says Reconnecting… (seen; also while connecting a room that has been live: a reload
// bringing it back) and Copied or Saved (which their buttons show).
const room = useRoomStore();
const { t } = useI18n();

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
  [t('social.host.stats.hereNow'), room.hereNow],
  [t('social.host.stats.max'), room.session.most],
  [t('social.host.stats.total'), room.session.people.length],
  [t('social.host.stats.messages'), room.session.messages],
  [t('social.host.stats.removed'), removedCount(room.session)],
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
const reconnecting = computed(() => room.status === 'reconnecting' || (room.status === 'connecting' && !!room.session.liveSince));
const said = computed(() => (reconnecting.value ? t('common.reconnecting') : done.value === 'copied' ? t('common.copied') : done.value === 'saved' ? t('common.saved') : ''));

async function copyLink() {
  if (await room.copyLink()) say('copied');
}

const endButton = useTemplateRef('endButton');
const ending = ref(false);
const cancelEnd = async () => {
  ending.value = false;
  await nextTick();
  endButton.value.focus();
};
watch(() => room.askingEnd, (asking) => { if (asking) ending.value = false; });   // Back asks the same question: one is enough

// Room settings follow the room as it is (the server's word on it included): each field only when its
// value changes, so a room given again as it was (hosting after a reconnect) leaves what's typed. A field
// the user has typed in keeps their typing when the room's value changes underneath (the welcome edited
// from the chat panel); one they haven't touched follows it. The form is kept in the store, with what the
// room last said (seen), so it stays while you're on another tab and a change made meanwhile shows when
// you're back.
const draft = room.settingsDraft;
watch(() => draft.max, (max) => { if (max > MAX_WATCHERS) draft.max = MAX_WATCHERS; });
for (const key of ['welcome', 'allowGuests', 'max', 'signal']) {
  watch(() => room.room?.[key], (v) => {
    if (v === undefined || v === draft.seen[key]) return;
    if (draft.seen[key] === undefined || draft[key] === draft.seen[key]) draft[key] = v;
    draft.seen[key] = v;
  }, { immediate: true });
}
const countId = useId();
// With guests off, no new guest gets in; the ones here stay unless the host chooses to kick them too (or one at a
// time, from the chat panel).
const guests = computed(() => room.watchers.filter((w) => w.guest));
const kickGuests = ref(false);
const kickLabel = computed(() => t('social.host.kickGuests', { count: guests.value.length }, guests.value.length));

const save = () => {
  room.changeSettings({ welcome: draft.welcome, allowGuests: draft.allowGuests, max: draft.max, signal: draft.signal });
  if (!draft.allowGuests && kickGuests.value) for (const guest of guests.value) room.remove(guest.peer);
  kickGuests.value = false;
  say('saved');
};
</script>

<template>
  <div class="host-room">
    <header>
      <h2>{{ room.room.name }}</h2>
      <span v-if="room.session.liveSince" class="live">{{ t('social.host.liveFor', { duration: liveFor }) }}</span>
      <span class="actions">
        <button @click="copyLink">{{ done === 'copied' ? t('common.copied') : t('common.copyLink') }}</button>
        <button ref="endButton" class="danger" @click="ending = true">{{ t('social.host.endRoom') }}</button>
      </span>
    </header>
    <p class="status" :class="{ unseen: !reconnecting }" role="status">{{ said }}</p>
    <p class="link"><span class="link-text">{{ room.link }}</span></p>
    <p v-if="!room.room.public" class="help">{{ room.hasPassword ? t('social.host.sendLinkWithPassword') : t('social.host.sendLink') }}</p>

    <dl class="numbers">
      <div v-for="[label, value] in numbers" :key="label">
        <dt>{{ label }}</dt>
        <dd>{{ value }}</dd>
      </div>
    </dl>

    <!-- The lobby picture with the settings under it, and who came by beside them, as tall as they are or taller. -->
    <div class="columns">
      <div class="column">
        <LobbyPicture v-if="room.room.public" />
        <section class="settings">
          <h3>{{ t('social.host.roomSettings') }}</h3>
          <form @submit.prevent="save">
            <label>{{ t('social.start.welcomeMessage') }} <textarea v-model="draft.welcome" maxlength="200" rows="3" :aria-describedby="countId"></textarea></label>
            <p :id="countId" class="help count">{{ t('social.start.charCount', { count: draft.welcome.length, max: 200 }) }}</p>
            <label class="choice"><input v-model="draft.allowGuests" type="checkbox"> {{ t('social.start.allowGuests') }}</label>
            <label v-if="!draft.allowGuests && guests.length" class="choice kick"><input v-model="kickGuests" type="checkbox"> {{ kickLabel }}</label>
            <label>{{ t('social.start.maxWatchers') }} <input v-model.number="draft.max" type="number" min="1" :max="MAX_WATCHERS" required></label>
            <label v-if="room.room.public">{{ t('social.start.signal') }}
              <select v-model="draft.signal">
                <option :value="null">{{ t('common.none') }}</option>
                <option v-for="(words, value) in signalWords" :key="value" :value="value">{{ words }}</option>
              </select>
            </label>
            <button type="submit">{{ done === 'saved' ? t('common.saved') : t('common.save') }}</button>
          </form>
          <div class="facts">
            <p class="help">{{ t('social.host.setAtStart') }}</p>
            <p>{{ room.room.public ? t('social.host.listedInLobby') : t('social.host.onlyWithLink') }}</p>
            <p v-if="room.hasPassword">{{ t('social.host.passwordSet') }}</p>
          </div>
        </section>
      </div>
      <CameBy :people="room.session.people" :now="now" />
    </div>

    <EndRoomDialog v-if="ending" @end="room.endRoom()" @cancel="cancelEnd" />
  </div>
</template>

<style scoped>
div.host-room {
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;   /* the tab's height with its padding, so only this scrolls, not the tab */
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
dt {   /* as SAUCE's labels */
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-faint);
}
dd {
  margin: 2px 0 0;
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

div.columns {   /* two columns, or one under the other when there isn't room */
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: 12px;
}
div.column {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
label.kick {   /* under Allow guests, as part of it */
  margin-top: -4px;
  padding-left: 21px;
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

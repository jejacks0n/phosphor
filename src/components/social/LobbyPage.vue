<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore } from '@/store/RoomStore';
import { goingBackReplacesWords } from '@/social/messages';
import { silencedWords } from '@/social/chat';
import { signalWords } from '@/social/lobby';
import ConfirmEmail from './ConfirmEmail.vue';
import UserName from './UserName.vue';
import RoomCard from './RoomCard.vue';
import ReportDialog from './ReportDialog.vue';

// The lobby, in the side panel's Social tab: you (or Sign in), the public rooms as cards, and who else is here.
// Showing it connects the lobby, and while it shows, a room of yours whose tab has gone is looked for.
const social = useSocialStore(), roomStore = useRoomStore();
const { t } = useI18n();
onMounted(() => social.showLobby());
const LOOK_EVERY_MS = 2000;
const looking = setInterval(() => roomStore.lookForOwnRooms(), LOOK_EVERY_MS);
onBeforeUnmount(() => {
  clearInterval(looking);
  roomStore.stopLooking();
});
watch(() => social.claims?.sub, () => roomStore.lookForOwnRooms(), { immediate: true });

const filters = computed(() => [
  [t('social.lobby.filterAll'), null],
  ...Object.entries(signalWords).map(([value, words]) => [words, value]),
]);
const filter = ref(null);
const shown = computed(() => (filter.value ? social.rooms.filter((r) => r.signal === filter.value) : social.rooms));

// What the rooms area shows. A lobby that drops after a state keeps its rooms (dimmed) while it
// reconnects; one that never got a state (it holds no one, not even you) has nothing to keep.
const view = computed(() => {
  const status = social.lobbyStatus;
  const empty = !social.lobby.rooms.size && !social.lobby.people.size;
  if (status === 'refused' || status === 'closed' || (status === 'reconnecting' && empty)) return 'unavailable';
  if (status === 'connecting' || status === null) return 'loading';
  return social.rooms.length ? 'rooms' : 'empty';
});
const reconnecting = computed(() => social.lobbyStatus === 'reconnecting' && view.value !== 'unavailable');

// A room of yours to go back to with no card to say so: private, or out of the lobby, or filtered out.
const yoursUnlisted = computed(() => (view.value === 'loading' ? [] : roomStore.reclaimable.filter((r) => !shown.value.some((card) => card.id === r.id))));

const name = computed(() => social.myName ?? social.me?.username);
// Who you are is known once /api/me has answered: until then, neither you nor a guest (no Sign in to flash).
const known = computed(() => social.supported !== null);

// A card's Report room, asked here: the card can leave the lobby before "Reported. Thank you." has gone.
const reporting = ref(null);   // ReportDialog's props, from a RoomCard's report

// Silenced, Start a room is off with until when beside it; a ticking now brings it back when that's past.
const now = ref(Date.now());
const silenced = computed(() => social.claims?.silencedUntil > now.value);
let tick;
onMounted(() => { tick = setInterval(() => { now.value = Date.now(); }, 60_000); });
onBeforeUnmount(() => clearInterval(tick));
</script>

<template>
  <!-- Not "social" in a class or id: content blockers hide those, and the lobby goes blank. -->
  <section class="lobby" :aria-label="t('sidePanel.lobby')" @dragover.prevent @drop.prevent> <!-- a dropped file isn't opened by the browser -->
    <p v-if="social.supported === false" class="unsupported">{{ t('social.unsupported') }}</p>
    <template v-else>
      <p v-if="social.notice && social.page === 'lobby'" class="notice" role="status">
        <span>{{ social.notice }}</span>
        <button class="link" :aria-label="t('common.dismiss')" @click="social.notice = null">✕</button>
      </p>
      <div class="you">
        <div v-if="known" class="who">
          <UserName v-if="name" class="name" :name="name" />
          <span v-if="!social.signedIn" class="tag">{{ t('common.guest') }}</span>
        </div>
        <div v-if="social.signedIn" class="links">
          <button @click="social.page = 'account'">{{ t('social.lobby.editAccount') }}</button>
          <button @click="social.signOut()">{{ t('social.lobby.signOut') }}</button>
        </div>
        <template v-if="known && social.signedIn">
          <ConfirmEmail v-if="social.me?.emailVerified === false" class="confirm" />
        </template>
        <template v-else-if="known">
          <button class="primary sign-in" @click="social.page = 'sign-in'">{{ t('social.lobby.signInToSocialize') }}</button>
          <i18n-t keypath="social.lobby.noAccount" tag="p" class="help">
            <template #create>
              <button class="link inline" @click="social.page = 'create'">{{ t('social.lobby.createOne') }}</button>
            </template>
          </i18n-t>
        </template>
      </div>

      <p v-for="room in yoursUnlisted" :key="room.id" class="yours">
        <i18n-t :keypath="roomStore.goingBackReplaces ? 'social.lobby.reclaimWaitingDirty' : 'social.lobby.reclaimWaiting'" tag="span" :values="{ replaces: goingBackReplacesWords() }">
          <template #name>
            <strong>{{ room.name }}</strong>
          </template>
        </i18n-t>
        <button class="primary" @click="roomStore.goBackToRoom(room.id)">{{ t('social.lobby.backToYourRoom') }}</button>
      </p>
      <header>
        <h2>{{ t('social.lobby.publicRooms') }}</h2>
        <span class="count">{{ t('social.lobby.liveCount', { count: social.rooms.length }) }}</span>
        <select v-model="filter" class="filter" :aria-label="t('social.lobby.filterAria')">
          <option v-for="[label, value] in filters" :key="label" :value="value">{{ label }}</option>
        </select>
      </header>
      <template v-if="social.signedIn && social.me?.emailVerified !== false">
        <p v-if="silenced" class="silenced" role="status">{{ silencedWords(social.claims.silencedUntil, now) }}</p>
        <button class="start" :disabled="silenced" @click="social.page = 'start-room'">{{ t('social.lobby.startRoom') }}</button>
      </template>
      <p v-if="reconnecting" class="status" role="status">{{ t('common.reconnecting') }}</p>

      <div v-if="view === 'unavailable'" class="state">
        <h3>{{ t('social.lobby.unavailableHeading') }}</h3>
        <p>{{ t('social.lobby.unavailableBody') }}</p>
        <p v-if="social.lobbyStatus === 'refused'">{{ t('social.lobby.clockHint') }}</p>
      </div>
      <div v-else-if="view === 'loading'" class="rooms" aria-busy="true">
        <div v-for="i in 3" :key="i" class="skeleton-card">
          <div class="skeleton thumb"></div>
          <div class="skeleton line"></div>
          <div class="skeleton line short"></div>
        </div>
      </div>
      <div v-else-if="view === 'empty'" class="state">
        <h3>{{ t('social.lobby.emptyHeading') }}</h3>
        <p>{{ t('social.lobby.emptyBody') }}</p>
      </div>
      <div v-else-if="!shown.length" class="state">
        <h3>{{ t('social.lobby.emptyFilter') }}</h3>
      </div>
      <!-- stale while reconnecting: dimmed, and their Join buttons out of reach -->
      <div v-else class="rooms" :class="{ stale: reconnecting }" :inert="reconnecting">
        <RoomCard v-for="room in shown" :key="room.id" :room="room" :signed-in="social.signedIn" @report="reporting = $event" />
      </div>

      <hr>
      <h3 class="here">{{ t('social.lobby.inLobby') }} <span class="count">{{ social.people.length }}</span></h3>
      <ul :aria-label="t('social.lobby.inLobby')">
        <li v-for="person in social.people" :key="person.sub" :class="{ me: person.sub === social.claims?.sub }">
          <UserName class="name" :name="person.name">{{ person.sub === social.claims?.sub ? t('social.chat.youSuffix') : '' }}</UserName>
          <span v-if="person.guest" class="what">{{ t('common.guest') }}</span>
        </li>
      </ul>
    </template>
    <ReportDialog v-if="reporting" v-bind="reporting" @done="reporting = null" />
  </section>
</template>

<style scoped>
section.lobby {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  padding: 12px;
  overflow: auto;
  font-size: 12px;
  color: var(--text-dim);
}

p.notice {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  padding: 8px 10px;
  border-radius: 4px;
  background: var(--surface-2);
  line-height: 1.4;
  color: var(--text-muted);
}
p.notice button.link {
  padding: 0 4px;
}
p.unsupported {
  margin: 0;
  line-height: 1.5;
  color: var(--text-muted);
}

div.you {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
h3.here {   /* as SAUCE's labels */
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: normal;
  text-transform: uppercase;
  color: var(--text-faint);
}
div.who {
  display: flex;
  align-items: center;
  gap: 8px;
}
span.name {
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
div.links {
  display: flex;
  gap: 6px;
  margin: 8px 0 0;
}
div.links button {
  flex: 1;
}
button.sign-in {
  width: 100%;
  margin-top: 12px;
}
div.confirm {
  margin-top: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}
p.help {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-muted);
}
button.link.inline {
  padding: 0;
  font-size: inherit;
  letter-spacing: normal;
  color: var(--accent);
}

p.yours {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  line-height: 1.4;
}

header {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
header h2 {   /* as SAUCE's title */
  margin: 0;
  font-size: 13px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent);
}
span.count {
  color: var(--text-muted);
  font-weight: 400;
}
header h2,
header span.count {
  white-space: nowrap;
}
select.filter {   /* right of the title, as small as its words */
  width: auto;
  min-width: 0;
  height: 24px;
  margin-left: auto;
  align-self: center;
  padding: 2px 6px;
  font-size: 11px;
}
p.silenced {
  margin: 0;
  color: var(--text-muted);
}
button.start {
  align-self: stretch;
}

p.status {
  margin: 0;
  color: var(--text-muted);
}

div.rooms {
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: opacity 0.2s;
}
div.rooms.stale {
  opacity: 0.4;
}

div.skeleton-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
div.skeleton {
  background: var(--surface-2);
  border-radius: 4px;
}
div.skeleton.thumb {
  aspect-ratio: 2 / 1;
}
div.skeleton.line {
  height: 9px;
  width: 80%;
}
div.skeleton.line.short {
  width: 50%;
}
@media (prefers-reduced-motion: no-preference) {
  div.skeleton {
    background: linear-gradient(90deg, var(--surface-2) 0, var(--surface-3) 50%, var(--surface-2) 100%);
    background-size: 200% 100%;
    animation: shimmer 1.4s linear infinite;
  }
  @keyframes shimmer { to { background-position: -200% 0; } }
}

div.state {
  padding: 16px 0;
}
div.state h3 {
  margin: 0;
  font-size: 13px;
  letter-spacing: normal;
  text-transform: none;
  color: var(--text);
}
div.state p {
  margin: 8px 0 0;
  line-height: 1.4;
  color: var(--text-muted);
}

hr {
  width: 100%;
  margin: 4px 0;
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
  padding: 4px 0;
}
li span.name {
  flex: 1;
}
li.me span.name {   /* you, among them */
  color: var(--accent-hot);
}
span.what {
  color: var(--text-faint);
  white-space: nowrap;
}
section.lobby button {   /* a button's words stay on one line */
  white-space: nowrap;
}
</style>

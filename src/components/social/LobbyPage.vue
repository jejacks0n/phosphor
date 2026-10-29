<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useSocialStore } from '@/store/SocialStore';
import { mutedWords } from '@/social/chat';
import UserName from './UserName.vue';
import RoomCard from './RoomCard.vue';
import StartRoomPage from './StartRoomPage.vue';

const social = useSocialStore();

const FILTERS = [['All', null], ['Wants feedback', 'feedback'], ['Open to chat', 'chat']];
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

const name = computed(() => social.myName ?? social.me?.username);
// Who you are is known once /api/me has answered: until then, neither you nor a guest (no Sign in to flash).
const known = computed(() => social.supported !== null);

// Muted, Start a room is off with until when beside it; a ticking now brings it back when that's past.
const now = ref(Date.now());
const muted = computed(() => social.claims?.mutedUntil > now.value);
let tick;
onMounted(() => { tick = setInterval(() => { now.value = Date.now(); }, 60_000); });
onBeforeUnmount(() => clearInterval(tick));
</script>

<template>
  <div class="lobby">
    <!-- Setup room takes the public rooms' place; the column beside stays. -->
    <section v-if="social.page === 'start-room'" class="main">
      <StartRoomPage />
    </section>
    <section v-else class="main">
      <header>
        <h2>Public rooms</h2>
        <span class="count">{{ social.rooms.length }} live</span>
        <template v-if="social.signedIn && social.me?.emailVerified !== false">
          <p v-if="muted" class="muted">{{ mutedWords(social.claims.mutedUntil, now) }}</p>
          <button class="start" :disabled="muted" @click="social.page = 'start-room'">Start a room</button>
        </template>
      </header>
      <hr>
      <div class="chips" role="group" aria-label="Filter rooms">
        <button v-for="[label, value] in FILTERS" :key="label" class="chip" :aria-pressed="filter === value" @click="filter = value">{{ label }}</button>
      </div>
      <p v-if="reconnecting" class="status" role="status">Reconnecting…</p>

      <div v-if="view === 'unavailable'" class="state">
        <h3>Rooms are unavailable right now</h3>
        <p>The editor works as usual.</p>
        <p v-if="social.lobbyStatus === 'refused'">If your computer's clock is wrong, fix it and reload.</p>
      </div>
      <div v-else-if="view === 'loading'" class="rooms" aria-busy="true">
        <div v-for="i in 4" :key="i" class="skeleton-card">
          <div class="skeleton thumb"></div>
          <div class="skeleton line"></div>
          <div class="skeleton line short"></div>
        </div>
      </div>
      <div v-else-if="view === 'empty'" class="state">
        <h3>No public rooms right now</h3>
        <p>Start one and you'll be the first thing people see here.</p>
      </div>
      <div v-else-if="!shown.length" class="state">
        <h3>No rooms match this filter</h3>
      </div>
      <!-- stale while reconnecting: dimmed, and their Join buttons out of reach -->
      <div v-else class="rooms" :class="{ stale: reconnecting }" :inert="reconnecting">
        <RoomCard v-for="room in shown" :key="room.id" :room="room" :signed-in="social.signedIn" />
      </div>
    </section>

    <aside class="side">
      <div class="you">
        <div class="label">You</div>
        <div v-if="known" class="who">
          <UserName v-if="name" class="name" :name="name" />
          <span v-if="!social.signedIn" class="tag">guest</span>
        </div>
        <div v-if="social.signedIn" class="links">
          <button @click="social.page = 'account'">Edit account</button>
          <button @click="social.signOut()">Sign out</button>
        </div>
      </div>

      <template v-if="known && social.signedIn">
        <div v-if="social.me?.emailVerified === false" class="confirm">
          Confirm your email to start a room
          <button class="link inline" :disabled="social.busy" @click="social.resendConfirmation()">Resend</button>
        </div>
      </template>
      <template v-else-if="known">
        <button class="primary sign-in" @click="social.page = 'sign-in'">Sign in</button>
        <p class="help">No account? <button class="link inline" @click="social.page = 'create'">Create one</button></p>
        <p class="help">Sign in to chat and start rooms.</p>
      </template>

      <hr>
      <h3 class="here">In the lobby <span class="count">{{ social.people.length }}</span></h3>
      <ul aria-label="In the lobby">
        <li v-for="person in social.people" :key="person.sub">
          <UserName class="name" :name="person.name" />
          <span v-if="person.guest" class="what">guest</span>
        </li>
      </ul>
    </aside>
  </div>
</template>

<style scoped>
div.lobby {
  display: flex;
  height: 100%;
  min-height: 0;
  font-size: 12px;
  color: var(--text-dim);
}

section.main {
  flex: 1;
  min-width: 0;
  padding: 16px;
  overflow: auto;
}

header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
}
header h2 {
  margin: 0;
}
header button.start {
  margin-left: auto;
}
header p.muted { /* until when, beside Start a room */
  margin: 0 0 0 auto;
  color: var(--text-muted);
}
header p.muted + button.start {
  margin-left: 0;
}
section.main > hr { /* the space below Start a room as above and beside it: the section's 16px */
  margin-top: 16px;
}

section.main > div.chips {
  margin-bottom: 12px;
}

span.count {
  color: var(--text-muted);
  font-weight: 400;
}

div.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
button.chip {
  padding: 3px 9px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  background: var(--surface-3);
  border-color: var(--border-light);
  box-shadow: none;
  white-space: nowrap;
}
button.chip[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--text-inverted);
  font-weight: 600;
}

p.status {
  margin: 0 0 10px;
  color: var(--text-muted);
}

div.rooms {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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
  padding: 32px 0;
}
div.state h3 {
  font-size: 14px;
  letter-spacing: normal;
  text-transform: none;
  color: var(--text);
}
div.state p {
  margin: 8px 0 0;
  color: var(--text-muted);
}

aside.side {
  display: flex;
  flex-direction: column;
  width: 240px;
  flex-shrink: 0;
  padding: 14px;
  overflow: auto;
  border-left: 1px solid var(--border);
  background: var(--surface-0);
}

div.label,
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
  margin-top: 16px;
}

div.confirm {
  margin-top: 16px;
  color: var(--text-muted);
  line-height: 1.5;
}

p.help {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}
button.link.inline {
  padding: 0;
  font-size: inherit;
  letter-spacing: normal;
  color: var(--accent);
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
li span.name {
  flex: 1;
}
span.what {
  color: var(--text-faint);
  white-space: nowrap;
}
</style>

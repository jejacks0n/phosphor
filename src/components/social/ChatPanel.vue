<script setup>
import { ref, reactive, computed, nextTick, onMounted, useTemplateRef, watch } from 'vue';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import UserName from './UserName.vue';
import { clock } from '@/social/chat';
import ChatFoot from './ChatFoot.vue';
import RoomMenu from './RoomMenu.vue';
import RoomPeople from './RoomPeople.vue';
import ReportDialog from './ReportDialog.vue';

// The chat of the room you host or watch, at the right of the whole app (every tab, while you're in
// one): the room's name (and, watching, who hosts it, and Exit; hosting, the room menu and who is here), the
// host's welcome pinned (with the host's Edit), the messages, and the box to write in. » folds it
// to a thin rail that counts what came since. The list keeps its place: a new message scrolls it only
// when it was already at the bottom, and earlier ones (asked for on reaching the top) go in above
// without moving what you were reading. Someone you blocked is folded to one line (Show opens just
// that message). Who came and went, with no message between, is one line ("tin-owl joined, wren
// left"); your own comings and goings aren't shown, as "You joined" marks where you came in. A confirmed
// member can Report someone else's message (it shows on hover or focus, as the host's Delete does), until
// they've reported that person in this room.
const room = useRoomStore(), social = useSocialStore();

const folded = ref(false);
const since = ref(0);    // messages since the fold
const panel = useTemplateRef('panel');
const list = useTemplateRef('list');
const menu = useTemplateRef('menu');

const host = computed(() => room.room?.host || null);
const blocked = computed(() => new Set(social.blocked.map((b) => b.id)));
const shownAnyway = reactive(new Set());   // blocked messages opened with Show
const hidden = (m) => !m.mine && blocked.value.has(m.sub) && !shownAnyway.has(m.id);
const time = (ts) => clock.format(ts);
const reportable = (m) => room.canReport && !m.mine && !m.deleted && !hidden(m) && !room.reported.includes(m.sub);
const reporting = ref(null);   // { name, sub, messageId, trigger }
const opened = ref(0);         // each Report opens a new dialog, even on the same message
const askToReport = (m, event) => {
  reporting.value = { name: m.name, sub: m.sub, messageId: m.id, trigger: event.currentTarget };
  opened.value++;
};

onMounted(() => {
  list.value.scrollTop = list.value.scrollHeight;
});

// Folding and opening: focus goes to the other button, or the box.
async function fold(to) {
  folded.value = to;
  since.value = 0;
  await nextTick();
  const next = to ? panel.value.querySelector('button.open') : (panel.value.querySelector('textarea') ?? panel.value.querySelector('button.fold'));
  next?.focus();
  if (!to) list.value.scrollTop = list.value.scrollHeight;
}
watch(() => room.chat.at(-1)?.id, () => { if (folded.value && !room.chat.at(-1)?.presence) since.value++; });

// The list as drawn: messages, runs of who came and went ({ id, people }), and "You joined" after the
// last of a watcher's first history (a run ends there, so what came after is below it). A run names each
// person once, where they first came in it, by how they ended up: joined, left, came and went, came back.
const did = ({ first, last }) => (first === last ? first : first === 'joined' ? 'came and went' : 'came back');
const rows = computed(() => {
  const out = [];
  let run = null;
  for (const m of room.chat) {
    if (!m.presence) {
      out.push(m);
      run = null;
    } else if (!m.mine) {
      if (!run) out.push(run = { id: m.id, people: [] });
      const seen = run.people.find((p) => p.sub === m.sub);
      if (seen) seen.last = m.presence;
      else run.people.push({ id: m.id, sub: m.sub, name: m.name, first: m.presence, last: m.presence });
    }
    if (m.id === room.joinedAt) {
      out.push({ id: 'you-joined', joined: true });
      run = null;
    }
  }
  return out;
});

// The list's place (the list is shown when not folded; messages come and go meanwhile).
const atBottom = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 8;
watch(() => [room.chat.length, room.chat[0]?.id], async (_, [, before]) => {
  const el = list.value;
  if (!el || folded.value) return;
  const stuck = atBottom(el), height = el.scrollHeight, top = el.scrollTop;
  const prepended = room.chat.findIndex((m) => m.id === before) > 0;
  await nextTick();
  if (prepended) el.scrollTop = top + el.scrollHeight - height;
  else if (stuck) el.scrollTop = el.scrollHeight;
  askIfAtTop();
}, { flush: 'pre' });

// Reaching the top asks for the page before the oldest message (one at a time; the store decides).
function askIfAtTop() {
  const el = list.value;
  if (el && room.chatMore && el.scrollTop < 24) room.earlier();
}
</script>

<template>
  <aside ref="panel" class="chat" :class="{ folded }" aria-label="Chat">
    <div v-show="folded" class="rail">
      <button class="open link" aria-label="Open the chat" @click="fold(false)">«</button>
      <span v-if="since" class="count">{{ since }}</span>
    </div>
    <div v-show="!folded" class="body">
      <header>
        <div class="room">
          <h2 v-if="room.room?.name">{{ room.room.name }}</h2>
          <p v-if="room.role === 'watch' && host" class="host">hosted by <UserName class="person" :name="host" /></p>
        </div>
        <div class="tools">
          <RoomMenu v-if="room.role === 'host'" ref="menu" />
          <button v-else-if="room.role === 'watch'" class="exit" @click="room.leave()">Exit</button>
          <button class="fold link" aria-label="Fold the chat" @click="fold(true)">»</button>
        </div>
      </header>
      <RoomPeople v-if="room.role === 'host'" />
      <p v-if="room.room?.welcome" class="pinned">
        <span>
          Pinned, from the host
          <button v-if="room.role === 'host'" class="link edit" @click="menu.editWelcome($event.currentTarget)">Edit</button>
        </span>
        {{ room.room.welcome }}
      </p>
      <div ref="list" class="list" role="log" aria-label="Messages" tabindex="-1" @scroll.passive="askIfAtTop">
        <p v-if="room.chatMore" class="more">↑ Scroll up for earlier messages</p>
        <p v-if="room.role === 'watch' && room.joinedAt === null && room.status === 'live'" class="joined">You joined</p>
        <!-- A row is drawn again only when what it shows changes, not on every new message. -->
        <div v-for="m in rows" :key="m.id" v-memo="m.people ? [m.people.map(did).join()] : [m.deleted, hidden(m), room.role === 'host', reportable(m)]">
          <p v-if="m.joined" class="joined">You joined</p>
          <p v-else-if="m.people" class="presence">
            <span><template v-for="(p, i) in m.people" :key="p.id">{{ i ? ', ' : '' }}<UserName class="person" :name="p.name" /> {{ did(p) }}</template></span>
          </p>
          <div v-else class="message" :class="{ note: m.deleted || hidden(m) }">
            <p v-if="m.deleted">Message deleted by the host</p>
            <p v-else-if="hidden(m)">
              Message from someone you blocked
              <button class="link" @click="shownAnyway.add(m.id)">Show</button>
            </p>
            <template v-else>
              <p class="who">
                <UserName class="name" :name="m.name">{{ m.mine ? ' (you)' : '' }}</UserName>
                <span v-if="m.host" class="tag">host</span>
                <!-- Report and Delete take the time's place while the message is pointed at or has focus. -->
                <span class="when">
                  <time>{{ time(m.ts) }}</time>
                  <span v-if="reportable(m) || room.role === 'host'" class="actions">
                    <button v-if="reportable(m)" class="link report" :aria-label="`Report message from ${m.name}`" @click="askToReport(m, $event)">Report</button>
                    <button v-if="room.role === 'host'" class="link delete" :aria-label="`Delete message from ${m.name}`" @click="room.deleteMessage(m.id)">Delete</button>
                  </span>
                </span>
              </p>
              <p class="text">{{ m.text }}</p>
            </template>
          </div>
        </div>
      </div>
      <ChatFoot />
      <ReportDialog v-if="reporting" :key="opened" v-bind="reporting" @done="reporting = null" />
    </div>
  </aside>
</template>

<style scoped>
aside.chat {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 280px;
  min-height: 0;
  box-sizing: border-box;
  border-radius: 5px;
  background: var(--surface-1);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-dim);
}
aside.chat.folded {
  width: 28px;
  align-items: center;
}
.body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding-top: 6px;
}
.rail button.open {
  padding: 4px;
  font-size: 14px;
}
span.count {
  min-width: 16px;
  padding: 1px 4px;
  box-sizing: border-box;
  border-radius: 8px;
  background: var(--accent);
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  color: var(--white);
}

header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 10px 6px 8px 12px;
  border-bottom: 1px solid var(--border);
}
div.room {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
h2 {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
p.host {
  margin: 0;
  overflow-wrap: anywhere;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-muted);
}
div.tools {
  display: flex;
  align-items: center;
  gap: 4px;
}
button.exit {   /* as the host's ⋯ in its place */
  height: 26px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
button.fold {
  padding: 4px 6px;
  font-size: 14px;
}

p.pinned {
  margin: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-0);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
p.pinned span {
  display: flex;
  justify-content: space-between;
  margin-bottom: 2px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-faint);
}

p.pinned button.edit {
  padding: 0 4px;
  font-size: 11px;
  text-transform: none;
  letter-spacing: normal;
}

div.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 12px;
  overflow-anchor: none;   /* the list holds its own place (above) */
}
p.more, p.joined, p.presence {
  margin: 6px 0;
  font-size: 11px;
  text-align: center;
  color: var(--text-faint);
}
p.joined, p.presence {
  display: flex;
  align-items: center;
  gap: 8px;
}
p.presence span {
  overflow-wrap: anywhere;
}
span.person {   /* a name in a line of words */
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  color: var(--text);
}
p.joined::before, p.joined::after, p.presence::before, p.presence::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

div.message {
  position: relative;
  padding: 4px 0;
}
div.message p {
  margin: 0;
}
div.message.note p {
  font-style: italic;
  color: var(--text-faint);
}
p.who {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
span.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  color: var(--text);
}
span.tag {
  padding: 0 6px;
  border-radius: 10px;
  font-size: 10px;
  color: var(--text-muted);
  border: 1px solid var(--border-light);
}
span.when {   /* the time and the actions in one place, on one baseline, at the right */
  display: grid;
  justify-items: end;
  align-items: baseline;
  margin-left: auto;
}
span.when > * {
  grid-area: 1 / 1;
}
time {
  font-size: 10px;
  color: var(--text-faint);
}
p.text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--text);
}
div.message button.link {
  padding: 0 4px;
  font-style: normal;
}
span.actions {   /* as the time; see-through until wanted (not hidden, so Tab still reaches them) */
  display: flex;
  gap: 8px;
  opacity: 0;
}
div.message button.link:is(.report, .delete) {
  padding: 0;
  font-size: 10px;
  font-weight: 400;
  letter-spacing: normal;
  color: var(--text-faint);
}
div.message button.link.report:hover {
  color: var(--text);
}
div.message button.link.delete:hover {
  color: var(--danger);
}
div.message:is(:hover, :focus-within) span.actions {
  opacity: 1;
}
div.message:is(:hover, :focus-within) span.when:has(span.actions) time {
  visibility: hidden;
}
</style>

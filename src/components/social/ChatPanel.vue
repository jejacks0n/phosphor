<script setup>
import { ref, reactive, computed, nextTick, onMounted, useTemplateRef, watch } from 'vue';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { nameColor } from '@/social/names';
import ChatFoot from './ChatFoot.vue';

// The chat of the room you host or watch, at the right of the whole app (every tab, while you're in
// one): the room's name, the host's welcome pinned, the messages, and the box to write in. » folds it
// to a thin rail that counts what came since. The list keeps its place: a new message scrolls it only
// when it was already at the bottom, and earlier ones (asked for on reaching the top) go in above
// without moving what you were reading. Someone you blocked is folded to one line (Show opens just
// that message).
const room = useRoomStore(), social = useSocialStore();

const folded = ref(false);
const since = ref(0);    // messages since the fold
const panel = useTemplateRef('panel');
const list = useTemplateRef('list');

const blocked = computed(() => new Set(social.blocked.map((b) => b.id)));
const shownAnyway = reactive(new Set());   // blocked messages opened with Show
const hidden = (m) => !m.mine && blocked.value.has(m.sub) && !shownAnyway.has(m.id);
const clock = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });   // made once: building one per row is slow
const time = (ts) => clock.format(ts);

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
watch(() => room.chat.at(-1)?.id, () => { if (folded.value) since.value++; });

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
        <div>
          <h2>Chat</h2>
          <p class="room">{{ room.room?.name }}</p>
        </div>
        <button class="fold link" aria-label="Fold the chat" @click="fold(true)">»</button>
      </header>
      <p v-if="room.room?.welcome" class="pinned">
        <span>Pinned, from the host</span>
        {{ room.room.welcome }}
      </p>
      <div ref="list" class="list" role="log" aria-label="Messages" @scroll.passive="askIfAtTop">
        <p v-if="room.chatMore" class="more">↑ Scroll up for earlier messages</p>
        <p v-if="room.role === 'watch' && room.joinedAt === null && room.status === 'live'" class="joined">You joined</p>
        <!-- A row is drawn again only when what it shows changes, not on every new message. -->
        <div v-for="m in room.chat" :key="m.id" v-memo="[m.deleted, hidden(m), room.role === 'host', m.id === room.joinedAt]">
          <div class="message" :class="{ note: m.deleted || hidden(m) }">
            <p v-if="m.deleted">Message deleted by the host</p>
            <p v-else-if="hidden(m)">
              Message from someone you blocked
              <button class="link" @click="shownAnyway.add(m.id)">Show</button>
            </p>
            <template v-else>
              <p class="who">
                <span class="name" :style="{ color: nameColor(m.name) }">{{ m.name }}{{ m.mine ? ' (you)' : '' }}</span>
                <span v-if="m.host" class="tag">host</span>
                <time>{{ time(m.ts) }}</time>
              </p>
              <p class="text">{{ m.text }}</p>
            </template>
            <button v-if="room.role === 'host' && !m.deleted" class="link delete" :aria-label="`Delete message from ${m.name}`" @click="room.deleteMessage(m.id)">Delete</button>
          </div>
          <p v-if="m.id === room.joinedAt" class="joined">You joined</p>
        </div>
      </div>
      <ChatFoot />
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
h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
p.room {
  margin: 2px 0 0;
  overflow-wrap: anywhere;
  color: var(--text-muted);
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
  display: block;
  margin-bottom: 2px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-faint);
}

div.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 12px;
  overflow-anchor: none;   /* the list holds its own place (above) */
}
p.more, p.joined {
  margin: 6px 0;
  font-size: 11px;
  text-align: center;
  color: var(--text-faint);
}
p.joined {
  display: flex;
  align-items: center;
  gap: 8px;
}
p.joined::before, p.joined::after {
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
}
span.tag {
  padding: 0 6px;
  border-radius: 10px;
  font-size: 10px;
  color: var(--text-muted);
  border: 1px solid var(--border-light);
}
time {
  margin-left: auto;
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
div.message button.delete {
  position: absolute;
  top: 2px;
  right: 0;
  opacity: 0;
  background: var(--surface-1);
}
div.message:hover button.delete,
div.message:focus-within button.delete {
  opacity: 1;
}
</style>

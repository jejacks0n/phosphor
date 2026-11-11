<script setup>
import { ref, reactive, computed, nextTick, onMounted, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useProjectStore } from '@/store/ProjectStore';
import UserName from './UserName.vue';
import { clock } from '@/social/chat';
import { toast } from '@/composables/useToast';
import ChatFoot from './ChatFoot.vue';
import RoomMenu from './RoomMenu.vue';
import RoomPeople from './RoomPeople.vue';
import ReportDialog from './ReportDialog.vue';
import ModalDialog from '@/components/ModalDialog.vue';

// The chat of the room you host or watch, the side panel's CHAT tab (SidePanel, every tab, while you're in
// one): the room's name (and, watching, who hosts it, and Exit; hosting, the room menu and who is here;
// a watcher's list of who to follow is there once an artist is), the host's welcome pinned, the messages, and the box to write in. The panel
// counts what came while it isn't shown. The list keeps its place: a new message scrolls it only
// when it was already at the bottom, and earlier ones (asked for on reaching the top) go in above
// without moving what you were reading. Someone you blocked is folded to one line (Show opens just
// that message). Who came and went, with no message between, is one line ("tin-owl joined, wren
// left"); your own comings and goings aren't shown, as "You joined" marks where you came in. A confirmed
// member can Report someone else's message (it shows on hover or focus, as the host's Delete does), until
// they've reported that person in this room; and Report room, under Exit, until they've reported the room. A signed-in
// watcher has Block beside it (the host's is in "N here"), which asks first and blocks them from the watcher's own rooms.
// An invitation to draw waits here, blocking nothing, until it's answered, withdrawn or they leave.
const room = useRoomStore(), social = useSocialStore(), drawing = useDrawingStore(), project = useProjectStore();
const { t } = useI18n();

const props = defineProps({ shown: { type: Boolean, default: true } });   // in view: not folded away or behind LAYERS
const list = useTemplateRef('list');

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
const blockable = (m) => room.role === 'watch' && !social.isGuest && !m.mine && !m.deleted && !blocked.value.has(m.sub);
const blocking = ref(null);   // { name, trigger }
const askToBlock = (m, event) => {
  blocking.value = { name: m.name, trigger: event.currentTarget };
};
const blockDone = (trigger) => (trigger.isConnected ? trigger : list.value).focus();   // its Block gone, the messages
const cancelBlock = () => {
  blockDone(blocking.value.trigger);
  blocking.value = null;
};
const confirmBlock = async () => {
  const { name, trigger } = blocking.value;
  blocking.value = null;
  await social.block(name);   // their messages fold, and its Block goes
  await nextTick();
  blockDone(trigger);
};
const askToReportRoom = (event) => {
  reporting.value = { room: { id: room.id, from: 'inside' }, trigger: event.currentTarget };
  opened.value++;
};

onMounted(() => {
  list.value.scrollTop = list.value.scrollHeight;
});

// Shown again, it's at the newest. What's said about the drawing while it's out of view is a toast too.
watch(() => props.shown, async (shown) => {
  if (!shown) return;
  await nextTick();
  if (list.value) list.value.scrollTop = list.value.scrollHeight;
});
watch(() => drawing.notice, (words) => { if (words && !props.shown) toast(words); });

// The list as drawn: messages, runs of who came and went ({ id, people }), and "You joined" after the
// last of a watcher's first history (a run ends there, so what came after is below it). A run names each
// person once, where they first came in it, by how they ended up: joined, left, came and went, came back.
const presenceKey = ({ first, last }) => (first === last ? first : first === 'joined' ? 'cameAndWent' : 'cameBack');
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

// The list's place (while it's shown; messages come and go meanwhile).
const atBottom = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 8;
watch(() => [room.chat.length, room.chat[0]?.id], async (_, [, before]) => {
  const el = list.value;
  if (!el || !props.shown) return;
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
  <aside class="chat" :aria-label="t('social.chat.panelAria')">
    <div class="body">
      <header>
        <div class="room">
          <h2 v-if="room.room?.name">{{ room.room.name }}</h2>
          <p v-if="room.role === 'watch' && host" class="host">
            <i18n-t keypath="social.chat.hostedBy" tag="span">
              <template #host><UserName class="person" :name="host" /></template>
            </i18n-t>
          </p>
        </div>
        <div class="tools">
          <RoomMenu v-if="room.role === 'host'" />
          <template v-else-if="room.role === 'watch'">
            <div class="leave">
              <button class="exit" @click="room.leave()">{{ t('social.chat.exit') }}</button>
              <button v-if="room.canReportRoom" class="link report-room" :aria-label="t('social.chat.reportRoomAria')" @click="askToReportRoom">{{ t('social.chat.report') }}</button>
            </div>
          </template>
        </div>
      </header>
      <RoomPeople v-if="room.role" />
      <p v-if="room.room?.welcome" class="pinned">
        <span>{{ t('social.chat.pinnedFromHost') }}</span>
        {{ room.room.welcome }}
      </p>
      <div v-if="drawing.invitation" class="invitation" role="status">
        <i18n-t v-if="host" keypath="social.chat.invitedByHost" tag="p">
          <template #host><UserName class="person" :name="host" /></template>
        </i18n-t>
        <p v-else>{{ t('social.chat.invitedFallback') }}</p>
        <p v-if="project.image && (project.isDirty || project._stroke)">{{ t('social.chat.acceptReplacesDirty') }}</p>
        <div class="answers">
          <button @click="drawing.decline()">{{ t('common.notNow') }}</button>
          <button class="primary" @click="drawing.accept()">{{ t('common.accept') }}</button>
        </div>
      </div>
      <p v-if="drawing.notice" class="drawing-notice" role="status">
        <span>{{ drawing.notice }}</span>
        <button class="link" :aria-label="t('common.dismiss')" @click="drawing.notice = null">✕</button>
      </p>
      <label v-if="project._sharing" class="show-cursors"><input v-model="drawing.showCursors" type="checkbox"> {{ t('social.chat.showCursors') }}</label>
      <div ref="list" class="list" role="log" :aria-label="t('social.chat.messagesAria')" tabindex="-1" @scroll.passive="askIfAtTop">
        <p v-if="room.chatMore" class="more">{{ t('social.chat.scrollForEarlier') }}</p>
        <p v-if="room.role === 'watch' && room.joinedAt === null && room.status === 'live'" class="joined">{{ t('social.chat.youJoined') }}</p>
        <!-- A row is drawn again only when what it shows changes, not on every new message. -->
        <div v-for="m in rows" :key="m.id" v-memo="m.people ? [m.people.map(presenceKey).join()] : [m.deleted, hidden(m), room.role === 'host', reportable(m), blockable(m)]">
          <p v-if="m.joined" class="joined">{{ t('social.chat.youJoined') }}</p>
          <p v-else-if="m.people" class="presence">
            <span>
              <template v-for="(p, i) in m.people" :key="p.id">
                <template v-if="i">, </template>
                <i18n-t :keypath="`social.chat.presence.${presenceKey(p)}`" tag="span">
                  <template #person>
                    <span class="person">{{ p.name }}</span>
                  </template>
                </i18n-t>
              </template>
            </span>
          </p>
          <div v-else class="message" :class="{ note: m.deleted || hidden(m) }">
            <p v-if="m.deleted">{{ t('social.chat.deletedByHost') }}</p>
            <p v-else-if="hidden(m)">
              {{ t('social.chat.fromBlocked') }}
              <button class="link" @click="shownAnyway.add(m.id)">{{ t('social.chat.show') }}</button>
            </p>
            <template v-else>
              <p class="who">
                <UserName class="name" :name="m.name">{{ m.mine ? t('social.chat.youSuffix') : '' }}</UserName>
                <span v-if="m.host" class="tag">{{ t('common.host') }}</span>
                <!-- Report and Delete take the time's place while the message is pointed at or has focus. -->
                <span class="when">
                  <time>{{ time(m.ts) }}</time>
                  <span v-if="reportable(m) || blockable(m) || room.role === 'host'" class="actions">
                    <button v-if="reportable(m)" class="link report" :aria-label="t('social.chat.reportMessageAria', { name: m.name })" @click="askToReport(m, $event)">{{ t('social.chat.report') }}</button>
                    <button v-if="blockable(m)" class="link block" :aria-label="t('social.chat.blockAria', { name: m.name })" @click="askToBlock(m, $event)">{{ t('social.people.blockConfirm') }}</button>
                    <button v-if="room.role === 'host'" class="link delete" :aria-label="t('social.chat.deleteMessageAria', { name: m.name })" @click="room.deleteMessage(m.id)">{{ t('common.delete') }}</button>
                  </span>
                </span>
              </p>
              <p class="text">{{ m.text }}</p>
              <p v-if="m.muted" class="muted">{{ t('social.chat.mutedNote') }}</p>
            </template>
          </div>
        </div>
      </div>
      <ChatFoot />
      <ReportDialog v-if="reporting" :key="opened" v-bind="reporting" @done="reporting = null" />
      <ModalDialog v-if="blocking" :title="t('social.people.blockTitle', { name: blocking.name })" :sub="t('social.chat.blockSub')" @cancel="cancelBlock">
        <div class="actions">
          <button autofocus @click="cancelBlock">{{ t('common.cancel') }}</button>
          <button class="danger" @click="confirmBlock">{{ t('social.people.blockConfirm') }}</button>
        </div>
      </ModalDialog>
    </div>
  </aside>
</template>

<style scoped>
aside.chat {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 10px 12px 8px;
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
p.host span.person {
  display: block;   /* the name's own line when it won't fit after "hosted by": its cell stays beside it */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
p.host {
  margin: 5px 0 0;
  overflow-wrap: anywhere;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-muted);
}
div.tools {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}
div.leave {   /* Exit, and Report room under it */
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
button.exit {   /* as the host's ⋯ in its place */
  height: 26px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
button.report-room {
  padding: 0;
  font-size: 10px;
  font-weight: 400;
  color: var(--text-faint);
}
button.report-room:hover {
  color: var(--text);
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

div.invitation {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-0);
  color: var(--text);
}
div.invitation p {
  margin: 0;
}
div.answers {
  display: flex;
  gap: 8px;
}
div.answers button {   /* half the row each, and Accept no taller than Not now */
  flex: 1 1 0;
  padding: 10px 12px;
  font-size: 12px;
}
p.drawing-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
}
p.drawing-notice button.link {
  padding: 0 4px;
}
label.show-cursors {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
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
p.muted {
  font-size: 10px;
  font-style: italic;
  color: var(--text-faint);
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

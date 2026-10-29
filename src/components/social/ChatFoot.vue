<script setup>
import { ref, computed, watch, nextTick, useTemplateRef, onMounted, onBeforeUnmount } from 'vue';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { MOST_CHARS, silencedWords } from '@/social/chat';

// The foot of the chat panel: one bordered box with the message in it and a round send arrow at its
// bottom-right (gray with nothing to send, purple with text). Enter sends, Shift+Enter is a new line,
// and the box grows to 5 lines, then scrolls. A guest is asked to sign in, and a member who hasn't
// confirmed their email to do that; neither can send. While the pass is being swapped (who you are isn't
// known) it holds a blank line's space, so the panel doesn't jump and "Confirm your email" doesn't flash.
// A silenced person gets a notice of until when in place of the box, and the box back (its text kept) when the
// silence ends: a minute-by-minute clock, as a silence can be longer than a timeout can wait.
const room = useRoomStore(), social = useSocialStore(), workspace = useWorkspaceStore();

const text = ref('');
const field = useTemplateRef('field');
const hasText = computed(() => text.value.trim() !== '');
const now = ref(Date.now());
const silenced = computed(() => room.canChat && room.silencedUntil > now.value);
let tick = null;
onMounted(() => { tick = setInterval(() => { now.value = Date.now(); }, 60_000); });
onBeforeUnmount(() => clearInterval(tick));
watch(silenced, async () => {   // the box is back: as tall as its text
  await nextTick();
  grow();
});
const refused = computed(() => (room.chatRefused === 'too-fast' ? 'Slow down a little' : ''));

// As tall as the text, up to the box's own limit (CSS).
const grow = () => {
  const el = field.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};
const typed = () => {
  room.chatRefused = null;
  grow();
};

// The text stays until the room has taken it (a refusal keeps it to send again).
let sending = false;
async function send() {
  if (sending || !hasText.value) return;
  sending = true;
  const sent = text.value;
  try {
    if (await room.say(sent) && text.value === sent) {   // what was typed meanwhile stays
      text.value = '';
      await nextTick();
      grow();
    }
  } finally {
    sending = false;
  }
  field.value?.focus();
}

function onKeyDown(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  send();
}

function signIn() {
  social.page = 'sign-in';
  workspace.editorTab = 'social';
}
</script>

<template>
  <footer>
    <p v-if="silenced" class="silenced" role="status">{{ silencedWords(room.silencedUntil, now) }}</p>
    <form v-else-if="room.canChat" @submit.prevent="send">
      <div class="box">
        <textarea ref="field" v-model="text" aria-label="Message" :maxlength="MOST_CHARS" rows="1" @input="typed" @keydown="onKeyDown"></textarea>
        <button type="submit" class="send" :class="{ ready: hasText }" aria-label="Send">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" fill="currentColor"/></svg>
        </button>
      </div>
      <p class="refused" role="status">{{ refused }}</p>
    </form>
    <p v-else-if="!social.claims" class="confirm" aria-hidden="true">&nbsp;</p>
    <button v-else-if="social.claims.guest" class="sign-in" @click="signIn">Sign in to chat</button>
    <p v-else class="confirm">Confirm your email to chat</p>
  </footer>
</template>

<style scoped>
footer {
  padding: 4px;
}

form {
  display: flex;
  flex-direction: column;
}
div.box {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 6px 6px 6px 10px;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  background: var(--surface-0);
}
div.box:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
div.box textarea,
div.box textarea:hover,
div.box textarea:focus {
  flex: 1;
  min-width: 0;
  height: auto;
  max-height: calc(5 * 18px + 8px);   /* 5 lines (the line-height below) and the padding */
  margin: 0;
  padding: 4px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-size: 13px;
  line-height: 18px;
  resize: none;
}
div.box button.send,
div.box button.send:hover {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;   /* a button only once there's something to send */
  color: var(--text-muted);
  box-shadow: none;
  transform: none;
}
div.box button.send.ready,
div.box button.send.ready:hover {
  background: var(--accent);
  color: var(--white);
}

p.refused {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
}
p.refused:not(:empty) {
  margin-top: 4px;
}
button.sign-in {
  width: 100%;
}
p.confirm,
p.silenced {
  margin: 0;
  font-size: 12px;
  text-align: center;
  color: var(--text-muted);
}
</style>

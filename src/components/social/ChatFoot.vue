<script setup>
import { ref, computed, watch, nextTick, useTemplateRef, onMounted, onBeforeUnmount } from 'vue';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { MOST_CHARS, mutedWords } from '@/social/chat';

// The foot of the chat panel: one bordered box with the message in it and a round send arrow at its
// bottom-right (gray with nothing to send, purple with text). Enter sends, Shift+Enter is a new line,
// and the box grows to 5 lines, then scrolls. A guest is asked to sign in, and a member who hasn't
// confirmed their email to do that; neither can send. While the pass is being swapped (who you are isn't
// known) it holds a blank line's space, so the panel doesn't jump and "Confirm your email" doesn't flash.
// A muted person gets a notice of until when in place of the box, and the box back (its text kept) when the
// mute ends: a minute-by-minute clock, as a mute can be longer than a timeout can wait.
const room = useRoomStore(), social = useSocialStore(), workspace = useWorkspaceStore();

const text = ref('');
const field = useTemplateRef('field');
const hasText = computed(() => text.value.trim() !== '');
const now = ref(Date.now());
const muted = computed(() => room.canChat && room.mutedUntil > now.value);
let tick = null;
onMounted(() => { tick = setInterval(() => { now.value = Date.now(); }, 60_000); });
onBeforeUnmount(() => clearInterval(tick));
watch(muted, async () => {   // the box is back: as tall as its text
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
    <p v-if="muted" class="muted" role="status">{{ mutedWords(room.mutedUntil, now) }}</p>
    <form v-else-if="room.canChat" @submit.prevent="send">
      <div class="box">
        <textarea ref="field" v-model="text" aria-label="Message" :maxlength="MOST_CHARS" rows="1" @input="typed" @keydown="onKeyDown"></textarea>
        <button type="submit" class="send" :class="{ ready: hasText }" aria-label="Send">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
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
p.muted {
  margin: 0;
  font-size: 12px;
  text-align: center;
  color: var(--text-muted);
}
</style>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useSocialStore } from '@/store/SocialStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import ModalDialog from '@/components/ModalDialog.vue';

// SOCIAL's first question, the short version of the policies: it stands in for the tab until it's answered
// (EditWorkspace), and nothing from SOCIAL runs before that (SocialStore.boot). The legal pages open over it.
const social = useSocialStore(), workspace = useWorkspaceStore();
const agreed = ref(false);

// A legal page closing gives focus back to its link, here, where Tab and Escape are the dialog's.
let opener = null;
function read(page, event) {
  opener = event.currentTarget;
  workspace.legalPage = page;
}
watch(() => workspace.legalPage, (page) => { if (!page) opener?.focus(); });

// Answered, focus goes on from the tab that's showing, unless what's showing took it.
onBeforeUnmount(() => nextTick(() => {
  if (document.activeElement === document.body) document.querySelector('[role="tab"][aria-selected="true"]')?.focus();
}));
</script>

<template>
  <ModalDialog long title="Before you open SOCIAL" @cancel="social.declineConsent()">
    <div class="reading" autofocus tabindex="0" role="region" aria-label="What SOCIAL means for you">
      <p>SOCIAL is where you can watch or join people draw or let them watch you. Here's what that means for your privacy.</p>

      <h4>The lobby</h4>
      <p>Opening SOCIAL connects your browser to our server. Anyone in the lobby will see your username and whether you're a guest or not. Guests are given randomly assigned usernames. Public rooms are listed with their host, room name, viewer count, and a preview of the art.</p>

      <h4>Joining a room</h4>
      <p>Your browser connects directly to the host's, so each of you can see the other's IP address. That can reveal your approximate location and internet provider, so use a VPN if you want to hide it. Chat goes through the host's browser, and anyone in the room can see and copy it.</p>

      <h4>Starting a room</h4>
      <p>The people you admit see your art as you draw it, and everyone who joins can see your IP address. Public rooms show a preview in the lobby. Anyone you invite to draw gets the whole project, including the original image. If someone reports your room, we keep a snapshot of the canvas to review and resolve the report.</p>

      <h4>Be kind</h4>
      <p>Don't bully, harass, threaten anyone, or attack people for who they are. Don't use someone's IP address against them or share their personal information. Keep public rooms appropriate, respect other people's art, and only report in good faith. Hosts can remove or block people, and anyone signed in with a confirmed email can report a person or room.</p>
    </div>
    <div class="answer">
      <label class="agree">
        <input v-model="agreed" type="checkbox">
        <span>I'm 13 or older and agree to the <button type="button" class="link inline" @click="read('terms', $event)">Terms</button>, <button type="button" class="link inline" @click="read('privacy', $event)">Privacy Policy</button>, and <button type="button" class="link inline" @click="read('guidelines', $event)">Community Guidelines</button></span>
      </label>
      <div class="actions">
        <button @click="social.declineConsent()">Not now</button>
        <button class="primary" :disabled="!agreed" @click="social.acceptConsent()">Accept</button>
      </div>
    </div>
  </ModalDialog>
</template>

<style scoped>
div.reading {
  flex: 1 1 auto;
  min-height: 96px;
  margin: 8px -18px 0;
  padding: 0 18px 12px;
  overflow: auto;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-dim);
  outline: none;
}

div.reading:focus-visible {
  border-bottom-color: var(--accent);
}

h4 {
  margin: 14px 0 4px;
  font-size: 13px;
  color: var(--text);
}

p {
  margin: 0;
}

div.answer {   /* the agreement beside the answers, and over them where it doesn't fit */
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px 16px;
  margin-top: 12px;
}

label.agree {
  flex: 1 1 280px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-dim);
}

label.agree input {
  flex-shrink: 0;
  margin-top: 2px;
}

button.link.inline {
  padding: 0;
  font-size: inherit;
  letter-spacing: normal;
  color: var(--accent);
  text-decoration: underline;
}

div.actions {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}

div.actions button {   /* Accept no taller than Not now */
  padding: 10px 12px;
  font-size: 12px;
}
</style>

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
      <p>This is where you watch people draw, or let them watch you. Here's the short version of what that means. The
        Terms, Privacy Policy and Community Guidelines linked below have all of it.</p>

      <h4>The lobby</h4>
      <p>Going on connects your browser to our server. It makes a signing key and gets a temporary pass that admits you
        to the lobby and rooms. Everyone in the lobby sees your username or nickname and whether you're a guest. Public
        rooms are listed for everyone with their name, host, viewer count, the signal the host chose and a preview
        picture of the art. Private rooms aren't listed.</p>

      <h4>Watching a room</h4>
      <p>Your browser connects directly to the host's browser, so each of you can see the other's IP address, which can
        reveal your approximate location and your internet service provider. If you'd rather keep it private, use a VPN.
        The host's browser relays the room's chat, and anyone in the room can see it and copy it.</p>

      <h4>Starting a room</h4>
      <p>Your art goes to the people you admit, as you draw it. A public room's preview shows in the lobby. Everyone who
        joins can see your IP address. Anyone you invite to draw gets the whole project, including the original image.
        If someone reports your room, we keep a snapshot of the canvas to review and resolve the report.</p>

      <h4>Being good to each other</h4>
      <p>Be kind. Don't bully, harass or threaten anyone, or attack people for who they are. Don't use someone's IP
        address against them or share their personal information. Keep public rooms suitable, respect people's art and
        report in good faith. Hosts can remove or block people, and anyone signed in with a confirmed email can report a
        person or a room.</p>

      <p class="guardian">If you're under the age of majority where you live, a parent or legal guardian must agree on
        your behalf.</p>
    </div>
    <label class="agree">
      <input v-model="agreed" type="checkbox">
      <span>I'm 13 or older and agree to the <button type="button" class="link inline" @click="read('terms', $event)">Terms</button>, <button type="button" class="link inline" @click="read('privacy', $event)">Privacy Policy</button> and <button type="button" class="link inline" @click="read('guidelines', $event)">Community Guidelines</button></span>
    </label>
    <div class="actions">
      <button @click="social.declineConsent()">Not now</button>
      <button class="primary" :disabled="!agreed" @click="social.acceptConsent()">Accept</button>
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

p.guardian {
  margin-top: 14px;
  color: var(--text-muted);
}

label.agree {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 0;
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
  justify-content: flex-end;
  gap: 8px;
}
</style>

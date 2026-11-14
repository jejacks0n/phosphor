<script setup>
import { ref, watch, onMounted, nextTick, useTemplateRef, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore } from '@/store/RoomStore';
import { USERNAME_MAX } from '@/social/names';
import { checkForUpdates } from '@/composables/useDesktopMenu';

// The desktop build's side panel Social tab out of a room, in the lobby's place: your name (kept on this computer, and
// needed first: it's the name on your pass), Join by an address someone gives you (and its password, once the room
// asks for one: a wrong one brings this page back asking again), and Start a room, which opens the host form. A room on
// a newer version offers Check for Updates beside saying so.
const social = useSocialStore(), room = useRoomStore();
const { t } = useI18n();
onMounted(() => social.showLobby());   // boots: the key that signs your pass

const name = ref(social.desktopName);
watch(name, (typed) => social.setDesktopName(typed));
const id = useId();
const address = ref(room.needsPassword?.address ?? '');
watch(address, () => { room.needsPassword = null; });   // another address: its own check says whether it asks
const password = ref('');
const joining = ref(false);
const keepPassword = ref(false);   // joinAddress clears needsPassword while it checks: the field stays meanwhile
const passwordInput = useTemplateRef('passwordInput');
watch(() => room.needsPassword, async (asks) => {   // asked (again, when wrong): the password, to type it
  if (!asks) return;
  await nextTick();
  passwordInput.value?.focus();
  passwordInput.value?.select();
}, { immediate: true });
async function join() {
  joining.value = true;
  keepPassword.value = !!room.needsPassword;
  try {
    await room.joinAddress(address.value, { password: keepPassword.value ? password.value : undefined });
  } finally {
    joining.value = keepPassword.value = false;
  }
}
</script>

<template>
  <!-- Not "social" in a class or id: content blockers hide those. A section.lobby, as LobbyPage, for the side panel's focus. -->
  <section class="lobby" :aria-label="t('sidePanel.lobby')">
    <p v-if="social.supported === false" class="unsupported">{{ t('social.unsupported') }}</p>
    <template v-else>
      <p v-if="social.notice && social.page === 'lobby'" class="notice" role="status">
        <span>{{ social.notice }}</span>
        <button v-if="social.notice === t('social.errors.join.newer')" class="link" @click="checkForUpdates()">{{ t('updates.check') }}</button>
        <button class="link" :aria-label="t('common.dismiss')" @click="social.notice = null">✕</button>
      </p>
      <label>{{ t('social.desktop.yourName') }} <input v-model="name" :maxlength="USERNAME_MAX" autocomplete="nickname" :aria-describedby="social.desktopName ? undefined : `${id}-name`"></label>
      <p v-if="!social.desktopName" :id="`${id}-name`" class="help">{{ t('social.desktop.nameFirst') }}</p>

      <form @submit.prevent="join">
        <h2>{{ t('social.desktop.joinHeading') }}</h2>
        <label>{{ t('social.desktop.address') }} <input v-model="address" placeholder="192.168.1.20:31337" autocomplete="off" spellcheck="false" required></label>
        <template v-if="room.needsPassword || keepPassword">
          <p class="help">{{ t('social.watch.needsPassword') }}</p>
          <label>{{ t('social.watch.password') }} <input ref="passwordInput" v-model="password" type="password" autocomplete="off" required></label>
        </template>
        <button class="primary" type="submit" :disabled="!social.desktopName || joining" :title="social.desktopName ? undefined : t('social.desktop.nameFirst')">{{ t('social.watch.join') }}</button>
      </form>

      <hr>
      <h2>{{ t('social.desktop.hostHeading') }}</h2>
      <button :disabled="!social.desktopName" :title="social.desktopName ? undefined : t('social.desktop.nameFirst')" @click="social.page = 'start-room'">{{ t('social.lobby.startRoom') }}</button>

      <p class="help ip">{{ t('social.desktop.ipSeen') }}</p>
    </template>
  </section>
</template>

<style scoped>
/* As the lobby's (LobbyPage). */
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
form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
h2 {   /* as SAUCE's title */
  margin: 0;
  font-size: 13px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent);
}
label {   /* as SAUCE's labels */
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-faint);
}
p.help {
  margin: -4px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-muted);
}
p.ip {
  margin-top: 4px;
}
hr {
  width: 100%;
  margin: 4px 0;
}
section.lobby button {   /* a button's words stay on one line */
  white-space: nowrap;
}
</style>

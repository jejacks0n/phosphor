<script setup>
import { onMounted } from 'vue';
import { useSocialStore } from '@/store/SocialStore';
import LobbyPage from './LobbyPage.vue';

const social = useSocialStore();
onMounted(() => social.showLobby());
</script>

<template>
  <article class="social-tab" @dragover.prevent @drop.prevent> <!-- a dropped file isn't opened by the browser -->
    <p v-if="social.supported === false" class="unsupported">This browser can't sign you in to SOCIAL yet</p>
    <template v-else>
      <p v-if="social.notice" class="notice" role="status">
        <span>{{ social.notice }}</span>
        <button class="link" aria-label="Dismiss" @click="social.notice = null">✕</button>
      </p>
      <div class="page" :data-page="social.page">
        <LobbyPage v-if="social.page === 'lobby'" />
      </div> <!-- the other pages (sign in, account) come next -->
    </template>
  </article>
</template>

<style scoped>
article.social-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

p.notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}

p.notice button.link {
  padding: 0 4px;
}

p.unsupported {
  margin: 0;
  padding: 32px 16px;
  font-size: 14px;
  color: var(--text-muted);
}

div.page {
  flex: 1;
  min-height: 0;
}
</style>

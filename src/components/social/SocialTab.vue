<script setup>
import { onMounted } from 'vue';
import { useSocialStore } from '@/store/SocialStore';

const social = useSocialStore();
onMounted(() => social.showLobby());
</script>

<template>
  <article class="social-tab" @dragover.prevent @drop.prevent> <!-- a dropped file isn't opened by the browser -->
    <p v-if="social.notice" class="notice" role="status">{{ social.notice }}</p>
    <div class="page" :data-page="social.page"></div> <!-- the pages (lobby, sign in, account) come next -->
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
  margin: 0;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}

div.page {
  flex: 1;
}
</style>

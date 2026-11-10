<script setup>
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore } from '@/store/SocialStore';
import UserName from './UserName.vue';

// Who you blocked, each with Unblock: its own page, from a link on Account.
const social = useSocialStore();
const { t } = useI18n();
onMounted(() => social.loadBlocked());
</script>

<template>
  <div class="form-page blocked">
    <h2>{{ t('social.account.blockedHeading') }}</h2>
    <p v-if="!social.blocked.length" class="intro">{{ t('social.account.nobodyBlocked') }}</p>
    <div v-for="person in social.blocked" :key="person.username" class="row">
      <UserName class="username" :name="person.username" />
      <button :disabled="social.busy" :aria-label="t('social.account.unblockAria', { name: person.username })" @click="social.unblock(person.username)">{{ t('social.account.unblock') }}</button>
    </div>
  </div>
</template>

<style scoped>
div.row {   /* as Account's rows */
  display: flex;
  align-items: center;
  gap: 8px;
}
div.row > button {
  margin-left: auto;
}
span.username {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text);
}
</style>

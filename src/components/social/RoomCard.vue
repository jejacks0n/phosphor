<script setup>
import { computed, useId, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNow } from '@vueuse/core';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { joinState, liveFor, pictureUrl, signalWord } from '@/social/lobby';
import { goingBackReplacesWords } from '@/social/messages';
import DropdownMenu from '@/components/DropdownMenu.vue';
import UserName from './UserName.vue';

const props = defineProps({
  room: { type: Object, required: true },
  signedIn: { type: Boolean, required: true },
});

const roomStore = useRoomStore(), social = useSocialStore();
const { t } = useI18n();
const now = useNow({ interval: 60_000 });   // "live 42 min" moves on while the lobby is shown
const join = computed(() => joinState(props.room, { signedIn: props.signedIn }));
const meta = computed(() => {
  const signal = signalWord(props.room.signal);
  const live = liveFor(props.room.liveSince, now.value.getTime());
  return signal ? t('social.card.metaWithSignal', { live, signal: signal.toLowerCase() }) : live;
});
const reasonId = useId();
const yours = computed(() => roomStore.reclaimable.some((r) => r.id === props.room.id));   // your own, with its tab gone

// The ⋯ with Report room: for a confirmed member, not on their own room, until they've reported it.
const reportable = computed(() => roomStore.canReport && props.room.host !== social.myName && !social.reportedRooms.includes(props.room.id));
// The lobby shows the dialog, so a card that leaves the lobby doesn't take "Reported. Thank you." with it.
const emit = defineEmits(['report']);   // { room, trigger, back }: ReportDialog's props
const joinButton = useTemplateRef('join');
const askToReport = (event) => {
  emit('report', { room: { id: props.room.id, from: 'lobby' }, trigger: event.currentTarget.closest('.dropdown').querySelector('.dropdown-trigger'), back: joinButton.value });
};
</script>

<template>
  <article class="room-card">
    <div class="thumb">
      <img v-if="room.thumbnail" :src="pictureUrl(room.thumbnail)" alt="">
      <DropdownMenu v-if="reportable" class="more" :label="t('social.card.moreFor', { name: room.name })">
        <template #trigger><span aria-hidden="true">⋯</span></template>
        <button @click="askToReport">{{ t('social.card.reportRoom') }}</button>
      </DropdownMenu>
    </div>
    <div class="info">
      <div class="name" :title="room.name">{{ room.name }}</div>
      <div class="host-line">
        <UserName class="host" :name="room.host" />
        <button v-if="yours" class="join primary" :aria-describedby="roomStore.goingBackReplaces ? reasonId : undefined" @click="roomStore.goBackToRoom(room.id)">{{ t('social.lobby.backToYourRoom') }}</button>
        <button v-else ref="join" class="join" :disabled="!join.enabled" :aria-describedby="join.reason ? reasonId : undefined" @click="roomStore.join(room.id)">{{ join.label }}</button>
      </div>
      <div class="meta">{{ meta }}</div>
      <div v-if="room.blockedInside" class="blocked">{{ t('social.card.blockedInside') }}</div>
      <div v-if="yours && roomStore.goingBackReplaces" :id="reasonId" class="reason">{{ goingBackReplacesWords() }}</div>
      <div v-else-if="!yours && join.reason" :id="reasonId" class="reason">{{ join.reason }}</div>
    </div>
  </article>
</template>

<style scoped>
article.room-card {
  display: flex;
  flex-direction: column;
  background: var(--surface-0);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.2s;
}
article.room-card:hover {
  border-color: var(--accent);
}

div.thumb {
  position: relative;
  aspect-ratio: 2 / 1;
  background: var(--black);
}
div.thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
}

div.info {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 9px 10px 10px;
  font-size: 11px;
  color: var(--text-muted);
}

div.name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

div.host-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

span.host {
  flex: 1;
  min-width: 0;
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
}

div.meta {
  margin-top: 2px;
}

div.blocked {
  margin-top: 4px;
  font-size: 10px;
  color: var(--text-faint);
}

article.more {   /* the ⋯, over the picture's top right corner, see-through until pointed at */
  position: absolute;
  top: 6px;
  right: 6px;
}
article.more :deep(.dropdown-trigger) {
  border-color: transparent;
  background: rgba(0, 0, 0, 0.45);
  color: var(--white);
  opacity: 0.75;
}
article.more :deep(.dropdown-trigger:hover),
article.more :deep(.dropdown-trigger:focus-visible) {
  opacity: 1;
}

div.reason {
  margin-top: 4px;
  color: var(--text-faint);
}

button.join {
  flex: none;
  padding: 5px 10px;
  font-size: 11px;
}
</style>

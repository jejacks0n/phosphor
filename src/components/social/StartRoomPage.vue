<script setup>
import { computed, watch, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore, MAX_WATCHERS } from '@/store/RoomStore';
import { useProjectStore } from '@/store/ProjectStore';
import { signalWords } from '@/social/lobby';
import { useLayerName } from '@/composables/useLayerName';
import LobbyPicture from './LobbyPicture.vue';

// Set up your room, in a box over everything: the room's settings and, for a room listed in the lobby, its lobby card
// (its signal) and picture. Going live makes it (its errors are the notice at the top of the box), and the side panel
// shows the room you host from then on.
const social = useSocialStore(), room = useRoomStore(), project = useProjectStore();
const { t } = useI18n();

const hasArt = computed(() => !!project.image && project.cells.length > 0);
const noArt = computed(() => t('social.start.noArt'));
const roomsAreStill = computed(() => t('tabs.animateInRoom'));
const layerName = useLayerName();
const tooManyLayers = computed(() => t('social.start.tooManyLayers', { name: layerName('base') }));
const cannotGoLive = computed(() => project.hasFrames ? roomsAreStill.value : !project.fitsRoom ? tooManyLayers.value : undefined);   // why Go live is off, when it's the document

const draft = room.startDraft;   // kept in the store while you're on another tab
watch(() => draft.max, (max) => { if (max > MAX_WATCHERS) draft.max = MAX_WATCHERS; });
const id = useId();

const goLive = () => room.startRoom({ ...draft, name: draft.name.trim() });
</script>

<template>
  <div class="start-room">
    <h2>{{ t('social.start.heading') }}</h2>
    <!-- Laid out as the room's Settings and stats: its settings in a box, and its lobby card (for a room in the
         lobby) with the lobby picture beside them when there's room, under them when there isn't. -->
    <form @submit.prevent="goLive">
      <section class="settings">
        <h3>{{ t('social.host.roomSettings') }}</h3>
        <div class="fields">
          <label>{{ t('social.start.roomName') }} <input v-model="draft.name" maxlength="60" pattern=".*\S.*" :title="t('social.start.roomNamePatternTitle')" required></label>
          <label>{{ t('social.start.welcomeMessage') }} <textarea v-model="draft.welcome" maxlength="200" rows="3" :aria-describedby="`${id}-count`"></textarea></label>
          <p :id="`${id}-count`" class="help count">{{ t('social.start.charCount', { count: draft.welcome.length, max: 200 }) }}</p>
          <fieldset>
            <legend>{{ t('social.start.whoCanJoin') }}</legend>
            <div class="choices">
              <label class="choice"><input v-model="draft.isPublic" type="radio" name="who" :value="true"> {{ t('social.start.anyoneInLobby') }}</label>
              <label class="choice"><input v-model="draft.isPublic" type="radio" name="who" :value="false"> {{ t('social.start.onlyWithLink') }}</label>
            </div>
          </fieldset>
          <template v-if="!draft.isPublic">
            <label>{{ t('social.start.passwordOptional') }} <input v-model="draft.password" type="text" autocomplete="off" :aria-describedby="`${id}-password`"></label>
            <p :id="`${id}-password`" class="help">{{ t('social.start.passwordHelp') }}</p>
          </template>
          <label class="choice"><input v-model="draft.allowGuests" type="checkbox" :aria-describedby="`${id}-guests`"> {{ t('social.start.allowGuests') }}</label>
          <p :id="`${id}-guests`" class="help">{{ t('social.start.allowGuestsHelp') }}</p>
          <label>{{ t('social.start.maxWatchers') }} <input v-model.number="draft.max" class="short" type="number" min="1" :max="MAX_WATCHERS" required :aria-describedby="`${id}-max`"></label>
          <p :id="`${id}-max`" class="help">{{ t('social.start.maxWatchersHelp') }}</p>
        </div>
      </section>

      <div class="column">
        <section v-if="draft.isPublic" class="settings" :aria-labelledby="`${id}-card`">
          <h3 :id="`${id}-card`">{{ t('social.start.lobbyCard') }}</h3>
          <div class="fields">
            <label>{{ t('social.start.signal') }}
              <select v-model="draft.signal" :aria-describedby="`${id}-signal`">
                <option :value="null">{{ t('common.none') }}</option>
                <option v-for="(words, value) in signalWords" :key="value" :value="value">{{ words }}</option>
              </select>
            </label>
            <p :id="`${id}-signal`" class="help">{{ t('social.start.signalHelp') }}</p>
            <p v-if="!hasArt" class="no-art">{{ noArt }}</p>
          </div>
        </section>
        <p v-else-if="!hasArt" class="no-art">{{ noArt }}</p>
        <LobbyPicture v-if="draft.isPublic && hasArt" />
      </div>
      <p v-if="cannotGoLive" class="no-art why">{{ cannotGoLive }}</p>

      <div class="buttons">
        <button class="primary" type="submit" :disabled="social.busy || !hasArt || !!cannotGoLive" :title="cannotGoLive">{{ t('social.start.goLive') }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
div.start-room {   /* as the room's Settings and stats (HostRoomPage) */
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  font-size: 12px;
  color: var(--text-dim);
}
h2 {
  margin: 0;
}
p.no-art {   /* in place of the lobby picture: nothing to share yet */
  margin: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--warning) 45%, transparent);
  border-left-width: 3px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--warning) 10%, transparent);
  font-size: 13px;
  color: var(--warning);
}
p.why {
  grid-column: 1 / -1;
}

/* Two columns, or one under the other when there isn't room, as Settings and stats' are; the second column is kept
   when empty, so a link-only room's settings stay a column wide. */
form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  align-items: start;
  gap: 12px;
}
div.column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
section.settings {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-0);
}
h3 {   /* as Settings and stats' boxes' headings */
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}
div.fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}
label.choice {
  display: flex;
  align-items: center;
  gap: 8px;
}
input.short {
  width: 80px;
}
fieldset {
  margin: 0;
  padding: 0;
  border: none;
}
legend {   /* as the labels */
  margin-bottom: 8px;
  padding: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-faint);
}
div.choices {   /* a row of choices, wrapping as needed */
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}
textarea {
  height: auto;
  min-height: calc(3lh + 18px);   /* 3 lines, the padding and the border; it grows to fit the message */
  field-sizing: content;
  resize: vertical;
}
p.help {
  margin: -4px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}
p.count {
  text-align: right;
}
div.buttons {   /* the rule across the form; Go live as wide as the first column (all of it, when stacked) */
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}
</style>

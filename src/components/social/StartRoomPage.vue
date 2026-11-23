<script setup>
import { computed, watch, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore, MAX_WATCHERS } from '@/store/RoomStore';
import { useProjectStore } from '@/store/ProjectStore';
import { signalWords } from '@/social/lobby';
import { openFontSetup } from '@/composables/useFontSetup';
import LobbyPicture from './LobbyPicture.vue';

// Set up your room, in a box over everything: the room's settings and, for a room listed in the lobby, its lobby card
// (its signal) and picture. Going live makes it (its errors are the notice at the top of the box), and the side panel
// shows the room you host from then on. On desktop the room is on this computer's room service: no lobby, link or
// guests, so no lobby card or Who can join, a password always offered, and the port it listens on (kept for next time).
const DESKTOP = import.meta.env.VITE_DESKTOP === '1';
const social = useSocialStore(), room = useRoomStore(), project = useProjectStore();
const { t } = useI18n();

const hasArt = computed(() => !!project.image && project.cells.length > 0);
const noArt = computed(() => t('social.start.noArt'));
const roomsAreStill = computed(() => t('tabs.animateInRoom'));
const nameFirst = computed(() => (DESKTOP && !social.desktopName ? t('social.desktop.nameFirst') : undefined));   // a pass needs a name
// why Go live is off, when it's the document (frames, a font that isn't set up, a layer on a plugin solver) or, on
// desktop, no name
const cannotGoLive = computed(() => (project.hasFrames ? roomsAreStill.value : project.fontNotSetUp ?? room.pluginSolversWhy ?? nameFirst.value));

const draft = room.startDraft;   // kept in the store while you're on another tab
const listed = computed(() => !DESKTOP && draft.isPublic);   // in the lobby, with its card and picture
watch(() => draft.max, (max) => { if (max > MAX_WATCHERS) draft.max = MAX_WATCHERS; });
const id = useId();

const goLive = () => room.startRoom({ ...draft, name: draft.name.trim() });
</script>

<template>
  <div class="start-room">
    <h2>{{ t('social.start.heading') }}</h2>
    <!-- Laid out as the room's Settings and stats: its settings in a box, and its lobby card (for a room in the
         lobby) with the lobby picture beside them when there's room, under them when there isn't. A room with no
         lobby card (link-only, or on desktop) is one column, in a narrower box (SocialDialogs): its settings bare, with
         no box or heading of their own under the dialog's. -->
    <form :class="{ single: !listed }" @submit.prevent="goLive">
      <section class="settings">
        <h3 v-if="listed">{{ t('social.host.roomSettings') }}</h3>
        <div class="fields">
          <label>{{ t('social.start.roomName') }} <input v-model="draft.name" maxlength="60" pattern=".*\S.*" :title="t('social.start.roomNamePatternTitle')" required></label>
          <label>{{ t('social.start.welcomeMessage') }} <textarea v-model="draft.welcome" maxlength="200" rows="3" :aria-describedby="`${id}-count`"></textarea></label>
          <p :id="`${id}-count`" class="help count">{{ t('social.start.charCount', { count: draft.welcome.length, max: 200 }) }}</p>
          <fieldset v-if="!DESKTOP">
            <legend>{{ t('social.start.whoCanJoin') }}</legend>
            <div class="choices">
              <label class="choice"><input v-model="draft.isPublic" type="radio" name="who" :value="true"> {{ t('social.start.anyoneInLobby') }}</label>
              <label class="choice"><input v-model="draft.isPublic" type="radio" name="who" :value="false"> {{ t('social.start.onlyWithLink') }}</label>
            </div>
          </fieldset>
          <template v-if="DESKTOP || !draft.isPublic">
            <label>{{ t('social.start.passwordOptional') }} <input v-model="draft.password" type="text" autocomplete="off" :aria-describedby="`${id}-password`"></label>
            <p :id="`${id}-password`" class="help">{{ DESKTOP ? t('social.desktop.passwordHelp') : t('social.start.passwordHelp') }}</p>
          </template>
          <template v-if="!DESKTOP">
            <label class="choice"><input v-model="draft.allowGuests" type="checkbox" :aria-describedby="`${id}-guests`"> {{ t('social.start.allowGuests') }}</label>
            <p :id="`${id}-guests`" class="help">{{ t('social.start.allowGuestsHelp') }}</p>
          </template>
          <label>{{ t('social.start.maxWatchers') }} <input v-model.number="draft.max" class="short" type="number" min="1" :max="MAX_WATCHERS" required :aria-describedby="`${id}-max`"></label>
          <p :id="`${id}-max`" class="help">{{ DESKTOP ? t('social.desktop.maxWatchersHelp') : t('social.start.maxWatchersHelp') }}</p>
          <template v-if="DESKTOP">
            <label>{{ t('social.desktop.port') }} <input v-model.number="draft.port" class="short" type="number" min="1" max="65535" required :aria-describedby="`${id}-port`"></label>
            <p :id="`${id}-port`" class="help">{{ t('social.desktop.portHelp') }}</p>
          </template>
        </div>
      </section>

      <div v-if="listed" class="column">
        <section class="settings" :aria-labelledby="`${id}-card`">
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
        <LobbyPicture v-if="hasArt" />
      </div>
      <p v-else-if="!hasArt" class="no-art why">{{ noArt }}</p>
      <p v-if="cannotGoLive" class="no-art why">{{ cannotGoLive }}<template v-if="project.fontNotSetUp"> <button type="button" class="ghost" @click="openFontSetup(project.drawingFont)">{{ t('palette.fonts.setupButton') }}</button></template></p>

      <div class="buttons">
        <button class="primary" type="submit" :disabled="social.busy || !hasArt || !!cannotGoLive" :title="cannotGoLive" :data-off-reason="cannotGoLive ? '' : undefined">{{ t('social.start.goLive') }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
div.start-room {   /* as the room's Settings and stats (HostRoomPage), inset only by the dialog's own padding */
  display: flex;
  flex-direction: column;
  gap: 10px;
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
p.why button {
  margin-left: 6px;
  font-size: 12px;
}

/* Two columns, or one under the other when there isn't room, as Settings and stats' are; one when there's no lobby
   card. */
form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  align-items: start;
  gap: 12px;
}
form.single {
  grid-template-columns: 1fr;
}
form.single section.settings {
  padding: 0;
  border: none;
  background: none;
}
form.single div.fields {
  margin-top: 0;
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

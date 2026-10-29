<script setup>
import { computed, watch, useId } from 'vue';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore, MAX_WATCHERS } from '@/store/RoomStore';
import { useProjectStore } from '@/store/ProjectStore';
import { signalWords } from '@/social/lobby';
import LobbyPicture from './LobbyPicture.vue';

// Setup room, in the lobby in place of the public rooms: the room's settings and, for a room listed in the
// lobby, its lobby picture. Going live makes it (its errors are the notice at the top of the tab), and the
// tab shows the room you host from then on.
const social = useSocialStore(), room = useRoomStore(), project = useProjectStore();

const hasArt = computed(() => !!project.image && project.cells.length > 0);
const noArt = 'Open some art in PIXEL or ANSI to share it first.';

const draft = room.startDraft;   // kept in the store while you're on another tab
watch(() => draft.max, (max) => { if (max > MAX_WATCHERS) draft.max = MAX_WATCHERS; });
const id = useId();

const goLive = () => room.startRoom({ ...draft, name: draft.name.trim() });
</script>

<template>
  <div class="start-room">
    <button class="link back" @click="social.page = 'lobby'">‹ Back to the lobby</button>
    <h2>Setup room</h2>
    <!-- Two groups, side by side when there's room and stacked when there isn't: the room and who can join it,
         then its lobby card (for a room in the lobby). -->
    <form @submit.prevent="goLive">
      <div class="group">
        <label>Room name <input v-model="draft.name" maxlength="60" pattern=".*\S.*" title="Use at least one character that isn't a space" required></label>
        <label>Welcome message <textarea v-model="draft.welcome" maxlength="200" rows="3" :aria-describedby="`${id}-count`"></textarea></label>
        <p :id="`${id}-count`" class="help count">{{ draft.welcome.length }}/200</p>
        <fieldset>
          <legend>Who can join</legend>
          <div class="choices">
            <label class="choice"><input v-model="draft.isPublic" type="radio" name="who" :value="true"> Anyone, in the lobby</label>
            <label class="choice"><input v-model="draft.isPublic" type="radio" name="who" :value="false"> Only with the link</label>
          </div>
        </fieldset>
        <template v-if="!draft.isPublic">
          <label>Password (optional) <input v-model="draft.password" type="text" autocomplete="off" :aria-describedby="`${id}-password`"></label>
          <p :id="`${id}-password`" class="help">The link alone lets people in. Add a password if you want them to need both.</p>
        </template>
        <label class="choice"><input v-model="draft.allowGuests" type="checkbox" :aria-describedby="`${id}-guests`"> Allow guests</label>
        <p :id="`${id}-guests`" class="help">Guests can only watch. Turn this off if you'd rather have members only, now or once you're live.</p>
        <label>Max watchers <input v-model.number="draft.max" class="short" type="number" min="1" :max="MAX_WATCHERS" required :aria-describedby="`${id}-max`"></label>
        <p :id="`${id}-max`" class="help">Each watcher uses some of your upload speed. 12 suits most home connections.</p>
      </div>

      <section v-if="draft.isPublic" class="group" :aria-labelledby="`${id}-card`">
        <h3 :id="`${id}-card`">Lobby card</h3>
        <fieldset :aria-describedby="`${id}-signal`">
          <legend>Signal</legend>
          <div class="choices">
            <label class="choice"><input v-model="draft.signal" type="radio" name="signal" :value="null"> None</label>
            <label v-for="(words, value) in signalWords" :key="value" class="choice"><input v-model="draft.signal" type="radio" name="signal" :value="value"> {{ words }}</label>
          </div>
        </fieldset>
        <p :id="`${id}-signal`" class="help">Shown on your room's card in the lobby.</p>
        <LobbyPicture v-if="hasArt" />
        <p v-else class="no-art">{{ noArt }}</p>
      </section>
      <p v-else-if="!hasArt" class="no-art">{{ noArt }}</p>

      <div class="buttons">
        <button class="primary" type="submit" :disabled="social.busy || !hasArt">Go live</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
div.start-room {
  max-width: 760px;   /* past this the fields only get longer, not easier */
}
button.back {
  margin-left: -8px;
}
h2 {
  margin: 8px 0 16px;
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

/* A column is at least the lobby picture's width (or the whole width, when that's less); an empty second
   column is kept, so a link-only room's one group stays a column wide. */
form {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr));
  align-items: start;
  gap: 20px 32px;
}
div.group,
section.group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
h3 {   /* as the Lobby picture's heading below it */
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}
label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-weight: 500;
}
label.choice {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  font-weight: 400;
}
label.choice input {
  width: auto;
  margin: 0;
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

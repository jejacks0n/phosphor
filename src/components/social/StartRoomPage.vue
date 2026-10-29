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

const draft = room.startDraft;   // kept in the store while you're on another tab
watch(() => draft.max, (max) => { if (max > MAX_WATCHERS) draft.max = MAX_WATCHERS; });
const id = useId();

const goLive = () => room.startRoom({ ...draft, name: draft.name.trim() });
</script>

<template>
  <div class="start-room">
    <button class="link back" @click="social.page = 'lobby'">‹ Back to the lobby</button>
    <h2>Setup room</h2>
    <div class="columns">
      <form @submit.prevent="goLive">
        <label>Room name <input v-model="draft.name" maxlength="60" pattern=".*\S.*" title="Use at least one character that isn't a space" required></label>
        <label>Welcome message <textarea v-model="draft.welcome" maxlength="200" rows="3" :aria-describedby="`${id}-count`"></textarea></label>
        <p :id="`${id}-count`" class="help count">{{ draft.welcome.length }}/200</p>
        <fieldset>
          <legend>Who can join</legend>
          <label class="choice"><input v-model="draft.isPublic" type="radio" name="who" :value="true"> Anyone, in the lobby</label>
          <label class="choice"><input v-model="draft.isPublic" type="radio" name="who" :value="false"> Only with the link</label>
        </fieldset>
        <fieldset v-if="draft.isPublic" :aria-describedby="`${id}-signal`">
          <legend>Signal</legend>
          <label class="choice"><input v-model="draft.signal" type="radio" name="signal" :value="null"> None</label>
          <label v-for="(words, value) in signalWords" :key="value" class="choice"><input v-model="draft.signal" type="radio" name="signal" :value="value"> {{ words }}</label>
        </fieldset>
        <p v-if="draft.isPublic" :id="`${id}-signal`" class="help">Shown on your room's card in the lobby.</p>
        <label v-if="!draft.isPublic">Password (optional) <input v-model="draft.password" type="text" autocomplete="off" :aria-describedby="`${id}-password`"></label>
        <p v-if="!draft.isPublic" :id="`${id}-password`" class="help">The link alone lets people in. Add a password if you want them to need both.</p>
        <label class="choice"><input v-model="draft.allowGuests" type="checkbox" :aria-describedby="`${id}-guests`"> Allow guests</label>
        <p :id="`${id}-guests`" class="help">Guests can only watch, so you can't remove one; turn this off if you'd rather have members only.</p>
        <label>Max watchers <input v-model.number="draft.max" type="number" min="1" :max="MAX_WATCHERS" required :aria-describedby="`${id}-max`"></label>
        <p :id="`${id}-max`" class="help">Each watcher uses some of your upload speed. 12 suits most home connections.</p>
        <div class="buttons">
          <button class="primary" type="submit" :disabled="social.busy || !hasArt">Go live</button>
          <button type="button" @click="social.page = 'lobby'">Cancel</button>
        </div>
      </form>
      <p v-if="!hasArt" class="no-art">Open some art in PIXEL or ANSI to share it</p>
      <LobbyPicture v-else-if="draft.isPublic" />
    </div>
  </div>
</template>

<style scoped>
div.start-room {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
button.back {
  margin-left: -8px;
}
h2 {
  margin: 8px 0 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
div.columns {   /* the form, and the picture beside it (below it, when there's no room) */
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 24px;
}
p.no-art {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
}

form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 300px;
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
fieldset {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: none;
}
legend {
  margin-bottom: 6px;
  padding: 0;
  font-weight: 500;
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
div.buttons {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
div.buttons button.primary {
  flex: 1;
}
</style>

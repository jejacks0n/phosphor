<script setup>
import { computed, useId } from 'vue';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore } from '@/store/RoomStore';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { charRowsOf } from '@/lib/Cells';
import { fontOnWire } from '@/social/wire';
import { signalWords } from '@/social/lobby';
import RoomArt from './RoomArt.vue';

// A new room: your art as watchers will see it, and the room's settings. Going live makes it (its
// errors are the notice at the top of the tab), and the tab shows the room you host from then on.
const social = useSocialStore(), room = useRoomStore(), project = useProjectStore(), workspace = useWorkspaceStore();

const art = computed(() => (project.image && project.cells.length
  ? { cells: project.cells, cols: project.cols, lines: charRowsOf(project.rows), font: fontOnWire(workspace.displayFontSpec) }
  : null));

const draft = room.startDraft;   // kept in the store while you're on another tab
const id = useId();

const goLive = () => room.startRoom({ ...draft, name: draft.name.trim() });
</script>

<template>
  <div class="start-room">
    <section class="main">
      <button class="link back" @click="social.page = 'lobby'">‹ Back to the lobby</button>
      <h2>Start a room</h2>
      <div class="label">What watchers will see</div>
      <div class="preview">
        <RoomArt v-if="art" :art="art" />
        <p v-else class="no-art">Open some art in PIXEL or ANSI to share it</p>
      </div>
    </section>

    <aside class="side">
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
        <label>Max watchers <input v-model.number="draft.max" type="number" min="1" max="30" required :aria-describedby="`${id}-max`"></label>
        <p :id="`${id}-max`" class="help">Each watcher uses some of your upload speed. 12 suits most home connections.</p>
        <div class="buttons">
          <button class="primary" type="submit" :disabled="social.busy || !art">Go live</button>
          <button type="button" @click="social.page = 'lobby'">Cancel</button>
        </div>
      </form>
    </aside>
  </div>
</template>

<style scoped>
div.start-room {
  display: flex;
  height: 100%;
  min-height: 0;
  font-size: 12px;
  color: var(--text-dim);
}

section.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
}
button.back {
  align-self: flex-start;
  margin-left: -8px;
}
h2 {
  margin: 8px 0 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
div.label {
  margin-bottom: 6px;
  font-weight: 500;
}
div.preview {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
p.no-art {
  margin: 0;
  padding: 32px 16px;
  font-size: 14px;
  color: var(--text-muted);
}

aside.side {
  width: 280px;
  flex-shrink: 0;
  padding: 14px;
  overflow: auto;
  border-left: 1px solid var(--border);
  background: var(--surface-0);
}
form {
  display: flex;
  flex-direction: column;
  gap: 10px;
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

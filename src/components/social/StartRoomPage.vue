<script setup>
import { ref, computed } from 'vue';
import { useSocialStore } from '@/store/SocialStore';
import { useRoomStore } from '@/store/RoomStore';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { charRowsOf } from '@/lib/Cells';
import { fontOnWire } from '@/social/wire';
import RoomArt from './RoomArt.vue';

// A new room: your art as watchers will see it, and the room's settings. Going live makes it (its
// errors are the notice at the top of the tab), and the tab shows the room you host from then on.
const social = useSocialStore(), room = useRoomStore(), project = useProjectStore(), workspace = useWorkspaceStore();

const art = computed(() => (project.image && project.cells.length
  ? { cells: project.cells, cols: project.cols, lines: charRowsOf(project.rows), font: fontOnWire(workspace.displayFontSpec) }
  : null));

const name = ref('');
const welcome = ref('');
const isPublic = ref(true);
const password = ref('');
const allowGuests = ref(true);
const max = ref(12);

const goLive = () => room.startRoom({
  name: name.value.trim(), welcome: welcome.value, isPublic: isPublic.value, password: password.value,
  allowGuests: allowGuests.value, max: max.value,
});
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
        <label>Room name <input v-model="name" maxlength="60" required></label>
        <label>Welcome message <textarea v-model="welcome" maxlength="200" rows="3"></textarea></label>
        <p class="help count">{{ welcome.length }}/200</p>
        <fieldset>
          <legend>Who can join</legend>
          <label class="choice"><input v-model="isPublic" type="radio" name="who" :value="true"> Anyone, in the lobby</label>
          <label class="choice"><input v-model="isPublic" type="radio" name="who" :value="false"> Only with the link</label>
        </fieldset>
        <label v-if="!isPublic">Password <input v-model="password" type="text" autocomplete="off" required></label>
        <label class="choice"><input v-model="allowGuests" type="checkbox"> Allow guests</label>
        <p class="help">Guests can only watch, so you can't remove one; turn this off if you'd rather have members only.</p>
        <label>Most watchers <input v-model.number="max" type="number" min="1" max="24" required></label>
        <p class="help">Each watcher uses some of your upload speed. 12 suits most home connections.</p>
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

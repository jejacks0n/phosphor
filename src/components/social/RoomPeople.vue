<script setup>
import { ref, useTemplateRef } from 'vue';
import { useRoomStore } from '@/store/RoomStore';
import { useDrawingStore } from '@/store/DrawingStore';
import UserName from './UserName.vue';
import DropdownMenu from '@/components/DropdownMenu.vue';
import ModalDialog from '@/components/ModalDialog.vue';
import ReportDialog from './ReportDialog.vue';

// Who is here, under the host's chat header: "N here" (those connected), folded or open for as long as
// the room lasts. The list is every watcher, one still connecting too. A member's ⋯ menu: Make artist (then
// Withdraw invitation, or Back to watching), Remove for this
// session, Block from my rooms, which asks first, and Report (when you may report, and haven't reported them in this room). Cancel (or Escape) puts
// focus back on the ⋯ button the menu came from, or on the "N here" button when that member has left.
// A watcher's is a list of who to follow, when there's more than the host: Follow on each row (pressed for the one
// followed), and Show everyone and Show box under it. Nothing shows while the host is the only one to follow.
const room = useRoomStore(), drawing = useDrawingStore();

const menuTrigger = (event) => event.currentTarget.closest('.dropdown').querySelector('.dropdown-trigger');   // the ⋯ a menu item is under
const blocking = ref(null);   // { watcher, trigger }
const askToBlock = (watcher, event) => {
  blocking.value = { watcher, trigger: menuTrigger(event) };
};
const toggle = useTemplateRef('toggle');
const cancelBlock = () => {
  (blocking.value.trigger.isConnected ? blocking.value.trigger : toggle.value).focus();
  blocking.value = null;
};
const reporting = ref(null);   // { name, sub, trigger }
const opened = ref(0);         // each Report opens a new dialog, even for the same person
const askToReport = (watcher, event) => {
  reporting.value = { name: watcher.name, sub: watcher.sub, trigger: menuTrigger(event) };
  opened.value++;
};
const confirmBlock = async () => {
  const { watcher } = blocking.value;
  blocking.value = null;
  await room.block(watcher);
};
</script>

<template>
  <section v-if="room.role === 'host'" class="people">
    <button ref="toggle" class="link here" :aria-expanded="room.peopleOpen" @click="room.peopleOpen = !room.peopleOpen">
      {{ room.hereNow }} here
      <svg class="chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true"><path d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>
    </button>
    <ul v-if="room.peopleOpen" aria-label="Who is here">
      <li v-for="watcher in room.watchers" :key="watcher.peer">
        <UserName class="name" :name="watcher.name" />
        <span v-if="watcher.guest" class="tag">guest</span>
        <span v-else-if="room.muted.includes(watcher.sub)" class="tag">muted</span>
        <span v-if="drawing.artists.includes(watcher.sub)" class="tag">artist</span>
        <span v-else-if="drawing.invited.includes(watcher.sub)" class="tag">invited</span>
        <span class="what">{{ !watcher.connected ? 'connecting…' : watcher.tracking ? 'tracking' : 'looking around' }}</span>
        <DropdownMenu v-if="watcher.guest && room.room?.allowGuests === false" :label="`More for ${watcher.name}`">
          <template #trigger><span aria-hidden="true">⋯</span></template>
          <button @click="room.remove(watcher.peer)">Kick</button>
        </DropdownMenu>
        <DropdownMenu v-else-if="!watcher.guest" :label="`More for ${watcher.name}`">
          <template #trigger><span aria-hidden="true">⋯</span></template>
          <button v-if="drawing.artists.includes(watcher.sub)" @click="drawing.backToWatching(watcher.sub)">Back to watching</button>
          <button v-else-if="drawing.invited.includes(watcher.sub)" @click="drawing.withdraw(watcher.sub)">Withdraw invitation</button>
          <button v-else-if="watcher.connected" @click="drawing.invite(watcher.sub)">Make artist</button>
          <button @click="room.remove(watcher.peer)">Kick – for this session</button>
          <button v-if="room.muted.includes(watcher.sub)" @click="room.mute(watcher.sub, false)">Unmute</button>
          <button v-else title="Their messages stop reaching anyone else. They aren't told." @click="room.mute(watcher.sub, true)">Mute – for everyone but you</button>
          <button @click="askToBlock(watcher, $event)">Block – from all future rooms</button>
          <button v-if="room.canReport && !room.reported.includes(watcher.sub)" @click="askToReport(watcher, $event)">Report</button>
        </DropdownMenu>
      </li>
    </ul>

    <ModalDialog v-if="blocking" :title="`Block ${blocking.watcher.name}?`"
        sub="They can't join any room you host, and they leave this one now. Unblock them from Account." @cancel="cancelBlock">
      <div class="actions">
        <button class="danger" @click="confirmBlock">Block</button>
        <button autofocus @click="cancelBlock">Cancel</button>
      </div>
    </ModalDialog>
    <ReportDialog v-if="reporting" :key="opened" v-bind="reporting" @done="reporting = null" />
  </section>
  <section v-else-if="room.role === 'watch' && !drawing.mayDraw && room.followable.length > 1" class="people follow">
    <ul aria-label="Who to follow">
      <li v-for="person in room.followable" :key="person.sub">
        <UserName class="name" :name="person.name" />
        <span v-if="person.host" class="tag">host</span>
        <button
            class="link follow-person"
            :aria-label="`Follow ${person.name}`"
            :aria-pressed="room.following === person.sub"
            @click="room.follow(person.sub)"
        >{{ room.following === person.sub ? 'Following' : 'Follow' }}</button>
      </li>
    </ul>
    <label><input type="checkbox" :checked="room.showEveryone" @change="room.setShowEveryone($event.target.checked)"> Show everyone</label>
    <label><input type="checkbox" :checked="room.showBox" @change="room.setShowBox($event.target.checked)"> Show box</label>
  </section>
</template>

<style scoped>
section.people {
  border-bottom: 1px solid var(--border);
}
button.here {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  width: 100%;
  text-align: left;
}
svg.chevron {   /* as the charset field's: down while folded, up once open */
  flex: none;
  width: 11px;
  height: 11px;
  fill: currentColor;
  transition: transform 0.15s ease;
}
button.here[aria-expanded='true'] svg.chevron {
  transform: rotate(180deg);
}
@media (prefers-reduced-motion: reduce) {
  svg.chevron {
    transition: none;
  }
}
ul {
  max-height: 160px;
  margin: 0;
  padding: 0 12px 6px;
  overflow-y: auto;
  list-style: none;
}
li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
}
span.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text);
}
span.tag {
  padding: 0 6px;
  border-radius: 10px;
  font-size: 10px;
  color: var(--text-muted);
  border: 1px solid var(--border-light);
}
button.follow-person[aria-pressed='true'] {
  color: var(--text-muted);
  cursor: default;
}
section.follow label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 12px;
  font-size: 11px;
  color: var(--text-muted);
}
span.what {
  font-size: 11px;
  color: var(--text-faint);
  white-space: nowrap;
}
div.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

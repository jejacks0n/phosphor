<script setup>
import { ref, useTemplateRef } from 'vue';
import { useRoomStore } from '@/store/RoomStore';
import UserName from './UserName.vue';
import DropdownMenu from '@/components/DropdownMenu.vue';
import ModalDialog from '@/components/ModalDialog.vue';
import ReportDialog from './ReportDialog.vue';

// Who is here, under the host's chat header: "N here" (those connected), folded or open for as long as
// the room lasts. The list is every watcher, one still connecting too. A member's ⋯ menu: Remove for this
// session, Block from my rooms, which asks first, and Report (when you may report, and haven't reported them in this room). Cancel (or Escape) puts
// focus back on the ⋯ button the menu came from, or on the "N here" button when that member has left.
const room = useRoomStore();

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
  <section class="people">
    <button ref="toggle" class="link here" :aria-expanded="room.peopleOpen" @click="room.peopleOpen = !room.peopleOpen">
      {{ room.hereNow }} here
      <svg class="chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true"><path d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>
    </button>
    <ul v-if="room.peopleOpen" aria-label="Who is here">
      <li v-for="watcher in room.watchers" :key="watcher.peer">
        <UserName class="name" :name="watcher.name" />
        <span v-if="watcher.guest" class="tag">guest</span>
        <span v-else-if="room.muted.includes(watcher.sub)" class="tag">muted</span>
        <span class="what">{{ !watcher.connected ? 'connecting…' : watcher.tracking ? 'tracking' : 'looking around' }}</span>
        <DropdownMenu v-if="watcher.guest && room.room?.allowGuests === false" :label="`More for ${watcher.name}`">
          <template #trigger><span aria-hidden="true">⋯</span></template>
          <button @click="room.remove(watcher.peer)">Kick</button>
        </DropdownMenu>
        <DropdownMenu v-else-if="!watcher.guest" :label="`More for ${watcher.name}`">
          <template #trigger><span aria-hidden="true">⋯</span></template>
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

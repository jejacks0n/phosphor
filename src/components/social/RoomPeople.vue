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
      {{ room.hereNow }} here <span aria-hidden="true">{{ room.peopleOpen ? '▴' : '▾' }}</span>
    </button>
    <ul v-if="room.peopleOpen" aria-label="Who is here">
      <li v-for="watcher in room.watchers" :key="watcher.peer">
        <UserName class="name" :name="watcher.name" />
        <span v-if="watcher.guest" class="tag">guest</span>
        <span class="what">{{ !watcher.connected ? 'connecting…' : watcher.following ? 'following' : 'looking around' }}</span>
        <DropdownMenu v-if="!watcher.guest" :label="`More for ${watcher.name}`">
          <template #trigger><span aria-hidden="true">⋯</span></template>
          <button @click="room.remove(watcher.peer)">Remove for this session</button>
          <button @click="askToBlock(watcher, $event)">Block from my rooms</button>
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
  padding: 6px 12px;
  width: 100%;
  text-align: left;
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

<script setup>
import { ref, computed } from 'vue';
import UserName from './UserName.vue';
import { timeIn } from '@/social/session';
import { clock } from '@/social/chat';

// Everyone who came by this session, a row each, newest last: their time in the room, whether they're
// here, left (and when) or were removed (and when; removed wins over left), and what they said. Ten
// rows show, then "and N more" opens the rest in place. `now` ticks once a second from the page.
const props = defineProps({ people: { type: Array, required: true }, now: { type: Number, required: true } });

const SHOWN = 10;
const all = ref(false);
const shown = computed(() => (all.value ? props.people : props.people.slice(0, SHOWN)));

const inRoom = (person) => {
  const minutes = Math.floor(timeIn(person, props.now) / 60_000);
  if (minutes < 1) return 'under a minute';
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};
const where = (person) => {
  if (person.removed !== null) return `removed ${clock.format(person.removed)}`;
  return person.since === null ? `left ${clock.format(person.left)}` : 'here';
};
</script>

<template>
  <section class="came-by">
    <h3>Who came by</h3>
    <p v-if="!people.length" class="empty">Nobody has stopped by yet.</p>
    <table v-else>
      <thead>
        <tr><th>Name</th><th>Time</th><th>Status</th><th class="said">Messages</th></tr>
      </thead>
      <tbody>
        <tr v-for="person in shown" :key="person.sub">
          <td><div class="who"><UserName class="name" :name="person.name" /> <span v-if="person.guest" class="guest">guest</span></div></td>
          <td>{{ inRoom(person) }}</td>
          <td>{{ where(person) }}</td>
          <td class="said">{{ person.said }}</td>
        </tr>
      </tbody>
    </table>
    <button v-if="people.length > SHOWN && !all" @click="all = true">and {{ people.length - SHOWN }} more</button>
  </section>
</template>

<style scoped>
section.came-by {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-0);
}
h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}
table {
  width: 100%;
  margin-top: 10px;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
th {   /* as SAUCE's labels */
  padding: 0 0 6px 12px;
  font-size: 11px;
  font-weight: 600;
  text-align: left;
  text-transform: uppercase;
  color: var(--text-faint);
}
td {
  padding: 3px 0 3px 12px;
  color: var(--text-muted);
}
th, td {   /* the name takes what's left, and only it is cut short */
  white-space: nowrap;
}
:is(th, td):first-child {
  width: 100%;
  max-width: 0;
  padding-left: 0;
}
div.who {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
span.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
  color: var(--text);
}
span.guest {
  flex-shrink: 0;
}
p.empty {
  margin: 10px 0 0;
  color: var(--text-muted);
}
th.said, td.said {
  text-align: right;
}
button {
  margin-top: 10px;
}
</style>

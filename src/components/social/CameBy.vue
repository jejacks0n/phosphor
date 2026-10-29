<script setup>
import { ref, computed } from 'vue';
import NameSwatch from './NameSwatch.vue';
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
const messages = (n) => `${n} ${n === 1 ? 'message' : 'messages'}`;
</script>

<template>
  <section class="came-by">
    <h3>Who came by</h3>
    <ul>
      <li v-for="person in shown" :key="person.sub">
        <span class="name"><NameSwatch :name="person.name" />{{ person.name }}</span>
        <span class="guest">{{ person.guest ? 'guest' : '' }}</span>
        <span class="time">{{ inRoom(person) }}</span>
        <span>{{ where(person) }}</span>
        <span class="said">{{ messages(person.said) }}</span>
      </li>
    </ul>
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
ul {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}
li {
  display: grid;
  grid-template-columns: minmax(0, 2fr) 3.5em minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
span.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--text);
}
span.said {
  text-align: right;
}
button {
  margin-top: 10px;
}
</style>

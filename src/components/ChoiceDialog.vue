<script setup>
import ModalDialog from '@/components/ModalDialog.vue';

// A choice in a centred confirm box (Merge down: exactly or into the picture; Bake under CGA/VGA:
// keep full colour or lock to the palette). choices: [{ id, title, text, note? }], the first
// focused, the second accented as the alternative; choosing emits its id.
const props = defineProps({
  title: { type: String, required: true },
  sub: { type: String, required: true },
  choices: { type: Array, required: true },
});
const emit = defineEmits(['choose', 'cancel']);
</script>

<template>
  <ModalDialog :title="props.title" :sub="props.sub" @cancel="emit('cancel')">
    <button
        v-for="(choice, i) in props.choices"
        :key="choice.id"
        class="choice"
        :class="{ alternative: i === 1 }"
        @click="emit('choose', choice.id)"
    >
      <b>{{ choice.title }}</b>
      <span>{{ choice.text }}</span>
      <span v-if="choice.note" class="warn">{{ choice.note }}</span>
    </button>
    <div class="actions">
      <button class="cancel" @click="emit('cancel')">Cancel</button>
    </div>
  </ModalDialog>
</template>

<style scoped>
button.choice {
  display: block;
  width: 100%;
  margin: 0 0 10px;
  padding: 12px 14px;
  text-align: left;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  line-height: 1.4;
}

button.choice:hover,
button.choice:focus-visible {
  border-color: var(--accent);
}

button.choice b {
  display: block;
  margin-bottom: 2px;
  font-size: 15px;
}

button.choice span {
  color: var(--text-muted);
  font-size: 13px;
}

button.choice.alternative {
  border-color: var(--accent);
}

button.choice.alternative b {
  color: var(--accent-hot);
}

span.warn {
  display: block;
  margin-top: 6px;
  color: #ffcf6e !important;
  font-size: 12px !important;
}

div.actions {
  display: flex;
  justify-content: flex-end;
}

button.cancel {
  padding: 6px 4px;
  border: 0;
  background: none;
  box-shadow: none;
  color: var(--text-muted);
  font: inherit;
}
</style>

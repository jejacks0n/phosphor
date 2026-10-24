<script setup>
import { onMounted, useTemplateRef } from 'vue';

// A choice centred over the page like a confirm box (Merge down: exactly or into the picture; Bake
// under CGA/VGA: keep full colour or lock to the palette). choices: [{ id, title, text, note? }],
// the first focused, the second accented as the alternative; choosing emits its id.
const props = defineProps({
  title: { type: String, required: true },
  sub: { type: String, required: true },
  choices: { type: Array, required: true },
});
const emit = defineEmits(['choose', 'cancel']);
const dialog = useTemplateRef('dialog');

onMounted(() => dialog.value?.querySelector('button.choice')?.focus());

// While it's up, keys are the dialog's: none reach the app's shortcuts (Backspace would delete the
// selection that's merging, the arrows nudge it). Escape cancels; Tab keeps to the dialog's buttons.
function onKeyDown(event) {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('cancel');
  } else if (event.key === 'Tab') {
    const buttons = [...event.currentTarget.querySelectorAll('button')];
    const at = buttons.indexOf(document.activeElement);
    const next = event.shiftKey ? (at <= 0 ? buttons.length - 1 : at - 1) : (at === buttons.length - 1 ? 0 : at + 1);
    event.preventDefault();
    buttons[next]?.focus();
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="choice-backdrop" @click.self="emit('cancel')">
      <div ref="dialog" class="choice-dialog" role="dialog" aria-modal="true" aria-labelledby="choice-dialog-title" @keydown="onKeyDown">
        <h3 id="choice-dialog-title">{{ props.title }}</h3>
        <p class="sub">{{ props.sub }}</p>
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
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
div.choice-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(2px);
}

div.choice-dialog {
  width: 100%;
  max-width: 440px;
  padding: 18px;
  background: var(--surface-0);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  color: var(--text);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
}

h3 {
  margin: 0 0 4px;
  font-size: 16px;
}

p.sub {
  margin: 0 0 14px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
}

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

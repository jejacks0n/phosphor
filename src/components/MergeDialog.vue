<script setup>
import { onMounted, useTemplateRef } from 'vue';

// Merge down's choice, centred over the page like a confirm box: merge exactly (crisp, untouched by
// effects), or into the picture (part of the image, so every effect applies to it, live).
// selection: only the selection's part of the edit layer is merging. note: the picture is still
// the original image, so say what the first Into-the-picture merge costs.
const props = defineProps({
  selection: { type: Boolean, default: false },
  note: { type: Boolean, default: false },
});
const emit = defineEmits(['choose', 'cancel']);
const exactly = useTemplateRef('exactly');

onMounted(() => exactly.value?.focus());

// Escape cancels, and doesn't go on to the app's own keys (Escape also drops the selection there).
function onKeyDown(event) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  emit('cancel');
}
</script>

<template>
  <Teleport to="body">
    <div class="merge-backdrop" @click.self="emit('cancel')">
      <div class="merge-dialog" role="dialog" aria-modal="true" aria-labelledby="merge-dialog-title" @keydown="onKeyDown">
        <h3 id="merge-dialog-title">{{ props.selection ? 'Merge the selection down' : 'Merge the edit layer down' }}</h3>
        <p class="sub">
          {{ props.selection
            ? "Only what's drawn inside the selection moves into the base layer; the rest of the edit layer stays where it is."
            : "Everything you've drawn moves into the base layer. How should it go in?" }}
        </p>
        <button ref="exactly" class="choice" @click="emit('choose', 'exact')">
          <b>Exactly</b>
          <span>Stays crisp, cell for cell, as it shows now. Effects like Edges and Sharpen don't touch it.</span>
        </button>
        <button class="choice into" @click="emit('choose', 'picture')">
          <b>Into the picture</b>
          <span>Becomes part of the image itself, so every effect applies to it, live, like the photo.</span>
          <span v-if="props.note" class="warn">
            The picture becomes the working-size copy the preview is made from (like Bake), so growing the
            grid later works from that, and effects like Edges can shift slightly across the picture this
            first time.
          </span>
        </button>
        <div class="actions">
          <button class="cancel" @click="emit('cancel')">Cancel</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
div.merge-backdrop {
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

div.merge-dialog {
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

button.choice.into {
  border-color: var(--accent);
}

button.choice.into b {
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

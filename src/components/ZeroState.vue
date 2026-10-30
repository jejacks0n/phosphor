<script setup>
import { PROJECT_EXTENSION } from '@/document/projectIO';

defineProps({
  ready: { type: Boolean, default: true }, // nothing until it's known there's nothing to restore, so this doesn't flash
  recent: { type: Array, default: () => [] },
  openRecent: Function,
});
const emit = defineEmits(['file-dropped', 'file-selected', 'start-blank']);

const MAX_RECENT = 5;
const editedTime = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function onFileSelected(e) {
  const file = e.target.files[0];
  if (file) emit('file-selected', file);
}
</script>

<template>
  <article class="zero-state">
    <div v-if="ready" class="drop-zone">
      <div class="logo"></div>
      <span class="icon">⬆</span>
      <p>Drop an image or {{ PROJECT_EXTENSION }} file here to start</p>
      <label>
        <span class="mobile">Upload File to Start</span>
        <span class="desktop">Browse Files</span>
        <input type="file" @change="onFileSelected" :accept="`image/*,${PROJECT_EXTENSION}`" hidden>
      </label>

      <button class="link" @click="$emit('start-blank')">
        Or start with a blank canvas
      </button>
    </div>

    <section v-if="ready && recent.length" class="recent">
      <h2 id="recent-heading">Continue where you left off</h2>
      <ul aria-labelledby="recent-heading">
        <li v-for="row in recent.slice(0, MAX_RECENT)" :key="row.id">
          <span class="name" :title="row.filename">{{ row.filename }}</span>
          <time :datetime="new Date(row.editedAt).toISOString()">{{ editedTime(row.editedAt) }}</time>
          <button :disabled="row.openElsewhere" :aria-label="`${row.openElsewhere ? 'Open in another tab' : 'Open'}: ${row.filename}`" @click="openRecent(row.id)">
            {{ row.openElsewhere ? 'Open in another tab' : 'Open' }}
          </button>
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
article.zero-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: safe center; /* the list can make it taller than a short window: scrolls from the top */
  align-items: center;
  width: 100%;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  gap: 40px;
  box-sizing: border-box;
}

div.logo {
  display: none;
  width: 75%;
  max-width: 320px;
  aspect-ratio: 210 / 150;
  background-image: var(--logo);
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

div.drop-zone {
  width: 75%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  border-radius: 10px;
  align-items: center;
  padding: 30px 20px 60px;
  text-align: center;
  border: 2px dashed var(--border);
  background: var(--surface-0);
}

span.icon {
  font-size: 68px;
  opacity: 0.5;
  color: var(--text-faint);
}

p {
  font-size: 16px;
  margin: 0;
  font-family: inherit;
  color: var(--text-muted);
}

label {
  width: 80%;
  min-width: 100px;
  max-width: 200px;
  margin-top: 10px;
  padding: 15px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  transition: all 0.2s ease;
  background: var(--accent);
  color: var(--text-inverted);
  border: 1px solid var(--border-light);
}

label:hover {
  transform: translateY(-1px);
  background: var(--accent-hot);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  border-color: var(--accent);
  color: var(--text);
}

span.mobile {
  display: none;
}

section.recent {
  width: 100%;
  max-width: 480px;
}

section.recent h2 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}

section.recent ul {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

section.recent li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-muted);
}

section.recent span.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--text);
}

@media (max-width: 768px) {
  div.logo {
    display: block;
  }

  span.icon,
  p {
    display: none;
  }

  span.desktop {
    display: none;
  }
  span.mobile {
    display: inline;
  }
}
</style>

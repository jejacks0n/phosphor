<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { PROJECT_EXTENSION } from '@/document/projectIO';
import { formatShortDateTime } from '@/i18n/format';
import { arrowsBetween } from '@/lib/focus';

const props = defineProps({
  ready: { type: Boolean, default: true }, // nothing until it's known there's nothing to restore, so this doesn't flash
  recent: { type: Array, default: () => [] },
  openRecent: Function,
});
defineEmits(['browse', 'start-blank']);
const { t } = useI18n();

// A fresh tab starts on Choose a file, so Tab goes on from it as it would natively: when it's settled that there's
// nothing to restore. A start screen come back to later (New project, leaving a room) leaves focus to what placed it,
// and focus something else already has stays where it is.
const browse = ref(null);
watch(() => props.ready, async (ready) => {
  await nextTick();
  if (ready && (!document.activeElement || document.activeElement === document.body)) browse.value?.focus();
});
// A drawing open elsewhere is in another tab on the web, and in another window in the desktop app.
const elsewhere = import.meta.env.VITE_DESKTOP === '1' ? 'openElsewhereWindow' : 'openElsewhere';

const MAX_RECENT = 5;
// A name longer than this is cut in the middle, keeping its end (the time a save is named for, the extension).
// ponytail: a count of characters, about two lines at a phone's width; measure the text if names come out ragged.
const MAX_NAME = 80, KEPT_END = 30;

const rows = computed(() => {
  const shown = props.recent.slice(0, MAX_RECENT).map((row) => {
    const name = row.fileExt ? `${row.filename}.${row.fileExt}` : row.filename;
    const status = row.asOpened || !(row.dirty || row.savedToFile) ? 'unchanged' : row.dirty ? 'changed' : 'saved';
    return { ...row, name, status, minute: `${name}\n${Math.floor(row.editedAt / 60_000)}` };
  });
  // Two rows of the same name in the same minute show their seconds, so no two read the same.
  const twins = (row) => shown.filter((other) => other.minute === row.minute).length > 1;
  return shown.map((row) => ({
    ...row,
    shortName: row.name.length > MAX_NAME ? `${row.name.slice(0, MAX_NAME - KEPT_END - 1)}…${row.name.slice(-KEPT_END)}` : row.name,
    when: formatShortDateTime(row.editedAt, { seconds: twins(row) }),
  }));
});
</script>

<template>
  <!-- Up and Down move between its buttons, top to bottom: Choose a file, Start blank, each Open. -->
  <article class="zero-state" @keydown="arrowsBetween($event, $event.currentTarget.querySelectorAll('button'))">
    <div v-if="ready" class="drop-zone">
      <div class="logo"></div>
      <span class="icon">⬆</span>
      <p>{{ t('zero.dropPrompt', { ext: PROJECT_EXTENSION }) }}</p>
      <button ref="browse" class="browse" @click="$emit('browse')">
        <span class="mobile">{{ t('zero.browseMobile') }}</span>
        <span class="desktop">{{ t('zero.browseDesktop') }}</span>
      </button>

      <button class="link" @click="$emit('start-blank')">
        {{ t('zero.startBlank') }}
      </button>
    </div>

    <section v-if="ready && recent.length" class="recent">
      <h2 id="recent-heading">{{ t('zero.recentHeading') }}</h2>
      <ul aria-labelledby="recent-heading">
        <li v-for="row in rows" :key="row.id">
          <span class="name" :title="row.name">{{ row.shortName }}</span>
          <span class="about">
            <time :datetime="new Date(row.editedAt).toISOString()">{{ row.when }}</time>
            · <span class="status">{{ t(`zero.status.${row.status}`) }}</span>
            <button
              :disabled="row.openElsewhere"
              :aria-label="row.openElsewhere ? t(`zero.${elsewhere}Aria`, { name: row.name }) : t('zero.openAria', { name: row.name })"
              @click="openRecent(row.id)"
            >
              {{ row.openElsewhere ? t(`zero.${elsewhere}`) : t('zero.open') }}
            </button>
          </span>
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

button.browse {
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

button.browse:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}

button.browse:hover {
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

/* One line when the name fits beside the rest; otherwise the name takes its own line (two at most) and the time,
   status and Open go under it. */
section.recent li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  font-size: 13px;
  color: var(--text-muted);
}

section.recent span.name {
  flex: 1 1 auto;
  min-width: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  color: var(--text);
}

section.recent span.about {
  display: flex;
  flex: 1 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  white-space: nowrap;
}

section.recent span.about button {
  margin-left: auto;
}

@media (max-width: 768px) {
  section.recent li + li {
    padding-top: 6px;
    border-top: 1px solid var(--border);
  }

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

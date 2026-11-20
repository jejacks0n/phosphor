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

const rows = computed(() => {
  const shown = props.recent.slice(0, MAX_RECENT).map((row) => {
    const name = row.fileExt ? `${row.filename}.${row.fileExt}` : row.filename;
    const status = row.asOpened || !(row.dirty || row.savedToFile) ? 'unchanged' : row.dirty ? 'changed' : 'saved';
    return { ...row, name, status, minute: `${name}\n${Math.floor(row.editedAt / 60_000)}` };
  });
  // Two rows of the same name in the same minute show their seconds, so no two read the same.
  const twins = (row) => shown.filter((other) => other.minute === row.minute).length > 1;
  return shown.map((row) => ({ ...row, when: formatShortDateTime(row.editedAt, { seconds: twins(row) }) }));
});
</script>

<template>
  <!-- Up and Down move between its buttons, top to bottom: Choose a file, Start blank, each row. -->
  <article class="zero-state" @keydown="arrowsBetween($event, $event.currentTarget.querySelectorAll('button'))">
    <!-- With recent work the drop part shrinks to a band, and the list fills the box under it. -->
    <div v-if="ready" class="drop-zone" :class="{ listed: rows.length }">
      <div class="logo"></div>
      <span class="icon">⬆</span>
      <p>{{ t('zero.dropPrompt', { ext: PROJECT_EXTENSION }) }}</p>
      <div class="actions">
        <button ref="browse" class="browse" @click="$emit('browse')">
          <span class="mobile">{{ t('zero.browseMobile') }}</span>
          <span class="desktop">{{ t('zero.browseDesktop') }}</span>
        </button>

        <button class="link" @click="$emit('start-blank')">
          {{ t('zero.startBlank') }}
        </button>
      </div>

      <section v-if="rows.length" class="recent">
        <h2 id="recent-heading">{{ t('zero.recentHeading') }}</h2>
        <ul aria-labelledby="recent-heading">
          <!-- The title is on the row, not its button: a disabled button takes no pointer, so shows no tooltip. -->
          <li v-for="row in rows" :key="row.id" :title="row.name">
            <button
              :disabled="row.openElsewhere"
              :aria-label="row.openElsewhere ? t(`zero.${elsewhere}Aria`, { name: row.name }) : t('zero.openAria', { name: row.name })"
              @click="openRecent(row.id)"
            >
              <span class="name">{{ row.name }}</span>
              <span class="meta">
                <time :datetime="new Date(row.editedAt).toISOString()">{{ row.when }}</time>
                <span class="status" :class="row.status">{{ t(`zero.status.${row.status}`) }}</span>
              </span>
              <span class="go">{{ row.openElsewhere ? t(`zero.${elsewhere}`) : `${t('zero.open')} ›` }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
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

div.actions {
  display: contents; /* with no list, Choose a file and Start blank stand in the box's column */
}

/* With recent work: one box 480px wide, the drop part a band at its top, the list under it after a rule. */
div.drop-zone.listed {
  width: 100%;
  max-width: 480px;
  box-sizing: border-box;
  padding: 20px 20px 12px;
}

section.recent {
  align-self: stretch;
  padding-top: 14px;
  border-top: 1px solid var(--border);
  text-align: left;
}

section.recent h2 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}

section.recent ul {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* A row is one button: the name, under it the time and state, and Resume centered beside both. */
section.recent li button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: "name go" "meta go";
  gap: 3px 16px;
  align-items: center;
  width: calc(100% + 24px);
  margin: 0 -12px; /* the hover fill runs past the text */
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: none;
  box-shadow: none;
  text-align: left;
  font-size: 13px;
  font-weight: normal;
  color: var(--text-muted);
}

section.recent li button:focus-visible {
  background: var(--surface-2);
}

section.recent li button:focus-visible span.go {
  color: var(--accent);
}

@media (hover: hover) { /* as the app's buttons: a tap on a touch screen leaves no hover look behind */
  section.recent li button:hover {
    transform: none;
    background: var(--surface-2);
    box-shadow: none;
    color: var(--text-muted);
  }

  section.recent li button:hover span.go {
    color: var(--accent);
  }
}

section.recent li button:active:not(:disabled) {
  transform: none;
}

section.recent span.name {
  grid-area: name;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 14px;
  color: var(--text);
}

section.recent span.meta {
  grid-area: meta;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

section.recent span.status {
  padding: 0 7px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  font-size: 11px;
}

section.recent span.status.changed {
  color: var(--warning);
  border-color: var(--warning);
  background: color-mix(in srgb, var(--warning) 10%, transparent);
}

section.recent span.status.saved {
  color: var(--success);
  border-color: var(--success);
  background: color-mix(in srgb, var(--success) 10%, transparent);
}

section.recent span.go {
  grid-area: go;
  font-weight: 600;
  white-space: nowrap;
}

/* Open in another tab (or window): dimmed, and it can't be picked up here. */
section.recent li button:disabled {
  opacity: 1;
}

section.recent li button:disabled span.name,
section.recent li button:disabled span.meta {
  opacity: 0.55;
}

section.recent li button:disabled span.go {
  font-style: italic;
  font-weight: normal;
}

/* Wider than a phone, the band is the arrow beside the prompt, with Choose a file and Start blank under it. */
@media (min-width: 769px) {
  div.drop-zone.listed {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas: "icon text" "icon actions" "list list";
    gap: 10px 28px;
    justify-items: start;
    text-align: left;
  }

  div.drop-zone.listed span.icon {
    grid-area: icon;
    font-size: 40px;
  }

  div.drop-zone.listed p {
    grid-area: text;
    font-size: 14px;
  }

  div.drop-zone.listed div.actions {
    grid-area: actions;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
  }

  div.drop-zone.listed button.browse {
    width: auto;
    max-width: none;
    margin-top: 0;
    padding: 9px 18px;
  }

  div.drop-zone.listed section.recent {
    grid-area: list;
    justify-self: stretch;
  }
}

@media (max-width: 768px) {
  div.logo {
    display: block;
  }

  div.drop-zone.listed div.logo {
    width: 55%;
  }

  div.drop-zone.listed button.browse {
    padding: 14px;
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

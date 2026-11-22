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
    <!-- The dashed line is around the whole canvas, as all of it takes a dropped file (DropZone.vue). With recent work
         the drop part shrinks to a band, and the list sits under it, one column in the middle, the band the list's width. -->
    <div v-if="ready" class="drop-zone" :class="{ listed: rows.length }">
      <div class="logo"></div>
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"/>
      </svg>
      <p>{{ t('zero.dropPrompt', { ext: PROJECT_EXTENSION }) }}</p>
      <div class="actions">
        <button ref="browse" class="browse" @click="$emit('browse')">
          <span class="mobile">{{ t('zero.browseMobile') }}</span>
          <span class="desktop">{{ t('zero.browseDesktop') }}</span>
        </button>

        <button class="blank" @click="$emit('start-blank')">
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
              <span class="go">{{ row.openElsewhere ? t(`zero.${elsewhere}`) : t('zero.open') }}</span>
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
  padding: 16px;
  box-sizing: border-box;
  container-type: inline-size; /* the canvas's width, which the window's doesn't tell: its panels may be open */
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

/* The dashed line fills the canvas; what's in it sits in the middle. */
div.drop-zone {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 40px 24px;
  border: 1.5px dashed var(--border-light);
  border-radius: 12px;
  text-align: center;
  transition: border-color 0.2s ease;
}

svg.icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  margin-bottom: 18px;
  color: var(--text-faint);
}

p {
  margin: 0 0 28px;
  font-family: inherit;
  font-size: 18px;
  font-weight: 500;
  text-wrap: balance;
  color: var(--text-dim);
}

/* The two ways in, side by side: two buttons of one height, Choose a file the marked one. A canvas too narrow for
   both on a line (the window's wide, its panels open) has one over the other, each the line's whole width. */
div.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
}

div.actions button {
  flex: 1 1 0; /* they share what room the line has; a label stays on one line, so that's what sends one under */
  min-height: 42px;
  padding: 0 24px;
  font-size: 13px;
  white-space: nowrap;
}

@container (max-width: 350px) { /* a sliver of canvas, narrower than a label: it takes two lines sooner than run past the line */
  div.actions button {
    flex-basis: 100%;
    padding-block: 6px;
    white-space: normal;
  }
}

div.actions button:focus-visible { /* the ring stands off the button, with room around it before the next */
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

button.browse {
  background: var(--accent);
  color: var(--text-inverted);
  border-color: transparent;
}

button.blank {
  border-color: var(--border-light);
}

@media (hover: hover) {
  button.browse:hover {
    background: var(--accent-hot);
    border-color: transparent;
    color: var(--text-inverted);
  }
}

span.mobile {
  display: none;
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
  flex-wrap: wrap; /* short of room the state goes under the time, and then the time takes two lines: never under Resume */
  align-items: center;
  gap: 2px 8px;
}

section.recent span.status {
  overflow: hidden; /* on a line of its own and still short of room, it ends in an ellipsis */
  padding: 0 7px;
  white-space: nowrap;
  text-overflow: ellipsis;
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

/* Wider than a phone, with recent work: one column 480px wide in the middle, and everything in it that width, edge to
   edge: the arrow and the prompt on a line, Choose a file and Start blank under it, each half the line, then the list
   after a rule. */
@media (min-width: 769px) {
  div.drop-zone.listed {
    display: grid;
    grid-template-columns: 20px minmax(0, 452px); /* with the gap, 480px; the arrow's column fixed, so the list can't widen it */
    grid-template-areas: "icon text" "actions actions" "list list";
    justify-content: center;
    align-content: center;
    gap: 12px 8px;
    text-align: left;
  }

  div.drop-zone.listed svg.icon {
    grid-area: icon;
    align-self: center;
    width: 20px;
    height: 20px;
    margin: 0;
  }

  div.drop-zone.listed p {
    grid-area: text;
    margin: 0;
    font-size: 14px;
    font-weight: normal;
    color: var(--text-muted);
  }

  div.drop-zone.listed div.actions {
    grid-area: actions;
    gap: 8px 14px;
  }

  div.drop-zone.listed div.actions button {
    flex-basis: 15.5em; /* about Start with a blank canvas: short of two of these one goes under, so the two are one width */
    min-height: 36px;
    padding-inline: 18px;
  }

  div.drop-zone.listed section.recent {
    grid-area: list;
    justify-self: stretch;
    min-width: 0;
    margin-top: 6px;
  }
}

/* A phone: nothing can be dropped, so no dashed line. The logo, the two buttons a finger's size, the list under them. */
@media (max-width: 768px) {
  article.zero-state {
    padding: 20px;
  }

  div.drop-zone {
    flex: 0 1 auto;
    max-width: 360px;
    padding: 0;
    border: none;
  }

  div.drop-zone.listed {
    max-width: 480px;
  }

  div.logo {
    display: block;
    margin-bottom: 28px;
  }

  div.drop-zone.listed div.logo {
    width: 55%;
  }

  svg.icon,
  p {
    display: none;
  }

  div.actions {
    flex-direction: column;
    align-self: stretch;
    gap: 12px;
  }

  div.actions button {
    flex: none;
    min-height: 48px;
    font-size: 15px;
  }

  section.recent {
    margin-top: 24px;
  }

  span.desktop {
    display: none;
  }
  span.mobile {
    display: inline;
  }
}
</style>

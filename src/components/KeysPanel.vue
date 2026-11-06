<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { usePlayback } from '@/composables/usePlayback';
import { EASINGS, MOTIONS } from '@/document/tweens.js';
import { PARTS } from '@/document/parts.js';
import { listedParts, partKeys } from '@/document/keys.js';
import DropdownMenu from '@/components/DropdownMenu.vue';

// Over the animation bar on VECTOR: the first selected shape's parts as rows, each with its keys as diamonds on a lane
// of frames lined up with the scrubber's marks below. Keys are selected, eased, deleted and added here.
const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const playback = usePlayback();
const root = useTemplateRef('root');

// Each easing's curve, as a graph of how far along against time; and No tween's cross.
const CURVES = {
  none: 'M4 4l8 8M12 4l-8 8',
  linear: 'M2 14L14 2',
  easeIn: 'M2 14C9 14 12 9 14 2',
  easeOut: 'M2 14C4 7 7 2 14 2',
  easeInOut: 'M2 14C8 14 8 2 14 2',
  elastic: 'M2 14C3 4 4 0 6 1S8 4 10 2.5S13 1.8 14 2',
};
const easings = [['none', null], ...EASINGS.map((easing) => [easing, easing])];

const shapeKey = computed(() => workspace.vectorSelected.find((key) => project.shapes.has(key)) ?? null);
const at = computed(() => (workspace.playing ? workspace.playFrame : project.frame));
const count = computed(() => project.frames.length);
// The shape's life around the frame being edited (playing doesn't move it), and the parts that change in it.
const keys = computed(() => {
  void project.historyVersion;
  return shapeKey.value && project.hasFrames ? partKeys(project.frames, shapeKey.value, project.frame) : null;
});
const rows = computed(() => {
  void project.historyVersion;
  if (!keys.value) return [];
  return listedParts(project.frames, shapeKey.value, project.frame).map((part) => ({ part, keys: keys.value.rows.get(part) }));
});
const unlisted = computed(() => (keys.value ? PARTS.filter((part) => !rows.value.some((row) => row.part === part)) : []));
const keyAt = (part, i) => keys.value?.rows.get(part).find((k) => k.at === i);
const deletable = (k) => !!k && k.at !== keys.value.start && !k.fixed;
const partName = (part) => t(`keysPanel.parts.${part}`);

// The selected keys, each with whether a tween leaves it.
const selected = computed(() => workspace.selectedKeys.map(({ part, at }) => {
  const row = keys.value?.rows.get(part) ?? [], j = row.findIndex((k) => k.at === at);
  return { part, key: row[j], leaves: j >= 0 && j < row.length - 1 };
}).filter(({ key }) => key));
const isSelected = (part, i) => workspace.selectedKeys.some((ref) => ref.part === part && ref.at === i);
const easable = computed(() => selected.value.filter(({ leaves }) => leaves));
const movable = computed(() => easable.value.filter(({ part, key }) => part === 'transform' && key.easing));
const easing = computed(() => easable.value[0]?.key.easing ?? null);
const motion = computed(() => movable.value[0]?.key.motion ?? 'smooth');
const canDelete = computed(() => selected.value.some(({ key }) => deletable(key)));

// A new shape, nothing selected; and only keys still there (an undo, say, takes some away), in rows still listed.
watch(shapeKey, () => { workspace.selectedKeys = []; });
watch(rows, (now) => {
  const kept = workspace.selectedKeys.filter(({ part, at }) => now.some((row) => row.part === part && row.keys.some((k) => k.at === at)));
  if (kept.length < workspace.selectedKeys.length) workspace.selectedKeys = kept;
}, { immediate: true });
onBeforeUnmount(() => { workspace.selectedKeys = []; });

// The lanes line up with the scrubber: frame i where its mark is, the range's thumb travel stopping half a thumb
// (--thumb) short of each end.
const lane = reactive({ left: 0, width: 0, thumb: 0 });
const scrubber = () => document.querySelector('.animation-bar .scrubber input[type=range]');
function measure() {
  const range = scrubber();
  if (!range || !root.value) return;
  const box = range.getBoundingClientRect();
  lane.left = box.left - root.value.getBoundingClientRect().left;
  lane.width = box.width;
  lane.thumb = parseFloat(getComputedStyle(range).getPropertyValue('--thumb')) || 0;
}
let observer = null;
onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  for (const el of [root.value, scrubber(), scrubber()?.closest('.animation-bar')]) if (el) observer.observe(el);
});
onBeforeUnmount(() => observer?.disconnect());
const x = (i) => lane.thumb / 2 + (lane.width - lane.thumb) * (count.value > 1 ? i / (count.value - 1) : 0);
const half = computed(() => (count.value > 1 ? (lane.width - lane.thumb) / (count.value - 1) / 2 : 0));
const outside = (i) => !!keys.value && (i < keys.value.start || i > keys.value.end);

// Each row's tween bars and hold lines: from each key to its next, or on to the life's end after the last.
const piecesOf = (row) => row.keys.map((k, j) => ({ from: k.at, to: row.keys[j + 1]?.at ?? keys.value.end, easing: row.keys[j + 1] ? k.easing : null }))
  .filter(({ from, to }) => to > from);

// Anything that changes the frames lands on the frame showing.
const paused = (act) => (...args) => {
  playback.pause();
  act(...args);
};
const pick = paused((part, i, event) => {
  if (!event.shiftKey) {
    workspace.selectedKeys = [{ part, at: i }];
    project.showFrame(i);
  } else if (isSelected(part, i)) workspace.selectedKeys = workspace.selectedKeys.filter((ref) => ref.part !== part || ref.at !== i);
  else workspace.selectedKeys = [...workspace.selectedKeys, { part, at: i }];
});
const pickFrame = paused((i) => {
  workspace.selectedKeys = rows.value.filter((row) => row.keys.some((k) => k.at === i)).map(({ part }) => ({ part, at: i }));
  project.showFrame(i);
});
const ease = paused((choice) => project.setKeyEasing(shapeKey.value, workspace.selectedKeys, choice));
const moveBy = paused((choice) => project.setKeyMotion(shapeKey.value, workspace.selectedKeys, choice));
const remove = paused(() => project.deleteKeys(shapeKey.value, workspace.selectedKeys));
const addKey = paused((part) => project.addKey(shapeKey.value, part));
const show = paused((i) => project.showFrame(i));
// A row's ◇ keys the part on the frame showing; its lit ◆ deletes that key.
const toggleHere = paused((part) => {
  if (keyAt(part, project.frame)) project.deleteKeys(shapeKey.value, [{ part, at: project.frame }]);
  else project.addKey(shapeKey.value, part);
});
const previous = (row) => row.keys.findLast((k) => k.at < at.value)?.at;
const next = (row) => row.keys.find((k) => k.at > at.value)?.at;

// Delete and Backspace, with focus in the panel, are its own: the selected keys go, never the shape.
function keydown(event) {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return;
  event.preventDefault();
  event.stopPropagation();
  if (canDelete.value) remove();
}
// A press anywhere in the panel puts focus there, so Delete is the panel's (Safari doesn't focus a pressed button).
const focusIn = () => {
  if (!root.value.contains(document.activeElement)) root.value.focus({ preventScroll: true });
};
</script>

<template>
  <section ref="root" class="keys-panel" tabindex="0" :aria-label="t('keysPanel.aria')" :style="{ '--lead': `${lane.left}px`, '--lane': `${lane.width}px` }" @keydown="keydown" @pointerdown="focusIn">
    <div class="head">
      <div class="lead">
        <button class="fold" :aria-label="t('keysPanel.fold')" :title="t('keysPanel.fold')" @click="workspace.keysOpen = false">▾</button>
        <DropdownMenu v-if="shapeKey" class="add-key" :label="t('keysPanel.addKey')" align="left" up :disabled="!unlisted.length">
          <button v-for="part in unlisted" :key="part" :disabled="!!keyAt(part, project.frame)" @click="addKey(part)">{{ partName(part) }}</button>
        </DropdownMenu>
      </div>
      <p v-if="!shapeKey" class="none">{{ t('keysPanel.none') }}</p>
      <template v-else>
        <div class="ruler">
          <button v-for="i in count" :key="i" class="frame" :class="{ now: i - 1 === at, out: outside(i - 1) }" :data-at="i - 1" :style="{ left: `${x(i - 1) - 10}px` }" :aria-label="t('keysPanel.frame', { frame: i })" :disabled="!keys" @click="pickFrame(i - 1)">
            <span>{{ i }}</span>
          </button>
        </div>
        <div class="rest">
          <DropdownMenu class="easing" :label="t('keysPanel.easing')" up :disabled="!easable.length">
            <template #trigger>
              <svg class="curve" viewBox="0 0 16 16" aria-hidden="true"><path :d="CURVES[easing ?? 'none']"/></svg>
              {{ t(`animation.easings.${easing ?? 'none'}`) }}
            </template>
            <button v-for="[name, choice] in easings" :key="name" :aria-pressed="easing === choice" @click="ease(choice)">
              <svg class="curve" viewBox="0 0 16 16" aria-hidden="true"><path :d="CURVES[name]"/></svg>
              {{ t(`animation.easings.${name}`) }}
            </button>
          </DropdownMenu>
          <DropdownMenu class="motion" :label="t('keysPanel.motion')" up :disabled="!movable.length">
            <template #trigger>{{ t(`animation.motions.${motion}`) }}</template>
            <button v-for="choice in MOTIONS" :key="choice" :aria-pressed="motion === choice" @click="moveBy(choice)">{{ t(`animation.motions.${choice}`) }}</button>
          </DropdownMenu>
          <button class="delete" :aria-label="t('keysPanel.delete')" :title="t('keysPanel.deleteTitle')" :disabled="!canDelete" @click="remove">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 1h4l1 1h3v2H2V2h3zM3 5h10l-1 10H4z"/></svg>
          </button>
        </div>
      </template>
    </div>
    <div v-if="shapeKey" class="rows">
      <div v-for="row in rows" :key="row.part" class="row" :class="{ picked: selected.some(({ part }) => part === row.part) }" :data-part="row.part">
        <div class="lead">
          <span class="name">{{ partName(row.part) }}</span>
          <span class="nav">
            <button :aria-label="t('keysPanel.previous', { part: partName(row.part) })" :disabled="previous(row) === undefined" @click="show(previous(row))">◀</button>
            <button class="here" :class="{ on: !!keyAt(row.part, at) }" :aria-label="t('keysPanel.here', { part: partName(row.part) })" :aria-pressed="!!keyAt(row.part, at)" :disabled="!!keyAt(row.part, at) && !deletable(keyAt(row.part, at))" @click="toggleHere(row.part)">{{ keyAt(row.part, at) ? '◆' : '◇' }}</button>
            <button :aria-label="t('keysPanel.next', { part: partName(row.part) })" :disabled="next(row) === undefined" @click="show(next(row))">▶</button>
          </span>
        </div>
        <div class="lane" @click.self="workspace.selectedKeys = []">
          <span v-if="keys.start > 0" class="out" :style="{ left: 0, width: `${x(keys.start) - half}px` }"></span>
          <span v-if="keys.end < count - 1" class="out" :style="{ left: `${x(keys.end) + half}px`, right: 0 }"></span>
          <span v-for="i in count" :key="`tick${i}`" class="tick" :style="{ left: `${x(i - 1)}px` }"></span>
          <span v-for="piece in piecesOf(row)" :key="`piece${piece.from}`" :class="piece.easing ? 'tween' : 'hold'" :style="{ left: `${x(piece.from)}px`, width: `${x(piece.to) - x(piece.from)}px` }">
            <svg v-if="piece.easing" class="curve" viewBox="0 0 16 16" aria-hidden="true"><path :d="CURVES[piece.easing]"/></svg>
          </span>
          <button v-for="k in row.keys" :key="`key${k.at}`" class="key" :class="{ fixed: k.fixed }" :data-at="k.at" :style="{ left: `${x(k.at) - 7}px` }" :aria-pressed="isSelected(row.part, k.at)" :aria-label="t('keysPanel.key', { part: partName(row.part), frame: k.at + 1 })" @click="pick(row.part, k.at, $event)"></button>
        </div>
      </div>
      <span v-if="rows.length" class="playhead" :style="{ left: `${lane.left + x(at)}px` }"></span>
    </div>
  </section>
</template>

<style scoped>
section.keys-panel {
  position: relative;
  flex-shrink: 0;
  overflow: hidden; /* on a phone the lanes are narrow and the rest gives way (the panel's own layout is to come) */
  padding: 2px 0 6px;
  background: var(--surface-2);
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text);
  outline: none;
}
section.keys-panel:focus-visible {
  box-shadow: inset 0 0 0 1px var(--accent);
}

div.head, div.row {
  display: flex;
  align-items: center;
}
div.head {
  height: 32px;
}
div.row {
  height: 22px;
}
div.row:hover, div.row.picked {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
div.rows {
  position: relative;
}

/* The names and their buttons, as wide as what's left of the scrubber. */
div.lead {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  width: var(--lead);
  min-width: 0;
  padding: 0 10px;
  box-sizing: border-box;
  overflow: hidden;
}
div.row div.lead {
  justify-content: space-between;
}
span.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The buttons drawn as glyphs: none of a button's own look. */
button.fold, span.nav button, button.frame, button.key {
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  transform: none;
  filter: none;
  transition: none;
}
button.fold {
  width: 14px;
  font-size: 12px;
  color: var(--text-dim);
}
span.nav {
  display: flex;
  flex: none;
  gap: 2px;
}
span.nav button {
  width: 16px;
  font-size: 10px;
  font-weight: 400;
  color: var(--text-muted);
}
span.nav button.here {
  font-size: 12px;
}
span.nav button.here.on {
  color: var(--accent);
}
@media (hover: hover) {
  button.fold:hover, span.nav button:hover:not(:disabled) {
    color: var(--text);
  }
}

div.ruler, div.lane {
  position: relative;
  flex: none;
  width: var(--lane);
  height: 100%;
}
button.frame {
  position: absolute;
  top: 8px;
  width: 20px;
  font-size: 10px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}
button.frame span {
  padding: 0 4px;
  border-radius: 3px;
}
button.frame.out {
  opacity: 0.4;
}
button.frame.now span {
  background: var(--accent);
  color: var(--white);
}
@media (hover: hover) {
  button.frame:hover span {
    color: var(--text);
  }
}

span.out {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  pointer-events: none;
}
span.tick, span.hold, span.tween {
  position: absolute;
  pointer-events: none;
}
span.tick {
  top: 4px;
  bottom: 4px;
  width: 1px;
  background: var(--border);
}
span.hold {
  top: 10.5px;
  height: 1px;
  background: var(--text-faint);
}
span.tween {
  top: 8px;
  height: 6px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--accent) 45%, transparent);
}
span.tween svg.curve {
  position: absolute;
  left: 50%;
  top: -4px;
  margin-left: -7px;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--accent) 30%, var(--surface-2));
}

/* A key: a diamond, lit when selected; a Duplicate's (fixed) in its color. */
button.key {
  position: absolute;
  top: 4px;
  width: 14px;
  height: 14px;
}
button.key::before {
  content: '';
  position: absolute;
  inset: 2.5px;
  transform: rotate(45deg);
  background: var(--text);
  border: 1px solid var(--surface-0);
}
button.key.fixed::before {
  background: var(--warning);
}
button.key[aria-pressed='true']::before {
  background: var(--accent);
  box-shadow: 0 0 0 2px var(--white);
}

span.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--accent);
  pointer-events: none;
}

div.rest {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-left: 14px;
}
p.none {
  margin: 0;
  color: var(--text-muted);
  white-space: nowrap;
}
:deep(.dropdown-trigger) {
  white-space: nowrap;
}
svg.curve {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}
.easing :deep(.dropdown-trigger) > svg.curve {
  width: 14px;
  height: 14px;
  fill: none;
}
.easing button[aria-pressed='true']::after, .motion button[aria-pressed='true']::after {
  content: '✓' / '';
  margin-left: 4px;
}
button.delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  padding: 0;
  border-radius: 4px;
}
button.delete svg {
  width: 14px;
  height: 14px;
  fill: currentColor;
}
</style>

<script setup>
import { computed, reactive, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { usePlayback } from '@/composables/usePlayback';
import { frameMarks } from '@/lib/frameMarks';
import { tweenBands } from '@/document/tweens.js';
import DropdownMenu from '@/components/DropdownMenu.vue';

// Under the canvas while Animate is on: play, step, scrub, timing, and adding and arranging frames. Inside an art layer
// the ones that change the frame showing are off (the layer is drawn on every frame, but the dimmed rest is of this one).
const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const playback = usePlayback();

const kinds = computed(() => [
  ['blank', t('animation.kinds.blank')],
  ['duplicate', t('animation.kinds.duplicate')],
  ['wipe', t('animation.kinds.wipe')],
]);

const at = computed(() => (workspace.playing ? workspace.playFrame : project.frame));
const count = computed(() => project.frames.length);
const ghostTitle = computed(() => (workspace.ghost ? t('animation.ghostOnTitle', { percent: workspace.ghostStrength }) : t('animation.ghostOffTitle')));
const inside = computed(() => project.artInside !== null);
// Why Add frame is off, if it is.
const full = computed(() => {
  if (!project.canAnimate) return t('animation.tooLarge');
  return count.value >= project.mostFrames ? t('animation.maxFrames', { count: count.value }, count.value) : '';
});

// A frame's changes are worked out when it's left, and here when it's edited, so its mark is right at once.
watch(() => project.historyVersion, () => project.noteFrame());
// Tweens are each shape's: the bar shows the first selected shape's.
const shapeKeys = computed(() => workspace.vectorSelected.filter((key) => project.shapes.has(key)));
const marks = computed(() => {
  void project.historyVersion;
  return project.hasFrames ? frameMarks(project.frames, shapeKeys.value[0]) : [project.hasEdits ? 'drawn' : 'empty'];
});
const bands = computed(() => (project.hasFrames && shapeKeys.value[0] ? tweenBands(project.frames, shapeKeys.value[0]) : []));
// Where the range's thumb sits for frame i: its travel stops half a thumb (--thumb, the global slider's) short of each end.
const markAt = (i) => `calc(var(--thumb) / 2 + (100% - var(--thumb)) * ${count.value > 1 ? i / (count.value - 1) : 0})`;
// The Keys panel's frames in view, while they don't all fit there; dragging the band scrolls the panel.
const view = computed(() => workspace.keysView);
const range = useTemplateRef('range');
let viewDrag = null;
function grabView(event) {
  if (event.button !== 0) return;
  const travel = range.value.offsetWidth - (parseFloat(getComputedStyle(range.value).getPropertyValue('--thumb')) || 0);
  viewDrag = { x: event.clientX, scroll: workspace.keysScroll, perPx: ((count.value - 1) / travel) * view.value.px, pointer: event.pointerId };
  event.currentTarget.setPointerCapture(event.pointerId);
}
const dragView = (event) => {
  if (viewDrag?.pointer === event.pointerId) workspace.keysScroll = viewDrag.scroll + (event.clientX - viewDrag.x) * viewDrag.perPx;
};
const dropView = (event) => {
  if (viewDrag?.pointer === event.pointerId) viewDrag = null;
};

// Anything that changes the frames lands on the frame showing.
const paused = (act) => (...args) => {
  playback.pause();
  act(...args);
};
const scrub = paused((event) => project.showFrame(Number(event.target.value)));
const step = paused((by) => project.stepFrame(by));
const add = paused((kind) => project.addFrame(kind));
const move = paused((by) => project.moveFrame(project.frame, project.frame + by));
const remove = paused(() => project.deleteFrame());
// What's being typed in FPS and Hold, until it's set or left: the bar redraws with every frame played, and a field
// bound to the value alone would be written back over the typing.
const typing = reactive({ fps: null, hold: null });
const setHold = paused((event) => {
  typing.hold = null;
  project.setHold(project.frame, event.target.value);
  event.target.value = project.currentFrame.hold;
});
const setFps = (event) => {
  typing.fps = null;
  project.setFps(event.target.value);
  event.target.value = project.fps;
};
</script>

<template>
  <div class="animation-bar" role="toolbar" :aria-label="t('animation.toolbarAria')" :title="inside ? t('art.framesOff') : null">
    <!-- Three groups, one line where they fit; on a narrow screen the frames get the first line, and play and the steps start
         the second, so a narrow screen never strands a control. -->
    <div class="playback">
    <button class="play" :aria-label="workspace.playing ? t('animation.pause') : t('animation.play')" :title="workspace.playing ? t('animation.pauseTitle') : t('animation.playTitle')" :disabled="count < 2 || inside" @click="playback.toggle()">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path v-if="workspace.playing" d="M3 2h4v12H3zM9 2h4v12H9z"/>
        <path v-else d="M4 2l10 6-10 6z"/>
      </svg>
    </button>
    <button class="step" :aria-label="t('animation.prevFrame')" :title="t('animation.prevFrameTitle')" :disabled="count < 2 || inside" @click="step(-1)">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h2v10H3zM13 3v10L6 8z"/></svg>
    </button>
    <button class="step" :aria-label="t('animation.nextFrame')" :title="t('animation.nextFrameTitle')" :disabled="count < 2 || inside" @click="step(1)">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 3h2v10h-2zM3 3v10l7-5z"/></svg>
    </button>
    </div>
    <div class="transport">
    <output class="indicator" data-testid="frame-indicator">{{ at + 1 }} / {{ count }}</output>
    <div class="scrubber">
      <div class="scrubber-marks" aria-hidden="true">
        <span v-if="view" class="view" :style="{ left: `calc(${markAt(view.first)} - 4px)`, width: `calc((100% - var(--thumb)) * ${(view.last - view.first) / (count - 1)} + 8px)` }" @pointerdown="grabView" @pointermove="dragView" @pointerup="dropView" @lostpointercapture="dropView"></span>
        <span v-for="band in bands" :key="`band${band.from}`" class="band" :style="{ left: `calc(${markAt(band.from)} + 3px)`, width: `calc((100% - var(--thumb)) * ${(band.to - band.from) / (count - 1)} - 6px)` }"></span>
        <span v-for="(mark, i) in marks" :key="i" :class="mark" :style="{ left: markAt(i) }"></span>
      </div>
      <!-- A pointer lets go of it, so the app's keys work again; the keyboard keeps its arrows. -->
      <input ref="range" type="range" :aria-label="t('animation.frameAria')" min="0" :max="count - 1" step="1" :value="at" :disabled="inside" @input="scrub" @pointerup="$event.target.blur()">
    </div>
    <DropdownMenu :label="t('animation.addFrame')" up :disabled="!!full || inside">
      <template #trigger>
        <!-- A frame of film, on its side, with a plus at its corner. -->
        <svg class="add-frame" viewBox="0 0 16 16" fill-rule="evenodd" aria-hidden="true">
          <path d="M0.5 6h11.5v9H0.5zM1.6 6.7h1.1v1h-1.1zm2.2 0h1.1v1h-1.1zm2.2 0h1.1v1h-1.1zm2.2 0h1.1v1h-1.1zm2.2 0h1.1v1h-1.1zM1.6 13.3h1.1v1h-1.1zm2.2 0h1.1v1h-1.1zm2.2 0h1.1v1h-1.1zm2.2 0h1.1v1h-1.1zm2.2 0h1.1v1h-1.1zM1.5 8.4h9.5v4.2H1.5zM12.55 0.8h1.5v1.45h1.45v1.5h-1.45v1.45h-1.5v-1.45H11.1v-1.5h1.45z"/>
        </svg>
      </template>
      <button v-for="[kind, label] in kinds" :key="kind" @click="add(kind)">{{ label }}</button>
    </DropdownMenu>
    <DropdownMenu class="frame-menu" :label="t('animation.frameActions')" up :disabled="inside">
      <template #trigger>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 7h3v3H2zM6.5 7h3v3h-3zM11 7h3v3h-3z"/></svg>
      </template>
      <button :disabled="at === 0" @click="move(-1)">{{ t('animation.moveEarlier') }}</button>
      <button :disabled="at === count - 1" @click="move(1)">{{ t('animation.moveLater') }}</button>
      <button :disabled="count < 2" @click="remove">{{ t('animation.deleteFrame') }}</button>
      <p class="heading">{{ t('animation.cellsCarry') }}</p>
      <button v-for="on in [true, false]" :key="on" :aria-pressed="workspace.cellsStay !== on" @click="workspace.cellsStay = !on">{{ t(on ? 'animation.cellsCarryOn' : 'animation.cellsCarryOff') }}</button>
    </DropdownMenu>
    </div>
    <div class="settings">
    <label class="field fps" :title="t('animation.fpsTitle')">
      <input type="number" :aria-label="t('animation.fpsTitle')" min="1" max="60" step="1" :value="typing.fps ?? project.fps" @input="typing.fps = $event.target.value" @change="setFps" @blur="typing.fps = null">
      {{ t('animation.fpsUnit') }}
    </label>
    <label class="field" :title="t('animation.holdTitle')">
      {{ t('animation.hold') }}
      <input type="number" :aria-label="t('animation.hold')" min="0" max="60" step="0.05" :value="typing.hold ?? project.frames[at]?.hold" @input="typing.hold = $event.target.value" @change="setHold" @blur="typing.hold = null">
      {{ t('animation.holdUnit') }}
    </label>
    <span v-if="full" class="full">{{ full }}</span>
    <!-- Ghost: one button, lit while it's on, opening a box with both of its settings: on or off, and how strong. -->
    <DropdownMenu class="ghost" :class="{ active: workspace.ghost }" :label="ghostTitle" :trigger-label="t('animation.ghost')" up :close-on-select="false">
      <template #trigger>
        <svg viewBox="0 0 16 16" fill-rule="evenodd" aria-hidden="true">
          <path d="M8 1.5C5 1.5 3 3.9 3 7v7.5l1.67-1.25 1.66 1.25L8 13.25l1.67 1.25 1.66-1.25L13 14.5V7c0-3.1-2-5.5-5-5.5zM6.25 5.5a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2zm3.5 0a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z"/>
        </svg>
        <svg class="caret" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4.5l5 6H3z"/></svg>
      </template>
      <label class="ghost-on" :title="t('animation.ghostTitle')">
        <input v-model="workspace.ghost" type="checkbox">
        {{ t('animation.ghostOn') }}
      </label>
      <label class="strength" :class="{ off: !workspace.ghost }">
        <input v-model.number="workspace.ghostStrength" type="range" :aria-label="t('animation.ghostStrength')" min="0" max="100" step="1" :disabled="!workspace.ghost" @pointerup="$event.target.blur()">
        <output>{{ workspace.ghostStrength }}%</output>
      </label>
    </DropdownMenu>
    <button v-if="workspace.editorTab === 'vector'" class="keys" :class="{ active: workspace.keysOpen }" :aria-label="t('keysPanel.button')" :aria-pressed="workspace.keysOpen" :title="t('keysPanel.buttonTitle')" @click="workspace.keysOpen = !workspace.keysOpen">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 14.5 8 8 14.5 1.5 8z"/></svg>
    </button>
    </div>
  </div>
</template>

<style scoped>
div.animation-bar {
  container: animation-bar / inline-size; /* how wide the bar is, not the window, decides when it takes two lines */
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 6px 10px;
  flex-shrink: 0;
  background: var(--surface-2);
  border-top: 1px solid var(--accent);
}
div.playback, div.transport, div.settings {
  display: flex;
  align-items: center;
  gap: 6px 8px;
  min-width: 0;
}
div.playback {
  margin-right: -4px; /* the transport's gap from it, not the bar's */
}
div.transport { /* takes the spare room beside the settings; on a line of its own, each fills its line */
  flex: 9999 1 304px; /* with play and the steps, 400px */
}
div.settings {
  flex: 1 1 auto;
}
div.settings > * {
  flex-shrink: 0;
  white-space: nowrap;
}
div.settings:has(span.full) {
  flex-wrap: wrap;
}

button.play, button.step {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-dim);
}
button.play {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--white);
}
button.step {
  width: 22px;
  height: 26px;
}
button.play svg, button.step svg, :deep(.dropdown-trigger) > svg {
  width: 12px;
  height: 12px;
  fill: currentColor;
}
button.play:disabled, button.step:disabled {
  opacity: 0.4;
  cursor: default;
}

output.indicator {
  min-width: 56px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

div.scrubber {
  --thumb: 17px; /* global.css's slider thumb, border and all */
  position: relative;
  flex: 1 1 0;
  min-width: 60px;
  height: 28px;
}
div.scrubber input {
  position: absolute;
  inset: 0 0 auto;
  width: 100%;
  height: 16px;
  margin: 0;
  accent-color: var(--accent);
}
div.scrubber-marks {
  position: absolute;
  inset: 17px 0 0;
}
div.scrubber-marks span {
  position: absolute;
  pointer-events: none;
  top: 0;
  width: 2px;
  height: 9px;
  transform: translateX(-50%);
  background: var(--text);
}
div.scrubber-marks span.view { /* the Keys panel's frames in view */
  top: -1px;
  height: 11px;
  transform: none;
  box-sizing: border-box;
  border: 1px solid var(--accent);
  border-radius: 3px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  pointer-events: auto;
  touch-action: none;
  cursor: grab;
}
div.scrubber-marks span.empty {
  top: 1px;
  width: 1px;
  height: 4px;
  background: var(--text-muted);
}
div.scrubber-marks span.duplicate {
  width: 6px;
  background: var(--warning);
}
div.scrubber-marks span.band { /* a tween, key frame to key frame, under the dots of the frames it works out */
  top: 2px;
  height: 5px;
  transform: none;
  border-radius: 2px;
  background: color-mix(in srgb, var(--accent) 60%, transparent);
}
div.scrubber-marks span.tween {
  top: 3px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
}
div.scrubber-marks span.wipe {
  top: 1px;
  width: 7px;
  height: 7px;
  transform: translateX(-50%) rotate(45deg);
  background: var(--accent-hot);
}

label.field {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-dim);
  white-space: nowrap;
}
label.field input {
  width: 52px;
  height: 26px;
  padding: 2px 4px;
}

/* Ghost: one button, the ghost and a small caret, as the toolbar's buttons are and lit while it's on. */
.ghost :deep(.dropdown-trigger) {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 3px 6px 3px 8px;
  border-radius: 3px;
  border: 1px solid var(--border);
  color: var(--text-faint);
}
.ghost :deep(.dropdown-trigger) > svg {
  display: block;
  width: 16px;
  height: 16px;
  fill: currentColor;
}
.ghost :deep(.dropdown-trigger) > svg.caret {
  width: 8px;
  height: 8px;
}
@media (hover: hover) {
  .ghost :deep(.dropdown-trigger:hover) {
    color: var(--text);
  }
}
.ghost.active :deep(.dropdown-trigger) {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--white);
}
.ghost.active :deep(.dropdown-trigger:hover) {
  background: color-mix(in srgb, var(--white) 12%, var(--accent));
}
label.ghost-on {
  display: flex;
  color: var(--text);
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
label.strength.off {
  opacity: 0.4;
}
label.strength {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--text-dim);
}
label.strength input {
  width: 140px;
  margin: 0;
  accent-color: var(--accent);
}
label.strength output {
  min-width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

span.full {
  font-size: 12px;
  color: var(--warning);
}

p.heading {
  margin: 2px 10px 4px;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}
.frame-menu button[aria-pressed='true']::after {
  content: '✓';
  margin-left: 4px;
}

svg.add-frame {
  width: 16px;
  height: 16px;
}

/* As the toolbar's tool buttons: an icon, lit when it's on. */
button.keys {
  display: flex;
  align-items: center;
  height: 26px;
  padding: 3px 8px;
  border-radius: 3px;
  border: 1px solid var(--border);
}
button.keys svg {
  display: block;
  width: 16px;
  height: 16px;
  fill: var(--text-faint);
}
@media (hover: hover) {
  button.keys:hover svg {
    fill: var(--text);
  }
}
button.keys.active {
  background: var(--accent);
  border-color: var(--accent);
}
button.keys.active svg {
  fill: var(--white);
}

@media (max-width: 768px) { /* global.css's thumb is larger here, for a finger */
  div.scrubber {
    --thumb: 23px;
  }
}

@media (max-width: 960px) { /* up to the largest phone on its side */
  div.animation-bar, div.playback, div.transport, div.settings {
    column-gap: 6px;
  }
  div.transport {
    flex-basis: 190px; /* with play and the steps, 300px */
  }
  div.playback {
    margin-right: 0;
  }
  button.step { /* for a finger */
    width: 32px;
  }
  .ghost :deep(.dropdown-trigger) { /* for a finger */
    padding: 3px 8px;
  }
  output.indicator {
    min-width: 44px;
  }
  label.field {
    gap: 3px;
  }
  label.field input { /* 16px: Safari on a phone zooms the page to anything smaller when it's focused */
    width: 44px;
    font-size: 16px;
    appearance: textfield;
  }
  label.field input::-webkit-inner-spin-button {
    display: none;
  }
  label.fps input {
    width: 36px;
  }
  span.full {
    flex-basis: 100%;
    order: 1;
  }
}

/* Phones under 390px (the bar's padding aside): the second line's buttons and gaps a little tighter, so Keys still fits
   beside Ghost. */
@container animation-bar (max-width: 369px) {
  div.animation-bar, div.playback, div.settings {
    column-gap: 4px;
  }
  button.keys {
    padding: 3px 5px;
  }
  .ghost :deep(.dropdown-trigger) {
    padding: 3px 4px 3px 5px;
  }
}

/* Where the bar can't be one line (play, the steps and the frames at 300px, beside the timing): the frames get the first
   line to themselves, and play and the steps start the second. */
@container animation-bar (max-width: 589px) {
  div.transport {
    flex-basis: 100%;
  }
  div.playback {
    order: 1;
  }
  div.settings { /* beside them, its slider giving way */
    order: 2;
    flex: 1 1 0;
  }
}

@media (max-width: 350px) { /* no room for one line of them */
  div.settings {
    flex-wrap: wrap;
  }
}
</style>

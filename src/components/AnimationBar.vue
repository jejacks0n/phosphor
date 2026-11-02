<script setup>
import { computed, watch } from 'vue';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { usePlayback } from '@/composables/usePlayback';
import { frameMarks } from '@/lib/frameMarks';
import DropdownMenu from '@/components/DropdownMenu.vue';

// Under the canvas while Animate is on: play, step, scrub, timing, and adding and arranging frames.
const project = useProjectStore();
const workspace = useWorkspaceStore();
const playback = usePlayback();

const KINDS = [
  ['blank', 'Blank: ghost of what came before'],
  ['duplicate', 'Duplicate: everything, solid'],
  ['wipe', 'Wipe: a clean slate, no ghost'],
];

const at = computed(() => (workspace.playing ? workspace.playFrame : project.frame));
const count = computed(() => project.frames.length);
// Why Add frame is off, if it is.
const full = computed(() => {
  if (!project.canAnimate) return 'This canvas is too large to add frames';
  return count.value >= project.mostFrames ? `${count.value} frames is the most at this canvas size` : '';
});

// A frame's changes are worked out when it's left, and here when it's edited, so its mark is right at once.
watch(() => project.historyVersion, () => project.noteFrame());
const marks = computed(() => {
  void project.historyVersion;
  return project.hasFrames ? frameMarks(project.frames) : [project.hasEdits ? 'drawn' : 'empty'];
});
// Where the range's thumb sits for frame i: its travel stops half a thumb short of each end.
const markAt = (i) => (count.value > 1 ? `calc(7px + (100% - 14px) * ${i / (count.value - 1)})` : '7px');

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
const setHold = paused((event) => {
  project.setHold(project.frame, event.target.value);
  event.target.value = project.currentFrame.hold;
});
const setFps = (event) => {
  project.setFps(event.target.value);
  event.target.value = project.fps;
};
</script>

<template>
  <div class="animation-bar" role="toolbar" aria-label="Animation">
    <!-- Two groups, one line where they fit and a line each where they don't, so a narrow screen never strands a control. -->
    <div class="transport">
    <button class="play" :aria-label="workspace.playing ? 'Pause' : 'Play'" :title="workspace.playing ? 'Pause (L)' : 'Play (L)'" :disabled="count < 2" @click="playback.toggle()">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path v-if="workspace.playing" d="M3 2h4v12H3zM9 2h4v12H9z"/>
        <path v-else d="M4 2l10 6-10 6z"/>
      </svg>
    </button>
    <button class="step" aria-label="Previous frame" title="Previous frame (,)" :disabled="count < 2" @click="step(-1)">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h2v10H3zM13 3v10L6 8z"/></svg>
    </button>
    <button class="step" aria-label="Next frame" title="Next frame (.)" :disabled="count < 2" @click="step(1)">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 3h2v10h-2zM3 3v10l7-5z"/></svg>
    </button>
    <output class="indicator" data-testid="frame-indicator">{{ at + 1 }} / {{ count }}</output>
    <div class="scrubber">
      <div class="scrubber-marks" aria-hidden="true">
        <span v-for="(mark, i) in marks" :key="i" :class="mark" :style="{ left: markAt(i) }"></span>
      </div>
      <!-- A pointer lets go of it, so the app's keys work again; the keyboard keeps its arrows. -->
      <input type="range" aria-label="Frame" min="0" :max="count - 1" step="1" :value="at" @input="scrub" @pointerup="$event.target.blur()">
    </div>
    </div>
    <div class="settings">
    <label class="field fps" title="Frames per second">
      <input type="number" aria-label="Frames per second" min="1" max="60" step="1" :value="project.fps" @change="setFps">
      fps
    </label>
    <label class="field" title="How long this frame stays, in seconds (0 is one tick)">
      Hold
      <input type="number" aria-label="Hold" min="0" max="60" step="0.05" :value="project.frames[at]?.hold" @change="setHold">
      s
    </label>
    <DropdownMenu label="Add frame" up :disabled="!!full">
      <template #trigger>
        <!-- A frame of film, on its side, with a plus at its corner. -->
        <svg class="add-frame" viewBox="0 0 16 16" fill-rule="evenodd" aria-hidden="true">
          <path d="M0.5 6h11.5v9H0.5zM1.6 6.7h1.1v1h-1.1zm2.2 0h1.1v1h-1.1zm2.2 0h1.1v1h-1.1zm2.2 0h1.1v1h-1.1zm2.2 0h1.1v1h-1.1zM1.6 13.3h1.1v1h-1.1zm2.2 0h1.1v1h-1.1zm2.2 0h1.1v1h-1.1zm2.2 0h1.1v1h-1.1zm2.2 0h1.1v1h-1.1zM1.5 8.4h9.5v4.2H1.5zM12.55 0.8h1.5v1.45h1.45v1.5h-1.45v1.45h-1.5v-1.45H11.1v-1.5h1.45z"/>
        </svg>
      </template>
      <button v-for="[kind, label] in KINDS" :key="kind" @click="add(kind)">{{ label }}</button>
    </DropdownMenu>
    <span v-if="full" class="full">{{ full }}</span>
    <DropdownMenu label="Frame actions" up>
      <template #trigger>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 7h3v3H2zM6.5 7h3v3h-3zM11 7h3v3h-3z"/></svg>
      </template>
      <button :disabled="at === 0" @click="move(-1)">Move earlier</button>
      <button :disabled="at === count - 1" @click="move(1)">Move later</button>
      <button :disabled="count < 2" @click="remove">Delete frame</button>
    </DropdownMenu>
    <button class="ghost" :class="{ active: workspace.ghost }" aria-label="Ghost" :aria-pressed="workspace.ghost" title="Ghost: show earlier frames, dimmed, on a Blank frame" @click="workspace.ghost = !workspace.ghost">
      <svg viewBox="0 0 16 16" fill-rule="evenodd" aria-hidden="true">
        <path d="M8 1.5C5 1.5 3 3.9 3 7v7.5l1.67-1.25 1.66 1.25L8 13.25l1.67 1.25 1.66-1.25L13 14.5V7c0-3.1-2-5.5-5-5.5zM6.25 5.5a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2zm3.5 0a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z"/>
      </svg>
    </button>
    <input v-model.number="workspace.ghostStrength" class="strength" type="range" aria-label="Ghost strength" :title="`Ghost strength: ${workspace.ghostStrength}%`" min="0" max="100" step="1" :disabled="!workspace.ghost" @pointerup="$event.target.blur()">
    </div>
  </div>
</template>

<style scoped>
div.animation-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 6px 10px;
  flex-shrink: 0;
  background: var(--surface-2);
  border-top: 1px solid var(--accent);
}
div.transport, div.settings {
  display: flex;
  align-items: center;
  gap: 6px 8px;
  min-width: 0;
}
div.transport { /* takes the spare room beside the settings; on a line of its own, each fills its line */
  flex: 9999 1 340px;
}
div.settings {
  flex: 1 1 auto;
}
div.settings > * {
  flex-shrink: 0;
  white-space: nowrap;
}
div.settings > input.strength {
  flex-shrink: 1;
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
  top: 0;
  width: 2px;
  height: 9px;
  transform: translateX(-50%);
  background: var(--text);
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

input.strength {
  flex: 1 1 72px;
  width: 72px;
  min-width: 20px;
  margin: 0;
  accent-color: var(--accent);
}

span.full {
  font-size: 12px;
  color: var(--warning);
}

svg.add-frame {
  width: 16px;
  height: 16px;
}

/* As the toolbar's tool buttons: an icon, lit when it's on. */
button.ghost {
  display: flex;
  align-items: center;
  height: 26px;
  padding: 3px 8px;
  border-radius: 3px;
  border: 1px solid var(--border);
}
button.ghost svg {
  display: block;
  width: 16px;
  height: 16px;
  fill: var(--text-faint);
}
@media (hover: hover) {
  button.ghost:hover svg {
    fill: var(--text);
  }
}
button.ghost.active {
  background: var(--accent);
  border-color: var(--accent);
}
button.ghost.active svg {
  fill: var(--white);
}

@media (max-width: 960px) { /* up to the largest phone on its side */
  div.animation-bar, div.transport, div.settings {
    column-gap: 6px;
  }
  div.transport {
    flex-basis: 240px;
  }
  button.step { /* for a finger */
    width: 32px;
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

@media (max-width: 350px) { /* no room for one line of them */
  div.settings {
    flex-wrap: wrap;
  }
}
</style>

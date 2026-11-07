<script setup>
import { useMediaQuery } from '@vueuse/core';
import { computed, onBeforeUnmount, onMounted, reactive, useTemplateRef, watch, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { usePlayback } from '@/composables/usePlayback';
import { EASINGS, MOTIONS } from '@/document/tweens.js';
import { PARTS, partsOf } from '@/document/parts.js';
import { isArt } from '@/document/artLayers.js';
import { listedParts, partKeys } from '@/document/keys.js';
import { lifeAt } from '@/document/tweens.js';
import { MIN_FRAME_PX, MIN_FRAME_PX_PHONE, MOST_FRAME_PX, frameAt, labelEvery, laneLayout, xOf, zoomAround } from '@/lib/keyLanes.js';
import DropdownMenu from '@/components/DropdownMenu.vue';
import KeyValues from '@/components/KeyValues.vue';

// Over the animation bar on VECTOR: the first selected shape's parts as rows, each with its keys as diamonds on a lane
// of frames lined up with the scrubber's marks below. Keys are selected, eased, deleted and added here. Following a
// path is set up here too: + Add key's Follow a path… starts the pick (workspace.pickingPath, which Vector select's
// next click ends), a follower's Along row has the menu for how it follows, and a path or guide has the Guide toggle.
const { t } = useI18n();
const project = useProjectStore();
const workspace = useWorkspaceStore();
const playback = usePlayback();
const root = useTemplateRef('root');
const phone = useMediaQuery('(max-width: 768px)');

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
// The shape's life around the frame showing (the one playing, while it plays), and the parts that change in it. They
// follow the life's first frame, so playing within a life leaves them as they are.
const lifeStart = computed(() => {
  void project.historyVersion;
  return shapeKey.value && project.hasFrames && project.frames[at.value] ? lifeAt(project.frames, shapeKey.value, at.value)[0] ?? null : null;
});
const keys = computed(() => {
  void project.historyVersion;
  return lifeStart.value === null ? null : partKeys(project.frames, shapeKey.value, lifeStart.value);
});
const shape = computed(() => project.shapes.get(shapeKey.value) ?? null);
// A follower has an Along row whatever its keys: its name is the menu that sets how it follows.
const rows = computed(() => {
  void project.historyVersion;
  if (!keys.value) return [];
  const listed = listedParts(project.frames, shapeKey.value, lifeStart.value);
  return PARTS.filter((part) => listed.includes(part) || (part === 'along' && shape.value?.follow)).map((part) => ({ part, keys: keys.value.rows.get(part) }));
});
// The parts + Add key offers: those without a row yet (a follower's Along always has one).
const unlisted = computed(() => {
  const one = keys.value && shape.value;
  return one ? partsOf(one).filter((part) => part !== 'along' && !rows.value.some((row) => row.part === part)) : [];
});
// Follow a path…: one shape or art layer selected that follows nothing.
const canFollow = computed(() => !!keys.value && !!shape.value && !shape.value.follow
  && workspace.vectorSelected.filter((key) => project.shapes.has(key)).length === 1);
// Picking ends, with nothing done, once it couldn't go on: the picker not the one selected shape, the tool not Vector
// select, VECTOR not showing or Animate off; and with the panel.
const picking = computed(() => workspace.pickingPath !== null && workspace.pickingPath === shapeKey.value && canFollow.value
  && workspace.activeTool === 'vselect' && workspace.editorTab === 'vector' && project.animate);
watch(() => workspace.pickingPath !== null && !picking.value, (stale) => {
  if (stale) workspace.pickingPath = null;
}, { immediate: true });
onBeforeUnmount(() => { workspace.pickingPath = null; });
// The Along menu's choices, and the Guide toggle: for a path with followers on the frame showing, or a guide.
const follow = computed(() => shape.value?.follow ?? null);
const RIDES = [['along', 'rideAlong'], ['start', 'rideStart'], ['end', 'rideEnd']];
const STEPS = [['smooth', 'smooth'], ['half', 'half'], ['cells', 'cells']];
const guided = computed(() => !!shape.value && !isArt(shape.value)
  && (!!shape.value.guide || [...project.shapes.values()].some((other) => other.follow?.key === shapeKey.value)));
const keyAt = (part, i) => keys.value?.rows.get(part).find((k) => k.at === i);
const deletable = (k) => !!k && k.at !== keys.value.start && !k.fixed;
const partName = (part) => t(`keysPanel.parts.${part}`);
// What a row's name column, on a phone, has room for.
const rowName = (part) => t(`keysPanel.${phone.value ? 'partsShort' : 'parts'}.${part}`);

// The selected keys, each with whether a tween leaves it.
const selected = computed(() => workspace.selectedKeys.map(({ part, at }) => {
  const row = keys.value?.rows.get(part) ?? [], j = row.findIndex((k) => k.at === at);
  return { part, key: row[j], leaves: j >= 0 && j < row.length - 1 };
}).filter(({ key }) => key));
const isSelected = (part, i) => workspace.selectedKeys.some((ref) => ref.part === part && ref.at === i);
const easable = computed(() => selected.value.filter(({ leaves }) => leaves));
// An art layer always moves by whole cells: it has no motion to choose.
const movable = computed(() => (isArt(project.shapes.get(shapeKey.value)) ? [] : easable.value.filter(({ part, key }) => part === 'transform' && key.easing)));
// The easing of the selected keys that a tween leaves, or MIXED when they differ.
const MIXED = 'mixed';
const easing = computed(() => {
  const all = easable.value.map(({ key }) => key.easing ?? null);
  return all.every((one) => one === all[0]) ? all[0] ?? null : MIXED;
});
const easingName = computed(() => (easing.value === MIXED ? t('keysPanel.mixed') : t(`animation.easings.${easing.value ?? 'none'}`)));
const motion = computed(() => movable.value[0]?.key.motion ?? 'smooth');
const canDelete = computed(() => selected.value.some(({ key }) => deletable(key)));

// A new shape, nothing selected; and only keys still there (an undo, say, takes some away), in rows still listed.
// A frame added, deleted or moved (or that undone) shifts keys to other frames, so none stays selected: a ref names
// a frame by index, and could land on another key.
watch(shapeKey, () => { workspace.selectedKeys = []; });
watch(() => project.frames.map(({ id }) => id).join(), () => { workspace.selectedKeys = []; });
// Not while playing: rows follow the frame playing, which may be past the shape's life; a pause checks the frame then.
watch([rows, () => workspace.playing], ([now, playing]) => {
  if (playing) return;
  const kept = workspace.selectedKeys.filter(({ part, at }) => now.some((row) => row.part === part && row.keys.some((k) => k.at === at)));
  if (kept.length < workspace.selectedKeys.length) workspace.selectedKeys = kept;
}, { immediate: true });
onBeforeUnmount(() => { workspace.selectedKeys = []; });

// The lanes line up with the scrubber, as wide as its range, frame i where its mark is (the thumb, --thumb, travels
// half a thumb short of each end); or, with too many frames for that, they're a window that scrolls and zooms
// (keyLanes.js).
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
const layout = computed(() => laneLayout({ count: count.value, width: lane.width, thumb: lane.thumb, zoom: workspace.keysZoom,
  scroll: workspace.keysScroll, minPx: phone.value ? MIN_FRAME_PX_PHONE : MIN_FRAME_PX }));
const x = (i) => xOf(i, layout.value);
const keyW = computed(() => (phone.value ? 16 : 14)); // wider on a phone, and taller
const half = computed(() => layout.value.px / 2);
const inView = (i) => i >= layout.value.first && i <= layout.value.last;
const laneX = (clientX) => clientX - root.value.getBoundingClientRect().left - lane.left;
// The frames in view with a tick and a number, thinned out when they're tight; the one showing always has a number.
const ticked = computed(() => {
  const { first, last, px } = layout.value, every = labelEvery(px), shown = [];
  for (let i = first; i <= last; i++) if (every === 1 || i === 0 || (i + 1) % every === 0) shown.push(i);
  return shown;
});
const numbered = computed(() => (inView(at.value) && !ticked.value.includes(at.value) ? [...ticked.value, at.value].sort((a, b) => a - b) : ticked.value));

// The scroll kept in range (the scrubber's band sets it too), and what's in view told to the band.
watchEffect(() => {
  if (workspace.keysScroll !== layout.value.scroll) workspace.keysScroll = layout.value.scroll;
});
watchEffect(() => {
  const { fits, first, last, px } = layout.value;
  workspace.keysView = fits || !shapeKey.value || !lane.width ? null : { first, last, px };
});
onBeforeUnmount(() => { workspace.keysView = null; });
// The frame showing stays in view: stepping, playing and scrubbing scroll the lanes to it, and so does the lanes'
// width changing (the frame counter beside the scrubber grows a digit, say).
watch([at, () => lane.width], ([i]) => {
  const { fits, px, width, thumb } = layout.value, xi = x(i);
  if (fits) return;
  if (xi < thumb / 2) workspace.keysScroll = i * px;
  else if (xi > width - thumb / 2) workspace.keysScroll = i * px + thumb - width;
});

// − and + zoom around the frame showing (or the lanes' edge it's past); Cmd/Ctrl-wheel and pinch around the pointer.
// The wheel and Shift-wheel scroll them, and so does dragging the ruler where there's no number.
function zoomBy(factor, around) {
  const { zoom, scroll } = zoomAround(layout.value, factor, around);
  workspace.keysZoom = zoom;
  workspace.keysScroll = scroll;
}
const mostZoomed = computed(() => layout.value.px >= Math.max(MOST_FRAME_PX, layout.value.fit));
const zoomButton = (factor) => zoomBy(factor, Math.min(Math.max(x(at.value), 0), lane.width));
function wheel(event) {
  if (event.ctrlKey || event.metaKey) { // a pinch comes as a Ctrl-wheel
    event.preventDefault();
    zoomBy(1.25 ** (-event.deltaY / 100), laneX(event.clientX));
  } else if (!layout.value.fits) {
    event.preventDefault();
    workspace.keysScroll = layout.value.scroll + (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY);
  }
}
let pan = null;
function grabRuler(event) {
  if (event.button !== 0 || layout.value.fits) return;
  pan = { x: event.clientX, scroll: layout.value.scroll, pointer: event.pointerId };
  event.currentTarget.setPointerCapture(event.pointerId);
}
const panRuler = (event) => {
  if (pan?.pointer === event.pointerId) workspace.keysScroll = pan.scroll - (event.clientX - pan.x);
};
const dropRuler = () => { pan = null; };
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
  if (dragged || press?.drag) return; // a drag's own click, or another finger's tap during one
  if (!event.shiftKey) {
    workspace.selectedKeys = [{ part, at: i }];
    project.showFrame(i);
  } else if (isSelected(part, i)) workspace.selectedKeys = workspace.selectedKeys.filter((ref) => ref.part !== part || ref.at !== i);
  else workspace.selectedKeys = [...workspace.selectedKeys, { part, at: i }];
});
const keysOn = (i) => rows.value.filter((row) => row.keys.some((k) => k.at === i)).map(({ part }) => ({ part, at: i }));
const pickFrame = paused((i) => {
  if (dragged || press?.drag) return; // a drag's own click, or another finger's tap during one
  workspace.selectedKeys = keysOn(i);
  project.showFrame(i);
});

// A press on a diamond or a frame number (frame i) that goes half a frame along is a drag of its keys (refs, selected
// as it begins), snapping to the frame under the pointer; less is a click. Escape, or the browser taking the pointer
// (or the window losing focus), puts them back; a move with no button down is a drop whose pointerup went astray. A
// second press (another finger) while one's held does nothing.
let press = null, dragged = false;
function pressKeys(event, i, refs) {
  if (press) return;
  dragged = false;
  if (event.button !== 0 || !keys.value || !half.value) return;
  press = { off: laneX(event.clientX) - x(i), at: i, pointer: event.pointerId, shape: shapeKey.value, refs, by: 0, drag: null };
  window.addEventListener('pointermove', dragKeys);
  window.addEventListener('pointerup', dropKeys);
  window.addEventListener('pointercancel', cancelKeys);
  window.addEventListener('blur', cancelKeys);
  window.addEventListener('keydown', escapeKeys, true);
}
const pressKey = (event, part, i) => pressKeys(event, i, isSelected(part, i) ? workspace.selectedKeys
  : event.shiftKey ? [...workspace.selectedKeys, { part, at: i }] : [{ part, at: i }]);
function dragKeys(event) {
  if (event.pointerId !== press.pointer) return;
  if (!event.buttons) {
    dropKeys(event);
    return;
  }
  const by = frameAt(laneX(event.clientX) - press.off, layout.value) - press.at;
  if (by === press.by) return;
  if (!press.drag) {
    playback.pause();
    press.drag = {};
    root.value.setPointerCapture(press.pointer);
  }
  press.by = by;
  workspace.selectedKeys = project.moveKeys(press.shape, press.refs, by, press.drag);
}
function letGo() {
  window.removeEventListener('pointermove', dragKeys);
  window.removeEventListener('pointerup', dropKeys);
  window.removeEventListener('pointercancel', cancelKeys);
  window.removeEventListener('blur', cancelKeys);
  window.removeEventListener('keydown', escapeKeys, true);
  dragged = !!press.drag; // the click that follows isn't one
  setTimeout(() => { dragged = false; });
  press = null;
}
function dropKeys(event) {
  if (event.pointerId !== press.pointer) return;
  if (press.drag) project.endKeyDrag(press.drag);
  letGo();
}
function cancelKeys(event) {
  if (event?.pointerId !== undefined && event.pointerId !== press.pointer) return;
  if (press.drag) {
    project.cancelKeyDrag(press.drag);
    workspace.selectedKeys = press.refs;
  }
  letGo();
}
// While a drag's under way the keys are its own: Escape cancels it (the shape stays selected); the rest (undo, Delete)
// do nothing, as the frames are mid-drag.
function escapeKeys(event) {
  if (!press.drag) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.key === 'Escape') cancelKeys();
}
const lostKeys = (event) => {
  if (press?.drag) cancelKeys(event);
};
onBeforeUnmount(() => {
  if (!press) return;
  project.cancelKeyDrag(press.drag);
  letGo();
});
const ease = paused((choice) => project.setKeyEasing(shapeKey.value, workspace.selectedKeys, choice));
const moveBy = paused((choice) => project.setKeyMotion(shapeKey.value, workspace.selectedKeys, choice));
const remove = paused(() => project.deleteKeys(shapeKey.value, workspace.selectedKeys));
const addKey = paused((part) => project.addKey(shapeKey.value, part));
const pickPath = paused(() => { workspace.pickingPath = shapeKey.value; });
const ride = paused((choice) => project.setFollow([shapeKey.value], { ride: choice }));
const face = paused(() => project.setFollow([shapeKey.value], { face: !follow.value.face }));
const step = paused((choice) => project.setFollow([shapeKey.value], { motion: choice }));
const unfollow = paused(() => project.stopFollowing([shapeKey.value]));
const guide = paused(() => project.setGuide([shapeKey.value], !shape.value.guide));
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
  <section ref="root" class="keys-panel" tabindex="0" :aria-label="t('keysPanel.aria')" :style="{ '--lead': `${lane.left}px`, '--lane': `${lane.width}px` }" @keydown="keydown" @pointerdown="focusIn" @lostpointercapture="lostKeys">
    <div class="head">
      <div class="lead">
        <button class="fold" :aria-label="t('keysPanel.fold')" aria-expanded="true" :title="t('keysPanel.fold')" @click="workspace.keysOpen = false">▾</button>
        <DropdownMenu v-if="shapeKey" class="add-key" :label="t('keysPanel.addKey')" align="left" up :disabled="!unlisted.length && !canFollow">
          <button v-for="part in unlisted" :key="part" :disabled="!!keyAt(part, project.frame)" @click="addKey(part)">{{ partName(part) }}</button>
          <template v-if="canFollow">
            <div v-if="unlisted.length" class="divider"/>
            <button class="follow" @click="pickPath">{{ t('keysPanel.followPath') }}</button>
          </template>
        </DropdownMenu>
      </div>
      <p v-if="!shapeKey" class="none">{{ t('keysPanel.none') }}</p>
      <template v-else>
        <div class="ruler" @wheel="wheel" @pointerdown.self="grabRuler" @pointermove="panRuler" @pointerup="dropRuler" @lostpointercapture="dropRuler">
          <button v-for="i in numbered" :key="i" class="frame" :class="{ now: i === at, out: outside(i) }" :data-at="i" :style="{ left: `${x(i) - 10}px` }" :aria-label="t('keysPanel.frame', { frame: i + 1 })" :disabled="!keys" @pointerdown="pressKeys($event, i, keysOn(i))" @click="pickFrame(i)">
            <span>{{ i + 1 }}</span>
          </button>
        </div>
        <span class="zoom">
          <button :aria-label="t('keysPanel.zoomOut')" :title="t('keysPanel.zoomOut')" :disabled="layout.fits" @click="zoomButton(1 / 1.25)">−</button>
          <button :aria-label="t('keysPanel.zoomIn')" :title="t('keysPanel.zoomIn')" :disabled="mostZoomed" @click="zoomButton(1.25)">+</button>
        </span>
        <div class="rest">
          <button v-if="guided" class="guide" :aria-pressed="!!shape.guide" :title="t('keysPanel.guideTitle')" @click="guide">{{ t('keysPanel.guide') }}</button>
          <DropdownMenu class="easing" :label="t('keysPanel.easing')" :trigger-label="t('keysPanel.easingNow', { easing: easingName })" up :disabled="!easable.length">
            <template #trigger>
              <svg v-if="easing !== MIXED" class="curve" viewBox="0 0 16 16" aria-hidden="true"><path :d="CURVES[easing ?? 'none']"/></svg>
              <span class="shrinks">{{ easingName }}</span>
            </template>
            <button v-for="[name, choice] in easings" :key="name" :aria-pressed="easing === choice" @click="ease(choice)">
              <svg class="curve" viewBox="0 0 16 16" aria-hidden="true"><path :d="CURVES[name]"/></svg>
              {{ t(`animation.easings.${name}`) }}
            </button>
          </DropdownMenu>
          <DropdownMenu class="motion" :label="t('keysPanel.motion')" :trigger-label="t('keysPanel.motionNow', { motion: t(`animation.motions.${motion}`) })" up :disabled="!movable.length">
            <template #trigger><span class="shrinks">{{ t(`animation.motions.${motion}`) }}</span></template>
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
          <DropdownMenu v-if="row.part === 'along' && follow" class="along" :label="t('keysPanel.alongMenu')" align="left" up>
            <template #trigger><span class="name">{{ rowName('along') }} ▾</span></template>
            <p class="heading">{{ t('keysPanel.moves') }}</p>
            <button v-for="[choice, words] in RIDES" :key="choice" :aria-pressed="(follow.ride ?? 'along') === choice" @click="ride(choice === 'along' ? undefined : choice)">{{ t(`keysPanel.${words}`) }}</button>
            <button v-if="!isArt(shape)" :aria-pressed="!!follow.face" @click="face">{{ t('keysPanel.face') }}</button>
            <p class="heading">{{ t('keysPanel.motionHeading') }}</p>
            <button v-for="[choice, words] in STEPS" :key="choice" :aria-pressed="(follow.motion ?? 'smooth') === choice" @click="step(choice === 'smooth' ? undefined : choice)">{{ t(`animation.motions.${words}`) }}</button>
            <div class="divider"/>
            <button @click="unfollow">{{ t('keysPanel.stopFollowing') }}</button>
          </DropdownMenu>
          <span v-else class="name">{{ rowName(row.part) }}</span>
          <span v-if="!phone" class="nav">
            <button :aria-label="t('keysPanel.previous', { part: partName(row.part) })" :disabled="previous(row) === undefined" @click="show(previous(row))">◀</button>
            <button class="here" :class="{ on: !!keyAt(row.part, at) }" :aria-label="t('keysPanel.here', { part: partName(row.part) })" :aria-pressed="!!keyAt(row.part, at)" :disabled="!!keyAt(row.part, at) && !deletable(keyAt(row.part, at))" @click="toggleHere(row.part)">{{ keyAt(row.part, at) ? '◆' : '◇' }}</button>
            <button :aria-label="t('keysPanel.next', { part: partName(row.part) })" :disabled="next(row) === undefined" @click="show(next(row))">▶</button>
          </span>
        </div>
        <div class="lane" @wheel="wheel" @click.self="dragged || (workspace.selectedKeys = [])">
          <span v-if="keys.start > 0" class="out" :style="{ left: 0, width: `${Math.max(0, x(keys.start) - half)}px` }"></span>
          <span v-if="keys.end < count - 1" class="out" :style="{ left: `${Math.max(0, x(keys.end) + half)}px`, right: 0 }"></span>
          <span v-for="i in ticked" :key="`tick${i}`" class="tick" :style="{ left: `${x(i)}px` }"></span>
          <span v-for="piece in piecesOf(row)" :key="`piece${piece.from}`" :class="piece.easing ? 'tween' : 'hold'" :style="{ left: `${x(piece.from)}px`, width: `${x(piece.to) - x(piece.from)}px` }">
            <svg v-if="piece.easing" class="curve" viewBox="0 0 16 16" aria-hidden="true"><path :d="CURVES[piece.easing]"/></svg>
          </span>
          <button v-for="k in row.keys.filter((k) => inView(k.at))" :key="`key${k.at}`" class="key" :class="{ fixed: k.fixed }" :data-at="k.at" :style="{ left: `${x(k.at) - keyW / 2}px` }" :aria-pressed="isSelected(row.part, k.at)" :aria-label="t('keysPanel.key', { part: partName(row.part), frame: k.at + 1 })" @pointerdown="pressKey($event, row.part, k.at)" @click="pick(row.part, k.at, $event)"></button>
        </div>
        <KeyValues v-if="!phone" :part="row.part" :shape-key="shapeKey"/>
        <button v-else class="here" :class="{ on: !!keyAt(row.part, at) }" :aria-label="t('keysPanel.here', { part: partName(row.part) })" :aria-pressed="!!keyAt(row.part, at)" :disabled="!!keyAt(row.part, at) && !deletable(keyAt(row.part, at))" @click="toggleHere(row.part)">{{ keyAt(row.part, at) ? '◆' : '◇' }}</button>
      </div>
      <span v-if="rows.length && inView(at)" class="playhead" :style="{ left: `${lane.left + x(at)}px` }"></span>
    </div>
  </section>
</template>

<style scoped>
section.keys-panel {
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
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
  overflow: hidden; /* scrolled, the frames out of view */
}
div.ruler {
  touch-action: pan-y; /* a finger drags it along */
}
button.frame, button.key {
  touch-action: none; /* a finger drags them */
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

span.zoom {
  display: flex;
  flex: none;
  margin-left: 14px;
}
span.zoom button {
  width: 22px;
  height: 22px;
  padding: 0;
}
div.rest {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-left: 6px;
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
.easing button[aria-pressed='true']::after, .motion button[aria-pressed='true']::after, .along button[aria-pressed='true']::after {
  content: '✓' / '';
  margin-left: 4px;
}
/* Follow a path…, and the Along menu's parts, set off by a line; its headings. */
div.divider {
  height: 1px;
  margin: 2px 4px;
  background: var(--border);
}
p.heading {
  margin: 2px 10px 0;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}
/* The Along row's name is its menu: drawn as the other names are. */
.along {
  min-width: 0;
}
.along :deep(.dropdown-trigger) {
  height: 20px;
  padding: 0 2px;
  border: none;
  background: transparent;
  font-weight: 400;
  color: var(--text);
}
button.guide {
  flex: none;
  height: 26px;
  padding: 0 8px;
  font-size: 12px;
}
button.guide[aria-pressed='true'] {
  background: var(--accent);
  color: var(--white);
}
button.delete {
  flex: none;
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

/* On a phone: no values and no ◀ ▶; a ◆ toggle ends each row. The top line is the fold, + Add key and the buttons; the
   ruler (and the zoom) has the next, under the lanes' own columns. */
div.row > button.here {
  flex: none;
  width: 34px;
  height: 22px;
  margin: 0 8px 0 auto;
  padding: 0;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted);
}
div.row > button.here.on {
  color: var(--accent);
}
@media (max-width: 768px) {
  div.head {
    flex-wrap: wrap;
    height: auto;
    row-gap: 4px;
    padding: 4px 0;
  }
  div.head > div.lead {
    width: auto;
    padding: 0 6px 0 8px;
  }
  div.rest { /* beside the lead, whatever its words; the menus give way before Delete does */
    order: 1;
    flex: 1 1 0;
    min-width: 120px;
    justify-content: flex-end;
    padding: 0 8px 0 0;
  }
  div.rest article.dropdown {
    min-width: 0;
  }
  div.rest :deep(.dropdown-trigger) {
    max-width: 100%;
  }
  span.shrinks {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  div.ruler {
    order: 2;
    height: 28px;
    margin-left: var(--lead);
  }
  span.zoom {
    order: 3;
    margin-left: 6px;
  }
  div.row {
    height: 26px;
  }
  .add-key button, .along button { /* every item tall enough to tap, and one height */
    min-height: 40px;
  }
  /* The Along menu's name and Guide, in rows too short for a finger: a 40px touch area around each, past the row. */
  div.row[data-part='along'] div.lead {
    overflow: visible;
  }
  .along :deep(.dropdown-trigger), button.guide {
    position: relative;
    max-width: 100%;
  }
  .along :deep(.dropdown-trigger)::after, button.guide::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
  }
  .along :deep(.dropdown-trigger)::after { /* 20px, from 15px over it to 6px under (the panel's padding) */
    top: -15px;
    bottom: -6px;
  }
  button.guide {
    z-index: 1; /* over the ruler's line, which a flex order paints later */
  }
  button.guide::after { /* 42px, from the panel's top edge down into the ruler's line */
    top: -6px;
    bottom: -10px;
  }
  div.row div.lead {
    padding: 0 0 0 6px;
    font-size: 10px;
  }
  span.tick {
    top: 6px;
    bottom: 6px;
  }
  span.hold {
    top: 12.5px;
  }
  span.tween {
    top: 10px;
  }
  button.key {
    top: 1px;
    width: 16px;
    height: 24px;
  }
  button.key::before {
    inset: 7px 3px;
  }
}
</style>

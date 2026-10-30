<script setup>
import { ref, computed, watch, useTemplateRef, onBeforeUnmount, useId } from 'vue';
import { useRoomStore } from '@/store/RoomStore';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { charRowsOf } from '@/lib/Cells';
import { cellGeometry, measureAdvance } from '@/lib/CellCanvas';
import { loadFontFaces } from '@/lib/displayFonts';
import { fontFor, fontOnWire } from '@/social/wire';
import { lobbyWindow } from '@/social/thumbnail';
import RoomArt from './RoomArt.vue';

// What the lobby card shows of the art: a frame as wide as the picture has room for (cells are whole
// device pixels, so it comes out up to a cell less), the shape of the lobby window, with the art scrolling inside it.
// Unchecked, the window follows the host's view and the frame is RoomArt centered on it; the frame can
// be scrolled to look, and "Use this exact position" pins the window to the cells the frame shows.
// While pinned, scrolling the frame moves the pin.
const FRAME = 300;   // until the picture's room is measured
const room = useRoomStore(), project = useProjectStore(), workspace = useWorkspaceStore();
const headingId = useId();

const spec = computed(() => fontOnWire(workspace.displayFontSpec));
const font = computed(() => fontFor(spec.value));
const art = computed(() => (project.cells.length
  ? { cells: project.cells, cols: project.cols, lines: charRowsOf(project.rows), font: spec.value }
  : null));

// The font's cell, once its faces have loaded (measured in a fallback until then).
const loaded = ref(0);
watch(() => `${font.value.id}:${font.value.size}`, (key) => {
  loadFontFaces(font.value).then(() => { if (key === `${font.value.id}:${font.value.size}`) loaded.value++; });
}, { immediate: true });
const advance = computed(() => (void loaded.value, measureAdvance(font.value)));

// The window comes from the cell the thumbnail measures (8 device px to the CSS px), so the frame shows
// what the card does: only the cell's aspect matters, and zoom keeps it.
const hostView = computed(() => {
  if (!art.value) return null;
  const { cellWidth, lineHeight } = cellGeometry(advance.value, 8, false, font.value);
  return lobbyWindow(art.value, { cellWidth, lineHeight }, room.lobbyPlace);
});
const cell = ref(null);    // the cell as RoomArt drew it: { width, height } in CSS px
const bars = ref({ x: 0, y: 0 });   // the frame's scrollbars take room from the art: the frame is that much bigger
const space = ref(FRAME);   // the picture's width inside its padding, in CSS px
// The cell the art's width fits in a whole number of device pixels, so RoomArt's rounding never makes the
// frame wider than its room.
const zoom = computed(() => {
  if (!hostView.value) return 1;
  const dpr = window.devicePixelRatio || 1;
  const cw = Math.max(1, Math.floor((space.value - bars.value.y) * dpr / hostView.value.cols));
  return cw / (advance.value * dpr);
});
const frameStyle = computed(() => {
  const v = hostView.value, c = cell.value;
  if (!v || !c) return { width: `${FRAME}px`, height: `${FRAME / 2}px` };
  return { width: `${v.cols * c.width + bars.value.y}px`, height: `${v.rows * c.height + bars.value.x}px` };
});
const pinned = computed(() => room.lobbyPin !== null);

const frameRef = useTemplateRef('frame');
const scroller = () => frameRef.value?.querySelector('.room-art');
const cellOf = (el) => {
  const { width, height } = el.firstElementChild.getBoundingClientRect();
  return { width: width / art.value.cols, height: height / art.value.lines };
};
const shownCell = (el) => {
  const c = cellOf(el);
  return { col: Math.round(el.scrollLeft / c.width), row: Math.round(el.scrollTop / c.height) };
};

// RoomArt resizes the art in an animation frame, and `settle` puts the window back in that frame's
// resize observers, before the browser's scroll event for it: a pin isn't moved by a resize.
const scrolled = (event) => {
  const el = event.target;
  if (!pinned.value || !cellOf(el).height) return;
  room.pinLobby(shownCell(el));
};
const pin = (event) => {
  if (!event.target.checked) return void room.followLobby();
  const el = scroller();
  if (el) room.pinLobby(shownCell(el));
};

// RoomArt has a new cell: the frame takes its size with the art's, before layout (from inside a resize
// observer, the elements around the art would miss their notifications).
const cellDrawn = ({ cellWidth, lineHeight }) => {
  const el = scroller();
  cell.value = { width: cellWidth, height: lineHeight };
  bars.value = { x: el.offsetHeight - el.clientHeight, y: el.offsetWidth - el.clientWidth };
};

// The art's size changed: the frame shows the window again (the frame is the window's size, so the
// window's corner is the scroll).
let sizerObserver = null;
const settle = () => {
  const el = scroller(), v = hostView.value;
  if (!el || !cell.value || !art.value || !v) return;   // not drawn yet
  el.scrollLeft = v.col * cell.value.width;
  el.scrollTop = v.row * cell.value.height;
};

const pictureRef = useTemplateRef('picture');
const spaceObserver = new ResizeObserver(([entry]) => { space.value = entry.contentRect.width; });
watch(pictureRef, (el) => { spaceObserver.disconnect(); if (el) spaceObserver.observe(el); }, { flush: 'post' });

// The art's sizer is watched once the art is there (it can come after the frame does).
const artRef = useTemplateRef('roomArt');
watch(artRef, (instance) => {
  sizerObserver?.disconnect();
  const el = instance?.$el;
  if (!el?.classList?.contains('room-art')) return;   // no art, or no WebGL2
  sizerObserver = new ResizeObserver(settle);
  sizerObserver.observe(el.firstElementChild);
}, { flush: 'post' });
onBeforeUnmount(() => {
  sizerObserver?.disconnect();
  spaceObserver.disconnect();
});
</script>

<template>
  <section ref="picture" class="lobby-picture" :aria-labelledby="headingId">
    <h3 :id="headingId">Lobby picture</h3>
    <div ref="frame" class="frame" :style="frameStyle" @scroll.capture="scrolled">
      <RoomArt v-if="art" ref="roomArt" :art="art" :host-view="hostView" :tracking="!pinned" :zoom="zoom" :boxed="false" @cell="cellDrawn" />
    </div>
    <label class="choice"><input type="checkbox" :checked="pinned" @change="pin"> Use this exact position</label>
  </section>
</template>

<style scoped>
section.lobby-picture {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-0);
}
h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}
label.choice {
  display: flex;
  align-items: center;
  gap: 8px;
}
div.frame {
  outline: 1px solid var(--border);
}
div.frame :deep(.room-art) {
  overflow: scroll;   /* both bars always, so their room is known and doesn't come and go with the art */
}
</style>

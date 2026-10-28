<script setup>
import { ref, computed, watch, useTemplateRef, onMounted, onBeforeUnmount, useId } from 'vue';
import { useRoomStore } from '@/store/RoomStore';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { charRowsOf } from '@/lib/Cells';
import { cellGeometry, measureAdvance } from '@/lib/CellCanvas';
import { loadFontFaces } from '@/lib/displayFonts';
import { fontFor, fontOnWire } from '@/social/wire';
import { lobbyWindow } from '@/social/thumbnail';
import RoomArt from './RoomArt.vue';

// What the lobby card shows of the art, as a small frame of the art's full width: about FRAME px wide
// (cells are whole device pixels, so the art comes out near it) and as tall as the card's lines, 2:1
// give or take a line. While the room follows the host's view the frame is RoomArt centered on the lobby window, as the
// thumbnail is made from it; the host's own wheel, key or press in it scrolls it, which pins the window
// to the line it is scrolled to. A scroll the frame makes by itself never pins (only one that comes
// just after a look-around, or while already pinned, is the host's).
const FRAME = 300;
const HOST_SCROLL_MS = 300;   // how soon after a look-around a scroll is the host's
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

// The window rows come from the cell the thumbnail measures (8 device px to the CSS px), so the frame
// shows what the card does: only the cell's aspect matters, and zoom keeps it.
const hostView = computed(() => {
  if (!art.value) return null;
  const { cellWidth, lineHeight } = cellGeometry(advance.value, 8, false, font.value);
  return { col: 0, cols: art.value.cols, ...lobbyWindow(art.value, { cellWidth, lineHeight }, room.lobbyPlace) };
});
const zoom = computed(() => (art.value ? FRAME / (art.value.cols * advance.value) : 1));
const sized = ref(null);   // the art as RoomArt drew it: { width, lineHeight } in CSS px
const frameStyle = computed(() => {
  const rows = hostView.value?.rows ?? 1;
  return { width: `${(sized.value?.width ?? FRAME) + bar.value}px`, height: `${rows * (sized.value?.lineHeight ?? FRAME / 2 / rows)}px` };
});
const pinned = computed(() => room.lobbyPin !== null);

const frameRef = useTemplateRef('frame');
const scroller = () => frameRef.value?.querySelector('.room-art');
const lineHeightOf = (el) => el.firstElementChild.getBoundingClientRect().height / art.value.lines;

// The frame's scrollbar takes room from the art: the frame is that much wider, so the art fits across.
const bar = ref(0);

let hostUntil = 0, sizerObserver = null;
const lookAround = () => { hostUntil = performance.now() + HOST_SCROLL_MS; };
const scrolled = (event) => {
  const el = event.target, now = performance.now();
  if (!pinned.value && now > hostUntil) return;   // RoomArt centering on the view
  hostUntil = now + HOST_SCROLL_MS;               // a drag or a key held keeps going
  room.pinLobby(Math.round(el.scrollTop / lineHeightOf(el)));
};
// The art's size changed: the frame follows it, and a pinned window is held to its line.
const settle = () => {
  const el = scroller();
  if (!el) return;
  const { width, height } = el.firstElementChild.getBoundingClientRect();
  if (!height) return;   // not drawn yet
  sized.value = { width, lineHeight: height / art.value.lines };
  if (pinned.value) el.scrollTop = room.lobbyPin * lineHeightOf(el);
};

const follow = () => {
  room.followLobby();
  scroller()?.focus();   // the button is gone
};

onMounted(() => {
  const el = scroller();
  if (!el) return;
  bar.value = el.offsetWidth - el.clientWidth;
  sizerObserver = new ResizeObserver(settle);
  sizerObserver.observe(el.firstElementChild);
});
onBeforeUnmount(() => sizerObserver?.disconnect());
</script>

<template>
  <section class="lobby-picture" :aria-labelledby="headingId">
    <h3 :id="headingId">Lobby picture</h3>
    <p class="state">{{ pinned ? 'Pinned' : 'Follows your view' }}</p>
    <div ref="frame" class="frame" :style="frameStyle" @scroll.capture="scrolled">
      <RoomArt v-if="art" :art="art" :host-view="hostView" :following="!pinned" :zoom="zoom" :boxed="false" @look-around="lookAround" />
    </div>
    <button v-if="pinned" @click="follow">Follow my view</button>
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
p.state {
  margin: 0;
  color: var(--text-muted);
}
div.frame {
  outline: 1px solid var(--border);
}
div.frame :deep(.room-art) {
  scrollbar-gutter: stable;   /* the scrollbar's room is always there, so the bar's width is known */
}
</style>

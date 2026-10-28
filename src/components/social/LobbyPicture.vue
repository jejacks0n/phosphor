<script setup>
import { ref, computed, watch, nextTick, useTemplateRef, onBeforeUnmount, useId } from 'vue';
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
// give or take a line. While the room follows the host's view the frame is RoomArt centered on the
// lobby window, as the thumbnail is made from it. A scroll that lands half a line or more from where
// following puts the frame is the host's (the wheel, a key, a drag, momentum), and pins the window to
// the line it landed on; a scroll that lands there is RoomArt's own and never pins. Once pinned, any
// scroll moves the pin.
const FRAME = 300;
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

// The top line the frame is scrolled to while following: the window's middle centered, as RoomArt does
// it, held to the art the way the browser holds scrollTop.
const followedTop = (el, lineHeight) => {
  const { row, rows } = hostView.value, most = el.scrollHeight - el.clientHeight;
  return Math.max(0, Math.min((row + rows / 2) * lineHeight - el.clientHeight / 2, most)) / lineHeight;
};
const scrolled = (event) => {
  const el = event.target, lineHeight = lineHeightOf(el);
  if (!lineHeight) return;
  if (!pinned.value && Math.abs(el.scrollTop / lineHeight - followedTop(el, lineHeight)) < 0.5) return;
  room.pinLobby(Math.round(el.scrollTop / lineHeight));
};

// The art's size changed: the frame follows it (once it has, the window is put back at the top of it),
// and a pinned window is held to its line.
let sizerObserver = null;
const settle = async () => {
  const el = scroller();
  if (!el) return;
  const { width, height } = el.firstElementChild.getBoundingClientRect();
  if (!height) return;   // not drawn yet
  sized.value = { width, lineHeight: height / art.value.lines };
  await nextTick();   // the frame's new size
  if (pinned.value) el.scrollTop = room.lobbyPin * lineHeightOf(el);
  else el.scrollTop = followedTop(el, lineHeightOf(el)) * lineHeightOf(el);
};

const follow = () => {
  room.followLobby();
  scroller()?.focus();   // the button is gone
};

// The art's sizer is watched once the art is there (it can come after the frame does).
const artRef = useTemplateRef('roomArt');
watch(artRef, (instance) => {
  sizerObserver?.disconnect();
  const el = instance?.$el;
  if (!el?.classList?.contains('room-art')) return;   // no art, or no WebGL2
  bar.value = el.offsetWidth - el.clientWidth;
  sizerObserver = new ResizeObserver(settle);
  sizerObserver.observe(el.firstElementChild);
}, { flush: 'post' });
onBeforeUnmount(() => sizerObserver?.disconnect());
</script>

<template>
  <section class="lobby-picture" :aria-labelledby="headingId">
    <h3 :id="headingId">Lobby picture</h3>
    <p class="state">{{ pinned ? 'Pinned' : 'Follows your view' }}</p>
    <div ref="frame" class="frame" :style="frameStyle" @scroll.capture="scrolled">
      <RoomArt v-if="art" ref="roomArt" :art="art" :host-view="hostView" :following="!pinned" :zoom="zoom" :boxed="false" />
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

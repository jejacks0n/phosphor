<script>
// Its width in px: the narrowest and widest it drags to, where a double-click puts it, and an arrow key's step.
export const SIDE_PANEL = { min: 240, max: 480, width: 280, step: 16 };

// Fold or open it. The button that did it goes with it (» there, « in EditTabs), so focus follows to the one that's left.
export async function toggleSidePanel(workspace) {
  workspace.sidePanelFolded = !workspace.sidePanelFolded;
  await nextTick();
  document.querySelector('button.panel')?.focus();
}
</script>

<script setup>
import { computed, nextTick, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSessionStorage } from '@vueuse/core';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useRoomStore } from '@/store/RoomStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useSocialStore } from '@/store/SocialStore';
import { toast } from '@/composables/useToast';
import { useTabIndicator } from '@/composables/useTabIndicator';
import ChatPanel from '@/components/social/ChatPanel.vue';
import LobbyPage from '@/components/social/LobbyPage.vue';
import DesktopStartPage from '@/components/social/DesktopStartPage.vue';
import LayersList from '@/components/LayersList.vue';

// The column at the right of the whole app, on a wide screen: LAYERS, and Social, which is CHAT while you're in a
// room. Its left edge drags to resize it (or its arrow keys, a step at a time; a double-click puts it back), and the
// » at the right end of its tabs folds it away entirely; EditTabs then shows « in that same spot, which brings it back
// and counts the messages you haven't seen, as the CHAT tab does while LAYERS shows. Width and fold are kept in the browser; going into a room opens it on CHAT, a reload into
// one shows it as it was (folded or not, on LAYERS or CHAT), and leaving shows the lobby there.

const DESKTOP = import.meta.env.VITE_DESKTOP === '1';   // no lobby: the desktop's start page (your name, Join, Start a room) in its place
const workspace = useWorkspaceStore(), room = useRoomStore(), drawing = useDrawingStore(), social = useSocialStore();
const { t } = useI18n();
const panel = useTemplateRef('panel');

const clamp = (px) => Math.round(Math.min(SIDE_PANEL.max, Math.max(SIDE_PANEL.min, px)));
const width = computed(() => clamp(workspace.sidePanelWidth));
const tab = computed(() => workspace.sidePanelTab);
const chatShown = computed(() => room.inRoom && !workspace.sidePanelFolded && tab.value === 'social');

// Messages (not who came and went), an invitation to draw and (desktop) a join waiting for the host's yes count while the chat isn't showing (sidePanelUnread, which
// the « in EditTabs shows while the panel's folded).
const unread = computed(() => workspace.sidePanelUnread);
watch(chatShown, (shown) => { if (shown) workspace.sidePanelUnread = 0; });
watch(() => room.chat.at(-1)?.id, () => { if (!chatShown.value && room.chat.length && !room.chat.at(-1).presence) workspace.sidePanelUnread++; });
watch(() => drawing.invitation, (asked) => { if (asked && !chatShown.value) workspace.sidePanelUnread++; });
watch(() => room.asks?.length ?? 0, (now, was) => { if (now > was && !chatShown.value) workspace.sidePanelUnread++; });   // no asks on the web

// In a room the panel shows the chat, not the lobby's notice line: what SOCIAL says meanwhile (a Block that failed,
// say) is a toast.
watch(() => social.notice, (notice) => { if (notice && room.inRoom) toast(notice); });

// The tab showing in a room, kept in this browser tab for a reload into it.
const roomTab = useSessionStorage('phosphor.sidePanelRoomTab', 'social');
watch(tab, (name) => { if (room.inRoom) roomTab.value = name; });

// In a room the panel opens on its chat, unless this load is coming back to it (a reload): then it's as it was, the
// fold as kept and the tab that showed. Only the first room of a load is that. Leaving it, focus lost with what held
// it (Exit, End in Settings and stats) goes to the lobby's heading.
let first = true;
watch(() => room.inRoom, async (inRoom, was) => {
  workspace.sidePanelUnread = 0;
  if (inRoom) {
    const back = first && social._roomGoesOn;
    first = false;
    if (back) workspace.sidePanelTab = roomTab.value;
    else {
      workspace.showSocial();
      roomTab.value = 'social';   // (the tab may have been Social already, in the lobby)
    }
    return;
  }
  if (!was) return;
  await nextTick();
  const heading = panel.value?.querySelector('section.lobby h2');
  if (!heading || (document.activeElement && document.activeElement !== document.body)) return;
  heading.tabIndex = -1;
  heading.focus();
}, { immediate: true });

const pick = (name) => { workspace.sidePanelTab = name; };

// The marker along the picked tab's foot, sliding to the tab picked, and placed again wherever the tabs move to.
const tabList = useTemplateRef('tabList');
const { style: markerStyle, update: placeMarker } = useTabIndicator(tabList, '[role="tab"].on');
watch([tab, width, () => workspace.sidePanelFolded, () => room.inRoom, unread], () => nextTick(placeMarker), { immediate: true });

// Resizing: the edge follows the pointer (captured, so it keeps up off the edge), arrows step it.
let drag = null;
function grab(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.currentTarget.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, width: width.value };
}
function move(e) {
  if (drag) workspace.sidePanelWidth = clamp(drag.width + drag.x - e.clientX);
}
const drop = () => { drag = null; };
function key(e) {
  const by = { ArrowLeft: SIDE_PANEL.step, ArrowRight: -SIDE_PANEL.step }[e.key];
  if (by) workspace.sidePanelWidth = clamp(width.value + by);
  else if (e.key === 'Home') workspace.sidePanelWidth = SIDE_PANEL.min;
  else if (e.key === 'End') workspace.sidePanelWidth = SIDE_PANEL.max;
  else return;
  e.preventDefault();
}
</script>

<template>
  <div ref="panel" class="side-panel" :class="{ folded: workspace.sidePanelFolded }" :style="workspace.sidePanelFolded ? null : { width: `${width}px` }">
    <div
        v-if="!workspace.sidePanelFolded"
        class="grip" role="separator" aria-orientation="vertical" tabindex="0" :aria-label="t('sidePanel.resizeAria')"
        :aria-valuenow="width" :aria-valuemin="SIDE_PANEL.min" :aria-valuemax="SIDE_PANEL.max"
        @pointerdown="grab" @pointermove="move" @pointerup="drop" @pointercancel="drop" @lostpointercapture="drop"
        @dblclick="workspace.sidePanelWidth = SIDE_PANEL.width" @keydown="key"
    ></div>
    <div class="body">
      <div class="tabs">
        <div ref="tabList" class="tablist" role="tablist">
        <button role="tab" :aria-selected="tab === 'layers'" :class="{ on: tab === 'layers' }" @click="pick('layers')">{{ t('sidePanel.layers') }}</button>
        <button role="tab" :aria-selected="tab === 'social'" :class="{ on: tab === 'social' }" :aria-description="room.inRoom ? null : t('tabs.beta')" @click="pick('social')">
          {{ room.inRoom ? t('sidePanel.chat') : t('sidePanel.social') }}
          <span v-if="unread" class="unread">{{ unread }}</span>
          <span v-else-if="!room.inRoom" class="beta" aria-hidden="true">{{ t('tabs.beta') }}</span>
        </button>
        <div class="indicator" :style="markerStyle" aria-hidden="true"></div>
        </div>
        <!-- The fold, at the row's right end: folded, EditTabs shows « at this same spot. -->
        <button class="panel link" :aria-label="t('sidePanel.foldAria')" aria-expanded="true" @click="toggleSidePanel(workspace)">»</button>
      </div>
      <aside v-show="tab === 'layers'" class="layers" :aria-label="t('sidePanel.layers')">
        <LayersList/>
      </aside>
      <ChatPanel v-if="room.inRoom" v-show="tab === 'social'" :shown="chatShown"/>
      <component :is="DESKTOP ? DesktopStartPage : LobbyPage" v-else-if="tab === 'social' && social.allowed"/>
    </div>
  </div>
</template>

<style scoped>
div.side-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: 0;
  box-sizing: border-box;
  margin-left: 2px;
  border-radius: 5px;
  background: var(--surface-1);
  font-size: 12px;
  color: var(--text-dim);
}
div.side-panel.folded {   /* folded away: no width at all, EditTabs' « brings it back */
  display: none;
}

/* The left edge, a few px either side of it, drags the width. */
div.grip {
  position: absolute;
  z-index: 2;
  top: 0;
  bottom: 0;
  left: -6px;
  width: 8px;
  cursor: col-resize;
  touch-action: none;
}
div.grip:hover,
div.grip:focus-visible {
  outline: none;
  background: linear-gradient(to right, transparent 3px, var(--accent) 3px, var(--accent) 5px, transparent 5px);
}

.body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
/* Its tabs, unlike the editor's folder tabs (EditTabs.vue): a flat strip in the panel's own color, small spaced caps, the
   picked tab marked by a thin accent line along its foot that slides to the tab picked. */
div.tabs {
  position: relative;
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  box-sizing: border-box;
  height: 38px;
  padding: 0 6px;
  border-radius: 5px 5px 0 0;
  border-bottom: 1px solid var(--border);
}
div.tablist {
  position: relative;
  display: flex;
  flex: 1;
  align-items: stretch;
}
div.tabs button.panel {   /* as EditTabs' « folded, so it keeps its place */
  align-self: flex-start;
  margin: 8.5px 5px 0 4px;   /* puts it where EditTabs' « is (measured) */
  padding: 4px;
  font-size: 14px;
}
div.tabs button[role='tab'] {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: auto;
  padding: 0 12px;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: none;
  font-family: inherit;
  font-size: 11px;
  font-weight: normal;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  transition: color 0.3s ease;
}
div.tabs button[role='tab']:hover { /* not the global button lift */
  transform: none;
  box-shadow: none;
  background: none;
}
div.tabs button[role='tab']:not(.on):hover {
  color: var(--accent);
}
div.tabs button[role='tab']:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
div.tabs button[role='tab'].on {
  font-weight: 600;
  color: var(--text);
}
div.indicator { /* along the picked tab's foot, over the strip's line */
  position: absolute;
  bottom: -1px;
  left: 0;
  height: 2px;
  z-index: 2;
  pointer-events: none;
  transition: width 0.5s cubic-bezier(0.23, 1, 0.32, 1), transform 0.1s ease;
  background: var(--accent);
}
span.beta {   /* raised over the end of SOCIAL */
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 8px;
  font-weight: normal;
  letter-spacing: 0.04em;
  text-transform: lowercase;
  color: var(--accent);
}
aside.layers {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>

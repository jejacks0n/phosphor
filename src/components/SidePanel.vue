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
import LayersList from '@/components/LayersList.vue';

// The column at the right of the whole app, on a wide screen: LAYERS, and Social, which is CHAT while you're in a
// room. Its left edge drags to resize it (or its arrow keys, a step at a time; a double-click puts it back), and the
// » at the right end of its tabs folds it away entirely; EditTabs then shows « in that same spot, which brings it back
// and counts the messages you haven't seen, as the CHAT tab does while LAYERS shows. Width and fold are kept in the browser; going into a room opens it on CHAT, a reload into
// one shows it as it was (folded or not, on LAYERS or CHAT), and leaving shows the lobby there.

const workspace = useWorkspaceStore(), room = useRoomStore(), drawing = useDrawingStore(), social = useSocialStore();
const { t } = useI18n();
const panel = useTemplateRef('panel');

const clamp = (px) => Math.round(Math.min(SIDE_PANEL.max, Math.max(SIDE_PANEL.min, px)));
const width = computed(() => clamp(workspace.sidePanelWidth));
const tab = computed(() => workspace.sidePanelTab);
const chatShown = computed(() => room.inRoom && !workspace.sidePanelFolded && tab.value === 'social');

// Messages (not who came and went) and an invitation to draw count while the chat isn't showing (sidePanelUnread, which
// the « in EditTabs shows while the panel's folded).
const unread = computed(() => workspace.sidePanelUnread);
watch(chatShown, (shown) => { if (shown) workspace.sidePanelUnread = 0; });
watch(() => room.chat.at(-1)?.id, () => { if (!chatShown.value && room.chat.length && !room.chat.at(-1).presence) workspace.sidePanelUnread++; });
watch(() => drawing.invitation, (asked) => { if (asked && !chatShown.value) workspace.sidePanelUnread++; });

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

// The editor tabs' marker, sliding to the tab picked, and placed again wherever the tabs move to.
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
      <LobbyPage v-else-if="tab === 'social' && social.allowed"/>
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
/* Its tabs, as the editor's (EditTabs.vue): a strip of the tab bar's color, the picked tab the panel's own color and open
   into it, marked with the glowing bar along its top. */
div.tabs {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 3px;
  flex-shrink: 0;
  padding: 9px 6px 0;
  border-radius: 5px 5px 0 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface-0);
}
div.tablist {
  position: relative;
  display: flex;
  flex: 1;
  align-items: flex-end;
  gap: 3px;
}
div.tabs button.panel {   /* as EditTabs' « folded, so it keeps its place */
  align-self: center;
  margin: 0 5px 7px 4px;   /* the right and bottom put it where EditTabs' « is (measured, at both) */
  padding: 4px;
  font-size: 14px;
}
div.tabs button[role='tab'] {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  margin-bottom: -1px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-bottom: 1px solid transparent;
  border-radius: 5px 5px 0 0;
  box-shadow: none;
  background: var(--surface-0);
  font-family: inherit;
  font-size: 13px;
  font-weight: normal;
  text-transform: uppercase;
  color: var(--text-muted);
  transition: color 0.3s ease;
}
div.tabs button[role='tab']:hover { /* not the global button lift */
  transform: none;
  box-shadow: none;
  border-color: var(--border) var(--border) transparent;
}
div.tabs button[role='tab']:not(.on):hover {
  background: var(--surface-2);
  color: var(--accent);
}
div.tabs button[role='tab']:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
div.tabs button[role='tab'].on {
  height: 31px;
  font-weight: 500;
  background: var(--surface-1);
  color: var(--text);
  text-shadow: 0 0 5px var(--accent-glow);
}
div.indicator { /* the editor tabs' marker, along the picked tab's top */
  position: absolute;
  top: 0;
  left: 0;
  height: 4px;
  border-radius: 4px 4px 0 0;
  z-index: 2;
  pointer-events: none;
  transition: width 0.5s cubic-bezier(0.23, 1, 0.32, 1), transform 0.1s ease;
  background: var(--accent);
  box-shadow: 0 0 3px var(--accent), 0 0 20px var(--accent);
}
span.beta {   /* as the editor tabs' marks */
  font-size: 8px;
  letter-spacing: 0.04em;
  color: var(--accent);
  align-self: flex-start;
  margin-top: 7px;
}
aside.layers {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>

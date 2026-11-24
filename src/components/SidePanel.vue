<script>
// Its width in px: the narrowest and widest it drags to, where a double-click puts it, and an arrow key's step.
export const SIDE_PANEL = { min: 240, max: 480, width: 280, step: 16 };
const STRIP = 72;   // on a narrow screen, the art left showing beside it at the least (a tap there shuts it)

// Fold or open it (on a narrow screen, over the art or not). The button that did it goes with it (» there, « in
// EditTabs), so focus follows to the one that's left.
export async function toggleSidePanel(workspace, open) {
  workspace.toggleSidePanel(open);
  await nextTick();
  document.querySelector('button.panel')?.focus();
}

// Whether it shows: a wide screen's unless it's folded, a narrow screen's while it's open over the art.
export function useSidePanelShown(workspace) {
  const wide = useMediaQuery(desktopQuery);
  return { wide, shown: computed(() => (wide.value ? !workspace.sidePanelFolded : workspace.sidePanelOpen)) };
}
</script>

<script setup>
import { computed, defineAsyncComponent, nextTick, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMediaQuery, useSessionStorage } from '@vueuse/core';
import { desktopQuery } from '@/social/config';
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
import ArrowIcon from '@/components/ArrowIcon.vue';
import { historyTabShown } from '@/dev/historyTab.js';

// A HISTORY tab listing every step taken (dev/actionLog.js, installed in main.js), in development, or in a built app once
// phosphor.history(true) has been run in the console (dev/historyTab.js). The panel loads lazily, so an app that never
// shows it never loads it.
const historyShown = computed(historyTabShown);
const HistoryPanel = defineAsyncComponent(() => import('@/components/dev/HistoryPanel.vue'));

// The column at the right of the whole app: LAYERS, and Social, which is CHAT while you're in a
// room (and where it's shown, HISTORY, the log of the session's steps). Its left edge drags to resize it (or its arrow keys, a step at a time; a double-click puts it back), and the
// » at the right end of its tabs folds it away entirely; EditTabs then shows « in that same spot, which brings it back
// and counts the messages you haven't seen, as the CHAT tab does while LAYERS shows. In a room a speaker sits left of the », on
// either tab, for the tone for new messages. Width and fold are kept in the browser; going into a room opens it on CHAT, a reload into
// one shows it as it was (folded or not, on LAYERS or CHAT), and leaving shows the lobby there.
// On a narrow screen it comes over the art from the right instead, shut until « opens it, with a strip of the art
// left showing: », Escape or a tap on that strip shuts it. No edge to drag there; going into a room shuts it.

const DESKTOP = import.meta.env.VITE_DESKTOP === '1';   // no lobby: the desktop's start page (your name, Join, Start a room) in its place
const workspace = useWorkspaceStore(), room = useRoomStore(), drawing = useDrawingStore(), social = useSocialStore();
const { t } = useI18n();
const panel = useTemplateRef('panel');

const clamp = (px) => Math.round(Math.min(SIDE_PANEL.max, Math.max(SIDE_PANEL.min, px)));
const width = computed(() => clamp(workspace.sidePanelWidth));
const tab = computed(() => workspace.sidePanelTab);
const { wide, shown } = useSidePanelShown(workspace);
const chatShown = computed(() => room.inRoom && shown.value && tab.value === 'social');
watch(wide, () => { workspace.sidePanelOpen = false; });   // narrowed again, it starts shut

// On a narrow screen Escape shuts it (one in a dialog over it is the dialog's), as a tap on the art beside it does.
function shut(event) {
  if (wide.value || event.defaultPrevented || event.target.closest('dialog')) return;   // the chat box's own (ChatFoot) shut it already
  event.preventDefault();
  toggleSidePanel(workspace, false);
}

// Messages (not who came and went, nor those from before you came in), an invitation to draw and (desktop) a join waiting for the host's yes count while the chat isn't showing (sidePanelUnread, which
// the « in EditTabs shows while the panel's folded).
const unread = computed(() => workspace.sidePanelUnread);
watch(chatShown, (shown) => { if (shown) workspace.sidePanelUnread = 0; });
watch(() => room.chat.at(-1)?.id, (id) => { if (!chatShown.value && room.chat.length && !room.chat.at(-1).presence && id !== room.joinedAt) workspace.sidePanelUnread++; });   // not what came before you did
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
      if (wide.value) workspace.showSocial();
      else Object.assign(workspace, { sidePanelTab: 'social', sidePanelOpen: false });   // a narrow screen's shuts, for the art you came for: « counts what's said
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
watch(historyShown, (shown) => { if (!shown && tab.value === 'history') pick('layers'); });   // hidden while it shows

// The marker along the picked tab's foot, sliding to the tab picked, and placed again wherever the tabs move to.
const tabList = useTemplateRef('tabList');
const { style: markerStyle, update: placeMarker } = useTabIndicator(tabList, '[role="tab"].on');
watch([tab, width, shown, () => room.inRoom, unread], () => nextTick(placeMarker), { immediate: true });

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
  <div v-if="!wide && shown" class="scrim" @pointerdown.prevent="toggleSidePanel(workspace, false)" @touchstart.prevent></div>
  <div ref="panel" class="side-panel" :class="{ folded: !shown, overlay: !wide }" :style="shown ? { width: wide ? `${width}px` : `min(${width}px, calc(100vw - ${STRIP}px))` } : null" @keydown.esc="shut">
    <div
        v-if="shown && wide"
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
        <!-- An icon, not a word: a tool for bug reports shouldn't crowd the real tabs. -->
        <button v-if="historyShown" role="tab" class="icon" aria-label="History" title="History" :aria-selected="tab === 'history'" :class="{ on: tab === 'history' }" @click="pick('history')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
            <path d="M12 7v5l4 2"/>
          </svg>
        </button>
        <div class="indicator" :style="markerStyle" aria-hidden="true"></div>
        </div>
        <!-- In a room, the speaker that turns the tone for new messages off and on (RoomStore.chime), on either tab. -->
        <button v-if="room.inRoom" class="tone link" :aria-label="t('social.chat.toneAria')" :title="t('social.chat.toneAria')" :aria-pressed="workspace.chatTone" @click="workspace.chatTone = !workspace.chatTone">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"/>
            <path v-if="workspace.chatTone" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424"/>
            <path v-else d="M17.25 9.75 21.75 14.25M21.75 9.75l-4.5 4.5"/>
          </svg>
        </button>
        <!-- The fold, at the row's right end: folded, EditTabs shows « at this same spot. -->
        <button class="panel link" :aria-label="t('sidePanel.foldAria')" aria-expanded="true" @click="toggleSidePanel(workspace)"><ArrowIcon shape="double" :size="10"/></button>
      </div>
      <aside v-show="tab === 'layers'" class="layers" :aria-label="t('sidePanel.layers')">
        <LayersList/>
      </aside>
      <ChatPanel v-if="room.inRoom" v-show="tab === 'social'" :shown="chatShown"/>
      <component :is="DESKTOP ? DesktopStartPage : LobbyPage" v-else-if="tab === 'social' && social.allowed"/>
      <HistoryPanel v-if="historyShown && tab === 'history'"/>
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
/* A narrow screen's: over the art from the right, as the settings drawer comes from the left, with a strip of the art
   left showing; a press on it (the scrim over it) shuts the panel, a swipe as a tap, and nothing under it sees it:
   its touches canceled, no mouse events or click land on the art once it has gone. */
div.side-panel.overlay {
  position: fixed;
  z-index: 2001;   /* over the art's own layers (the overlays and cursors are 1001) */
  top: 0;
  right: 0;
  bottom: 0;
  margin: 0;
  padding-right: env(safe-area-inset-right, 0px);
  border-radius: 0;
  box-shadow: -4px 0 12px color-mix(in srgb, var(--shadow) 40%, transparent);
  transition: transform 0.2s ease;
}
@starting-style {
  div.side-panel.overlay {
    transform: translateX(100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  div.side-panel.overlay {
    transition: none;
  }
}
div.side-panel.overlay div.tabs button.tone {   /* beside it, a finger's size too */
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
}
div.side-panel.overlay div.tabs button.panel {   /* as EditTabs' « on a narrow screen: a finger's size */
  display: flex;
  align-self: center;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  height: 36px;
  margin: 0 -6px 0 0;
}
div.scrim {
  position: fixed;
  z-index: 2000;
  inset: 0;
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
div.tabs button.tone {
  display: flex;
  align-self: center;
  padding: 4px;
  color: var(--text-muted);
}
div.tabs button.tone[aria-pressed='false'] {
  color: var(--text-faint);
}
div.tabs button.tone:hover {
  color: var(--text);
}
div.tabs button.panel {   /* as EditTabs' « folded, so it keeps its place */
  display: flex;
  align-self: flex-start;
  margin: 10.5px 5px 0 4px;   /* 0.5px under the row's middle, 1px under EditTabs' « folded (measured) */
  padding: 4px;
}
div.tabs button[role='tab'] {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: auto;
  padding: 4px 12px 0;   /* its words 2px under its middle, level with EditTabs' Animate beside them; the tab as tall as the strip all the same */
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
div.tabs button[role='tab'].icon {
  padding: 4px 10px 0;
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
  top: 8px;
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

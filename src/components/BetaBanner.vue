<script setup>
import { useI18n } from 'vue-i18n';
import { buildStage } from '@/lib/buildStage.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

// A small CRT screen under the settings panel's logo on a pre-release build (lib/buildStage.js has which builds are):
// BETA or ALPHA lit between shade blocks, and under it the link that opens the issue report (IssueReportDialog.vue),
// both in the art's own font at its own size, a cell to a line. It says what the build is, so there's nothing to dismiss
// it with, and a released build has none of it. On a phone it's in the drawer, where the panel is.
// The screen is its own surface: dark glass lit a little by its phosphor, the same behind any theme, with the theme's
// accent as its ink (so a plugin's theme recolors it). Scanlines run across it, the word flickers now and then, and a
// refresh bar rolls slowly down; all three hold still for someone who asks for less motion. The shade blocks are its
// dressing, not read out.
const { t } = useI18n();
const workspace = useWorkspaceStore();
const stage = buildStage();
</script>

<template>
  <p v-if="stage" class="stage">
    <span class="name"><span aria-hidden="true">▓▒░ </span>{{ t(`issueReport.stage.${stage}`) }}<span aria-hidden="true"> ░▒▓</span></span>
    <button @click="workspace.issueReportOpen = true">{{ t('issueReport.link') }}</button>
  </p>
</template>

<style scoped>
p.stage {
  --ink: var(--accent-hot);
  --glass: #1c1c1f;
  position: relative;
  flex: none; /* the panel is a column that shrinks what it can: the screen keeps its two lines */
  margin: -2px 0 4px;
  padding: 10px 0 11px;
  overflow: hidden;
  border-radius: 9px / 12px; /* a tube's corners: rounder down the sides */
  background: radial-gradient(ellipse at 50% 45%, color-mix(in srgb, var(--ink) 24%, var(--glass)) 0%, color-mix(in srgb, var(--ink) 9%, var(--glass)) 100%);
  box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.5), 0 0 0 1px color-mix(in srgb, var(--ink) 45%, #000), 0 0 12px color-mix(in srgb, var(--ink) 20%, transparent);
  font: 16px/16px 'IBM VGA 8x16', 'JetBrains Mono', monospace;
  letter-spacing: 0;
  text-align: center;
  white-space: pre;
}
/* Scanlines: every other pixel row dimmed, over the glass and what's lit on it. */
p.stage::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(to bottom, transparent 0 1px, rgba(0, 0, 0, 0.3) 1px 2px);
}
/* The refresh bar: a faint lighter band rolling down. */
p.stage::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 40%;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.07), transparent);
  animation: refresh 6s linear infinite;
}
span.name {
  display: block;
  text-transform: uppercase;
  color: var(--ink);
  text-shadow: 0 0 4px var(--ink), 0 0 12px color-mix(in srgb, var(--ink) 55%, transparent);
  animation: flicker 6s steps(1) infinite;
}
/* A link in the screen's own letters, not a button's look. */
button {
  display: block;
  margin: 2px auto 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none !important;
  background: transparent;
  font: inherit;
  letter-spacing: 0;
  color: color-mix(in srgb, var(--ink) 50%, #888);
  cursor: pointer;
  transition: none;
}
button:hover {
  transform: none;
  background: transparent;
}
@media (hover: hover) { /* a tap on a touch screen leaves no hover look behind */
  button:hover {
    color: var(--ink);
    text-shadow: 0 0 6px var(--ink);
  }
}
/* Under a finger it takes a press a little above and below its words; where it sits doesn't change. */
@media (pointer: coarse) {
  button {
    padding: 8px 12px;
    margin: -6px auto -8px;
  }
}
@keyframes refresh {
  from { transform: translateY(-110%); }
  to { transform: translateY(280%); }
}
@keyframes flicker {
  0%, 100% { opacity: 1; }
  90% { opacity: 0.7; }
  91% { opacity: 1; }
  94% { opacity: 0.82; }
  95% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  p.stage::before { display: none; }
  span.name { animation: none; }
}
</style>

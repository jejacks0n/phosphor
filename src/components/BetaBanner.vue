<script setup>
import { useI18n } from 'vue-i18n';
import { buildStage } from '@/lib/buildStage.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

// One quiet line under the settings panel's logo on a pre-release build (lib/buildStage.js has which builds are):
// BETA or ALPHA, and the link that opens the issue report (IssueReportDialog.vue). It says what the build is, so
// there's nothing to dismiss it with, and a released build has none of it. On a phone it's in the drawer, where the
// panel is.
const { t } = useI18n();
const workspace = useWorkspaceStore();
const stage = buildStage();
</script>

<template>
  <p v-if="stage" class="stage">
    <span class="name">{{ t(`issueReport.stage.${stage}`) }}</span> · <button @click="workspace.issueReportOpen = true">{{ t('issueReport.link') }}</button>
  </p>
</template>

<style scoped>
p.stage {
  margin: -6px 0 0; /* up under the logo, whose own margin keeps the settings off it */
  text-align: center;
  font-size: 11px;
  color: var(--text-faint);
}
span.name {
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}
/* A link in the line's own words, not a button's look. */
button {
  padding: 0;
  border: none;
  box-shadow: none !important;
  background: transparent;
  font: inherit;
  color: var(--text-muted);
  text-decoration: underline;
  cursor: pointer;
}
button:hover {
  transform: none;
  background: transparent;
}
@media (hover: hover) { /* a tap on a touch screen leaves no hover look behind */
  button:hover {
    color: var(--accent-hot);
  }
}
/* Under a finger it takes a press a little above and below its words; where it sits doesn't change. */
@media (pointer: coarse) {
  button {
    padding-block: 9px;
    margin-block: -9px;
  }
}
</style>

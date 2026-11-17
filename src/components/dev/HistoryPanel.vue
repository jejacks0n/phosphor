<script setup>
// Development only (SidePanel's HISTORY tab, behind import.meta.env.DEV): the session's steps from dev/actionLog.js, newest
// at the bottom and kept scrolled there; Copy puts the whole log, headed by the build, browser and viewport, on the
// clipboard for a bug report; Clear starts it over. No translations: it never ships.
import { nextTick, useTemplateRef, watch } from 'vue';
import { clearLog, log, logText } from '@/dev/actionLog.js';
import { toast } from '@/composables/useToast';

const { version, sha } = __BUILD__;
const list = useTemplateRef('list');
watch(() => log.entries.length, async () => {
  await nextTick();
  if (list.value) list.value.scrollTop = list.value.scrollHeight;
});

function copy() {
  const text = logText({ version, sha, userAgent: navigator.userAgent, viewport: `${window.innerWidth}×${window.innerHeight}` });
  navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast('Copy failed'));
}
</script>

<template>
  <aside class="history" aria-label="History">
    <ol ref="list">
      <li v-for="(entry, i) in log.entries" :key="i" :class="{ error: entry.kind === 'error' }">
        <time>+{{ (entry.at / 1000).toFixed(1) }}s</time>
        <span class="text">{{ entry.text }}</span>
        <span v-if="entry.count > 1" class="count">×{{ entry.count }}</span>
        <span v-if="entry.args" class="args">{{ entry.args }}</span>
      </li>
    </ol>
    <div class="foot">
      <button class="copy link" @click="copy">Copy</button>
      <button class="clear link" @click="clearLog">Clear</button>
    </div>
  </aside>
</template>

<style scoped>
aside.history {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
ol {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 4px 8px;
  overflow: auto;
  list-style: none;
  font-family: var(--display-font-family);
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-dim);
}
li {
  display: flex;
  gap: 6px;
  white-space: nowrap;
}
li.error {
  color: var(--danger);
}
time {
  flex-shrink: 0;
  width: 5ch;
  text-align: right;
  color: var(--text-muted);
}
span.count {
  color: var(--accent);
}
span.args {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-muted);
}
div.foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 4px 8px;
  border-top: 1px solid var(--border);
}
</style>

<script>
import { reactive } from 'vue';

// What's been written, kept while the page is: a dialog shut by a stray Escape opens again with it. Sent, it's cleared.
const draft = reactive({ doing: '', wrong: '' });
</script>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/ProjectStore';
import { useRoomStore } from '@/store/RoomStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { log, logText } from '@/dev/actionLog.js';
import { MOST_DOING, MOST_REQUEST_BYTES, MOST_WRONG, TURNSTILE_ACTION, agentLine, buildLine, drawingFits, sendIssueReport } from '@/lib/issueReport.js';
import { PROJECT_EXTENSION } from '@/document/projectIO';
import { issueReportWords } from '@/social/messages';
import { mountTurnstile } from '@/social/turnstile';
import { desktop } from '@/social/desktop';
import ModalDialog from '@/components/ModalDialog.vue';
import FieldCount from '@/components/FieldCount.vue';

// Report an issue, from a pre-release build's banner (BetaBanner): what you were doing, what went wrong, and whether to
// send the drawing and the session's steps with it (lib/issueReport.js has what goes, and where). This is a bug report
// to Phosphor's developer; a report of a person or a room is SOCIAL's own (social/ReportDialog.vue). What's written
// becomes a public issue, which the note above Send says, with the build and browser that go with it; the drawing and
// the steps don't. Nothing is sent until Send. The checkbox is on, and the line under it says exactly what it sends: the
// drawing's name and size and how many steps; a drawing too big for a report isn't sent, and says so; with none open,
// only the steps. In a room the drawing open is the room's for its host and its artists, and the line says so; someone
// only watching still has their own drawing open, and it's that one. The drawing is made ready as the dialog opens (the
// .pho Save would write, with nothing saved: ProjectStore.projectFile), so its size is known before Send.
// Sent, the form gives way to a thank-you with the issue's number, linked, or without one if the issue isn't open yet.
// One that didn't go says why and keeps what was written. Escape, Cancel and × close it; the backdrop doesn't, with
// words typed in it. Focus goes back to the banner's link.
const DESKTOP = import.meta.env.VITE_DESKTOP === '1';
const REPO = 'https://github.com/jejacks0n/phosphor';
const emit = defineEmits(['close']);
const { t } = useI18n();
const project = useProjectStore(), room = useRoomStore(), drawing = useDrawingStore();

const include = ref(true);
const sending = ref(false);
const error = ref(null);
const sent = ref(null); // the server's answer once it's gone: { issue }

// What goes with the text always: which Phosphor this is, and the browser and system as a short line.
const { version, sha, packageVersion } = __BUILD__;
const build = buildLine({ version, sha });
const agent = agentLine(navigator.userAgent);

// Each field stops at its most (its maxlength, a line break one character, as the server counts it). Send waits for
// What went wrong?, and holds for a field put past its most some other way than typing.
const ready = computed(() => draft.wrong.trim() !== '' && draft.doing.length <= MOST_DOING && draft.wrong.length <= MOST_WRONG && !sending.value);

// The steps, as the HISTORY tab's Copy has them, and the drawing: undefined until it's made, null with none open.
const stepsText = () => logText({ version, sha, userAgent: navigator.userAgent, viewport: `${window.innerWidth}×${window.innerHeight}` });
const bytesOf = (text) => new Blob([text]).size;
const roomsDrawing = room.role === 'host' || drawing.mayDraw;
const file = shallowRef(undefined);
const made = Promise.resolve().then(() => project.projectFile())
  .then((blob) => blob && new File([blob], `${project.filename}${PROJECT_EXTENSION}`, { type: 'image/png' }), () => null);
made.then((it) => { file.value = it; });
const fits = (it, steps) => drawingFits(it.size, bytesOf(steps));

const size = (bytes) => (bytes < 2 ** 20 ? t('versions.kb', { n: Math.max(1, Math.round(bytes / 1024)) }) : t('versions.mb', { n: (bytes / 2 ** 20).toFixed(1) }));
const what = computed(() => {
  const steps = t('issueReport.steps', { count: log.entries.length }, log.entries.length);
  if (file.value === undefined) return t('issueReport.what.preparing');
  if (!file.value) return t('issueReport.what.stepsOnly', { steps });
  const key = `${roomsDrawing ? 'room' : 'drawing'}${fits(file.value, stepsText()) ? '' : 'TooBig'}`;
  return t(`issueReport.what.${key}`, { name: file.value.name, size: size(file.value.size), most: size(MOST_REQUEST_BYTES), steps });
});

// The web build's check that a person is sending it, shown only if it needs them. A widget that doesn't load leaves the
// token null, and the server says what it thinks of that. The desktop app has none.
const widget = useTemplateRef('widget');
let token = () => null;
onMounted(() => { if (!DESKTOP) mountTurnstile(widget.value, TURNSTILE_ACTION, { appearance: 'interaction-only' }).then((get) => { token = get; }, () => {}); });
onBeforeUnmount(() => token.remove?.());

const done = useTemplateRef('done');
async function send() {
  if (!ready.value) return;
  [sending.value, error.value] = [true, null];
  const steps = include.value ? stepsText() : null;
  const its = include.value ? await made : null;
  const answer = await sendIssueReport({
    fields: { doing: draft.doing.trim(), wrong: draft.wrong.trim(), packageVersion, build, platform: DESKTOP ? 'desktop' : 'web', agent },
    token: token(), drawing: its && fits(its, steps) ? its : null, steps,
  }, { desktop: DESKTOP ? desktop : null });
  sending.value = false;
  if (!answer.ok) {
    error.value = issueReportWords(answer.error);
    return;
  }
  sent.value = answer;
  Object.assign(draft, { doing: '', wrong: '' });
  await nextTick();
  done.value?.focus();
}

function close() {
  if (sending.value) return; // it's on its way: the answer comes first
  emit('close');
  nextTick(() => document.querySelector('aside.control-panel p.stage button')?.focus()); // once it's gone: while it's up, the rest can't take focus
}
</script>

<template>
  <ModalDialog long closable :title="t('issueReport.title')" @cancel="close">
    <!-- There from the start, so its words are read out when they come. -->
    <p class="sent" role="status">
      <i18n-t v-if="sent?.issue" keypath="issueReport.sentIssue" tag="span">
        <template #issue>
          <a :href="`${REPO}/issues/${sent.issue}`" target="_blank" rel="noopener">{{ t('issueReport.issue', { number: sent.issue }) }}</a>
        </template>
      </i18n-t>
      <template v-else-if="sent">{{ t('issueReport.sent') }}</template>
    </p>
    <div v-if="sent" class="actions">
      <button ref="done" class="primary" @click="close">{{ t('common.close') }}</button>
    </div>
    <form v-else @submit.prevent="send">
      <div class="counted">
        <label for="issue-doing">{{ t('issueReport.doing') }}</label>
        <FieldCount id="issue-doing-count" :count="draft.doing.length" :most="MOST_DOING" />
      </div>
      <textarea id="issue-doing" v-model="draft.doing" rows="3" :maxlength="MOST_DOING" aria-describedby="issue-doing-count"></textarea>

      <div class="counted">
        <label for="issue-wrong">{{ t('issueReport.wrong') }}</label>
        <FieldCount id="issue-wrong-count" :count="draft.wrong.length" :most="MOST_WRONG" />
      </div>
      <textarea id="issue-wrong" v-model="draft.wrong" rows="5" required :maxlength="MOST_WRONG" aria-describedby="issue-wrong-count"></textarea>

      <label class="include"><input v-model="include" type="checkbox" aria-describedby="issue-what"> {{ t('issueReport.include') }}</label>
      <p id="issue-what" class="what" :class="{ off: !include }">{{ what }}</p>

      <div v-if="!DESKTOP" ref="widget" class="turnstile"></div>
      <p class="public">{{ t('issueReport.public') }}</p>
      <p class="with">{{ t('issueReport.with', { build, agent }) }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" :disabled="sending" @click="close">{{ t('common.cancel') }}</button>
        <button type="submit" class="primary" :disabled="!ready">{{ sending ? t('issueReport.sending') : t('issueReport.send') }}</button>
      </div>
    </form>
  </ModalDialog>
</template>

<style scoped>
form {
  display: flex;
  flex-direction: column;
  margin-top: 12px; /* off the title */
}
div.counted {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
div.counted label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--accent-hot);
}
textarea {
  height: auto; /* its rows, not a one-line field's height */
  min-height: 34px;
  margin-bottom: 14px;
  resize: vertical;
  line-height: 1.4;
}
p {
  margin: 0;
  font-size: 13px;
}
label.include {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
p.what {
  margin: 4px 0 14px 24px; /* under the checkbox's words */
  font-size: 12px;
  color: var(--text-muted);
}
p.what.off {
  text-decoration: line-through;
}
div.turnstile:not(:empty) {
  margin-bottom: 14px;
}
p.public {
  font-weight: 600;
  color: var(--text);
}
p.with {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
}
p.error {
  margin-top: 12px;
  color: var(--danger);
}
p.sent:not(:empty) {
  margin: 12px 0 16px; /* off the title, as the form is */
  font-size: 14px;
}
p.sent a {
  color: var(--accent);
  text-decoration: underline;
}
div.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>

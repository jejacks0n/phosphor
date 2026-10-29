<script setup>
import { ref, computed, nextTick, onUnmounted } from 'vue';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { REASONS } from '@/social/chat';
import ModalDialog from '@/components/ModalDialog.vue';

// Report a person, for a message (messageId) or from the host's N here, or with `room` the room itself, from
// inside it (beside Exit) or from its lobby card: one reason, required. Sent, the
// dialog gives way to "Reported" for a few seconds (in a status line that's there from the start, so it's
// read out); one that can't be sent leaves the dialog as it is.
// Cancel, Escape and the backdrop send nothing; while a room report makes its picture, they wait. Focus goes back to `trigger`, or (that gone, as a message's
// Report is once you've reported them) to `back`, else the "N here" button or the messages.
const props = defineProps({
  name: { type: String, default: null },
  sub: { type: String, default: null },
  messageId: { type: String, default: null },
  room: { type: Object, default: null },   // { id, from: 'inside' | 'lobby' }: a report of the room
  trigger: { default: null },   // the element that opened it
  back: { default: null },      // where focus goes when the trigger has gone
});
const emit = defineEmits(['done']);
const roomStore = useRoomStore(), social = useSocialStore();
const SHOWN_MS = 4000;

const title = computed(() => (props.room ? 'Report this room?' : `Report ${props.name}?`));
const says = computed(() => (!props.room ? 'Phosphor\'s admin sees this message and the few before it.'
  : props.room.from === 'inside' ? 'Phosphor\'s admin sees the room\'s last lobby pictures and a picture of what you see now.'
    : 'Phosphor\'s admin sees the room\'s last lobby pictures.'));

const reason = ref(null);
const sent = ref(false);
const sending = ref(false);
let timer = null;
onUnmounted(() => clearTimeout(timer));

const focusBack = () => (props.trigger?.isConnected ? props.trigger : props.back ?? document.querySelector('.chat button.here, .chat [role=log]'))?.focus();
const cancel = () => {
  if (sending.value) return;
  focusBack();
  emit('done');
};
const send = () => (!props.room ? roomStore.report({ sub: props.sub, messageId: props.messageId, reason: reason.value })
  : props.room.from === 'inside' ? roomStore.reportRoom(reason.value)
    : social.reportRoom(props.room.id, reason.value));
function reported(ok) {
  if (!ok) return;
  sent.value = true;
  nextTick(focusBack);   // once the Report it came from is gone (you reported them)
  timer = setTimeout(() => emit('done'), SHOWN_MS);
}
function report() {
  if (sent.value || sending.value) return;
  const result = send();
  if (!(result instanceof Promise)) return reported(result);
  sending.value = true;   // reportRoom from inside waits for its picture
  result.then((ok) => {
    sending.value = false;
    reported(ok);
  });
}
</script>

<template>
  <Teleport to="body">
    <p class="reported" role="status">{{ sent ? 'Reported. Thank you.' : '' }}</p>
  </Teleport>
  <ModalDialog v-if="!sent" :title="title" :sub="says" @cancel="cancel">
    <fieldset>
      <legend>What's wrong?</legend>
      <label v-for="r in REASONS" :key="r.id"><input v-model="reason" type="radio" name="report-reason" :value="r.id"> {{ r.label }}</label>
    </fieldset>
    <div class="actions">
      <button class="danger" :disabled="!reason || sending" @click="report">Report</button>
      <button :disabled="sending" @click="cancel">Cancel</button>
    </div>
  </ModalDialog>
</template>

<style scoped>
fieldset {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 14px;
  padding: 0;
  border: 0;
  font-size: 13px;
}
legend {
  margin-bottom: 6px;
  padding: 0;
  font-weight: 600;
}
label {
  display: flex;
  align-items: center;
  gap: 8px;
}
div.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
p.reported {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1000;
  margin: 0;
  padding: 12px 18px;
  transform: translate(-50%, -50%);
  background: var(--surface-0);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  color: var(--text);
  font-size: 13px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
}
p.reported:empty {   /* waiting for its words: there for screen readers, not seen */
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>

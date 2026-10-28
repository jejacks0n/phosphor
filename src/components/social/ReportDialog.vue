<script setup>
import { ref, onUnmounted } from 'vue';
import { useRoomStore } from '@/store/RoomStore';
import { REASONS } from '@/social/chat';
import ModalDialog from '@/components/ModalDialog.vue';

// Report a person, for a message (messageId) or from the host's N here: one reason, required. Sent, the
// dialog gives way to "Reported" for a few seconds (in a status line that's there from the start, so it's
// read out); one that can't be sent leaves the dialog as it is.
// Cancel, Escape and the backdrop send nothing. Focus goes back to `trigger`, or (that gone) to the
// "N here" button or the messages.
const props = defineProps({
  name: { type: String, required: true },
  sub: { type: String, required: true },
  messageId: { type: String, default: null },
  trigger: { default: null },   // the element that opened it
});
const emit = defineEmits(['done']);
const room = useRoomStore();
const SHOWN_MS = 4000;

const reason = ref(null);
const sent = ref(false);
let timer = null;
onUnmounted(() => clearTimeout(timer));

const focusBack = () => (props.trigger?.isConnected ? props.trigger : document.querySelector('.chat button.here, .chat [role=log]'))?.focus();
const cancel = () => {
  focusBack();
  emit('done');
};
function report() {
  if (sent.value) return;
  if (!room.report({ sub: props.sub, messageId: props.messageId, reason: reason.value })) return;
  sent.value = true;
  focusBack();
  timer = setTimeout(() => emit('done'), SHOWN_MS);
}
</script>

<template>
  <Teleport to="body">
    <p class="reported" role="status">{{ sent ? 'Reported. Thank you.' : '' }}</p>
  </Teleport>
  <ModalDialog v-if="!sent" :title="`Report ${name}?`"
      sub="Phosphor's admin sees this message and the few before it. Nobody is told who reported them." @cancel="cancel">
    <fieldset>
      <legend>What's wrong?</legend>
      <label v-for="r in REASONS" :key="r.id"><input v-model="reason" type="radio" name="report-reason" :value="r.id"> {{ r.label }}</label>
    </fieldset>
    <div class="actions">
      <button class="danger" :disabled="!reason" @click="report">Report</button>
      <button @click="cancel">Cancel</button>
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

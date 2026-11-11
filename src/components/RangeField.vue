<script setup>
import { ref, computed } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import HelpInfo from '@/components/HelpInfo.vue';
import { t } from '@/i18n';

// One slider from a settings-schema entry (src/store/settings.js). Unstyled: the container
// (e.g. ControlPanel) styles .field/.label-row/.value with :deep() so each context can differ.
const props = defineProps({
  setting: { type: Object, required: true },
  modelValue: { type: [Number, String], default: 0 },
  compact: { type: Boolean, default: false }, // toolbar style: just label + slider (tooltip shows the value; setting.readout: beside it too)
});
const emit = defineEmits(['update:modelValue', 'commit']); // commit({ nudge }): a drag ended, or a key nudged it (undo steps)

// On touch layouts, dragging only updates the readout; the value commits on release.
const commitOnRelease = useMediaQuery('(max-width: 768px)');
const draft = ref(null);
let pointing = false; // a pointer drag, not a key

const value = computed(() => draft.value ?? props.modelValue);
const percent = computed(() => ((value.value - props.setting.min) / (props.setting.max - props.setting.min)) * 100);
// A setting with an off value (Posterize, Threshold) says Off there.
const formatted = computed(() => (props.setting.off !== undefined && Number(value.value) === props.setting.off
  ? t('common.off')
  : Number(value.value).toFixed(props.setting.decimals ?? 0) + (props.setting.unit ?? '')));
const ticksId = computed(() => (props.setting.ticks ? `ticks-${props.setting.key}` : undefined));

function onInput(event) {
  draft.value = event.target.value;
  if (commitOnRelease.value) return;
  emit('update:modelValue', Number(event.target.value));
  draft.value = null;
}

function commit(event) {
  emit('update:modelValue', Number(event.target.value));
  draft.value = null;
  emit('commit', { nudge: !pointing });
  pointing = false;
}
</script>

<template>
  <template v-if="compact">
    <label :for="setting.key">{{ setting.label }}</label>
    <div class="range-wrapper" :style="{ '--percent': percent }">
      <input
          type="range"
          :id="setting.key"
          :title="setting.title"
          :min="setting.min"
          :max="setting.max"
          :step="setting.step"
          :value="value"
          @input="onInput"
          @change="commit"
            @pointerdown="pointing = true"
      >
      <span class="value-tooltip">{{ formatted }}</span>
    </div>
    <span v-if="setting.readout" class="readout">{{ formatted }}</span>
  </template>
  <div v-else class="field">
    <div class="label-row">
      <div v-if="setting.help" class="label-group">
        <label :for="setting.key">{{ setting.label }}</label>
        <HelpInfo :name="setting.label" :text="setting.help"/>
      </div>
      <label v-else :for="setting.key">{{ setting.label }}</label>
      <span class="value">{{ formatted }}</span>
    </div>
    <div class="row-inputs">
      <div class="range-wrapper" :style="{ '--percent': percent }">
        <input
            type="range"
            :id="setting.key"
            :title="setting.title"
            :min="setting.min"
            :max="setting.max"
            :step="setting.step"
            :value="value"
            :list="ticksId"
            @input="onInput"
            @change="commit"
            @pointerdown="pointing = true"
        >
        <span class="value-tooltip">{{ formatted }}</span>
      </div>
      <slot/>
    </div>
    <datalist v-if="ticksId" :id="ticksId">
      <option v-for="tick in setting.ticks" :key="tick" :value="tick"></option>
    </datalist>
  </div>
</template>

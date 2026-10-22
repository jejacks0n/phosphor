<script setup>
import { ref, computed } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import HelpInfo from '@/components/HelpInfo.vue';

// One slider from a settings-schema entry (src/store/settings.js). Unstyled: the container
// (e.g. ControlPanel) styles .field/.label-row/.value with :deep() so each context can differ.
const props = defineProps({
  setting: { type: Object, required: true },
  modelValue: { type: [Number, String], default: 0 },
  compact: { type: Boolean, default: false }, // toolbar style: just label + slider (tooltip shows the value)
});
const emit = defineEmits(['update:modelValue']);

// On touch layouts, dragging only updates the readout; the value commits on release.
const commitOnRelease = useMediaQuery('(max-width: 768px)');
const draft = ref(null);

const value = computed(() => draft.value ?? props.modelValue);
const percent = computed(() => ((value.value - props.setting.min) / (props.setting.max - props.setting.min)) * 100);
const formatted = computed(() => Number(value.value).toFixed(props.setting.decimals ?? 0) + (props.setting.unit ?? ''));
const ticksId = computed(() => (props.setting.ticks ? `ticks-${props.setting.key}` : undefined));

function onInput(event) {
  draft.value = event.target.value;
  if (!commitOnRelease.value) commit(event);
}

function commit(event) {
  emit('update:modelValue', Number(event.target.value));
  draft.value = null;
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
      >
      <span class="value-tooltip">{{ formatted }}</span>
    </div>
  </template>
  <div v-else class="field">
    <div class="label-row">
      <div v-if="setting.help" class="label-group">
        <label :for="setting.key">{{ setting.label }}</label>
        <HelpInfo :text="setting.help"/>
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

<script setup>
import { computed } from 'vue';
import RangeField from '@/components/RangeField.vue';

// A plugin solver's options, drawn from what it declares (plugins/solvers.js): a slider, a checkbox, a color or a choice each,
// in the plugin's own words, shown as text and never translated. Each change emits change(values), every option's value
// with the one changed; commit({ nudge }) ends it, for the undo step: a slider's drag or nudge as RangeField's, a
// checkbox or a choice at once. The container (ControlPanel) styles .field and its label.
const props = defineProps({
  options: { type: Array, required: true },
  values: { type: Object, required: true },
  idPrefix: { type: String, default: 'solver' }, // the fields' ids are this and each option's id: a plugin filter's group has its own
});
const emit = defineEmits(['change', 'commit']);

const idOf = (option) => `${props.idPrefix}-${option.id}`;
const decimals = (step) => (String(step).split('.')[1] ?? '').length;
const setting = (option) => ({ key: idOf(option), label: option.name, min: option.min, max: option.max, step: option.step, decimals: decimals(option.step) });
// The colors right after a slider sit in its slot, beside the slider, as ControlPanel puts Edges' color.
const colorsAfter = (option) => {
  const list = [];
  for (let i = props.options.indexOf(option) + 1; props.options[i]?.kind === 'color'; i++) list.push(props.options[i]);
  return list;
};
const inSlot = computed(() => new Set(props.options.flatMap((option) => (option.kind === 'slider' ? colorsAfter(option) : []))));
const set = (option, value) => emit('change', { ...props.values, [option.id]: value });
function pick(option, value) {
  set(option, value);
  emit('commit', {});
}
</script>

<template>
  <div class="solver-options">
    <template v-for="option in props.options" :key="option.id">
      <RangeField
          v-if="option.kind === 'slider'" :setting="setting(option)" :model-value="props.values[option.id]"
          @update:model-value="set(option, $event)" @commit="emit('commit', $event)"
      >
        <input
            v-for="color in colorsAfter(option)" :id="idOf(color)" :key="color.id" type="color"
            :aria-label="color.name" :title="color.name" :value="props.values[color.id]"
            @input="set(color, $event.target.value)" @change="emit('commit', {})"
        >
      </RangeField>
      <div v-else-if="option.kind === 'checkbox'" class="field">
        <label class="check"><input :id="idOf(option)" type="checkbox" :checked="props.values[option.id]" @change="pick(option, $event.target.checked)"> {{ option.name }}</label>
      </div>
      <div v-else-if="option.kind === 'color' && !inSlot.has(option)" class="field">
        <label :for="idOf(option)">{{ option.name }}</label>
        <input
            :id="idOf(option)" type="color" :value="props.values[option.id]"
            @input="set(option, $event.target.value)" @change="emit('commit', {})"
        >
      </div>
      <div v-else-if="option.kind === 'choice'" class="field"><!-- a color in a slider's slot is drawn there, nothing here -->
        <label :for="idOf(option)">{{ option.name }}</label>
        <select :id="idOf(option)" :value="props.values[option.id]" @change="pick(option, Number($event.target.value))">
          <option v-for="(choice, i) in option.choices" :key="i" :value="i">{{ choice }}</option>
        </select>
      </div>
    </template>
  </div>
</template>

<style scoped>
label.check {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>

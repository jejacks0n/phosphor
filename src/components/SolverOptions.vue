<script setup>
import RangeField from '@/components/RangeField.vue';

// A plugin solver's options, drawn from what it declares (plugins/solvers.js): a slider, a checkbox or a choice each,
// in the plugin's own words, shown as text and never translated. Each change emits change(values), every option's value
// with the one changed; commit({ nudge }) ends it, for the undo step: a slider's drag or nudge as RangeField's, a
// checkbox or a choice at once. The container (ControlPanel) styles .field and its label.
const props = defineProps({
  options: { type: Array, required: true },
  values: { type: Object, required: true },
});
const emit = defineEmits(['change', 'commit']);

const idOf = (option) => `solver-${option.id}`;
const decimals = (step) => (String(step).split('.')[1] ?? '').length;
const setting = (option) => ({ key: idOf(option), label: option.name, min: option.min, max: option.max, step: option.step, decimals: decimals(option.step) });
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
      />
      <div v-else-if="option.kind === 'checkbox'" class="field">
        <label class="check"><input :id="idOf(option)" type="checkbox" :checked="props.values[option.id]" @change="pick(option, $event.target.checked)"> {{ option.name }}</label>
      </div>
      <div v-else class="field">
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

<script>
export default {
  name: 'PreviewTabs',
  props: {
    modelValue: {
      type: String,
      required: true,
    },
  },
  emits: ['update:modelValue'],
};
</script>

<template>
  <ul>
    <li :class="{ active: modelValue === 'source' }" @click="$emit('update:modelValue', 'source')">
      Source
    </li>
    <li :class="{ active: modelValue === 'ansi' }" @click="$emit('update:modelValue', 'ansi')">
      ANSI Output
    </li>
    <li :class="{ active: modelValue === 'sauce' }" @click="$emit('update:modelValue', 'sauce')">
      Sauce
    </li>
  </ul>
</template>

<style scoped>
ul {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
  margin: 0;
  padding: 5px 10px 0 10px;
  list-style: none;
  background: var(--surface-0);
  border-bottom: 1px solid var(--border);
}

li {
  padding: 5px 24px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  user-select: none;
  transition: all 0.2s ease;
  border-radius: 5px 5px 0 0;
  border: 1px solid var(--border);
  border-bottom: none;
  background: var(--surface-0);
  color: var(--text-muted);
}

li:hover {
  background: var(--surface-2);
  color: var(--accent);
}

li.active {
  margin-bottom: -1px;
  border-bottom: 1px solid transparent;
  font-weight: 500;
  background: var(--surface-1);
  color: var(--text);
}
</style>

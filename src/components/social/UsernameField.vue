<script setup>
import { computed, ref, useId } from 'vue';
import { usernameProblem } from '@/social/names';
import { messageFor } from '@/social/messages';

// The username field of Create an account and Pick your username, checked as you type with the
// server's rules: from the first blur or the third character on, so the first keystroke isn't nagged.
defineProps({ help: { type: String, default: null } });
const name = defineModel({ type: String, required: true });

const touched = ref(false);
const problem = computed(() => {
  const found = usernameProblem(name.value);
  return found && (touched.value || name.value.length >= 3) ? messageFor('USERNAME', { problem: found }) : null;
});
const id = useId();
</script>

<template>
  <label>Username
    <input v-model="name" class="mono" autocomplete="username" spellcheck="false" required
      :aria-invalid="!!problem" :aria-describedby="`${id}-help ${id}-problem`" @blur="touched = true">
  </label>
  <p v-if="help" :id="`${id}-help`" class="help">{{ help }}</p>
  <p v-if="problem" :id="`${id}-problem`" class="error">{{ problem }}</p>
</template>

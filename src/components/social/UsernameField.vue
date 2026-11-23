<script setup>
import { computed, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { USERNAME_MAX, usernameProblem } from '@/social/names';
import { messageFor } from '@/social/messages';
import FieldCount from '@/components/FieldCount.vue';

// The username field of Create an account and Pick your username, checked as you type with the
// server's rules: from the first blur with something typed, or the third character on, so the first keystroke isn't
// nagged, nor a field left empty (a dialog opens with focus in it, and a click elsewhere would shift what's clicked).
defineProps({ help: { type: String, default: null } });
const name = defineModel({ type: String, required: true });

const { t } = useI18n();
const touched = ref(false);
const problem = computed(() => {
  const found = usernameProblem(name.value);
  return found && (touched.value || name.value.length >= 3) ? messageFor('USERNAME', { problem: found }) : null;
});
const id = useId();
</script>

<template>
  <div class="counted">
    <label>{{ t('social.auth.usernameLabel') }}
      <input v-model="name" class="mono" autocomplete="username" spellcheck="false" required :maxlength="USERNAME_MAX"
        :aria-invalid="!!problem" :aria-describedby="`${id}-count ${id}-help ${id}-problem`" @blur="touched ||= name.length > 0">
    </label>
    <FieldCount :id="`${id}-count`" :count="name.length" :most="USERNAME_MAX" />
  </div>
  <p v-if="help" :id="`${id}-help`" class="help">{{ help }}</p>
  <p v-if="problem" :id="`${id}-problem`" class="error">{{ problem }}</p>
</template>

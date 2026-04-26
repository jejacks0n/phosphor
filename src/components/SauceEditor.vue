<script>
import { mapWritableState, mapActions } from 'pinia';
import { useCurrentFileStore, allKeys as allCurrentFileKeys } from '@/store/CurrentFile';

export default {
  name: 'SauceEditor',
  computed: {
    ...mapWritableState(useCurrentFileStore, allCurrentFileKeys),
  },
  methods: {
    ...mapActions(useCurrentFileStore, ['exportFile']),
  },
  mounted() {
    this.editMode = false;
  },
};
</script>

<template>
  <article>
    <h3>SAUCE Metadata</h3>
    <p>This metadata is embedded in the exported .ans or .utf8ans file and can be viewed by other ANSI editors or viewer applications.</p>

    <div class="field">
      <label for="sauce-title">Title</label>
      <input id="sauce-title" v-model="sauce.title" type="text" placeholder="Title (35 chars)" maxlength="35">
    </div>

    <div class="field">
      <label for="sauce-author">Author</label>
      <input id="sauce-author" v-model="sauce.author" type="text" placeholder="Author (20 chars)" maxlength="20">
    </div>

    <div class="field">
      <label for="sauce-group">Group</label>
      <input id="sauce-group" v-model="sauce.group" type="text" placeholder="Group (20 chars)" maxlength="20">
    </div>

    <div class="field">
      <label for="sauce-comments">Custom Comments</label>
      <textarea id="sauce-comments" v-model="sauce.userComments" placeholder="Add your own notes to the file metadata..."></textarea>
    </div>

    <div class="export-actions">
      <button @click="exportFile('ans')" :disabled="!image" class="primary">Export .ans</button>
      <button @click="exportFile('utf8ans')" :disabled="!image" class="primary">Export .utf8ans</button>
    </div>
  </article>
</template>

<style scoped>
article {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 240px;
  max-width: 450px;
  margin: auto;
  padding: 40px;
  box-sizing: border-box;
}

p {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}

div.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-faint);
}

textarea {
  resize: vertical;
  min-height: 100px;
  font-family: inherit;
}

div.export-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
}
</style>

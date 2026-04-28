<script>
import { mapState, mapWritableState, mapActions } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import ProjectActions from './ProjectActions.vue';

export default {
  name: 'SauceEditor',
  components: {
    ProjectActions,
  },
  computed: {
    ...mapWritableState(useProjectStore, [
      'sauceTitle', 'sauceAuthor', 'sauceGroup', 'sauceUserComments', 'image'
    ]),
    ...mapWritableState(useWorkspaceStore, ['editMode']),
  },
  methods: {
    //
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
      <input id="sauce-title" v-model="sauceTitle" type="text" placeholder="Title (35 chars)" maxlength="35">
    </div>

    <div class="field">
      <label for="sauce-author">Author</label>
      <input id="sauce-author" v-model="sauceAuthor" type="text" placeholder="Author (20 chars)" maxlength="20">
    </div>

    <div class="field">
      <label for="sauce-group">Group</label>
      <input id="sauce-group" v-model="sauceGroup" type="text" placeholder="Group (20 chars)" maxlength="20">
    </div>

    <div class="field">
      <label for="sauce-comments">Custom Comments</label>
      <textarea id="sauce-comments" v-model="sauceUserComments" placeholder="Add your own notes to the file metadata..."></textarea>
    </div>

    <div class="export-actions-container">
      <ProjectActions/>
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

.export-actions-container {
  margin-top: 20px;
}
</style>

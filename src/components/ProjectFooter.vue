<script>
import { mapWritableState } from 'pinia';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

export default {
  name: 'ProjectActions',
  computed: {
    ...mapWritableState(useWorkspaceStore, ['showAboutModal']),
    year() {
      return new Date().getFullYear();
    },
  },
};
</script>

<template>
  <footer class="project-footer">
    <button class="link" @click="showAboutModal = true">About Phosphor</button>
    <div>
      Brought to you by<br/>
      <a href="https://ishifishi.work" target="_blank">ishifishi.work</a> and
      <a href="https://euphio.org" target="_blank">euphio.org</a>
      <div class="copyright">&copy; {{ year }} Phosphor</div>
    </div>
  </footer>
</template>

<style scoped>
footer.project-footer {
  margin: 12px 12px 50px;
  font-size: 10px;
  text-align: center;
  line-height: 1.6;
  color: var(--text);
}

a {
  text-decoration: none;
  font-weight: 600;
  color: var(--accent-hover);
}

a:hover {
  text-decoration: underline;
}

div.copyright {
  opacity: 0.5;
}

button.link {
  margin-bottom: 10px;
}
</style>

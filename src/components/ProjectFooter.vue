<script>
export default {
  name: 'ProjectActions',
  computed: {
    year() {
      return new Date().getFullYear();
    },
  },
};
</script>

<template>
  <footer class="project-footer">
    Brought to you by<br/>
    <a href="https://ishifishi.work" target="_blank">ishifishi.work</a> and
    <a href="https://euphio.org" target="_blank">euphio.org</a>
    <div class="copyright">&copy; {{ year }} Phosphor</div>
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

footer a {
  text-decoration: none;
  font-weight: 600;
  color: var(--accent-hover);
}

footer a:hover {
  text-decoration: underline;
}

footer div.copyright {
  opacity: 0.5;
}
</style>

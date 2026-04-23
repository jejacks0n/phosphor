<script>
export default {
  name: 'ZeroState',
  emits: ['file-dropped', 'file-selected'],
  methods: {
    onFileSelected(e) {
      const file = e.target.files[0];
      if (file) this.$emit('file-selected', file);
    },
  },
};
</script>

<template>
  <article>
    <div class="drop-zone">
      <span class="icon">⬆</span>
      <p>Drop an image here to start</p>
      <label>
        Browse File
        <input type="file" @change="onFileSelected" accept="image/*" hidden>
      </label>
    </div>
  </article>
</template>

<style scoped>
article {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}

div.drop-zone {
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin: 40px;
  border-radius: 10px;
  align-items: center;
  padding: 30px 20px 60px;
  text-align: center;
  border: 2px dashed var(--border);
  background: rgba(0, 0, 0, 0.2);
}

span.icon {
  font-size: 68px;
  opacity: 0.5;
  color: var(--text-faint);
}

p {
  font-size: 16px;
  margin: 0;
  font-family: inherit;
  color: var(--text-muted);
}

label {
  width: 80%;
  min-width: 100px;
  max-width: 200px;
  margin-top: 10px;
  padding: 15px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  transition: all 0.2s ease;
  background: var(--accent);
  color: var(--text-inverted);
  border: 1px solid var(--border-light);
}

label:hover {
  transform: translateY(-1px);
  background: var(--accent-hot);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  border-color: var(--accent);
  color: var(--text);
}
</style>
